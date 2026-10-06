import type { FishEntity } from '../core/types';
import { type Brain, type Mode, MODE_LABEL, SURF_DECOR, SURF_GLASS, SURF_NONE, SURF_SUBSTRATE } from './brain';
import type { Ctx } from './context';
import { appetite, dropFood, feedProgress, foodValid, rt, scanForFood, tryBite } from './feeding';
import { hit, WALL_BACK, WALL_FRONT, WALL_LEFT, WALL_RIGHT } from './habitat';
import { DEG, clamp, noise1, smoothstep } from './math';
import { attachDecor, attachGlass, attachSubstrate, detach, standoff } from './surface';

/**
 * Fish ethology: a per-fish state machine (think, on a throttle) choosing what the animal is
 * doing, and per-frame steering that turns the current activity into a desired direction and
 * speed (consumed by locomotion.ts). Every Trait maps to concrete behavior here; species
 * parameters (params.ts) and the individual's size, hunger, fear and rest level modulate it.
 */

// Rest flavours.
export const RK_HOVER = 0, RK_BOTTOM = 1, RK_COVER = 2, RK_BURY = 3, RK_ATTACH = 4, RK_ANEMONE = 5;

// ---------------------------------------------------------------------------------------------
// Small steering helpers
// ---------------------------------------------------------------------------------------------

function desire(b: Brain, x: number, y: number, z: number, speed: number): void {
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 1e-9) {
    b.dx = x / l;
    b.dy = y / l;
    b.dz = z / l;
  }
  b.ds = speed;
}

/**
 * Steer toward a point, slowing within `arrive` m. Inside the arrival zone the heading eases
 * toward the current one, so a fish that has arrived settles instead of pirouetting over the
 * spot. Returns the distance.
 */
function seek(fish: FishEntity, b: Brain, gx: number, gy: number, gz: number, speed: number, arrive: number): number {
  const k = fish.kin;
  let x = gx - k.pos[0], y = gy - k.pos[1], z = gz - k.pos[2];
  const d = Math.sqrt(x * x + y * y + z * z);
  let s = speed;
  if (arrive > 0 && d < arrive) {
    const w = d / arrive;
    s = speed * w;
    const inv = 1 / Math.max(d, 1e-6);
    const cp = Math.cos(b.pitch);
    x = x * inv * w + cp * Math.cos(b.yaw) * (1 - w);
    y = y * inv * w + Math.sin(b.pitch) * (1 - w) * 0.3;
    z = z * inv * w + cp * Math.sin(b.yaw) * (1 - w);
  }
  desire(b, x, y, z, s);
  return d;
}

/** Face a horizontal direction while (nearly) holding station. */
function face(b: Brain, x: number, z: number, speed: number): void {
  const l = Math.sqrt(x * x + z * z);
  if (l > 1e-9) {
    b.dx = x / l;
    b.dz = z / l;
  }
  b.dy = 0;
  b.ds = speed;
}

/** Gentle aperiodic meander of the desired heading (± angle) and depth. */
function meander(ctx: Ctx, b: Brain, amount: number): void {
  const a = noise1(ctx.t * 0.33, b.noiseSeed) * amount;
  const c = Math.cos(a), s = Math.sin(a);
  const x = b.dx * c - b.dz * s, z = b.dx * s + b.dz * c;
  b.dx = x;
  b.dz = z;
  b.dy += noise1(ctx.t * 0.21, b.noiseSeed ^ 0x55) * amount * 0.15;
}

/** Relaxed swimming speed (m/s) for this individual right now. */
function cruiseSpeed(ctx: Ctx, b: Brain): number {
  const mood = 0.85 + 0.3 * (0.5 + 0.5 * noise1(ctx.t * 0.05, b.noiseSeed ^ 0x1234));
  return b.p.cruise * b.L * b.pace * mood * (1 - 0.85 * b.rest) * (1 + 0.7 * b.fear) * (1 + 0.4 * b.excite);
}

function dist2(fish: FishEntity, x: number, y: number, z: number): number {
  const k = fish.kin;
  const dx = x - k.pos[0], dy = y - k.pos[1], dz = z - k.pos[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Choose a goal point in the fish's zone, mostly near where it is (fish don't zip end to end constantly). */
function pickZoneGoal(ctx: Ctx, fish: FishEntity, b: Brain, local: number): void {
  const h = ctx.h;
  const B = h.b;
  const k = fish.kin;
  const L = b.L;
  const mx = Math.min(B.halfW * 0.8, Math.max(0.03, 1.4 * L)), mz = Math.min(B.halfD * 0.8, Math.max(0.03, 1.4 * L));
  const p = b.p;
  b.prefHTarget = p.zoneLo + (p.zoneHi - p.zoneLo) * ctx.rng.next();
  for (let i = 0; i < 6; i++) {
    let x: number, z: number;
    if (ctx.rng.chance(local)) {
      x = k.pos[0] + ctx.rng.signed() * 0.35;
      z = k.pos[2] + ctx.rng.signed() * 0.18;
    } else {
      x = ctx.rng.range(-B.halfW + mx, B.halfW - mx);
      z = ctx.rng.range(-B.halfD + mz, B.halfD - mz) * 0.85;
    }
    x = clamp(x, -B.halfW + mx, B.halfW - mx);
    z = clamp(z, -B.halfD + mz, B.halfD - mz);
    const y = h.yAtFrac(x, z, clamp(b.prefH * 0.5 + b.prefHTarget * 0.5, 0.02, 0.98));
    if (h.nearestDecor(x, y, z) > L || i === 5) {
      b.gx = x;
      b.gy = y;
      b.gz = z;
      b.hasGoal = true;
      return;
    }
  }
}

/**
 * Radius of the defended area around the home point (m). Anemonefish defend little more than
 * their anemone; cave-dwellers the cave mouth; open-substrate cichlids a patch a few body
 * lengths across.
 */
function territoryRadius(b: Brain): number {
  const t = b.p.t;
  if (t['anemone-host']) return Math.max(0.05, 1.5 * b.L);
  if (t['cave-dweller'] || t.burrower) return clamp(2.5 * b.L, 0.05, 0.25);
  return clamp(3.5 * b.L, 0.06, 0.3);
}

function bodyR(b: Brain): number {
  return 0.5 * b.p.depthFrac * b.L + 0.002;
}

// ---------------------------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------------------------

function keepsSurface(mode: Mode, b: Brain): boolean {
  return mode === 'graze' || mode === 'perch' || mode === 'feed' || (mode === 'rest' && (b.restKind === RK_ATTACH || b.restKind === RK_BOTTOM));
}

export function enter(ctx: Ctx, fish: FishEntity, b: Brain, mode: Mode, dur: number): void {
  if (b.surf !== SURF_NONE && !keepsSurface(mode, b)) detach(fish, b);
  if (mode !== 'feed') dropFood(b);
  else if (b.mode !== 'feed') b.feedStall = 0;
  if (b.coverIdx >= 0 && mode !== 'hide' && mode !== 'rest') releaseCover(ctx, b);
  if (b.buried > 0 && mode !== 'rest' && mode !== 'hide') b.buried = Math.min(b.buried, 0.99);
  b.mode = mode;
  b.modeT = 0;
  b.modeDur = dur;
  b.hasGoal = false;
  b.sub = 0;
  b.subT = 0;
  b.subDur = 0;
  b.perchIdx = mode === 'perch' ? b.perchIdx : -1;
  b.label = MODE_LABEL[mode];
}

function releaseCover(ctx: Ctx, b: Brain): void {
  if (b.coverIdx >= 0 && b.coverVersion === ctx.h.version && b.coverIdx < ctx.h.coverUse.length) ctx.h.coverUse[b.coverIdx]--;
  b.coverIdx = -1;
  b.shelterOwner = undefined;
}

/** Take cover point `i` (current habitat version) for this animal. */
export function claimCover(ctx: Ctx, b: Brain, i: number): void {
  const h = ctx.h;
  if (b.coverIdx === i && b.coverVersion === h.version) return;
  releaseCover(ctx, b);
  h.coverUse[i]++;
  b.coverIdx = i;
  b.coverVersion = h.version;
  b.shelterOwner = h.cover[i].ownerId;
}

/** Choose and claim a cover point suited to the species. Returns the index or −1. */
function chooseCover(ctx: Ctx, fish: FishEntity, b: Brain): number {
  const h = ctx.h;
  if (b.coverIdx >= 0 && b.coverVersion === h.version) return b.coverIdx;
  const t = b.p.t;
  const k = fish.kin;
  let best = -1, bestS = Infinity;
  for (let i = 0; i < h.cover.length; i++) {
    const c = h.cover[i];
    let pref = 1;
    switch (c.kind) {
      case 'cave': pref = t['cave-dweller'] || t['nocturnal-hider'] ? 0.4 : 1; break;
      case 'crevice': pref = t['cave-dweller'] || t['mucus-cocoon'] ? 0.5 : 1; break;
      case 'overhang': pref = t.shy || t.hoverer ? 0.7 : 1; break;
      case 'plants': pref = t.shy || t.hoverer ? 0.6 : 1.1; break;
      case 'anemone': pref = t['anemone-host'] ? 0.1 : 99; break;
      case 'burrow': pref = t.burrower ? 0.3 : 4; break;
    }
    if (pref >= 99) continue;
    // Caves are personal: avoid occupied ones (territorial cave-dwellers fight over them).
    const crowd = c.kind === 'cave' || c.kind === 'burrow' || c.kind === 'crevice' ? h.coverUse[i] * 2 : h.coverUse[i] * 0.15;
    // Too small a cave for a big fish? Already full?
    const enclosed = c.kind === 'cave' || c.kind === 'crevice' || c.kind === 'burrow';
    if (enclosed && c.radius < b.L * 0.3) continue;
    const cap = Math.max(1, Math.floor((c.radius / (b.L * (enclosed ? 0.8 : 0.55))) ** 2 * (enclosed ? 0.6 : 0.9)));
    if (h.coverUse[i] >= cap) continue;
    const dx = c.position[0] - k.pos[0], dy = c.position[1] - k.pos[1], dz = c.position[2] - k.pos[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const s = (d + 0.05) * pref * (1 + crowd);
    if (s < bestS) {
      bestS = s;
      best = i;
    }
  }
  if (best >= 0) claimCover(ctx, b, best);
  else b.coverMiss = h.version;
  return best;
}

/** Ensure FishState.home is set for animals that hold a home point. */
function ensureHome(ctx: Ctx, fish: FishEntity, b: Brain): boolean {
  const t = b.p.t;
  if (!(t.territorial || t['cave-dweller'] || t['anemone-host'] || t.burrower || t.perches)) return false;
  const s = fish.state;
  const h = ctx.h;
  if (s.home) {
    // Re-validate against the current decor (it may have moved).
    if (!h.insideDecor(s.home[0], s.home[1], s.home[2], 0.005) || b.shelterOwner) return true;
  }
  // Partner shares a home.
  if (b.partner?.state.home) {
    s.home = [b.partner.state.home[0], b.partner.state.home[1], b.partner.state.home[2]];
    return true;
  }
  let ci = -1;
  if (t['anemone-host']) ci = ctx.pickCover('anemone', fish.kin.pos[0], fish.kin.pos[2], 9);
  if (ci < 0 && t['cave-dweller']) ci = ctx.pickCover('cave', fish.kin.pos[0], fish.kin.pos[2], 9);
  if (ci < 0 && t['cave-dweller']) ci = ctx.pickCover('crevice', fish.kin.pos[0], fish.kin.pos[2], 9);
  if (ci < 0 && t.burrower) ci = ctx.pickCover('burrow', fish.kin.pos[0], fish.kin.pos[2], 9);
  if (ci >= 0) {
    const c = h.cover[ci].position;
    s.home = [c[0], c[1], c[2]];
    return true;
  }
  // Otherwise a spot in its zone near some decor, spread out from other homes.
  const B = h.b;
  let bx = 0, by = 0, bz = 0, bestS = -Infinity;
  for (let i = 0; i < 10; i++) {
    let x = ctx.rng.range(-B.halfW * 0.8, B.halfW * 0.8);
    let z = ctx.rng.range(-B.halfD * 0.7, B.halfD * 0.4);
    if (h.perchCount > 0 && ctx.rng.chance(0.6)) {
      const pi = Math.floor(ctx.rng.next() * h.perchCount);
      x = h.perches[pi * 3] + ctx.rng.signed() * 0.05;
      z = h.perches[pi * 3 + 2] + ctx.rng.signed() * 0.05;
    }
    const hf = (b.p.zoneLo + b.p.zoneHi) * 0.5;
    const y = h.yAtFrac(x, z, b.p.species.zone === 'bottom' ? 0.08 : hf);
    if (h.insideDecor(x, y, z, -b.L)) continue;
    let s = 0;
    for (const o of ctx.world.fish) {
      if (o === fish || !o.state.home) continue;
      const dx = o.state.home[0] - x, dz = o.state.home[2] - z;
      s -= 1 / (0.05 + Math.sqrt(dx * dx + dz * dz));
    }
    if (s > bestS) {
      bestS = s;
      bx = x;
      by = y;
      bz = z;
    }
  }
  s.home = [bx, by, bz];
  return true;
}

function findPartner(ctx: Ctx, fish: FishEntity, b: Brain): void {
  b.partnerCheckT = 10;
  if (b.partner && ctx.world.fishById.get(b.partner.state.id) === b.partner) return;
  b.partner = null;
  let best: FishEntity | null = null, bestD = Infinity;
  for (const o of ctx.world.fish) {
    if (o === fish || o.species !== fish.species) continue;
    const ob = o.brain.behavior as Brain | undefined;
    if (ob?.partner && ob.partner !== fish) continue;
    const opposite = fish.state.sex === 'unknown' || o.state.sex === 'unknown' || o.state.sex !== fish.state.sex;
    if (!opposite) continue;
    const d = dist2(fish, o.kin.pos[0], o.kin.pos[1], o.kin.pos[2]);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best) {
    b.partner = best;
    const ob = best.brain.behavior as Brain | undefined;
    if (ob && !ob.partner) ob.partner = fish;
  }
}

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

function wantsCover(b: Brain): boolean {
  const t = b.p.t;
  return t.shy || t['cave-dweller'] || t['nocturnal-hider'] || t['anemone-host'] || t.burrower || b.boldness < 0.35;
}

/** Nocturnal species spend the light hours in cover. */
function dayHider(ctx: Ctx, b: Brain): boolean {
  const p = b.p;
  return p.species.activity === 'nocturnal' && ctx.light > 0.35 && (p.t['nocturnal-hider'] || p.t.shy || p.t['cave-dweller'] || p.t.burrower || p.species.zone === 'bottom');
}

const CHOICES: Mode[] = ['shoal', 'cruise', 'hover', 'forage', 'graze', 'perch', 'patrol', 'investigate', 'flare', 'chase', 'clean', 'stalk', 'ambush', 'rest'];
const W = new Float64Array(CHOICES.length);

function chooseActivity(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const t = p.t;
  const g = ctx.groups.get(fish.species.id);
  const grouped = p.schooling > 0 && g !== undefined && g.count > 1;
  const zone = p.species.zone;
  const home = ensureHome(ctx, fish, b);
  W.fill(0);
  // 0 shoal, 1 cruise, 2 hover, 3 forage, 4 graze, 5 perch, 6 patrol, 7 investigate, 8 flare,
  // 9 chase(nip), 10 clean, 11 stalk, 12 ambush, 13 rest bout
  if (grouped) W[0] = p.schooling === 2 ? 6 : 3.5;
  else W[1] = 2;
  if (t['surface-skimmer']) W[1] += 2;
  if (t.hoverer) W[2] += 3;
  else if (p.canHover && !grouped) W[2] += 1;
  if (t.shy && !grouped) W[2] += 1;
  if (zone === 'bottom' && (t['bottom-rester'] || t['sand-sifter'] || t.scavenger || t['sifter-of-detritus'] || t.digger)) W[3] += 4;
  if (t['surface-grazer'] || t['plant-eater'] || t['coral-nipper'] || (t['algae-eater'] && !t.clings)) W[3] += 1.6;
  if (grouped && p.schooling === 1 && zone !== 'bottom') W[3] += 0.35; // shoal members pick at things briefly
  if (t.clings || t['glass-grazer']) W[4] += 6;
  if (t.perches || t.hops) W[5] += 4;
  // Seahorses spend most of their time anchored by the tail to a holdfast.
  if (p.species.locomotion === 'seahorse') W[5] += 8;
  // Wrasses, puffers, triggers and loaches pick small invertebrates off rock, wood and sand.
  if (t['invert-eater'] && !t.ambush && zone !== 'bottom') W[3] += 1.2;
  if (t.territorial && home && !t['anemone-host']) W[6] += 2.5;
  if (t['anemone-host'] && home) W[2] += 6;
  if (t['cave-dweller'] && home) W[2] += 1.5;
  // Burrow-dwellers (jawfish, garden eels, firefish) hover by their burrow; sand-sleeping wrasses
  // only use the sand at night and roam all day.
  if (t.burrower && !t['sand-sleeper'] && home && p.species.activity !== 'nocturnal') W[2] += 4;
  if ((t.curious || t.bold) && b.curiousT <= 0) W[7] += t.curious ? 1.6 : 0.7;
  if (t.flarer && b.flareT <= 0) W[8] += 2;
  if (t['fin-nipper'] && b.nipT <= 0) W[9] += 1;
  if (t.cleaner && b.cleanT <= 0) W[10] += 3;
  if ((t.predator || t['invert-eater']) && ctx.rng.chance(0.3)) W[11] += 0.5;
  if (t.ambush || t.drifter) W[12] += 5;
  if (t['bottom-rester'] && b.mode === 'forage') W[13] += 3;
  if (zone === 'bottom' && !t.clings && W[3] === 0 && W[5] === 0) W[3] += 1.5;
  if (!grouped && W[1] === 0 && W[2] === 0) W[1] = 0.5;
  let sum = 0;
  for (let i = 0; i < W.length; i++) sum += W[i];
  let r = ctx.rng.next() * sum;
  let pick = 1;
  for (let i = 0; i < W.length; i++) {
    r -= W[i];
    if (r <= 0) {
      pick = i;
      break;
    }
  }
  const mode = CHOICES[pick];
  const rr = ctx.rng;
  switch (mode) {
    case 'shoal': enter(ctx, fish, b, 'shoal', rr.range(20, 60)); break;
    case 'cruise': enter(ctx, fish, b, 'cruise', rr.range(10, 30)); break;
    case 'hover': enter(ctx, fish, b, 'hover', rr.range(8, 25)); break;
    case 'forage': enter(ctx, fish, b, 'forage', grouped && zone !== 'bottom' ? rr.range(4, 10) : rr.range(15, 50)); break;
    case 'graze': enter(ctx, fish, b, 'graze', rr.range(40, 180)); break;
    case 'perch': enter(ctx, fish, b, 'perch', rr.range(30, 90)); break;
    case 'patrol': enter(ctx, fish, b, 'patrol', rr.range(15, 40)); break;
    case 'investigate': enter(ctx, fish, b, 'investigate', rr.range(6, 14)); b.curiousT = rr.range(30, 120); break;
    case 'flare': enter(ctx, fish, b, 'flare', rr.range(3, 6)); b.flareT = rr.range(25, 90); break;
    case 'chase':
      b.nipT = rr.range(40, 140);
      if (pickNipTarget(ctx, fish, b)) enter(ctx, fish, b, 'chase', rr.range(1.2, 2.5));
      else enter(ctx, fish, b, grouped ? 'shoal' : 'cruise', 10);
      break;
    case 'clean':
      b.cleanT = rr.range(15, 50);
      if (pickClient(ctx, fish, b)) enter(ctx, fish, b, 'clean', rr.range(3, 8));
      else enter(ctx, fish, b, 'hover', 8);
      break;
    case 'stalk':
      if (pickPrey(ctx, fish, b)) enter(ctx, fish, b, 'stalk', rr.range(6, 15));
      else enter(ctx, fish, b, grouped ? 'shoal' : 'cruise', 12);
      break;
    case 'ambush': enter(ctx, fish, b, 'ambush', rr.range(20, 80)); break;
    case 'rest':
      enter(ctx, fish, b, 'rest', rr.range(10, 60));
      b.restKind = RK_BOTTOM;
      b.label = 'resting on the bottom';
      break;
    default: enter(ctx, fish, b, 'cruise', 15);
  }
  // Keep the target for chase/clean/stalk modes (enter() does not touch it).
}

/** Called every ~0.3–0.6 s per fish (sooner when excited). */
export function thinkFish(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const t = p.t;
  b.thinkT = (b.excite > 0.2 ? 0.15 : 0.3) + ctx.rng.next() * 0.3;
  if (b.mode === 'flee' && (b.fleeT > 0 || b.fleeDelay > 0)) return;
  if (b.partnerCheckT <= 0 && (p.pairs || p.harem)) findPartner(ctx, fish, b);

  // Startled timid animals bolt for cover; burrowers dive into their burrow.
  if (b.fear > 0.4 && wantsCover(b) && b.mode !== 'hide' && b.mode !== 'rest') {
    enterHide(ctx, fish, b);
    return;
  }

  // Food.
  const app = appetite(fish) * (1 - 0.6 * b.rest);
  if (b.mode === 'feed' && !foodValid(ctx, b)) b.scanT = 0;
  if (b.scanT <= 0) {
    b.scanT = (b.excite > 0.2 ? 0.15 : 0.45) * (0.7 + ctx.rng.next() * 0.6);
    if (b.fear < 0.55 && (b.rest < 0.75 || p.chemosensory) && scanForFood(ctx, fish, b, app)) {
      if (b.mode !== 'feed') {
        const keepSurf = b.surf !== SURF_NONE && (t.clings || b.p.mouth === 'sucker');
        if (b.surf !== SURF_NONE && !keepSurf) detach(fish, b);
        enter(ctx, fish, b, 'feed', 60);
      }
      return;
    }
  }
  if (b.mode === 'feed') {
    if (foodValid(ctx, b)) return;
    b.modeDur = 0;
  }

  // Air breathing.
  if (t['air-gulper'] && b.airT <= 0 && b.fear < 0.3 && b.mode !== 'gulp' && b.mode !== 'feed') {
    enter(ctx, fish, b, 'gulp', 20);
    return;
  }
  if (b.mode === 'gulp') return;

  // Rest at night (or by day for nocturnal species) — but nocturnal fish slip out for a look
  // around now and then by day, as they do in every aquarium.
  const dayHide = dayHider(ctx, b);
  if (dayHide && b.foray <= 0 && b.forayT <= 0 && b.mode === 'hide' && b.dayHide && b.modeT > 12 && b.fear < 0.2) {
    startForay(ctx, fish, b);
    return;
  }
  const hideByDay = dayHide && b.foray <= 0;
  if (((b.rest > 0.55 && b.foray <= 0) || hideByDay) && b.mode !== 'rest' && b.mode !== 'hide') {
    enterRest(ctx, fish, b, hideByDay);
    return;
  }
  if ((b.mode === 'rest' || b.mode === 'hide') && b.rest < 0.4 && !hideByDay) {
    // Waking / calm again (bottom-rest bouts run their own timer).
    const isBout = b.mode === 'rest' && b.restKind === RK_BOTTOM && b.modeT < b.modeDur;
    // Frightened fish stay in cover for a while after the fear has faded (10–30 s).
    const stillScared = b.mode === 'hide' && !b.dayHide && (b.fear > 0.15 || b.modeT < b.modeDur);
    if (!isBout && !stillScared) {
      chooseActivity(ctx, fish, b);
      return;
    }
  }
  if (b.mode === 'rest' || b.mode === 'hide') return;

  // New arrivals explore cautiously for a minute.
  if (b.age < 45) {
    if (b.mode !== 'explore') enter(ctx, fish, b, 'explore', 50);
    return;
  }

  // Territorial interruptions: chase off intruders.
  if ((t.territorial || p.aggression > 0.6) && b.mode !== 'chase' && b.fear < 0.3 && b.chaseCool <= 0 && ctx.rng.chance(0.35)) {
    if (checkIntruder(ctx, fish, b)) {
      // Brief displays and short chases, separated by long calm spells.
      b.chaseCool = ctx.rng.range(10, 30) * (1.4 - p.aggression);
      enter(ctx, fish, b, 'chase', ctx.rng.range(1.2, 3));
      b.label = 'chasing off an intruder';
      return;
    }
  }

  if (b.modeT < b.modeDur && b.mode !== 'explore') return;
  chooseActivity(ctx, fish, b);
}

/**
 * A nocturnal day-hider leaves its hideout for a daytime excursion (grazing the glass, a turn
 * along the bottom, a look at the front glass), then goes back. Excursions last ~0.5–2 min and
 * come every few minutes: strongly nocturnal hiders less often, bold or hungry fish more often.
 */
function startForay(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const rr = ctx.rng;
  const app = appetite(fish);
  b.foray = rr.range(30, 100) * (0.7 + 0.6 * b.boldness) * (0.8 + 0.6 * app);
  const mean = (b.p.t['nocturnal-hider'] ? 300 : 170) * (1.4 - 0.8 * b.boldness) * (1.2 - 0.5 * app);
  b.forayT = b.foray + rr.exp(mean);
  b.dayHide = false;
  chooseActivity(ctx, fish, b);
}

function enterHide(ctx: Ctx, fish: FishEntity, b: Brain): void {
  enter(ctx, fish, b, 'hide', ctx.rng.range(10, 30));
  b.dayHide = false;
  b.restKind = RK_COVER;
  if (b.p.t.burrower && fish.state.home) b.restKind = RK_BURY;
  chooseCover(ctx, fish, b);
}

function enterRest(ctx: Ctx, fish: FishEntity, b: Brain, byDay: boolean): void {
  const t = b.p.t;
  const zone = b.p.species.zone;
  let kind = RK_HOVER;
  if (t['sand-sleeper'] && !byDay) kind = RK_BURY;
  else if (t.burrower && (byDay || t['nocturnal-hider'] || fish.state.home)) kind = RK_BURY;
  else if (t['anemone-host'] && ensureHome(ctx, fish, b)) kind = RK_ANEMONE;
  else if (t.clings && !(byDay && t['cave-dweller'])) kind = RK_ATTACH;
  else if (t['cave-dweller'] || t['mucus-cocoon'] || t['nocturnal-hider'] || byDay) kind = RK_COVER;
  else if (zone === 'bottom' || t['bottom-rester'] || t.perches) kind = RK_BOTTOM;
  else if ((t.hoverer || t.shy) && ctx.h.cover.length > 0 && ctx.rng.chance(0.6)) kind = RK_COVER;
  if (kind === RK_BURY && ctx.world.tank.substrate === 'bare') kind = RK_COVER;
  enter(ctx, fish, b, byDay ? 'hide' : 'rest', 1e9);
  b.dayHide = byDay;
  b.restKind = kind;
  if (kind === RK_COVER && chooseCover(ctx, fish, b) < 0 && !byDay) b.restKind = zone === 'bottom' ? RK_BOTTOM : RK_HOVER;
  b.label = byDay ? 'hiding until dark' : kind === RK_BURY ? 'sleeping in the sand' : 'resting';
}

function checkIntruder(ctx: Ctx, fish: FishEntity, b: Brain): boolean {
  const home = fish.state.home;
  const k = fish.kin;
  const L = b.L;
  const cx = home ? home[0] : k.pos[0], cy = home ? home[1] : k.pos[1], cz = home ? home[2] : k.pos[2];
  const r = home ? territoryRadius(b) : clamp(2.5 * L, 0.05, 0.2);
  const n = ctx.hash.query(cx, cy, cz, r, b.idx, ctx.nbr);
  let best: FishEntity | null = null, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const o = ctx.world.fish[ctx.nbr[i]];
    const ob = ctx.brains[ctx.nbr[i]];
    if (o === b.partner || ob.p.move !== 'swimmer' || ob.surf !== SURF_NONE || ob.mode === 'hide') continue;
    const same = o.species === fish.species;
    const oL = ob.L;
    // Real territorial fish mostly chase conspecifics and similar-sized competitors that use the
    // same part of the water column; small fish passing overhead are tolerated.
    if (!same && (oL < 0.5 * L || oL > 2 * L)) continue;
    if (!same && Math.abs(o.kin.pos[1] - cy) > r * 0.6) continue;
    if (!same && b.p.aggression < 0.5 && ob.p.species.zone !== b.p.species.zone && ob.p.species.zone !== 'all') continue;
    if (same && b.p.colony === false && b.p.schooling > 0 && b.p.aggression < 0.5) continue;
    const d = dist2(fish, o.kin.pos[0], o.kin.pos[1], o.kin.pos[2]);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  b.target = best;
  return best !== null;
}

function pickNipTarget(ctx: Ctx, fish: FishEntity, b: Brain): boolean {
  const k = fish.kin;
  const n = ctx.hash.query(k.pos[0], k.pos[1], k.pos[2], clamp(10 * b.L, 0.1, 0.4), b.idx, ctx.nbr);
  let best: FishEntity | null = null, bestS = -Infinity;
  for (let i = 0; i < n; i++) {
    const o = ctx.world.fish[ctx.nbr[i]];
    const ob = ctx.brains[ctx.nbr[i]];
    if (o.species === fish.species || ob.p.move !== 'swimmer' || ob.surf !== SURF_NONE) continue;
    // Slow, long-finned fish are the classic victims.
    const slow = ob.p.cruise < 0.8 ? 1 : 0;
    const s = slow + ctx.rng.next() - (ob.L > 3 * b.L ? 1 : 0);
    if (s > bestS) {
      bestS = s;
      best = o;
    }
  }
  b.target = best;
  return best !== null;
}

function pickClient(ctx: Ctx, fish: FishEntity, b: Brain): boolean {
  const k = fish.kin;
  const n = ctx.hash.query(k.pos[0], k.pos[1], k.pos[2], 0.5, b.idx, ctx.nbr);
  let best: FishEntity | null = null, bestS = Infinity;
  for (let i = 0; i < n; i++) {
    const o = ctx.world.fish[ctx.nbr[i]];
    const ob = ctx.brains[ctx.nbr[i]];
    if (o.species === fish.species || ob.p.move !== 'swimmer' || ob.surf !== SURF_NONE) continue;
    if (ob.L < 1.4 * b.L || ob.mode === 'flee' || ob.mode === 'hide' || ob.mode === 'rest' || ob.pose > 0) continue;
    const s = dist2(fish, o.kin.pos[0], o.kin.pos[1], o.kin.pos[2]) * (0.5 + ctx.rng.next());
    if (s < bestS) {
      bestS = s;
      best = o;
    }
  }
  b.target = best;
  return best !== null;
}

function pickPrey(ctx: Ctx, fish: FishEntity, b: Brain): boolean {
  const k = fish.kin;
  const n = ctx.hash.query(k.pos[0], k.pos[1], k.pos[2], clamp(8 * b.L, 0.15, 0.5), b.idx, ctx.nbr);
  let best: FishEntity | null = null, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const o = ctx.world.fish[ctx.nbr[i]];
    const ob = ctx.brains[ctx.nbr[i]];
    if (o.species === fish.species) continue;
    const r = ob.L / b.L;
    // Stalks prey-sized tankmates; ignores much smaller ones (and never eats anyone here).
    const preyOk = b.p.t['invert-eater'] && ob.p.move !== 'swimmer' ? r < 0.4 : ob.p.move === 'swimmer' && r > 0.15 && r < 0.5;
    if (!preyOk) continue;
    const d = dist2(fish, o.kin.pos[0], o.kin.pos[1], o.kin.pos[2]);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  b.target = best;
  return best !== null;
}

// ---------------------------------------------------------------------------------------------
// Per-frame steering
// ---------------------------------------------------------------------------------------------

export function steerFish(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  b.hold = false;
  b.surfaceOk = false;
  b.floorOk = false;
  b.glassOk = false;
  b.decorOk = false;
  b.thrash = 0;
  b.turnBoost = 1;
  b.accelBoost = 1;
  b.posture = p.postureCruise;
  // Routine swimming stays close to level (≈ ±14°); feeding, escapes and air gulps raise the limit.
  b.pitchLimit = p.maxPitch * 0.55;
  b.flare = Math.max(0, b.flare - dt * 1.5);
  if (b.mode !== 'hide' && b.mode !== 'rest' && b.mode !== 'feed') b.shelterOwner = undefined;
  b.modeT += dt;
  b.subT += dt;
  // Buried animals emerge gradually when no longer resting.
  if (b.buried > 0 && !(b.mode === 'rest' || b.mode === 'hide')) b.buried = Math.max(0, b.buried - dt / 2.5);

  // Clients pose for cleaners: hold still with fins spread.
  if (b.pose > 0 && (b.mode === 'cruise' || b.mode === 'shoal' || b.mode === 'hover' || b.mode === 'patrol')) {
    b.hold = true;
    b.ds = 0.04 * p.cruise * b.L;
    b.flare = Math.max(b.flare, 0.35);
    b.label = 'posing for a cleaner';
    socialAndAvoid(ctx, fish, b, 0);
    return;
  }

  switch (b.mode) {
    case 'cruise': steerCruise(ctx, fish, b, dt); break;
    case 'shoal': steerShoal(ctx, fish, b); break;
    case 'hover': steerHover(ctx, fish, b); break;
    case 'forage': steerForage(ctx, fish, b, dt); break;
    case 'rest': steerRest(ctx, fish, b, dt); break;
    case 'hide': steerRest(ctx, fish, b, dt); break;
    case 'flee': steerFlee(ctx, fish, b, dt); break;
    case 'feed': steerFeed(ctx, fish, b); break;
    case 'gulp': steerGulp(ctx, fish, b); break;
    case 'patrol': steerPatrol(ctx, fish, b); break;
    case 'chase': steerChase(ctx, fish, b); break;
    case 'investigate': steerInvestigate(ctx, fish, b); break;
    case 'flare': steerFlare(ctx, fish, b); break;
    case 'clean': steerClean(ctx, fish, b); break;
    case 'stalk': steerStalk(ctx, fish, b); break;
    case 'graze': steerGraze(ctx, fish, b); break;
    case 'perch': steerPerch(ctx, fish, b); break;
    case 'ambush': steerAmbush(ctx, fish, b); break;
    case 'explore': steerExplore(ctx, fish, b); break;
    default: steerCruise(ctx, fish, b, dt);
  }
  if (b.surf === SURF_NONE) {
    const cohesion = b.mode === 'shoal' ? 1 : b.mode === 'flee' && p.schooling > 0 ? 1.2 : (b.mode === 'rest' && b.restKind === RK_HOVER) || b.mode === 'explore' ? 0.35 : b.mode === 'cruise' && p.schooling > 0 ? 0.3 : 0;
    socialAndAvoid(ctx, fish, b, cohesion);
  }
}

function socialAndAvoid(ctx: Ctx, fish: FishEntity, b: Brain, cohesion: number): void {
  social(ctx, fish, b, cohesion);
  avoid(ctx, fish, b);
}

// ---- cruise --------------------------------------------------------------------------------

function steerCruise(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const L = b.L;
  b.prefH += (b.prefHTarget - b.prefH) * Math.min(1, dt / 20);
  if (!b.hasGoal || b.subT > 25 || dist2(fish, b.gx, b.gy, b.gz) < Math.max(0.04, 2.5 * L) ** 2) {
    pickZoneGoal(ctx, fish, b, 0.6);
    b.subT = 0;
  }
  const sp = cruiseSpeed(ctx, b);
  seek(fish, b, b.gx, b.gy, b.gz, Math.max(sp, 0.4 * b.p.cruise * L), 2 * L);
  meander(ctx, b, 0.5);
  if (b.p.t['surface-skimmer']) b.dy *= 0.3;
  b.label = b.p.t['surface-skimmer'] ? 'skimming the surface' : b.rest > 0.3 && ctx.light < 0.5 ? (ctx.env.hour < 12 ? 'waking up' : 'slowing down for the night') : 'cruising';
}

// ---- shoal / school ---------------------------------------------------------------------------

function steerShoal(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const g = ctx.groups.get(fish.species.id);
  if (!g || g.count < 2) {
    steerCruise(ctx, fish, b, ctx.dt);
    return;
  }
  const p = b.p;
  const a = g.anchors[b.anchor % g.nAnchors];
  const R = g.radius;
  const t = ctx.t;
  // Personal slot in the group; slots drift so members keep exchanging places.
  const ox = noise1(t * 0.03, b.noiseSeed ^ 0x11) * R;
  const oy = noise1(t * 0.027, b.noiseSeed ^ 0x22) * R * 0.35;
  const oz = noise1(t * 0.031, b.noiseSeed ^ 0x33) * R * 0.7;
  const gx = a.x + ox, gy = a.y + oy, gz = a.z + oz;
  const k = fish.kin;
  const dx = gx - k.pos[0], dy = gy - k.pos[1], dz = gz - k.pos[2];
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const base = cruiseSpeed(ctx, b);
  const far = clamp((d - R * 0.5) / Math.max(1e-3, R), 0, 1.5);
  const sp = base * (0.75 + 0.6 * far);
  // In a school, once at your slot you swim with the group's heading (polarization).
  const av = Math.sqrt(a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
  const toward = clamp(d / Math.max(1e-3, R), 0, 1);
  if (av > 1e-4) {
    const pol = p.schooling === 2 ? 1.2 : 0.4;
    desire(b, (dx / Math.max(d, 1e-6)) * toward + (a.vx / av) * (1 - toward) * pol, (dy / Math.max(d, 1e-6)) * toward, (dz / Math.max(d, 1e-6)) * toward + (a.vz / av) * (1 - toward) * pol, sp);
  } else {
    desire(b, dx, dy, dz, sp);
  }
  if (p.schooling === 1) meander(ctx, b, 0.35);
  b.label = p.schooling === 2 ? 'schooling' : 'shoaling';
  // Loose shoalers sometimes peel off to pick at something, then rejoin.
  if (p.schooling === 1 && b.soloT <= 0 && b.fear < 0.15 && g.fear < 0.15) {
    b.soloT = ctx.rng.range(25, 80);
    enter(ctx, fish, b, 'forage', ctx.rng.range(3, 9));
  }
}

// ---- hover ------------------------------------------------------------------------------------

function steerHover(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  if (!b.hasGoal || b.subT > b.subDur) {
    b.subT = 0;
    b.subDur = ctx.rng.range(5, 15);
    const home = fish.state.home;
    let cx = k.pos[0], cy = k.pos[1], cz = k.pos[2], r = 4 * L;
    if (home && p.t['anemone-host'] && ctx.rng.chance(0.35)) {
      // Nestle down into the tentacles for a few seconds.
      b.sub = 1;
      b.subDur = ctx.rng.range(3, 8);
      b.gx = home[0] + ctx.rng.signed() * 0.3 * L;
      b.gy = home[1] + 0.3 * L;
      b.gz = home[2] + ctx.rng.signed() * 0.3 * L;
      b.hasGoal = true;
      const ci = ctx.pickCover('anemone', home[0], home[2], 0.1);
      b.shelterOwner = ci >= 0 ? ctx.h.cover[ci].ownerId : undefined;
      return steerHover(ctx, fish, b);
    }
    b.sub = 0;
    if (home && (p.t['anemone-host'] || p.t.territorial || p.t['cave-dweller'] || p.t.burrower)) {
      cx = home[0];
      cy = home[1] + (p.t['anemone-host'] ? 0.6 * L : p.t.burrower ? 1.5 * L : 2 * L);
      cz = home[2];
      r = p.t['anemone-host'] ? 1.2 * L : p.t.burrower ? 2 * L : 3 * L;
    } else if (b.partner && (p.pairs || p.harem)) {
      const q = b.partner.kin.pos;
      cx = q[0];
      cy = q[1];
      cz = q[2];
      r = 3 * L;
    } else {
      const ci = ctx.pickCover(null, k.pos[0], k.pos[2], 0.35);
      if (ci >= 0 && (p.t.shy || p.t.hoverer)) {
        const c = h.cover[ci];
        cx = c.position[0];
        cz = c.position[2];
        cy = Math.max(c.position[1], h.yAtFrac(cx, cz, b.prefH));
        r = c.radius + 2 * L;
      } else {
        cy = h.yAtFrac(cx, cz, b.prefH);
      }
    }
    b.gx = cx + ctx.rng.signed() * r;
    b.gy = cy + ctx.rng.signed() * r * 0.4;
    b.gz = cz + ctx.rng.signed() * r * 0.7;
    const B = h.b;
    b.gx = clamp(b.gx, -B.halfW + 2 * L, B.halfW - 2 * L);
    b.gz = clamp(b.gz, -B.halfD + 2 * L, B.halfD - 2 * L);
    b.gy = clamp(b.gy, h.floor(b.gx, b.gz) + bodyR(b) + 0.01, B.surfaceY - bodyR(b) - 0.01);
    b.hasGoal = true;
  }
  const d = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz));
  if (d > 1.5 * L) {
    seek(fish, b, b.gx, b.gy, b.gz, 0.45 * p.cruise * L * b.pace, 2 * L);
    b.hold = d < 3 * L;
  } else {
    b.hold = true;
    // Look around slowly, and tend to face into the current (rheotaxis).
    const look = b.yaw + noise1(ctx.t * 0.12, b.noiseSeed ^ 0x77) * 1.2;
    let fx = Math.cos(look), fz = Math.sin(look);
    h.current(ctx.env, ctx.t, k.pos[0], k.pos[1], k.pos[2], ctx.cur);
    const cs = Math.sqrt(ctx.cur[0] * ctx.cur[0] + ctx.cur[2] * ctx.cur[2]);
    if (cs > 0.006) {
      fx = fx * 0.5 - (ctx.cur[0] / cs) * 0.5;
      fz = fz * 0.5 - (ctx.cur[2] / cs) * 0.5;
    }
    face(b, fx + (b.gx - k.pos[0]) * 4, fz + (b.gz - k.pos[2]) * 4, 0.08 * p.cruise * L);
    b.dy = (b.gy - k.pos[1]) / Math.max(L, 0.01);
  }
  b.posture = p.postureRest * 0.7 + p.postureCruise * 0.3;
  b.label = p.t['anemone-host'] && fish.state.home ? (b.sub === 1 ? 'nestling in its anemone' : 'hovering by its anemone') : 'hovering';
  if (b.sub === 1) {
    // Clownfish wriggle among the tentacles: allowed into the anemone, rubbing from side to side.
    const ci = fish.state.home ? ctx.pickCover('anemone', fish.state.home[0], fish.state.home[2], 0.1) : -1;
    if (ci >= 0) b.shelterOwner = ctx.h.cover[ci].ownerId;
    b.floorOk = true;
    b.thrash = 0.25;
  }
}

// ---- forage -----------------------------------------------------------------------------------

function steerForage(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const bottom = p.species.zone === 'bottom' || p.t['sand-sifter'] || (p.t['bottom-rester'] && p.species.zone !== 'top');
  if (bottom) forageBottom(ctx, fish, b, dt);
  else foragePick(ctx, fish, b, dt);
}

function forageBottom(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  const B = h.b;
  const sifter = p.t['sand-sifter'] && ctx.world.tank.substrate !== 'bare';
  b.floorOk = true;
  if (b.sub === 0) {
    if (!b.hasGoal) {
      // Next spot 2–6 BL away, roughly ahead; group foragers drift with their shoal.
      const ang = b.yaw + ctx.rng.signed() * 1.3;
      const step = ctx.rng.range(2, 6) * L;
      let x = k.pos[0] + Math.cos(ang) * step, z = k.pos[2] + Math.sin(ang) * step;
      const g = ctx.groups.get(fish.species.id);
      if (g && g.count > 1 && p.schooling > 0) {
        const a = g.anchors[b.anchor % g.nAnchors];
        x = x * 0.6 + a.x * 0.4;
        z = z * 0.6 + a.z * 0.4;
      }
      const m = Math.max(0.02, 1.2 * L);
      b.gx = clamp(x, -B.halfW + m, B.halfW - m);
      b.gz = clamp(z, -B.halfD + m, B.halfD - m);
      b.gy = h.floor(b.gx, b.gz) + bodyR(b) + 0.003;
      if (h.insideDecor(b.gx, b.gy, b.gz, -0.5 * L)) {
        b.gx = k.pos[0] - Math.cos(ang) * step * 0.5;
        b.gz = k.pos[2] - Math.sin(ang) * step * 0.5;
        b.gx = clamp(b.gx, -B.halfW + m, B.halfW - m);
        b.gz = clamp(b.gz, -B.halfD + m, B.halfD - m);
        b.gy = h.floor(b.gx, b.gz) + bodyR(b) + 0.003;
      }
      b.hasGoal = true;
      b.subT = 0;
    }
    const hd = Math.hypot(b.gx - k.pos[0], b.gz - k.pos[2]);
    seek(fish, b, b.gx, b.gy, b.gz, 0.6 * p.cruise * L * b.pace * (1 + 0.5 * b.excite), 1.5 * L);
    b.posture = -8 * DEG;
    b.label = 'foraging';
    if (hd < 0.6 * L || b.subT > 6) {
      b.sub = 1;
      b.subT = 0;
      b.subDur = sifter ? ctx.rng.range(0.5, 0.9) : ctx.rng.range(0.8, 3);
      b.snap = 0.8;
    }
  } else if (b.sub === 1) {
    // Rooting: nose into the substrate (corydoras ~30°, sand-sifters take a deep mouthful).
    b.hold = true;
    face(b, Math.cos(b.yaw), Math.sin(b.yaw), 0.02 * L);
    b.dy = -0.4;
    b.posture = sifter ? -38 * DEG : -26 * DEG;
    b.pitchLimit = 10 * DEG;
    if (!sifter && ctx.rng.chance(dt * 2.5)) b.chewT = 0.25;
    b.label = sifter ? 'sifting sand' : 'rooting in the substrate';
    if (p.t.digger && ctx.world.tank.substrate !== 'bare') {
      // Excavating: nose down, tail fanning hard to blow sand out of the pit.
      b.thrash = 0.55 + 0.35 * Math.sin(ctx.t * 9);
      b.label = 'digging a pit';
    }
    if (b.subT > b.subDur) {
      b.subT = 0;
      if (sifter) {
        b.sub = 2;
        b.subDur = ctx.rng.range(1.2, 2.4);
        b.chewT = b.subDur;
        b.gy = k.pos[1] + 0.8 * L;
      } else {
        b.sub = 0;
        b.hasGoal = false;
      }
    }
  } else {
    // Sand-sifter chewing: rise a little, chew, expel sand through the gills.
    b.hold = true;
    face(b, Math.cos(b.yaw), Math.sin(b.yaw), 0.04 * L);
    b.dy = (b.gy - k.pos[1]) / Math.max(0.01, L);
    b.label = 'sifting sand';
    if (b.subT > b.subDur) {
      b.sub = 0;
      b.hasGoal = false;
    }
  }
}

function foragePick(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  const B = h.b;
  if (b.sub === 0) {
    if (!b.hasGoal) {
      // Find something to pick at: plants, a rock/wood face, or the glass biofilm.
      let found = false;
      const ci = ctx.pickCover('plants', k.pos[0], k.pos[2], 0.4);
      const rock = p.t['surface-grazer'] || p.t['algae-eater'] || p.t['coral-nipper'];
      if (ci >= 0 && !rock) {
        const c = h.cover[ci];
        b.gx = c.position[0] + ctx.rng.signed() * c.radius;
        b.gz = c.position[2] + ctx.rng.signed() * c.radius * 0.6;
        b.gy = clamp(c.position[1] + ctx.rng.range(-0.3, 1) * c.radius, h.floor(b.gx, b.gz) + 0.02, B.surfaceY - 0.03);
        found = true;
      } else if (h.colliders.length > 0) {
        const n = h.colliders.length;
        const i = Math.floor(ctx.rng.next() * n);
        const c = h.colliders[i];
        const cc = c.type === 'capsule' ? c.a : c.center;
        const v = ctx.v3;
        v[0] = cc[0] + ctx.rng.signed() * 0.1;
        v[1] = cc[1] + ctx.rng.range(0, 0.15);
        v[2] = cc[2] + ctx.rng.range(0, 0.1);
        h.projectToCollider(i, v, 0.7 * L + 0.01);
        if (Math.abs(v[0] - k.pos[0]) < 0.5) {
          b.gx = v[0];
          b.gy = clamp(v[1], h.floor(v[0], v[2]) + bodyR(b) + 0.005, B.surfaceY - 0.03);
          b.gz = v[2];
          found = true;
        }
      }
      if (!found) {
        // Back glass biofilm.
        b.gx = clamp(k.pos[0] + ctx.rng.signed() * 0.2, -B.halfW + 2 * L, B.halfW - 2 * L);
        b.gz = -B.halfD + 0.9 * L + 0.01;
        b.gy = h.yAtFrac(b.gx, b.gz, b.prefH);
      }
      b.hasGoal = true;
      b.subT = 0;
    }
    seek(fish, b, b.gx, b.gy, b.gz, 0.6 * p.cruise * L * b.pace, 2 * L);
    b.label = 'foraging';
    b.decorOk = dist2(fish, b.gx, b.gy, b.gz) < (3 * L) ** 2;
    if (dist2(fish, b.gx, b.gy, b.gz) < (1.2 * L) ** 2 || b.subT > 10) {
      b.sub = 1;
      b.subT = 0;
      b.subDur = ctx.rng.range(2, 6);
    }
  } else {
    // Peck: hold position, nose slightly down, quick bites.
    b.hold = true;
    b.glassOk = true;
    b.decorOk = true;
    face(b, Math.cos(b.yaw) + noise1(ctx.t * 0.4, b.noiseSeed) * 0.4, Math.sin(b.yaw), 0.05 * p.cruise * L);
    b.dy = (b.gy - k.pos[1]) / Math.max(0.01, L);
    b.posture = -12 * DEG;
    if (ctx.rng.chance(dt * 1.2)) {
      b.snap = 1;
      b.ds = 0.6 * p.cruise * L;
    }
    b.label = p.t['surface-grazer'] || p.t['algae-eater'] ? 'grazing algae' : p.t['plant-eater'] ? 'nibbling plants' : p.t['coral-nipper'] ? 'picking at coral' : 'picking at plants';
    if (b.subT > b.subDur) {
      b.sub = 0;
      b.hasGoal = false;
    }
  }
}

// ---- rest / hide ------------------------------------------------------------------------------

function steerRest(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  const B = h.b;
  const kind = b.restKind;
  const deep = b.mode === 'rest' ? smoothstep(0.4, 0.9, b.rest) : 0.5;
  b.posture = p.postureRest;

  if (kind === RK_ATTACH) {
    if (b.surf === SURF_NONE) {
      // Swim to the nearest surface and hold on.
      if (!b.hasGoal) {
        pickGrazeSpot(ctx, fish, b, true);
        b.subT = 0;
      }
      seek(fish, b, b.gx, b.gy, b.gz, 0.5 * p.cruise * L, L);
      b.glassOk = true;
      b.floorOk = true;
      b.decorOk = b.goalSurf === SURF_DECOR && dist2(fish, b.gx, b.gy, b.gz) < (3 * L) ** 2;
      const reach = (b.goalSurf === SURF_DECOR ? 0.5 : 0.8) * L + standoff(b);
      if (dist2(fish, b.gx, b.gy, b.gz) < reach * reach) attachToGoalSurface(ctx, fish, b);
      else if (b.subT > 25) b.hasGoal = false;
    } else {
      b.ds = 0;
      b.hasSurfTarget = false;
    }
    b.label = b.mode === 'hide' && b.dayHide ? 'hiding until dark' : 'resting on the glass';
    if (b.surf === SURF_SUBSTRATE) b.label = 'resting on the bottom';
    if (b.surf === SURF_DECOR) b.label = 'resting on the decor';
    return;
  }

  if (kind === RK_BOTTOM) {
    if (b.surf === SURF_NONE) {
      if (!b.hasGoal) {
        // A patch of open sand, often at the foot of a plant thicket or a rock.
        const ci = ctx.pickCover(null, k.pos[0], k.pos[2], 0.3);
        const so = standoff(b);
        if (ci >= 0 && ctx.rng.chance(0.6)) {
          const c = h.cover[ci];
          pickOpenSand(ctx, b, c.position[0], c.position[2], c.radius + L, c.radius + L, so);
        } else pickOpenSand(ctx, b, k.pos[0], k.pos[2], 0.05, 0.04, so);
        b.gx = clamp(b.gx, -B.halfW + 1.2 * L, B.halfW - 1.2 * L);
        b.gz = clamp(b.gz, -B.halfD + 1.2 * L, B.halfD - 1.2 * L);
        b.gy = h.floor(b.gx, b.gz) + bodyR(b);
        b.hasGoal = true;
        b.subT = 0;
      }
      b.floorOk = true;
      const d = seek(fish, b, b.gx, b.gy, b.gz, 0.4 * p.cruise * L, 2 * L);
      const low = k.pos[1] - h.floor(k.pos[0], k.pos[2]) < bodyR(b) * 1.6;
      if (d < 0.7 * L + 0.01 || (b.subT > 8 && low)) {
        // Only settle where the sand is clear (not under a root or in a rock's footing).
        if (h.colliders.length === 0 || h.nearestDecor(k.pos[0], h.floor(k.pos[0], k.pos[2]) + standoff(b), k.pos[2]) > standoff(b) * 0.95) {
          attachSubstrate(h, fish, b);
          b.hasSurfTarget = false;
        } else b.hasGoal = false;
      } else if (b.subT > 25) b.hasGoal = false;
    } else {
      b.ds = 0;
      b.hasSurfTarget = false;
    }
    b.label = b.mode === 'hide' && b.dayHide ? 'hiding until dark' : b.rest > 0.5 ? 'sleeping on the bottom' : 'resting on the bottom';
    b.pitchLimit = p.maxPitch * 0.8;
    return;
  }

  if (kind === RK_BURY) {
    if (b.sub === 0) {
      if (!b.hasGoal) {
        // Its burrow — or, if that proved unreachable, open sand close by.
        const home = b.subDur < 0 ? undefined : fish.state.home;
        if (home) {
          b.gx = clamp(home[0], -B.halfW + L, B.halfW - L);
          b.gz = clamp(home[2], -B.halfD + L, B.halfD - L);
        } else pickOpenSand(ctx, b, k.pos[0], k.pos[2], 0.1, 0.05, bodyR(b));
        b.gy = h.floor(b.gx, b.gz) + bodyR(b);
        b.hasGoal = true;
        b.subT = 0;
      }
      b.floorOk = true;
      const d = seek(fish, b, b.gx, b.gy, b.gz, (b.fear > 0.3 ? 2 : 0.8) * p.cruise * L, L);
      b.label = 'heading for its burrow';
      // Dig in on arrival — or wherever it is, if it is down on the sand and can't get closer.
      const low = k.pos[1] - h.floor(k.pos[0], k.pos[2]) < bodyR(b) * 2 + 0.006;
      if (d < 0.8 * L + 0.006 || (b.subT > 12 && low)) {
        b.sub = 1;
        b.subT = 0;
      } else if (b.subT > 40) {
        b.hasGoal = false;
        b.subDur = -1; // (flag: try open sand next)
        b.subT = 0;
      }
    } else {
      // Dive in head-first and work down until mostly buried.
      b.floorOk = true;
      b.hold = true;
      face(b, Math.cos(b.yaw), Math.sin(b.yaw), 0);
      b.buried = Math.min(1, b.buried + dt / (b.fear > 0.3 ? 0.6 : 2.5));
      b.label = b.mode === 'hide' ? (b.dayHide ? 'buried until dark' : 'hiding in its burrow') : 'sleeping in the sand';
    }
    return;
  }

  if (kind === RK_ANEMONE || kind === RK_COVER) {
    let ci = b.coverIdx;
    // An index from an older layout (decor/plants changed) is meaningless now: find shelter again
    // instead of giving up on it (once per layout, so a tank without cover costs nothing).
    if (ci >= 0 && (b.coverVersion !== h.version || ci >= h.cover.length)) ci = b.coverIdx = -1;
    if (ci < 0 && b.coverMiss !== h.version) {
      if (kind === RK_ANEMONE) {
        // Its own anemone (the pair's home), else the nearest one.
        const home = fish.state.home;
        ci = ctx.pickCover('anemone', home ? home[0] : k.pos[0], home ? home[2] : k.pos[2], 9);
        if (ci >= 0) claimCover(ctx, b, ci);
        else b.coverMiss = h.version;
      } else ci = chooseCover(ctx, fish, b);
      b.hasGoal = false;
    }
    if (ci >= 0 && ci < h.cover.length && b.coverVersion === h.version) {
      const c = h.cover[ci];
      b.shelterOwner = c.ownerId;
      if (!b.hasGoal || b.subT > b.subDur) {
        const r = Math.max(0, c.radius - 0.5 * L);
        b.gx = c.position[0] + ctx.rng.signed() * r * 0.6;
        b.gz = c.position[2] + ctx.rng.signed() * r * 0.6;
        b.gy = Math.max(c.position[1] + ctx.rng.signed() * r * 0.3, h.floor(b.gx, b.gz) + bodyR(b) + 0.003);
        b.hasGoal = true;
        b.subT = 0;
        b.subDur = ctx.rng.range(6, 20);
      }
      const d = seek(fish, b, b.gx, b.gy, b.gz, (b.fear > 0.3 ? 1.8 : 0.5) * p.cruise * L * (1 - 0.5 * deep), 2 * L);
      if (d < c.radius) {
        b.hold = true;
        // Sheltering fish face out of their refuge.
        const ox = k.pos[0] - c.position[0], oz = k.pos[2] - c.position[2];
        face(b, ox + 0.3 * Math.cos(b.yaw), oz + 0.3 * Math.sin(b.yaw) + 0.15, 0.03 * p.cruise * L * (1 - deep));
        b.dy = (b.gy - k.pos[1]) / Math.max(0.01, L);
        b.floorOk = true;
      }
      b.label = kind === RK_ANEMONE ? 'nestled in its anemone' : b.mode === 'hide' ? (b.dayHide ? 'hiding until dark' : b.fear > 0.2 ? 'hiding' : 'sheltering') : 'sleeping in cover';
      return;
    }
    // No cover in the tank: hide low against the back glass, near the corners.
    if (!b.hasGoal) {
      const side = k.pos[0] >= 0 ? 1 : -1;
      b.gx = side * (B.halfW - 2 * L - ctx.rng.range(0, 0.15));
      b.gz = -B.halfD + 1.5 * L + 0.01;
      b.gy = h.floor(b.gx, b.gz) + bodyR(b) + 0.01 + ctx.rng.range(0, 0.04);
      b.hasGoal = true;
    }
    const d = seek(fish, b, b.gx, b.gy, b.gz, (b.fear > 0.3 ? 1.5 : 0.4) * p.cruise * L, 2 * L);
    if (d < 2 * L) b.hold = true;
    b.floorOk = true;
    b.label = b.mode === 'hide' ? 'hiding' : 'resting';
    return;
  }

  // RK_HOVER: sink low (often among plants) and hang almost motionless, facing into the current.
  const g = ctx.groups.get(fish.species.id);
  if (!b.hasGoal || b.subT > b.subDur) {
    b.subT = 0;
    b.subDur = ctx.rng.range(20, 60);
    if (g && g.count > 1 && p.schooling > 0) {
      const a = g.anchors[0];
      const R = g.radius * 1.4;
      b.gx = a.x + ctx.rng.signed() * R;
      b.gz = a.z + ctx.rng.signed() * R * 0.6;
      b.gy = a.y + ctx.rng.signed() * R * 0.3;
    } else {
      const ci = ctx.pickCover('plants', k.pos[0], k.pos[2], 0.5);
      if (ci >= 0) {
        const c = h.cover[ci];
        b.gx = c.position[0] + ctx.rng.signed() * c.radius;
        b.gz = c.position[2] + ctx.rng.signed() * c.radius * 0.6;
      } else {
        b.gx = k.pos[0] + ctx.rng.signed() * 0.05;
        b.gz = k.pos[2] + ctx.rng.signed() * 0.03;
      }
      b.gy = h.yAtFrac(b.gx, b.gz, Math.max(0.1, p.zoneLo * 0.6 + 0.05));
    }
    b.gx = clamp(b.gx, -B.halfW + 2 * L, B.halfW - 2 * L);
    b.gz = clamp(b.gz, -B.halfD + 2 * L, B.halfD - 2 * L);
    b.gy = clamp(b.gy, h.floor(b.gx, b.gz) + bodyR(b) + 0.01, B.surfaceY - bodyR(b) - 0.01);
    b.hasGoal = true;
  }
  const d = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz));
  if (d > 2 * L) {
    seek(fish, b, b.gx, b.gy, b.gz, 0.35 * p.cruise * L * (1 - 0.4 * deep) + 0.003, 3 * L);
    b.hold = d < 4 * L;
  } else {
    b.hold = true;
    h.current(ctx.env, ctx.t, k.pos[0], k.pos[1], k.pos[2], ctx.cur);
    const cs = Math.sqrt(ctx.cur[0] * ctx.cur[0] + ctx.cur[2] * ctx.cur[2]);
    const fx = Math.cos(b.yaw), fz = Math.sin(b.yaw);
    if (cs > 0.004) face(b, fx * 0.7 - (ctx.cur[0] / cs) * 0.3, fz * 0.7 - (ctx.cur[2] / cs) * 0.3, 0.03 * p.cruise * L);
    else face(b, fx, fz, 0.02 * p.cruise * L);
    b.dy = ((b.gy - k.pos[1]) / Math.max(0.01, L)) * 0.5;
  }
  b.label = b.rest > 0.7 ? 'sleeping' : 'resting';
}

// ---- flee -------------------------------------------------------------------------------------

function steerFlee(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const L = b.L;
  b.label = 'fleeing';
  if (b.fleeDelay > 0) {
    // Reaction latency: carry on for a few tens of milliseconds.
    b.fleeDelay -= dt;
    b.ds = Math.max(b.ds, 0);
    return;
  }
  if (b.fleeT > 0) {
    b.fleeT -= dt;
    // C-start: very fast turn + burst away from the threat.
    b.turnBoost = 5;
    b.accelBoost = b.accelBurst / Math.max(1e-4, b.accel);
    b.pitchLimit = 35 * DEG;
    desire(b, b.fleeX, b.fleeY, b.fleeZ, p.burst * L * clamp(0.45 + 0.55 * b.fear, 0.4, 1));
    return;
  }
  // Escape over: think right away (hide / regroup / carry on).
  b.ds = cruiseSpeed(ctx, b) * 1.6;
  b.thinkT = 0;
  b.modeDur = 0;
  if (b.mode === 'flee') enter(ctx, fish, b, p.schooling > 0 ? 'shoal' : 'cruise', ctx.rng.range(8, 20));
}

/** Start an escape away from (ax, ay, az). */
export function startFlee(ctx: Ctx, fish: FishEntity, b: Brain, ax: number, ay: number, az: number, intensity: number, delay: number): void {
  const k = fish.kin;
  let x = k.pos[0] - ax, y = k.pos[1] - ay, z = k.pos[2] - az;
  // Escape mostly horizontally, with a random lateral component (unpredictable escapes).
  const l = Math.sqrt(x * x + z * z) || 1;
  x /= l;
  z /= l;
  const a = ctx.rng.signed() * 0.7;
  const c = Math.cos(a), s = Math.sin(a);
  const ex = x * c - z * s, ez = x * s + z * c;
  y = clamp(y * 2, -0.35, 0.35);
  if (b.surf !== SURF_NONE) detach(fish, b);
  enter(ctx, fish, b, 'flee', 3);
  b.fleeX = ex;
  b.fleeY = y;
  b.fleeZ = ez;
  b.fleeT = 0.25 + 0.45 * intensity;
  b.fleeDelay = delay;
}

// ---- feeding ----------------------------------------------------------------------------------

function steerFeed(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  if (!foodValid(ctx, b)) {
    b.thinkT = 0;
    b.ds = cruiseSpeed(ctx, b);
    b.label = 'looking for food';
    return;
  }
  const f = b.food!;
  const app = appetite(fish);
  const zeal = p.enthusiasm * (0.4 + app) * (1 + b.excite);
  const fx = Math.cos(b.bodyPitch) * Math.cos(b.yaw), fy = Math.sin(b.bodyPitch), fz = Math.cos(b.bodyPitch) * Math.sin(b.yaw);
  const reachOff = 0.46 * L;
  // Mouth position (attached suckermouths: centre of the underside).
  const mx = b.surf !== SURF_NONE ? k.pos[0] : k.pos[0] + fx * reachOff;
  const my = b.surf !== SURF_NONE ? k.pos[1] - b.ny * standoff(b) : k.pos[1] + fy * reachOff;
  const mz = b.surf !== SURF_NONE ? k.pos[2] : k.pos[2] + fz * reachOff;
  // Lead moving food a little.
  const dRaw = Math.sqrt((f.pos[0] - mx) ** 2 + (f.pos[1] - my) ** 2 + (f.pos[2] - mz) ** 2);
  // Can't get at it (wedged under a rock or behind a root)? Leave it and look for another bite.
  if (feedProgress(b, dRaw, ctx.dt, b.surf !== SURF_NONE ? 20 : 8)) {
    b.thinkT = 0;
    b.scanT = 0;
    b.ds = cruiseSpeed(ctx, b);
    b.label = 'looking for food';
    return;
  }
  const lead = clamp(dRaw / Math.max(0.02, Math.abs(b.speed) + p.cruise * L), 0, 0.6);
  const tx = f.pos[0] + f.vel[0] * lead, ty = f.pos[1] + f.vel[1] * lead, tz = f.pos[2] + f.vel[2] * lead;
  // Food lying on or against rock & wood: nose right up to it.
  if (f.state === 'settled' && dRaw < 3 * L) b.decorOk = true;
  const reach = Math.max(0.0035, 0.22 * L + f.sizeM * 0.5);
  const big = f.sizeM > p.gapeFrac * L * 1.5;

  // Suckermouth catfish settle onto big food and rasp at it.
  if ((p.mouth === 'sucker' || p.t.clings) && f.state === 'settled' && rt(f).restOn !== -2) {
    if (b.surf === SURF_NONE) {
      seek(fish, b, tx, ty + bodyR(b), tz, 0.7 * p.cruise * L * (1 + zeal), 1.5 * L);
      b.floorOk = true;
      if (dRaw < 0.8 * L + f.sizeM) {
        const on = rt(f).restOn ?? -1;
        if (on >= 0 && on < h.colliders.length) attachDecor(h, fish, b, on);
        else attachSubstrate(h, fish, b);
      }
    } else {
      // Shuffle onto the food.
      b.sx = f.pos[0];
      b.sy = f.pos[1];
      b.sz = f.pos[2];
      b.hasSurfTarget = true;
      b.ds = 0.3 * p.cruise * L;
      tryBite(ctx, fish, b, k.pos[0], k.pos[1], k.pos[2], 0.35 * L + f.sizeM * 0.6);
    }
    b.label = 'rasping at food';
    return;
  }
  if (b.surf !== SURF_NONE) detach(fish, b);

  // Aim so the mouth (not the centre) meets the food.
  const vx = tx - k.pos[0], vy = ty - k.pos[1], vz = tz - k.pos[2];
  const dc = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
  const near = clamp((dRaw - reach) / (4 * L), 0, 1);
  const far = p.cruise * L * (1.2 + 1.6 * zeal);
  const speed = Math.min(0.45 * p.burst * L, far) * near + 0.45 * p.cruise * L * (1 - near);
  desire(b, vx, vy, vz, speed);
  if (dc < 3 * L) b.turnBoost = 1.6;
  const hf = h.heightFrac(f.pos[0], f.pos[1], f.pos[2]);
  if (p.t.spitter && f.state === 'floating' && f.kind === 'fruit-flies' && b.biteT <= 0) {
    // Archerfish: line up beneath the insect, pause to aim, then strike.
    const hd = Math.hypot(f.pos[0] - k.pos[0], f.pos[2] - k.pos[2]);
    if (b.sub === 0 && hd < 3 * L && f.pos[1] - k.pos[1] < 6 * L) {
      b.sub = 1;
      b.subT = 0;
    }
    if (b.sub === 1 && b.subT < 0.9) {
      b.hold = true;
      b.pitchLimit = 40 * DEG;
      b.posture = 25 * DEG;
      face(b, f.pos[0] - k.pos[0], f.pos[2] - k.pos[2], 0.02 * p.cruise * L);
      b.label = 'taking aim';
      return;
    }
  }
  if (f.state === 'floating' || hf > 0.94) {
    b.surfaceOk = true;
    b.pitchLimit = 40 * DEG;
    b.label = 'feeding at the surface';
  } else if (f.state === 'settled') {
    b.floorOk = true;
    b.glassOk = true;
    b.pitchLimit = 35 * DEG;
    const close = clamp(1 - dRaw / (2.5 * L), 0, 1);
    b.posture = -(p.species.zone === 'bottom' ? 25 : 35) * DEG * close;
    b.label = big ? 'nibbling' : 'picking food off the bottom';
    if (big && dRaw < reach * 1.5) {
      b.hold = true;
      b.ds = 0.05 * p.cruise * L;
    }
  } else {
    b.pitchLimit = 35 * DEG;
    b.label = f.state === 'swimming' ? 'hunting live food' : 'feeding';
  }
  if (tryBite(ctx, fish, b, mx, my, mz, reach)) {
    // Quick suction lunge.
    b.speed += 0.3 * p.cruise * L;
  }
  if (app < 0.05) {
    dropFood(b);
    b.thinkT = 0;
    b.modeDur = 0;
  }
  if (b.food === null) {
    b.scanT = 0;
    b.thinkT = Math.min(b.thinkT, 0.1);
  }
}

// ---- air gulping ---------------------------------------------------------------------------------

function steerGulp(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  const bottom = p.species.zone === 'bottom';
  // Corydoras shoot almost vertically; labyrinth fish rise at an angle.
  b.pitchLimit = bottom ? 70 * DEG : 45 * DEG;
  b.label = 'gulping air';
  if (b.sub === 0) {
    if (!b.hasGoal) {
      b.gx = clamp(k.pos[0] + Math.cos(b.yaw) * 4 * L, -h.b.halfW + 2 * L, h.b.halfW - 2 * L);
      b.gz = clamp(k.pos[2] + Math.sin(b.yaw) * 2 * L, -h.b.halfD + 2 * L, h.b.halfD - 2 * L);
      b.gy = h.b.surfaceY;
      b.hasGoal = true;
    }
    b.surfaceOk = true;
    seek(fish, b, b.gx, b.gy, b.gz, (bottom ? 0.45 * p.burst : 1.6 * p.cruise) * L, 0);
    if (k.pos[1] + 0.5 * L * Math.sin(b.bodyPitch) > h.b.surfaceY - 0.004 || b.subT > 8) {
      b.sub = 1;
      b.subT = 0;
      b.snap = 1;
    }
  } else if (b.sub === 1) {
    b.surfaceOk = true;
    b.hold = true;
    b.ds = 0;
    if (b.subT > 0.3) {
      b.sub = 2;
      b.subT = 0;
      b.gy = h.yAtFrac(k.pos[0], k.pos[2], (p.zoneLo + p.zoneHi) * 0.5);
      b.gx = clamp(k.pos[0] + Math.cos(b.yaw) * 3 * L, -h.b.halfW + 2 * L, h.b.halfW - 2 * L);
      b.gz = k.pos[2];
    }
  } else {
    seek(fish, b, b.gx, b.gy, b.gz, (bottom ? 0.4 * p.burst : 1.4 * p.cruise) * L, 2 * L);
    if (Math.abs(k.pos[1] - b.gy) < 2 * L || b.subT > 6) {
      // Interval: labyrinth fish every few minutes, corydoras every ~10 min; more often in low O2.
      const o2 = clamp(ctx.world.tank.waterParams.oxygen, 0.3, 1);
      b.airT = ctx.rng.exp((bottom ? 600 : 150) * o2);
      b.modeDur = 0;
      b.thinkT = 0;
      enter(ctx, fish, b, p.schooling > 0 ? 'shoal' : 'cruise', 10);
    }
  }
}

// ---- territorial -----------------------------------------------------------------------------------

function steerPatrol(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const home = fish.state.home;
  if (!home) {
    steerCruise(ctx, fish, b, ctx.dt);
    return;
  }
  const r = territoryRadius(b);
  if (!b.hasGoal || dist2(fish, b.gx, b.gy, b.gz) < (1.5 * L) ** 2 || b.subT > 12) {
    // Patrol points along the territory edge.
    const a = ctx.rng.next() * Math.PI * 2;
    const h = ctx.h;
    b.gx = clamp(home[0] + Math.cos(a) * r * ctx.rng.range(0.5, 1), -h.b.halfW + 2 * L, h.b.halfW - 2 * L);
    b.gz = clamp(home[2] + Math.sin(a) * r * ctx.rng.range(0.3, 0.7), -h.b.halfD + 2 * L, h.b.halfD - 2 * L);
    b.gy = clamp(home[1] + ctx.rng.signed() * r * 0.3, h.floor(b.gx, b.gz) + bodyR(b) + 0.01, h.b.surfaceY - bodyR(b) - 0.01);
    b.hasGoal = true;
    b.subT = 0;
  }
  seek(fish, b, b.gx, b.gy, b.gz, 0.65 * p.cruise * L * b.pace, 2 * L);
  meander(ctx, b, 0.25);
  b.label = 'patrolling its territory';
}

function steerChase(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const tgt = b.target;
  if (!tgt || ctx.world.fishById.get(tgt.state.id) !== tgt || b.modeT > b.modeDur) {
    b.target = null;
    b.modeDur = 0;
    b.thinkT = 0;
    enter(ctx, fish, b, fish.state.home && p.t.territorial ? 'patrol' : p.schooling > 0 ? 'shoal' : 'cruise', ctx.rng.range(8, 20));
    return;
  }
  const q = tgt.kin.pos;
  const tb = tgt.brain.behavior as Brain | undefined;
  const nip = p.t['fin-nipper'] && b.label !== 'chasing off an intruder';
  // Aim at the tail for nips.
  const tf = tgt.kin.forward;
  const tl = tb ? tb.L : 0.05;
  const ax = nip ? q[0] - tf[0] * tl * 0.45 : q[0];
  const ay = nip ? q[1] - tf[1] * tl * 0.45 : q[1];
  const az = nip ? q[2] - tf[2] * tl * 0.45 : q[2];
  const d = seek(fish, b, ax, ay, az, (nip ? 0.6 : 0.5) * p.burst * L, 0);
  b.pitchLimit = p.maxPitch;
  b.turnBoost = 1.8;
  b.accelBoost = 2;
  if (d < 4 * L) b.flare = Math.max(b.flare, 0.7);
  b.label = nip ? 'nipping at fins' : 'chasing off an intruder';
  if (tb && d < 3 * L && tb.mode !== 'flee' && tb.mode !== 'hide' && tb.surf === SURF_NONE) {
    // The intruder retreats briskly (no contact, no injuries).
    tb.fear = Math.max(tb.fear, nip ? 0.3 : 0.4);
    startFlee(ctx, tgt, tb, fish.kin.pos[0], fish.kin.pos[1], fish.kin.pos[2], 0.25, 0.05);
    tb.fleeT = 0.25;
  }
  if (nip && d < 0.7 * L) {
    b.snap = 1;
    b.modeDur = Math.min(b.modeDur, b.modeT + 0.2);
  }
  // Territorial fish give up at the territory edge.
  const home = fish.state.home;
  if (home && !nip) {
    const hx = fish.kin.pos[0] - home[0], hz = fish.kin.pos[2] - home[2];
    if (hx * hx + hz * hz > (territoryRadius(b) * 1.6) ** 2) b.modeDur = Math.min(b.modeDur, b.modeT);
  }
}

// ---- curiosity, displays, cleaning, stalking -----------------------------------------------------

function steerInvestigate(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  const B = h.b;
  if (!b.hasGoal) {
    b.gx = clamp(k.pos[0] * 0.6 + ctx.rng.signed() * 0.12, -B.halfW + 3 * L, B.halfW - 3 * L);
    b.gz = B.halfD - (0.55 * L + 0.012);
    // Viewers look in around mid-height: curious fish come up/down a little toward them.
    const hf = clamp(0.5 * b.prefH + 0.25, p.zoneLo - 0.15, p.zoneHi + 0.15);
    b.gy = h.yAtFrac(b.gx, b.gz, clamp(hf, 0.08, 0.92));
    b.hasGoal = true;
  }
  b.glassOk = true;
  const d = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz));
  if (d > 1.5 * L) {
    seek(fish, b, b.gx, b.gy, b.gz, 0.8 * p.cruise * L * b.pace, 2 * L);
    b.label = 'coming to see you';
  } else {
    b.hold = true;
    // Look out through the glass, drifting gently side to side.
    const look = noise1(ctx.t * 0.25, b.noiseSeed ^ 0x99) * 0.6;
    face(b, Math.sin(look), 1, 0.05 * p.cruise * L);
    b.gx += noise1(ctx.t * 0.1, b.noiseSeed ^ 0x98) * 0.002;
    b.dy = (b.gy - k.pos[1]) / Math.max(0.01, L);
    b.label = 'watching you';
  }
}

function steerFlare(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const h = ctx.h;
  const L = b.L;
  const k = fish.kin;
  const B = h.b;
  if (!b.hasGoal) {
    // A rival nearby, or its own reflection in the nearest pane.
    let rival: FishEntity | null = null;
    const n = ctx.hash.query(k.pos[0], k.pos[1], k.pos[2], clamp(6 * L, 0.1, 0.3), b.idx, ctx.nbr);
    for (let i = 0; i < n; i++) {
      const o = ctx.world.fish[ctx.nbr[i]];
      const ob = ctx.brains[ctx.nbr[i]];
      if (ob.p.move === 'swimmer' && ob.L > 0.6 * L && ob.L < 2 * L && (o.species === fish.species || ob.p.t.flarer || ob.p.t.hoverer)) {
        rival = o;
        break;
      }
    }
    b.target = rival;
    if (!rival) {
      const dl = k.pos[0] + B.halfW, dr = B.halfW - k.pos[0], df = B.halfD - k.pos[2];
      if (df <= dl && df <= dr) {
        b.gx = k.pos[0];
        b.gz = B.halfD - 1.4 * L;
      } else {
        b.gx = dl < dr ? -B.halfW + 1.4 * L : B.halfW - 1.4 * L;
        b.gz = k.pos[2];
      }
      b.gy = k.pos[1];
    }
    b.hasGoal = true;
  }
  b.glassOk = true;
  let tx: number, tz: number;
  if (b.target) {
    const q = b.target.kin.pos;
    b.gx = q[0] - Math.cos(b.yaw) * 2 * L;
    b.gy = q[1];
    b.gz = q[2] - Math.sin(b.yaw) * 2 * L;
    tx = q[0] - k.pos[0];
    tz = q[2] - k.pos[2];
  } else {
    // Face the glass (its reflection).
    tx = b.gx === k.pos[0] ? 0 : Math.sign(b.gx) * 1;
    tz = b.gx === k.pos[0] ? 1 : 0;
    if (Math.abs(b.gz) > Math.abs(B.halfD - 2 * L)) {
      tx = 0;
      tz = 1;
    } else {
      tx = Math.sign(b.gx);
      tz = 0;
    }
  }
  const d = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz));
  if (d > 2 * L) {
    seek(fish, b, b.gx, b.gy, b.gz, 0.8 * p.cruise * L, 2 * L);
  } else {
    b.hold = true;
    // Flare in pulses, swinging between face-on and broadside.
    const ph = (b.modeT * 0.7) % 1;
    const swing = ph < 0.55 ? 0 : 1.1;
    const c = Math.cos(swing), s = Math.sin(swing);
    face(b, tx * c - tz * s, tx * s + tz * c, 0.03 * p.cruise * L);
    b.flare = ph < 0.8 ? 1 : 0.4;
  }
  b.label = b.target ? 'flaring at a rival' : 'flaring at its reflection';
}

function steerClean(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const c = b.target;
  const cb = c ? (c.brain.behavior as Brain | undefined) : undefined;
  if (!c || !cb || ctx.world.fishById.get(c.state.id) !== c || cb.mode === 'flee' || b.modeT > b.modeDur) {
    b.target = null;
    enter(ctx, fish, b, 'hover', ctx.rng.range(5, 12));
    return;
  }
  const q = c.kin.pos;
  const f = c.kin.forward;
  // Service station on the client's flank.
  const side = (b.noiseSeed & 1) === 0 ? 1 : -1;
  const lx = f[2] * side, lz = -f[0] * side;
  const off = 0.5 * cb.p.widthFrac * cb.L + 0.4 * L + 0.004;
  const along = noise1(ctx.t * 0.3, b.noiseSeed) * 0.3 * cb.L;
  const gx = q[0] + lx * off + f[0] * along, gy = q[1] + noise1(ctx.t * 0.25, b.noiseSeed ^ 3) * 0.2 * cb.p.depthFrac * cb.L, gz = q[2] + lz * off + f[2] * along;
  const d = seek(fish, b, gx, gy, gz, 1.2 * p.cruise * L, 1.5 * L);
  if (d < 1.2 * L) {
    b.hold = true;
    face(b, q[0] - fish.kin.pos[0], q[2] - fish.kin.pos[2], b.ds);
    cb.pose = 1.2;
    if (ctx.rng.chance(ctx.dt * 1.6)) b.snap = 1;
    b.label = 'cleaning a client';
  } else {
    b.label = 'approaching a client';
  }
}

function steerStalk(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const tgt = b.target;
  if (!tgt || ctx.world.fishById.get(tgt.state.id) !== tgt || b.modeT > b.modeDur) {
    b.target = null;
    b.modeDur = 0;
    b.thinkT = 0;
    enter(ctx, fish, b, 'cruise', 10);
    return;
  }
  const q = tgt.kin.pos;
  const k = fish.kin;
  const vx = q[0] - k.pos[0], vy = q[1] - k.pos[1], vz = q[2] - k.pos[2];
  const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const keep = 3.5 * L;
  if (d > keep) desire(b, vx, vy, vz, 0.35 * p.cruise * L * clamp((d - keep) / L, 0.2, 1));
  else {
    b.hold = true;
    face(b, vx, vz, 0.02 * p.cruise * L);
  }
  // The prey notices and edges away.
  const tb = tgt.brain.behavior as Brain | undefined;
  if (tb && d < 5 * L) tb.fear = Math.max(tb.fear, 0.2);
  b.label = 'stalking';
}

// ---- clinging grazers -----------------------------------------------------------------------------

/** Pick a surface spot for a clinging grazer: glass (often the front!), wood/rock, or substrate. */
function pickGrazeSpot(ctx: Ctx, fish: FishEntity, b: Brain, resting: boolean): void {
  const h = ctx.h;
  const B = h.b;
  const k = fish.kin;
  const L = b.L;
  const t = b.p.t;
  const so = standoff(b);
  const r = ctx.rng.next();
  const decorW = h.colliders.length > 0 ? (t['wood-eater'] ? 0.55 : 0.3) : 0;
  const glassW = t['glass-grazer'] || t.clings ? 0.6 : 0.2;
  const total = decorW + glassW + 0.12;
  const x0 = k.pos[0];
  if (r * total < glassW) {
    // Which pane: front glass is a favourite in aquaria (lit, algae film).
    const q = ctx.rng.next();
    const wall = q < 0.45 ? WALL_FRONT : q < 0.7 ? WALL_BACK : x0 < 0 ? WALL_LEFT : WALL_RIGHT;
    let x = clamp(x0 + ctx.rng.signed() * 0.25, -B.halfW + 2 * L, B.halfW - 2 * L);
    let z = clamp(k.pos[2] + ctx.rng.signed() * 0.15, -B.halfD + 2 * L, B.halfD - 2 * L);
    if (wall === WALL_FRONT) z = B.halfD - so;
    else if (wall === WALL_BACK) z = -B.halfD + so;
    else if (wall === WALL_LEFT) x = -B.halfW + so;
    else x = B.halfW - so;
    const fl = h.floor(x, z);
    const top = resting ? 0.5 : 0.9;
    b.gx = x;
    b.gz = z;
    b.gy = fl + so + 0.01 + ctx.rng.next() * Math.max(0.01, (B.surfaceY - fl) * top - so - 0.03);
    b.goalSurf = SURF_GLASS;
    b.goalSurfIdx = wall;
    b.hasGoal = true;
    return;
  }
  if (r * total < glassW + decorW) {
    // A decor surface: wood for wood-eaters, rock otherwise; prefer nearer pieces.
    let best = -1, bestS = Infinity;
    for (let i = 0; i < h.colliders.length; i++) {
      const kind = h.colliderKind[i];
      if (kind === 'plant') continue;
      const c = h.colliders[i];
      const cc = c.type === 'capsule' ? c.a : c.center;
      const dx = cc[0] - x0, dz = cc[2] - k.pos[2];
      let s = Math.sqrt(dx * dx + dz * dz) * (0.5 + ctx.rng.next());
      if (t['wood-eater'] && kind === 'driftwood') s *= 0.3;
      if (s < bestS) {
        bestS = s;
        best = i;
      }
    }
    if (best >= 0) {
      const c = h.colliders[best];
      const v = ctx.v3;
      const cc = c.type === 'capsule' ? c.a : c.center;
      const cb = c.type === 'capsule' ? c.b : c.center;
      const u = ctx.rng.next();
      v[0] = cc[0] + (cb[0] - cc[0]) * u + ctx.rng.signed() * 0.2;
      v[1] = cc[1] + (cb[1] - cc[1]) * u + ctx.rng.range(0, 0.2);
      v[2] = cc[2] + (cb[2] - cc[2]) * u + ctx.rng.range(-0.05, 0.2);
      h.projectToCollider(best, v, so);
      if (v[1] < B.surfaceY - so - 0.01 && v[1] > h.floor(v[0], v[2]) + so * 0.5) {
        b.gx = v[0];
        b.gy = v[1];
        b.gz = v[2];
        b.goalSurf = SURF_DECOR;
        b.goalSurfIdx = best;
        b.hasGoal = true;
        return;
      }
    }
  }
  // Substrate.
  pickOpenSand(ctx, b, k.pos[0], k.pos[2], 0.2, 0.1, so);
  b.goalSurf = SURF_SUBSTRATE;
  b.goalSurfIdx = -1;
  b.hasGoal = true;
}

/**
 * Goal on open substrate within ±(sx, sz) of (cx, cz), clear of rock and wood (the buried base
 * of a rock or the underside of a root is not somewhere to sit). Widens the search if needed.
 */
function pickOpenSand(ctx: Ctx, b: Brain, cx: number, cz: number, sx: number, sz: number, so: number): void {
  const h = ctx.h;
  const B = h.b;
  const L = b.L;
  const mx = Math.min(2 * L, 0.8 * B.halfW), mz = Math.min(2 * L, 0.8 * B.halfD);
  const clear = so + 0.5 * b.p.widthFrac * L + 0.003;
  let x = cx, z = cz;
  for (let i = 0; i < 8; i++) {
    const spread = 1 + i * 0.4;
    x = clamp(cx + ctx.rng.signed() * sx * spread, -B.halfW + mx, B.halfW - mx);
    z = clamp(cz + ctx.rng.signed() * sz * spread, -B.halfD + mz, B.halfD - mz);
    if (h.colliders.length === 0 || h.nearestDecor(x, h.floor(x, z) + so, z) > clear) break;
  }
  b.gx = x;
  b.gz = z;
  b.gy = h.floor(x, z) + so;
}

function attachToGoalSurface(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const h = ctx.h;
  const kind = b.goalSurf;
  const idx = b.goalSurfIdx;
  if (kind === SURF_GLASS && idx >= 0) attachGlass(h, fish, b, idx);
  else if (kind === SURF_DECOR && idx >= 0 && idx < h.colliders.length) {
    // Land on the chosen spot (the goal sits just off that face), not on whichever face of the
    // piece happens to be nearest — arriving from below must not end up clinging to an overhang's
    // underside. Callers only attach within a short distance of the goal, so this is a small step.
    const k = fish.kin;
    const x0 = k.pos[0], y0 = k.pos[1], z0 = k.pos[2];
    k.pos[0] = b.gx;
    k.pos[1] = b.gy;
    k.pos[2] = b.gz;
    attachDecor(h, fish, b, idx);
    // A percher can only sit on a ledge: if the spot turned out too steep, don't land at all.
    if (b.surf === SURF_DECOR && b.ny < 0.4 && !(b.p.t.clings || b.p.mouth === 'sucker')) {
      detach(fish, b);
      k.pos[0] = x0;
      k.pos[1] = y0;
      k.pos[2] = z0;
      b.hasGoal = false;
      return;
    }
  } else attachSubstrate(h, fish, b);
  b.hasSurfTarget = false;
  b.pauseT = ctx.rng.range(1, 4);
  b.moveT = 0;
}

function steerGraze(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const k = fish.kin;
  const h = ctx.h;
  if (b.surf === SURF_NONE) {
    if (b.sub === 2) {
      // Push off the surface and swim away.
      if (b.subT > 0.8) {
        b.modeDur = 0;
        b.thinkT = 0;
        b.sub = 0;
        b.hasGoal = false;
      }
      b.ds = 0.8 * p.cruise * L;
      b.label = 'swimming off';
      return;
    }
    if (!b.hasGoal) {
      pickGrazeSpot(ctx, fish, b, false);
      b.subT = 0;
    }
    const so = standoff(b);
    // Approach a point just off the surface, then settle onto it.
    seek(fish, b, b.gx, b.gy, b.gz, 0.8 * p.cruise * L * b.pace, 1.5 * L);
    b.glassOk = true;
    b.floorOk = true;
    b.decorOk = b.goalSurf === SURF_DECOR && dist2(fish, b.gx, b.gy, b.gz) < (3 * L) ** 2;
    b.label = 'looking for algae';
    const d2 = dist2(fish, b.gx, b.gy, b.gz);
    // Settle when close (on rock/wood very close: attaching places the body at the goal).
    const reach = (b.goalSurf === SURF_DECOR ? 0.5 : b.subT > 12 ? 1.4 : 0.9) * L + so;
    if (d2 < reach * reach) attachToGoalSurface(ctx, fish, b);
    else if (b.subT > 20) b.hasGoal = false; // blocked: look for another spot (never snap across the tank)
    return;
  }
  // Attached: slow shuffles between long rasping pauses.
  if (b.modeT > b.modeDur) {
    // Let go.
    const nx = b.nx, ny = b.ny, nz = b.nz;
    detach(fish, b);
    // Peel away along the surface at a shallow angle (head first, as it was lying) — turning
    // straight out from the glass would shove the body off it in one frame.
    const fx = k.forward[0], fz = k.forward[2];
    const fl = Math.hypot(fx, fz);
    if (fl > 0.2) b.yaw = Math.atan2(fz / fl + nz * 0.45, fx / fl + nx * 0.45);
    else b.yaw = Math.atan2(nz, nx);
    b.pitch = clamp(Math.asin(clamp(ny * 0.4, -1, 1)), -0.4, 0.4);
    b.sub = 2;
    b.subT = 0;
    b.speed = 0.6 * p.cruise * L;
    return;
  }
  if (b.pauseT > 0) {
    b.pauseT -= ctx.dt;
    b.ds = 0;
    b.hasSurfTarget = false;
    b.label = b.surf === SURF_GLASS ? 'grazing on the glass' : b.surf === SURF_DECOR ? (h.colliderKind[b.surfIdx] === 'driftwood' ? 'rasping on wood' : 'grazing on rock') : 'grazing';
    if (b.pauseT <= 0) {
      // Next shuffle: 0.3–1.2 BL; on glass, mostly sideways/upward lines.
      const f = k.forward;
      const lx = b.ny * f[2] - b.nz * f[1], ly = b.nz * f[0] - b.nx * f[2], lz = b.nx * f[1] - b.ny * f[0];
      const a = ctx.rng.signed() * 1.4;
      const c = Math.cos(a), s = Math.sin(a);
      const step = ctx.rng.range(0.3, 1.2) * L;
      let dx = f[0] * c + lx * s, dy = f[1] * c + ly * s, dz = f[2] * c + lz * s;
      if (b.surf === SURF_GLASS && k.pos[1] > h.b.surfaceY - 3 * L) dy = -Math.abs(dy) - 0.3;
      b.sx = k.pos[0] + dx * step;
      b.sy = k.pos[1] + dy * step;
      b.sz = k.pos[2] + dz * step;
      b.hasSurfTarget = true;
      b.moveT = ctx.rng.range(0.6, 2.2);
    }
  } else {
    b.moveT -= ctx.dt;
    b.ds = 0.35 * p.cruise * L;
    b.label = 'shuffling along';
    if (b.moveT <= 0) {
      b.pauseT = ctx.rng.range(2.5, 12);
      b.hasSurfTarget = false;
    }
  }
}

// ---- perching (gobies, blennies, hawkfish) -------------------------------------------------------------

function steerPerch(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const k = fish.kin;
  const h = ctx.h;
  if (b.surf === SURF_NONE) {
    const horse = p.species.locomotion === 'seahorse';
    if (!b.hasGoal) {
      // Choose a perch close by (and toward home), else a patch of open substrate.
      const home = fish.state.home;
      let best = -1, bestS = Infinity, bestD = 0;
      // After two failed hops in a row, settle for open sand (always reachable) once.
      const perchCount = b.perchFails >= 2 ? 0 : h.perchCount;
      for (let i = 0; i < perchCount; i++) {
        const bp = b.badPerches;
        if (i === bp[0] || i === bp[1] || i === bp[2] || i === bp[3]) continue;
        const px = h.perches[i * 3], py = h.perches[i * 3 + 1], pz = h.perches[i * 3 + 2];
        const dx = px - k.pos[0], dy = py - k.pos[1], dz = pz - k.pos[2];
        const dF = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dF > 0.5) continue;
        const hx = home ? px - home[0] : 0, hz = home ? pz - home[2] : 0;
        const s = (dF + 0.5 * Math.sqrt(hx * hx + hz * hz)) * (0.6 + ctx.rng.next()) + (i === b.perchIdx ? 0.3 : 0);
        if (s < bestS) {
          bestS = s;
          best = i;
          bestD = dF;
        }
      }
      const so = standoff(b);
      if (best >= 0) {
        b.perchIdx = best;
        b.gx = h.perches[best * 3];
        b.gy = h.perches[best * 3 + 1] + so;
        b.gz = h.perches[best * 3 + 2];
        b.goalSurf = SURF_DECOR;
        b.goalSurfIdx = h.perchOwner[best];
        // A hop covers a few body lengths; anything farther is a short swim.
        b.sub = bestD > clamp(8 * L, 0.1, 0.3) ? 1 : 0;
      } else {
        // A patch of open sand (never under the buried base of a rock).
        b.perchIdx = -1;
        pickOpenSand(ctx, b, k.pos[0], k.pos[2], 0.12, 0.08, so);
        b.goalSurf = SURF_SUBSTRATE;
        b.goalSurfIdx = -1;
        // A patch more than a few body lengths away is a short swim, not a hop.
        b.sub = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz)) > clamp(8 * L, 0.1, 0.3) ? 1 : 0;
      }
      b.hasGoal = true;
      b.subT = 0;
    }
    // A short hop: a quick dart up and over that brakes into the landing (gobies, blennies and
    // hawkfish cover a few body lengths in well under a second). Longer moves are a normal swim;
    // seahorses swim slowly upright to the next holdfast.
    const d = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz));
    const swim = horse || b.sub === 1;
    const vMax = horse ? 1.2 * p.cruise * L : swim ? 0.8 * p.cruise * L : 0.45 * p.burst * L;
    const sp = Math.min(vMax, 0.3 * p.cruise * L + 3 * d);
    seek(fish, b, b.gx, b.gy + Math.min(horse ? 0.01 : 0.03, d * 0.4), b.gz, sp, Math.max(1.5 * L, 0.02));
    b.floorOk = true;
    b.decorOk = d < 3 * L;
    if (!swim) {
      b.pitchLimit = 40 * DEG;
      b.turnBoost = 1.8;
      b.accelBoost = clamp((0.35 * b.accelBurst) / Math.max(1e-4, b.accel), 1, 6);
    }
    b.label = horse ? 'swimming to a holdfast' : swim ? 'swimming to another perch' : 'hopping';
    const giveUp = b.subT > (horse ? 45 : swim ? 20 : 3);
    if (!giveUp && d < 0.5 * L + 0.005) attachToGoalSurface(ctx, fish, b);
    if (b.surf !== SURF_NONE) {
      b.perchT = horse ? ctx.rng.range(30, 120) : ctx.rng.range(4, 25);
      b.perchFails = 0;
    } else if (giveUp) {
      // Couldn't settle there (blocked, or the spot slides it off — e.g. a reshaped rock):
      // remember it and pick another spot rather than hovering over or orbiting it.
      if (b.perchIdx >= 0) {
        b.badPerches[b.badPerchNext] = b.perchIdx;
        b.badPerchNext = (b.badPerchNext + 1) & 3;
      }
      b.perchFails++;
      b.hasGoal = false;
      b.label = 'cruising';
    }
    return;
  }
  // Perched: propped on the pelvic fins, eyes swivelling; quick head turns to look around.
  b.ds = 0;
  b.label = 'perched';
  b.perchT -= ctx.dt;
  if (b.pauseT > 0) b.pauseT -= ctx.dt;
  if (b.pauseT <= 0) {
    b.pauseT = ctx.rng.range(1.5, 5);
    const f = k.forward;
    const lx = b.ny * f[2] - b.nz * f[1], ly = b.nz * f[0] - b.nx * f[2], lz = b.nx * f[1] - b.ny * f[0];
    const a = ctx.rng.signed() * 1.1;
    b.sx = k.pos[0] + (f[0] * Math.cos(a) + lx * Math.sin(a)) * 0.01;
    b.sy = k.pos[1] + (f[1] * Math.cos(a) + ly * Math.sin(a)) * 0.01;
    b.sz = k.pos[2] + (f[2] * Math.cos(a) + lz * Math.sin(a)) * 0.01;
    b.hasSurfTarget = true;
    b.turnBoost = 2.5;
  }
  if (b.perchT <= 0) {
    detach(fish, b);
    b.hasGoal = false;
    b.subT = 0;
  }
}

// ---- ambush / drifter ---------------------------------------------------------------------------------

function steerAmbush(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const k = fish.kin;
  const h = ctx.h;
  if (!b.hasGoal || b.subT > b.subDur) {
    b.subT = 0;
    b.subDur = ctx.rng.range(20, 60);
    const ci = ctx.pickCover(null, k.pos[0], k.pos[2], 0.3);
    if (ci >= 0) {
      const c = h.cover[ci];
      b.gx = c.position[0] + ctx.rng.signed() * (c.radius + L);
      b.gz = c.position[2] + ctx.rng.signed() * (c.radius + L) * 0.6;
      b.gy = Math.max(c.position[1], h.yAtFrac(b.gx, b.gz, b.prefH));
    } else {
      b.gx = k.pos[0] + ctx.rng.signed() * 0.08;
      b.gz = k.pos[2] + ctx.rng.signed() * 0.05;
      b.gy = h.yAtFrac(b.gx, b.gz, b.prefH);
    }
    const B = h.b;
    b.gx = clamp(b.gx, -B.halfW + 2 * L, B.halfW - 2 * L);
    b.gz = clamp(b.gz, -B.halfD + 2 * L, B.halfD - 2 * L);
    b.gy = clamp(b.gy, h.floor(b.gx, b.gz) + bodyR(b) + 0.01, B.surfaceY - bodyR(b) - 0.01);
    b.hasGoal = true;
  }
  const d = Math.sqrt(dist2(fish, b.gx, b.gy, b.gz));
  if (d > 1.2 * L) {
    // Reposition very slowly (a leaf drifting).
    seek(fish, b, b.gx, b.gy, b.gz, 0.25 * p.cruise * L, 2 * L);
    b.hold = true;
    b.label = p.t.drifter ? 'drifting like a leaf' : 'repositioning';
  } else {
    b.hold = true;
    face(b, Math.cos(b.yaw), Math.sin(b.yaw), 0);
    b.dy = (b.gy - k.pos[1]) / Math.max(0.01, L);
    b.label = p.t.drifter ? 'drifting like a leaf' : 'lying in wait';
  }
  b.posture = p.t.drifter ? p.postureRest : p.postureRest * 0.5;
}

// ---- new arrivals ------------------------------------------------------------------------------------

function steerExplore(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const L = b.L;
  const k = fish.kin;
  if (b.age < 6) {
    // Fresh out of the bag: hang near the surface, then nose slowly down.
    b.hold = true;
    face(b, Math.cos(b.yaw) + noise1(ctx.t * 0.3, b.noiseSeed) * 0.3, Math.sin(b.yaw), 0.15 * p.cruise * L);
    b.dy = -0.25;
    b.label = 'getting its bearings';
    return;
  }
  if (!b.hasGoal || dist2(fish, b.gx, b.gy, b.gz) < (2 * L) ** 2 || b.subT > 15) {
    pickZoneGoal(ctx, fish, b, 0.8);
    // Hug cover and the back half of the tank at first.
    const ci = ctx.pickCover(null, k.pos[0], k.pos[2], 0.5);
    if (ci >= 0) {
      const c = ctx.h.cover[ci];
      b.gx = b.gx * 0.4 + c.position[0] * 0.6;
      b.gz = b.gz * 0.4 + c.position[2] * 0.6;
    } else {
      b.gz = b.gz * 0.5 - ctx.h.b.halfD * 0.3;
    }
    b.subT = 0;
  }
  seek(fish, b, b.gx, b.gy, b.gz, 0.55 * p.cruise * L, 2 * L);
  meander(ctx, b, 0.4);
  b.label = 'exploring its new home';
}

// ---------------------------------------------------------------------------------------------
// Social forces & obstacle avoidance
// ---------------------------------------------------------------------------------------------

/**
 * Neighbor interactions through the spatial hash: separation from everybody (personal space),
 * alignment + cohesion with conspecifics (shoaling/schooling), wariness of big predators, and
 * pair/harem members keeping near each other.
 */
function social(ctx: Ctx, fish: FishEntity, b: Brain, cohesion: number): void {
  const p = b.p;
  const L = b.L;
  const k = fish.kin;
  const fearTight = 1 - 0.4 * smoothstep(0.1, 0.6, b.fear);
  const R = clamp(Math.max(p.spacing * L * 3, 5 * L), 0.05, 0.3);
  const n = ctx.hash.query(k.pos[0], k.pos[1], k.pos[2], R, b.idx, ctx.nbr);
  let sx = 0, sy = 0, sz = 0;
  let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0, cnt = 0, spd = 0;
  let px = 0, py = 0, pz = 0;
  let nn = Infinity;
  for (let i = 0; i < n; i++) {
    const j = ctx.nbr[i];
    const o = ctx.world.fish[j];
    const ob = ctx.brains[j];
    if (ob.buried > 0.6) continue;
    const q = o.kin.pos;
    const dx = k.pos[0] - q[0], dy = k.pos[1] - q[1], dz = k.pos[2] - q[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
    const same = o.species === fish.species;
    if (ob.p.move !== 'swimmer' && ob.surf !== SURF_NONE) {
      // Walking invertebrates: just don't swim through them.
      const pr = 0.5 * (L + ob.L);
      if (d < pr) {
        const w = (pr - d) / pr;
        sx += (dx / d) * w;
        sy += (dy / d) * w;
        sz += (dz / d) * w;
      }
      continue;
    }
    const personal = same ? p.spacing * L * 0.7 * fearTight : 0.6 * (L + ob.L);
    if (d < personal) {
      const w = (personal - d) / personal;
      sx += (dx / d) * w * (1 + w);
      sy += (dy / d) * w * (1 + w);
      sz += (dz / d) * w * (1 + w);
    }
    if (same) {
      cnt++;
      cx += q[0];
      cy += q[1];
      cz += q[2];
      ax += o.kin.forward[0];
      ay += o.kin.forward[1];
      az += o.kin.forward[2];
      spd += Math.abs(ob.speed);
      if (d < nn) nn = d;
    } else if ((ob.p.t.predator || ob.p.species.diet === 'piscivore') && ob.L > 2.5 * L && d < 3 * ob.L) {
      // Keep away from big predators; prey shoals visibly give them room.
      const w = 1 - d / (3 * ob.L);
      px += (dx / d) * w;
      py += (dy / d) * w * 0.5;
      pz += (dz / d) * w;
      b.fear = Math.max(b.fear, 0.12 * w);
    }
  }
  b.nnDist = nn === Infinity ? 1 : nn;
  b.nnCount = cnt;
  let x = b.dx, y = b.dy, z = b.dz;
  x += sx * 1.6;
  y += sy * 1.2;
  z += sz * 1.6;
  x += px * 1.2;
  y += py;
  z += pz * 1.2;
  if (cnt > 0 && cohesion > 0) {
    const coh = p.cohesionW * cohesion * (1 + 1.5 * smoothstep(0.1, 0.6, b.fear));
    const ali = p.alignW * cohesion * (1 + b.fear);
    cx = cx / cnt - k.pos[0];
    cy = cy / cnt - k.pos[1];
    cz = cz / cnt - k.pos[2];
    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
    // Cohesion only pulls when neighbours are farther than the preferred spacing.
    const want = p.spacing * L * fearTight;
    if (cl > want) {
      const w = coh * clamp((cl - want) / R, 0, 1);
      x += (cx / cl) * w;
      y += (cy / cl) * w * 0.6;
      z += (cz / cl) * w;
    }
    const al = Math.sqrt(ax * ax + ay * ay + az * az);
    if (al > 1e-6) {
      x += (ax / al) * ali;
      y += (ay / al) * ali * 0.3;
      z += (az / al) * ali;
    }
    // Schools match speed.
    if (p.schooling === 2) b.ds = b.ds * 0.6 + (spd / cnt) * 0.4;
  }
  // Pairs & harems stay within a few body lengths of the partner.
  if (b.partner && (p.pairs || p.harem) && b.mode !== 'flee' && b.mode !== 'feed') {
    const q = b.partner.kin.pos;
    const dx = q[0] - k.pos[0], dy = q[1] - k.pos[1], dz = q[2] - k.pos[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const keep = 4 * L;
    if (d > keep) {
      const w = clamp((d - keep) / (6 * L), 0, 1) * 0.8;
      x += (dx / d) * w;
      y += (dy / d) * w * 0.5;
      z += (dz / d) * w;
      b.ds = Math.max(b.ds, p.cruise * L * (0.5 + w));
    }
  }
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 1e-9) {
    b.dx = x / l;
    b.dy = y / l;
    b.dz = z / l;
  }
}

/**
 * Soft boundary & obstacle avoidance: probe the current position and a look-ahead point; push the
 * desired direction away from glass, substrate, surface and decor, with a sideways slide so fish
 * swim around rocks instead of stalling against them.
 */
function avoid(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const h = ctx.h;
  const B = h.b;
  const k = fish.kin;
  const L = b.L;
  const cp = Math.cos(b.pitch);
  const fx = cp * Math.cos(b.yaw), fy = Math.sin(b.pitch), fz = cp * Math.sin(b.yaw);
  const look = 0.6 * L + Math.abs(b.speed) * 0.7 + 0.01;
  const rSide = 0.5 * b.p.widthFrac * L + 0.002;
  const rV = bodyR(b);
  let ax = 0, ay = 0, az = 0, slide = 0, sx = 0, sy = 0, sz = 0;
  const mWall = b.glassOk ? Math.max(0.008, 0.25 * L) : Math.max(0.02, 0.9 * L);
  const mFloor = b.floorOk ? 0.15 * L : Math.max(0.012, b.p.species.zone === 'bottom' ? 0.35 * L : 0.7 * L);
  const mSurf = b.surfaceOk ? 0 : Math.max(0.012, b.p.t['surface-skimmer'] ? 0.15 * L : 0.6 * L);
  const mDecor = b.decorOk ? Math.max(0.004, 0.15 * L) : Math.max(0.015, 0.7 * L);
  for (let s = 0; s < 2; s++) {
    const off = s === 0 ? 0 : look;
    const x = k.pos[0] + fx * off, y = k.pos[1] + fy * off, z = k.pos[2] + fz * off;
    let d = x + B.halfW - rSide;
    if (d < mWall) ax += ((mWall - d) / mWall) ** 2;
    d = B.halfW - x - rSide;
    if (d < mWall) ax -= ((mWall - d) / mWall) ** 2;
    d = z + B.halfD - rSide;
    if (d < mWall) az += ((mWall - d) / mWall) ** 2;
    d = B.halfD - z - rSide;
    if (d < mWall) az -= ((mWall - d) / mWall) ** 2;
    if (mFloor > 0) {
      d = y - rV - h.floor(clamp(x, -B.halfW, B.halfW), clamp(z, -B.halfD, B.halfD));
      if (d < mFloor) ay += 1.5 * ((mFloor - Math.max(d, -mFloor)) / mFloor) ** 2;
    }
    if (mSurf > 0) {
      d = B.surfaceY - y - rV;
      if (d < mSurf) ay -= ((mSurf - Math.max(d, -mSurf)) / mSurf) ** 2;
    }
    if (h.colliders.length > 0) {
      d = h.nearestDecor(x, y, z, b.shelterOwner) - rSide;
      if (d < mDecor) {
        const w = 1.6 * ((mDecor - Math.max(d, -mDecor)) / mDecor) ** 2;
        ax += hit.nx * w;
        ay += hit.ny * w;
        az += hit.nz * w;
        // Slide around the obstacle: the part of the normal perpendicular to our heading.
        const nf = hit.nx * fx + hit.ny * fy + hit.nz * fz;
        if (nf < -0.2) {
          slide += w;
          sx += (hit.nx - fx * nf) * w;
          sy += (hit.ny - fy * nf) * w;
          sz += (hit.nz - fz * nf) * w;
        }
      }
    }
  }
  if (ax === 0 && ay === 0 && az === 0) return;
  if (slide > 0) {
    const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sl > 1e-6) {
      ax += (sx / sl) * slide;
      ay += (sy / sl) * slide;
      az += (sz / sl) * slide;
    }
  }
  const W = 2.2;
  let x = b.dx + ax * W, y = b.dy + ay * W, z = b.dz + az * W;
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 1e-9) {
    x /= l;
    y /= l;
    z /= l;
  }
  // Ease off when the obstacle is right ahead.
  const opp = -(ax * fx + ay * fy + az * fz);
  if (opp > 0) b.ds *= 1 - 0.45 * clamp(opp, 0, 1);
  b.dx = x;
  b.dy = y;
  b.dz = z;
}
