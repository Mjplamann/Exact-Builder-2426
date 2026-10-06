import type { FishEntity } from '../core/types';
import { type Brain, MODE_LABEL, SURF_DECOR, SURF_GLASS, SURF_NONE, SURF_PLANT, SURF_SUBSTRATE } from './brain';
import type { Ctx } from './context';
import { appetite, dropFood, foodValid, rt, scanForFood, tryBite } from './feeding';
import { clamp, TAU } from './math';
import { hit } from './habitat';
import { attachDecor, attachNearest, attachPlant, attachSubstrate, detach, standoff } from './surface';
import type { Mode } from './brain';

/**
 * Invertebrate ethology.
 *
 * Walkers (shrimp, crabs, crayfish) pick their way over substrate, wood, rock and plants in
 * stop-and-go bouts, constantly picking at biofilm with their chelae; shrimp sometimes swim a
 * short hop with their pleopods and escape with a backward tail-flip; crabs walk sideways;
 * nocturnal crabs and crayfish keep to caves by day.
 *
 * Crawlers (snails, starfish, urchins) glide very slowly on their foot over every surface —
 * including the front glass, where you see the foot and the rasping radula — pausing to graze,
 * retracting when disturbed and occasionally losing their grip and dropping to the bottom.
 */

function enterInv(b: Brain, mode: Mode, dur: number): void {
  if (mode !== 'feed') dropFood(b);
  b.mode = mode;
  b.modeT = 0;
  b.modeDur = dur;
  b.sub = 0;
  b.subT = 0;
  b.hasGoal = false;
  b.hasSurfTarget = false;
  b.label = MODE_LABEL[mode];
}

/** Random point on/near the current surface, `dist` m away roughly along the body axis ± spread. */
function surfaceWanderTarget(ctx: Ctx, fish: FishEntity, b: Brain, dist: number, spread: number): void {
  const k = fish.kin;
  const f = k.forward;
  const lx = b.ny * f[2] - b.nz * f[1], ly = b.nz * f[0] - b.nx * f[2], lz = b.nx * f[1] - b.ny * f[0];
  const a = ctx.rng.signed() * spread;
  const c = Math.cos(a), s = Math.sin(a);
  b.sx = k.pos[0] + (f[0] * c + lx * s) * dist;
  b.sy = k.pos[1] + (f[1] * c + ly * s) * dist;
  b.sz = k.pos[2] + (f[2] * c + lz * s) * dist;
  b.hasSurfTarget = true;
}

export function thinkInvert(ctx: Ctx, fish: FishEntity, b: Brain): void {
  const p = b.p;
  const walker = p.move === 'walker';
  b.thinkT = walker ? ctx.rng.range(0.4, 1.0) : ctx.rng.range(1.5, 3.5);
  if (b.mode === 'tailflip' || b.mode === 'fall' || b.mode === 'swim') return;
  if (b.mode === 'retract' && b.modeT < b.modeDur) return;

  // Food by smell.
  if (b.scanT <= 0 && b.fear < 0.5) {
    b.scanT = walker ? 0.6 : 2.5;
    const app = appetite(fish) * (1 - 0.4 * b.rest);
    if (scanForFood(ctx, fish, b, app)) {
      if (b.mode !== 'feed') enterInv(b, 'feed', 120);
      return;
    }
  }
  if (b.mode === 'feed' && foodValid(ctx, b)) return;

  // Nocturnal crabs & crayfish hide by day.
  const byDay = p.species.activity === 'nocturnal' && ctx.light > 0.35 && (fish.species.group === 'crab' || fish.species.group === 'crayfish' || p.t['nocturnal-hider'] || p.t.shy);
  if ((byDay || b.fear > 0.5) && walker && b.mode !== 'hide') {
    enterInv(b, 'hide', 1e9);
    return;
  }
  if (b.mode === 'hide' && !byDay && b.fear < 0.2) {
    enterInv(b, 'walk', ctx.rng.range(5, 20));
    return;
  }
  if (b.mode === 'hide') return;

  // Night: most inverts slow down (rest), though many shrimp stay busy.
  if (b.rest > 0.65 && b.mode !== 'rest' && ctx.rng.chance(walker ? 0.3 : 0.5)) {
    enterInv(b, 'rest', ctx.rng.range(30, 120));
    return;
  }

  if (b.modeT < b.modeDur && b.mode !== 'feed') return;

  // Alternate walking and picking; shrimp occasionally swim a short hop.
  const r = ctx.rng.next();
  if (walker) {
    const swims = fish.species.group === 'shrimp' || fish.species.group === 'crayfish';
    if (swims && r < (fish.species.group === 'shrimp' ? 0.08 : 0.02)) enterInv(b, 'swim', 6);
    else if (r < 0.55) enterInv(b, 'pick', ctx.rng.range(3, 15));
    else enterInv(b, 'walk', ctx.rng.range(4, 15));
  } else {
    if (r < 0.4) enterInv(b, 'graze', ctx.rng.range(10, 60));
    else enterInv(b, 'walk', ctx.rng.range(20, 90));
  }
}

export function steerInvert(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  const p = b.p;
  const h = ctx.h;
  const k = fish.kin;
  const L = b.L;
  const walker = p.move === 'walker';
  b.modeT += dt;
  b.subT += dt;
  b.turnBoost = 1;
  b.hold = false;
  b.floorOk = true;
  const speed = p.cruise * L * b.pace * (1 - 0.6 * b.rest);

  // Free-floating (just added, swimming, flipped, falling): handled per mode below.
  if (b.surf === SURF_NONE && b.mode !== 'swim' && b.mode !== 'tailflip' && b.mode !== 'fall') {
    if (!attachNearest(h, fish, b, Math.max(0.02, 2 * L), true, true)) {
      if (walker) enterInv(b, 'swim', 8);
      else enterInv(b, 'fall', 30);
    }
  }

  switch (b.mode) {
    case 'walk': {
      // Stop-and-go: walk 1–4 s, pause 0.5–3 s (walkers); crawlers glide steadily.
      if (walker) {
        if (b.pauseT > 0) {
          b.pauseT -= dt;
          b.ds = 0;
          b.label = 'pausing';
          if (b.pauseT <= 0) {
            b.moveT = ctx.rng.range(1, 4);
            surfaceWanderTarget(ctx, fish, b, ctx.rng.range(3, 10) * L, 1.6);
          }
          break;
        }
        b.moveT -= dt;
        if (!b.hasSurfTarget) surfaceWanderTarget(ctx, fish, b, ctx.rng.range(3, 10) * L, 1.6);
        b.ds = speed;
        b.label = b.surf === SURF_GLASS ? 'climbing the glass' : b.surf === SURF_DECOR ? 'clambering over decor' : 'walking';
        if (b.moveT <= 0) b.pauseT = ctx.rng.range(0.5, 3);
      } else {
        // Snails meander: keep re-aiming a little ahead with a gentle random turn.
        const dx = b.sx - k.pos[0], dy = b.sy - k.pos[1], dz = b.sz - k.pos[2];
        if (!b.hasSurfTarget || dx * dx + dy * dy + dz * dz < (0.5 * L) ** 2) surfaceWanderTarget(ctx, fish, b, 2.5 * L, 0.5);
        b.ds = speed;
        b.label = b.surf === SURF_GLASS ? 'gliding up the glass' : 'crawling';
        if (b.surf === SURF_GLASS && b.up[2] < -0.5) b.label = 'grazing the front glass';
        maybeFall(ctx, fish, b, dt);
      }
      break;
    }
    case 'pick':
    case 'graze': {
      b.ds = 0;
      b.hasSurfTarget = false;
      // Small re-orientations while picking.
      if (ctx.rng.chance(dt * 0.4)) {
        surfaceWanderTarget(ctx, fish, b, 0.3 * L, 2.5);
        b.ds = speed * 0.5;
      }
      b.label = walker ? 'picking at biofilm' : 'grazing algae';
      if (!walker) maybeFall(ctx, fish, b, dt);
      break;
    }
    case 'rest': {
      b.ds = 0;
      b.hasSurfTarget = false;
      b.label = 'resting';
      if (b.modeT > b.modeDur) b.thinkT = 0;
      break;
    }
    case 'hide': {
      // Walk to the nearest cave/overhang and sit in it.
      let ci = b.coverIdx;
      if (ci < 0 || b.coverVersion !== h.version || ci >= h.cover.length) {
        ci = -1;
        let best = Infinity;
        for (let i = 0; i < h.cover.length; i++) {
          const c = h.cover[i];
          if (c.kind === 'anemone') continue;
          const pref = c.kind === 'cave' || c.kind === 'crevice' || c.kind === 'overhang' ? 1 : 2;
          const dx = c.position[0] - k.pos[0], dz = c.position[2] - k.pos[2];
          const s = Math.sqrt(dx * dx + dz * dz) * pref * (1 + h.coverUse[i]);
          if (s < best) {
            best = s;
            ci = i;
          }
        }
        if (ci >= 0) {
          h.coverUse[ci]++;
          b.coverIdx = ci;
          b.coverVersion = h.version;
          b.shelterOwner = h.cover[ci].ownerId;
        }
      }
      if (ci >= 0) {
        const c = h.cover[ci].position;
        b.sx = c[0];
        b.sy = h.floor(c[0], c[2]);
        b.sz = c[2];
        b.hasSurfTarget = true;
        const dx = c[0] - k.pos[0], dz = c[2] - k.pos[2];
        const close = dx * dx + dz * dz < (h.cover[ci].radius * 0.6) ** 2;
        b.ds = close ? 0 : speed * (b.fear > 0.3 ? 2.5 : 1);
        b.label = close ? 'hiding in a cave' : 'heading for cover';
      } else {
        b.ds = 0;
        b.label = 'keeping still';
      }
      break;
    }
    case 'feed': {
      if (!foodValid(ctx, b)) {
        b.thinkT = 0;
        b.ds = 0;
        break;
      }
      const f = b.food!;
      const fdx = f.pos[0] - k.pos[0], fdy = f.pos[1] - k.pos[1], fdz = f.pos[2] - k.pos[2];
      const d = Math.sqrt(fdx * fdx + fdy * fdy + fdz * fdz);
      // Shrimp swim over to food that is far away or on another surface.
      const otherSurface = f.state === 'settled' && ((rt(f).restOn ?? -1) >= 0 ? b.surf !== SURF_DECOR : b.surf !== SURF_SUBSTRATE);
      if (walker && fish.species.group === 'shrimp' && (d > 0.18 || (otherSurface && d > 3 * L)) && b.surf !== SURF_NONE) {
        enterInv(b, 'swim', 8);
        b.gx = f.pos[0];
        b.gy = f.pos[1] + standoff(b);
        b.gz = f.pos[2];
        b.hasGoal = true;
        b.food = f; // keep the target while swimming (claim kept)
        break;
      }
      b.sx = f.pos[0];
      b.sy = f.pos[1];
      b.sz = f.pos[2];
      b.hasSurfTarget = true;
      const reach = (walker ? 0.55 : 0.35) * L + f.sizeM * 0.5 + standoff(b);
      b.ds = d > reach ? speed * (walker ? 1.6 : 1.2) : 0;
      if (d <= reach * 1.2) {
        tryBite(ctx, fish, b, k.pos[0], k.pos[1], k.pos[2], reach * 1.2);
        b.label = walker ? 'eating' : 'feeding';
      } else {
        b.label = walker ? 'hurrying to food' : 'heading for food';
      }
      break;
    }
    case 'swim': {
      // Short swim with the pleopods to another surface (or to food).
      if (b.surf !== SURF_NONE) {
        detach(fish, b);
        b.yaw = Math.atan2(k.forward[2], k.forward[0]);
        b.pitch = 0.4;
        b.speed = 0.5 * p.burst * L * 0.3;
      }
      if (!b.hasGoal) {
        // A plant thicket, a decor top, or somewhere else on the bottom.
        const r = ctx.rng.next();
        const ci = ctx.pickCover('plants', k.pos[0], k.pos[2], 0.3);
        if (r < 0.35 && ci >= 0 && p.t.climbs) {
          const c = h.cover[ci];
          b.gx = c.position[0] + ctx.rng.signed() * c.radius * 0.5;
          b.gy = c.position[1] + ctx.rng.range(0, 1) * c.radius;
          b.gz = c.position[2] + ctx.rng.signed() * c.radius * 0.5;
          b.sub = 1; // land in plants
        } else if (r < 0.7 && h.perchCount > 0 && p.t.climbs) {
          const i = Math.floor(ctx.rng.next() * h.perchCount);
          b.gx = h.perches[i * 3];
          b.gy = h.perches[i * 3 + 1] + standoff(b);
          b.gz = h.perches[i * 3 + 2];
        } else {
          const B = h.b;
          b.gx = clamp(k.pos[0] + ctx.rng.signed() * 0.2, -B.halfW + 0.03, B.halfW - 0.03);
          b.gz = clamp(k.pos[2] + ctx.rng.signed() * 0.1, -B.halfD + 0.03, B.halfD - 0.03);
          b.gy = h.floor(b.gx, b.gz) + standoff(b);
        }
        b.hasGoal = true;
      }
      const dx = b.gx - k.pos[0], dy = b.gy - k.pos[1] + Math.min(0.04, Math.hypot(b.gx - k.pos[0], b.gz - k.pos[2]) * 0.3), dz = b.gz - k.pos[2];
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      b.dx = dx / l;
      b.dy = dy / l;
      b.dz = dz / l;
      b.ds = Math.min(0.25 * p.burst * L, 0.06);
      b.pitchLimit = 0.6;
      b.label = 'swimming';
      const d2 = (b.gx - k.pos[0]) ** 2 + (b.gy - k.pos[1]) ** 2 + (b.gz - k.pos[2]) ** 2;
      if (d2 < (0.7 * L + 0.005) ** 2 || b.modeT > 10) {
        if (b.sub === 1) attachPlant(fish, b);
        else if (!attachNearest(h, fish, b, 2 * L + 0.02, p.t.climbs, true)) attachSubstrate(h, fish, b);
        const keep = b.food;
        enterInv(b, keep ? 'feed' : 'pick', ctx.rng.range(3, 12));
        if (keep) b.food = keep;
      }
      break;
    }
    case 'tailflip': {
      // Abdominal flexion: a violent backward jump of 10–20 body lengths, then glide/sink.
      b.label = 'tail-flip escape';
      if (b.surf !== SURF_NONE) detach(fish, b);
      if (b.subT > 0.6) {
        enterInv(b, 'swim', 8);
        b.gx = k.pos[0];
        b.gz = k.pos[2];
        b.gy = h.floor(k.pos[0], k.pos[2]) + standoff(b);
        b.hasGoal = true;
      }
      break;
    }
    case 'fall': {
      b.label = 'dropping';
      if (b.surf !== SURF_NONE) detach(fish, b);
      break;
    }
    case 'retract': {
      b.ds = 0;
      b.hasSurfTarget = false;
      b.label = fish.species.group === 'snail' ? 'withdrawn into its shell' : 'frozen still';
      if (b.modeT > b.modeDur) b.thinkT = 0;
      break;
    }
    default:
      enterInv(b, 'walk', 10);
  }
}

/** Snails occasionally lose their grip on steep surfaces (more so when startled). */
function maybeFall(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): void {
  if (b.surf !== SURF_GLASS && b.surf !== SURF_DECOR) return;
  if (b.ny > 0.4) return;
  // ≈ once every ~40 min of crawling on vertical surfaces.
  if (ctx.rng.chance(dt / 2400)) startFall(fish, b);
}

export function startFall(fish: FishEntity, b: Brain): void {
  detach(fish, b);
  enterInv(b, 'fall', 30);
  b.fallV = 0;
}

/** Sub-step for free-moving invertebrates (falling snails, tail-flipping shrimp). */
export function integrateInvertFree(ctx: Ctx, fish: FishEntity, b: Brain, dt: number): boolean {
  const k = fish.kin;
  const h = ctx.h;
  if (b.mode === 'fall') {
    // Sinks shell-first at ~5 cm/s, tumbling slowly.
    b.fallV = Math.min(0.05, b.fallV + 0.25 * dt);
    k.pos[1] -= b.fallV * dt;
    const f = k.forward;
    const a = 1.2 * dt;
    const c = Math.cos(a), s = Math.sin(a);
    const y = f[1] * c - f[2] * s, z = f[1] * s + f[2] * c;
    f[1] = y;
    f[2] = z;
    b.vx = 0;
    b.vy = -b.fallV;
    b.vz = 0;
    b.speed = b.fallV;
    const fl = h.floor(k.pos[0], k.pos[2]);
    const dd = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2]);
    if (k.pos[1] <= fl + standoff(b) || dd < standoff(b)) {
      if (dd < standoff(b) && h.nearestIndex >= 0 && k.pos[1] > fl + standoff(b)) attachDecor(h, fish, b, h.nearestIndex);
      else attachSubstrate(h, fish, b);
      // It lands, then stays withdrawn a while before righting itself.
      enterInv(b, 'retract', ctx.rng.range(10, 40));
    }
    return true;
  }
  if (b.mode === 'tailflip') {
    // Backward along the body axis, decaying fast (τ ≈ 0.12 s).
    const v = b.speed;
    b.speed = v * Math.exp(-dt / 0.12);
    const f = k.forward;
    b.vx = -f[0] * v;
    b.vy = -f[1] * v + 0.1 * v;
    b.vz = -f[2] * v;
    k.pos[0] += b.vx * dt;
    k.pos[1] += b.vy * dt;
    k.pos[2] += b.vz * dt;
    const B = h.b;
    const so = standoff(b);
    k.pos[0] = clamp(k.pos[0], -B.halfW + so, B.halfW - so);
    k.pos[2] = clamp(k.pos[2], -B.halfD + so, B.halfD - so);
    k.pos[1] = clamp(k.pos[1], h.floor(k.pos[0], k.pos[2]) + so, B.surfaceY - so);
    const dd = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2]);
    if (dd < so) {
      k.pos[0] += hit.nx * (so - dd);
      k.pos[1] += hit.ny * (so - dd);
      k.pos[2] += hit.nz * (so - dd);
      b.speed *= 0.5;
    }
    k.tailPhase += TAU * 12 * dt;
    return true;
  }
  return false;
}

/** Begin a shrimp/crayfish tail-flip away from a threat. */
export function startTailflip(ctx: Ctx, fish: FishEntity, b: Brain, ax: number, az: number, intensity: number): void {
  const k = fish.kin;
  if (b.surf !== SURF_NONE) detach(fish, b);
  // Turn the tail toward safety: the animal shoots backwards, so face the threat.
  let x = ax - k.pos[0], z = az - k.pos[2];
  const l = Math.sqrt(x * x + z * z) || 1;
  x /= l;
  z /= l;
  k.forward[0] = x * 0.95;
  k.forward[1] = -0.3;
  k.forward[2] = z * 0.95;
  const fl = Math.hypot(k.forward[0], k.forward[1], k.forward[2]);
  k.forward[0] /= fl;
  k.forward[1] /= fl;
  k.forward[2] /= fl;
  enterInv(b, 'tailflip', 1);
  b.speed = clamp(b.p.burst * b.L * (0.8 + 0.6 * intensity) * 1.6, 0.1, 1.2);
  b.fear = Math.min(1, b.fear + intensity);
  void ctx;
}

/** Snails pull into their shell; shrimp freeze. */
export function startRetract(ctx: Ctx, b: Brain, intensity: number): void {
  enterInv(b, 'retract', ctx.rng.range(5, 12) + 20 * intensity);
}
