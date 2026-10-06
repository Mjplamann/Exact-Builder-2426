import type { FishEntity, FoodKind, FoodParticle } from '../core/types';
import type { World } from '../core/world';
import { FOODS } from '../data/foods';
import { RK_BURY, enter, startFlee, steerFish, thinkFish } from './behaviors';
import { type Brain, SURF_DECOR, SURF_NONE, SURF_PLANT, brainOf } from './brain';
import { Ctx } from './context';
import { appetite } from './feeding';
import { WALL_BACK, WALL_FRONT, WALL_LEFT, WALL_RIGHT, hit } from './habitat';
import { integrateInvertFree, startFall, startRetract, startTailflip, steerInvert, thinkInvert } from './inverts';
import { animateBreathing, integrateSwimmer, type SwimEnv } from './locomotion';
import { FastRng, TAU, approach, clamp, smoothstep } from './math';
import { burstAccel, maxTailHz, maxTurnRate, routineAccel } from './params';
import { attachDecor, attachGlass, attachNearest, attachSubstrate, animateSurface, detach, integrateSurface, standoff } from './surface';

/**
 * Moves every animal like its real counterpart: schooling/shoaling, hovering, bottom foraging,
 * glass grazing, hiding, territorial chases, resting at night, startle escapes, feeding, and
 * the biomechanics that drive the swim animation (tail-beat frequency from speed, glides, bends).
 *
 * Writes `fish.kin` every frame. Reads `world.colliders`, `world.cover`, `world.food`, `world.env`.
 *
 * Architecture (all allocation-free per frame):
 *  1. Brains (brain.ts) hold per-animal state; species parameters (params.ts) are cached.
 *  2. A spatial hash (spatialHash.ts) answers neighbor queries; a column grid (habitat.ts) answers
 *     decor distance queries.
 *  3. Each animal "thinks" on a throttle (behaviors.ts / inverts.ts) and steers every frame:
 *     activity goal + social forces + soft obstacle avoidance → desired direction & speed.
 *  4. Locomotion integrates in fixed sub-steps (≤ 1/60 s) under size-scaled turn/acceleration
 *     limits with beat-and-glide, hovering, banking and hard constraints (locomotion.ts), or
 *     moves attached animals over surfaces (surface.ts).
 *  5. Animation outputs: tail phase from Bainbridge's tail-beat/speed relation, effort, glides,
 *     body bend from yaw rate, fin sculling, breathing, rest level and an activity label.
 *
 * Kinematics conventions for the renderer are documented in locomotion.ts and surface.ts.
 *
 * OWNER: behavior module.
 */
export class BehaviorSystem {
  /** Set by the app: called when an animal takes a bite. `amount` is the nutrition taken. */
  onEat: (fish: FishEntity, food: FoodParticle, amount: number) => void = () => {};

  private ctx = new Ctx();
  private swimEnv: SwimEnv;
  private lastDaylight = -1;
  private hashVersion = -1;
  /** Placement batch: fish of one species added in the same instant arrive in the same bag. */
  private batchT = -1;
  private batch = new Map<string, [number, number, number]>();

  constructor(world: World) {
    const ctx = this.ctx;
    ctx.world = world;
    ctx.env = world.env;
    ctx.rng = new FastRng((world.tank.seed ^ 0x5eed_beef) >>> 0);
    ctx.onEat = (f, food, amount) => this.onEat(f, food, amount);
    ctx.h.rebuild(world);
    this.swimEnv = { h: ctx.h, t: 0 };
    world.events.on('food-dropped', ({ kind, at }) => this.onFoodDropped(this.ctx.world ?? world, kind, at));
    world.events.on('decor-changed', ({ item }) => {
      const w = this.ctx.world ?? world;
      const b = ctx.h.b;
      // Moving hardscape around disturbs everyone a little.
      this.startle(w, item ? [item.position[0], item.position[1] + 0.05, item.position[2]] : [0, b.height * 0.4, 0], 0.25);
    });
  }

  /** Decor/plants changed: world.colliders & world.cover were rebuilt. Refresh any caches. */
  onEnvironmentChanged(world: World): void {
    const ctx = this.ctx;
    ctx.world = world;
    ctx.h.rebuild(world);
    for (const f of world.fish) {
      const b = brainOf(f);
      b.coverIdx = -1;
      b.perchIdx = -1;
      b.shelterOwner = undefined;
      b.hasGoal = false;
      if (b.surf === SURF_DECOR) {
        // Collider indices changed: re-seat on whatever is nearest now.
        if (!attachNearest(ctx.h, f, b, Math.max(0.02, 2 * b.L), true, true)) detach(f, b);
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------------------------------

  /** Advance behavior and kinematics by real `dt` seconds. */
  update(world: World, dt: number): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const ctx = this.ctx;
    ctx.world = world;
    ctx.env = world.env;
    ctx.t = world.clock.realSeconds;
    ctx.dt = dt;
    ctx.timeScale = Math.max(1, world.clock.paused ? 1 : world.clock.timeScale);
    ctx.h.sync(world);
    this.swimEnv.t = ctx.t;
    this.updateLight(world, dt);
    ctx.habituation *= Math.exp(-dt / 60);

    const fish = world.fish;
    const n = fish.length;
    const h = ctx.h;
    if (this.hashVersion !== h.version) {
      const B = h.b;
      ctx.hash.configure(-B.halfW, 0, -B.halfD, B.halfW, B.height, B.halfD, 0.1);
      this.hashVersion = h.version;
    }
    const px = ctx.hash.begin(n);
    ctx.brains.length = n;
    for (let gi = 0; gi < ctx.groupList.length; gi++) {
      const g = ctx.groupList[gi];
      g.count = 0;
      g.sumL = 0;
      g.fear = 0;
      g.rest = 0;
      g.excite = 0;
      g.cx = g.cy = g.cz = 0;
    }
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      const b = brainOf(f);
      b.idx = i;
      ctx.brains[i] = b;
      this.refreshSize(f, b);
      if (!b.restInit) {
        b.rest = this.restTarget(b);
        b.restInit = true;
      }
      const p = f.kin.pos;
      px[i * 3] = p[0];
      px[i * 3 + 1] = p[1];
      px[i * 3 + 2] = p[2];
      if (b.p.move === 'swimmer' && b.p.schooling > 0) {
        const g = ctx.group(f.species.id, b.p);
        g.count++;
        g.sumL += b.L;
        g.fear += b.fear;
        g.rest += b.rest;
        g.excite += b.excite;
        g.cx += p[0];
        g.cy += p[1];
        g.cz += p[2];
      }
    }
    ctx.hash.build(n);
    ctx.updateGroups(dt);

    // Decide & steer.
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      const b = ctx.brains[i];
      this.tickTimers(f, b, dt);
      if (b.p.move === 'sessile') continue;
      if (b.p.move === 'swimmer') {
        if (b.thinkT <= 0) thinkFish(ctx, f, b);
        steerFish(ctx, f, b, dt);
      } else {
        if (b.thinkT <= 0) thinkInvert(ctx, f, b);
        steerInvert(ctx, f, b, dt);
      }
    }

    // Integrate in fixed sub-steps (≤ 1/60 s) for stable turning and contact.
    const steps = clamp(Math.ceil(dt * 60 - 1e-6), 1, 4);
    const hdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) this.integrate(fish[i], ctx.brains[i], hdt);
    }

    // Animation outputs.
    for (let i = 0; i < n; i++) this.writeKinematics(fish[i], ctx.brains[i], dt);
  }

  private refreshSize(f: FishEntity, b: Brain): void {
    const len = f.state.lengthCm;
    if (len === b.sizeFor) return;
    b.sizeFor = len;
    const L = Math.max(0.003, len / 100);
    b.L = L;
    b.turnMax = maxTurnRate(b.p, L);
    b.accel = routineAccel(b.p, L);
    b.accelBurst = burstAccel(b.p, L);
    b.tailHzMax = maxTailHz(L);
  }

  /** Light the animals perceive, and mild startles when the lights come on abruptly. */
  private updateLight(world: World, dt: number): void {
    const env = world.env;
    const ctx = this.ctx;
    const day = env.daylight;
    ctx.light = clamp(smoothstep(0.015, 0.3, day) + env.moonlight * 0.06 + env.roomLight * 0.04, 0, 1);
    ctx.dark = 1 - ctx.light;
    if (this.lastDaylight >= 0 && day - this.lastDaylight > 0.2 && dt < 0.5) {
      const B = ctx.h.b;
      this.startle(world, [0, B.surfaceY, 0], Math.min(0.5, (day - this.lastDaylight) * 0.6));
    }
    this.lastDaylight = day;
  }

  /** How rested this animal wants to be given the light (0 active … 1 asleep). */
  private restTarget(b: Brain): number {
    const L = this.ctx.light;
    switch (b.p.species.activity) {
      case 'nocturnal':
        return 0.6 * L;
      case 'crepuscular': {
        const twilight = 1 - Math.abs(2 * L - 1);
        return (L > 0.5 ? 0.25 : 0.55) * (1 - twilight);
      }
      default:
        return 1 - L;
    }
  }

  private tickTimers(f: FishEntity, b: Brain, dt: number): void {
    const ctx = this.ctx;
    b.age += dt;
    // Fear fades over ~10–30 s; the stress we added to the persisted state fades with it.
    const k = Math.exp(-dt / 7);
    b.fear *= k;
    if (b.stressAdded > 0) {
      const dec = b.stressAdded * (1 - k);
      b.stressAdded -= dec;
      f.state.stress = Math.max(0, f.state.stress - dec);
    }
    b.excite *= Math.exp(-dt / 30);
    b.airT -= dt;
    b.nipT -= dt;
    b.flareT -= dt;
    b.curiousT -= dt;
    b.cleanT -= dt;
    b.soloT -= dt;
    b.partnerCheckT -= dt;
    b.pose -= dt;
    b.chaseCool -= dt;
    b.thinkT -= dt;
    b.scanT -= dt;
    b.biteT -= dt;
    // Rest follows the light with a lag of minutes of sim time (fish settle gradually), but a
    // sudden switch-on of the lights wakes sleeping fish within seconds.
    const target = this.restTarget(b);
    let tau = Math.max(1.5, 240 / ctx.timeScale);
    if (target < b.rest - 0.3 && ctx.light > 0.6 && b.p.species.activity !== 'nocturnal') tau = Math.min(tau, 6);
    b.rest = approach(b.rest, target, tau, dt);
    // Shoal sub-groups reshuffle now and then.
    if (ctx.rng.chance(dt / 90)) b.anchor = Math.floor(ctx.rng.next() * 4);
  }

  private integrate(f: FishEntity, b: Brain, dt: number): void {
    const p = b.p;
    if (p.move === 'sessile') return;
    if (b.surf !== SURF_NONE) {
      const climbs = p.move === 'crawler' || (p.move === 'walker' ? p.t.climbs : b.mode === 'graze' || (b.mode === 'rest' && p.t.clings) || (b.mode === 'feed' && p.t.clings));
      const lateral = f.species.group === 'crab' && f.species.body.archetype !== 'hermit-crab';
      integrateSurface(this.ctx.h, f, b, dt, climbs, lateral);
      return;
    }
    if (p.move !== 'swimmer' && integrateInvertFree(this.ctx, f, b, dt)) return;
    integrateSwimmer(this.swimEnv, f, b, dt);
    // Burrowing: sink into the substrate.
    if (b.buried > 0) {
      const k = f.kin;
      const fl = this.ctx.h.floor(k.pos[0], k.pos[2]);
      const target = fl + (0.5 * p.depthFrac * b.L) * (1 - 2.1 * b.buried);
      if (b.mode === 'rest' || b.mode === 'hide') k.pos[1] = Math.min(k.pos[1], approach(k.pos[1], target, 0.4, dt));
      else k.pos[1] = Math.max(k.pos[1], target);
    }
  }

  private writeKinematics(f: FishEntity, b: Brain, dt: number): void {
    const k = f.kin;
    const p = b.p;
    const t = this.ctx.t;
    k.activity = b.label;
    k.rest = Math.max(b.rest, b.buried * 0.8);
    if (p.move === 'sessile') return;
    if (b.surf !== SURF_NONE) {
      const picking = b.mode === 'pick' || b.mode === 'graze' || (b.mode === 'feed' && b.biteT > -0.5) || (b.mode === 'walk' && p.move === 'crawler');
      animateSurface(f, b, dt, picking, t);
      if (p.move === 'swimmer') animateBreathing(f, b, dt, t);
      if (b.surf === SURF_PLANT) k.up = b.up;
      return;
    }
    if (p.move !== 'swimmer' && (b.mode === 'fall' || b.mode === 'tailflip')) {
      k.speed = Math.abs(b.speed);
      k.vel[0] = b.vx;
      k.vel[1] = b.vy;
      k.vel[2] = b.vz;
      k.up = undefined;
      k.onSurface = false;
      k.tailAmp = b.mode === 'tailflip' ? 1 : 0;
      k.finAmp = 0;
      k.mouth = 0;
      return;
    }
    // Free swimmer.
    const cp = Math.cos(b.bodyPitch);
    k.forward[0] = cp * Math.cos(b.yaw);
    k.forward[1] = Math.sin(b.bodyPitch);
    k.forward[2] = cp * Math.sin(b.yaw);
    k.pitch = b.bodyPitch;
    k.roll = (p.inverted ? Math.PI : 0) + b.roll;
    k.bend = b.bend;
    k.vel[0] = b.vx;
    k.vel[1] = b.vy;
    k.vel[2] = b.vz;
    k.speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    k.onSurface = false;
    // Belly-up swimmers (Synodontis nigriventris) are expressed purely through roll ≈ π; the
    // renderer applies roll about forward on top of world up.
    k.up = undefined;
    if (p.move === 'walker') {
      // Swimming shrimp: pleopods beat hard, legs trail.
      k.tailPhase = (k.tailPhase + TAU * 7 * dt) % (TAU * 64);
      k.tailAmp = 0.3;
      k.finPhase = (k.finPhase + TAU * 8 * dt) % (TAU * 64);
      k.finAmp = 1;
      k.mouth = 0;
      return;
    }
    k.tailAmp = b.tailAmp;
    k.finAmp = b.finAmp;
    animateBreathing(f, b, dt, t);
  }

  // ------------------------------------------------------------------------------------------
  // Placement
  // ------------------------------------------------------------------------------------------

  /** Give a newly added/born animal a natural starting position, heading and state. */
  placeNewFish(world: World, fish: FishEntity, near?: [number, number, number]): void {
    const ctx = this.ctx;
    ctx.world = world;
    ctx.env = world.env;
    ctx.h.sync(world);
    const h = ctx.h;
    const B = h.b;
    const b = brainOf(fish);
    this.refreshSize(fish, b);
    const k = fish.kin;
    const rng = ctx.rng;
    const p = b.p;
    const L = b.L;
    const yaw = rng.next() * TAU;
    k.forward[0] = Math.cos(yaw);
    k.forward[1] = 0;
    k.forward[2] = Math.sin(yaw);
    b.yaw = yaw;
    b.pitch = b.bodyPitch = 0;
    b.restInit = false;
    if (b.surf !== SURF_NONE) detach(fish, b);

    if (fish.state.pos) {
      k.pos[0] = fish.state.pos[0];
      k.pos[1] = fish.state.pos[1];
      k.pos[2] = fish.state.pos[2];
      return;
    }

    const tank = world.tank;
    const resident = Math.abs(fish.state.addedAt - tank.createdAt) < 20_000 && fish.state.generation === 0;
    const isFry = fish.state.generation > 0 || (fish.state.parents?.length ?? 0) > 0;
    const so = standoff(b);
    const mx = Math.min(B.halfW * 0.9, Math.max(0.03, 1.5 * L)), mz = Math.min(B.halfD * 0.9, Math.max(0.03, 1.5 * L));
    const rx = () => rng.range(-B.halfW + mx, B.halfW - mx);
    const rz = () => rng.range(-B.halfD + mz, B.halfD - mz);
    const clear = 0.5 * Math.max(p.depthFrac, p.widthFrac) * L + 0.003;
    const setPos = (x: number, y: number, z: number) => {
      // Never start inside rock or wood: nudge up and out until clear.
      for (let tries = 0; tries < 8; tries++) {
        k.pos[0] = clamp(x, -B.halfW + 0.005, B.halfW - 0.005);
        k.pos[2] = clamp(z, -B.halfD + 0.005, B.halfD - 0.005);
        k.pos[1] = clamp(y, h.floor(k.pos[0], k.pos[2]) + 0.003, B.surfaceY - 0.004);
        const d = h.nearestDecor(k.pos[0], k.pos[1], k.pos[2]);
        if (d >= clear || h.nearestIndex < 0) return;
        x += hit.nx * (clear - d + 0.01) + rng.signed() * 0.02;
        y += Math.max(0, hit.ny) * (clear - d) + 0.01;
        z += hit.nz * (clear - d + 0.01) + rng.signed() * 0.02;
      }
    };

    // Fry: beside the mother, or tucked into plants.
    if (isFry || near) {
      let base = near;
      if (!base && fish.state.parents) {
        for (const id of fish.state.parents) {
          const m = world.fishById.get(id);
          if (m && (m.state.sex === 'female' || !base)) base = [m.kin.pos[0], m.kin.pos[1], m.kin.pos[2]];
        }
      }
      if (!base) {
        const ci = ctx.pickCover('plants', 0, 0, 9);
        base = ci >= 0 ? [h.cover[ci].position[0], h.cover[ci].position[1], h.cover[ci].position[2]] : [rx(), B.surfaceY * 0.3, rz()];
      }
      setPos(base[0] + rng.signed() * 0.02, base[1] + rng.signed() * 0.01, base[2] + rng.signed() * 0.02);
      b.age = 0;
      b.fear = 0.3;
      if (p.move !== 'swimmer') attachNearest(h, fish, b, 1, p.t.climbs || p.move === 'crawler', true);
      return;
    }

    if (resident) {
      this.placeResident(world, fish, b, rx, rz, setPos);
      b.age = 1000;
      return;
    }

    // A new arrival from the shop: everybody from one bag is released at the same spot near
    // the surface.
    if (this.batchT !== world.clock.realSeconds) {
      this.batchT = world.clock.realSeconds;
      this.batch.clear();
    }
    let rel = this.batch.get(fish.species.id);
    if (!rel) {
      rel = [rng.range(-B.halfW * 0.5, B.halfW * 0.5), B.surfaceY - 0.03, rng.range(-B.halfD * 0.2, B.halfD * 0.5)];
      this.batch.set(fish.species.id, rel);
    }
    setPos(rel[0] + rng.signed() * 0.025, rel[1] - rng.next() * 0.02 - 0.3 * L, rel[2] + rng.signed() * 0.02);
    b.age = 0;
    if (p.move === 'swimmer') {
      b.fear = 0.35;
      enter(ctx, fish, b, 'explore', 50);
    } else if (p.move === 'walker') {
      // Shrimp swim straight down to the bottom; crabs & crayfish sink.
      thinkInvert(ctx, fish, b);
      b.mode = 'swim';
      b.label = 'swimming';
      b.hasGoal = true;
      b.gx = k.pos[0] + rng.signed() * 0.05;
      b.gz = k.pos[2] + rng.signed() * 0.03;
      b.gy = h.floor(b.gx, b.gz) + so;
    } else if (p.move === 'crawler') {
      startFall(fish, b);
    }
  }

  private placeResident(world: World, fish: FishEntity, b: Brain, rx: () => number, rz: () => number, setPos: (x: number, y: number, z: number) => void): void {
    const ctx = this.ctx;
    const h = ctx.h;
    const B = h.b;
    const rng = ctx.rng;
    const p = b.p;
    const L = b.L;
    const k = fish.kin;
    const so = standoff(b);
    const zone = p.species.zone;
    const hf = () => p.zoneLo + (p.zoneHi - p.zoneLo) * rng.next();

    if (p.move === 'crawler' || (p.move === 'swimmer' && p.t.clings)) {
      // Snails, otos and plecos already settled on glass, wood, rock or sand.
      const r = rng.next();
      if (r < 0.5) {
        const q = rng.next();
        const wall = q < 0.5 ? WALL_FRONT : q < 0.75 ? WALL_BACK : rng.chance(0.5) ? WALL_LEFT : WALL_RIGHT;
        setPos(rx(), h.yAtFrac(0, 0, rng.range(0.08, 0.7)), rz());
        attachGlass(h, fish, b, wall);
      } else if (r < 0.8 && h.colliders.length > 0) {
        const i = Math.floor(rng.next() * h.colliders.length);
        const c = h.colliders[i];
        const cc = c.type === 'capsule' ? c.a : c.center;
        setPos(cc[0] + rng.signed() * 0.05, cc[1] + 0.1, cc[2] + rng.signed() * 0.05);
        attachDecor(h, fish, b, i);
        if (k.pos[1] > B.surfaceY - so || k.pos[1] < h.floor(k.pos[0], k.pos[2])) attachSubstrate(h, fish, b);
      } else {
        setPos(rx(), 0, rz());
        attachSubstrate(h, fish, b);
      }
      const f = k.forward;
      // Random heading in the surface plane.
      const a = rng.next() * TAU;
      f[0] = Math.cos(a);
      f[1] = Math.sin(a) * (Math.abs(b.ny) < 0.5 ? 1 : 0);
      f[2] = Math.sin(a) * (Math.abs(b.ny) < 0.5 ? 0 : 1);
      if (p.move === 'swimmer') {
        enter(ctx, fish, b, 'graze', rng.range(20, 120));
        b.pauseT = rng.range(0, 5);
      }
      return;
    }
    if (p.move === 'walker') {
      const onDecor = p.t.climbs && h.colliders.length > 0 && rng.chance(0.3);
      if (onDecor) {
        const i = Math.floor(rng.next() * h.colliders.length);
        const c = h.colliders[i];
        const cc = c.type === 'capsule' ? c.a : c.center;
        setPos(cc[0], cc[1] + 0.15, cc[2]);
        attachDecor(h, fish, b, i);
        if (b.ny < 0.3) attachSubstrate(h, fish, b);
      } else {
        setPos(rx(), 0, rz());
        attachSubstrate(h, fish, b);
      }
      return;
    }
    if (p.move === 'sessile') {
      setPos(rx(), 0, rz());
      k.pos[1] = h.floor(k.pos[0], k.pos[2]) + so;
      return;
    }
    // Swimmers.
    const t = p.t;
    let home = fish.state.home;
    if (!home && (t['anemone-host'] || t['cave-dweller'] || t.territorial || t.burrower)) {
      // Pick a home now so the fish starts beside it.
      let ci = -1;
      if (t['anemone-host']) ci = ctx.pickCover('anemone', 0, 0, 9);
      if (ci < 0 && t['cave-dweller']) ci = ctx.pickCover('cave', 0, 0, 9);
      if (ci < 0 && t.burrower) ci = ctx.pickCover('burrow', 0, 0, 9);
      if (ci >= 0) {
        const c = h.cover[ci].position;
        fish.state.home = home = [c[0], c[1], c[2]];
      }
    }
    if (home) {
      setPos(home[0] + rng.signed() * 3 * L, home[1] + rng.range(0.5, 2) * L, home[2] + rng.signed() * 2 * L);
      return;
    }
    if (p.schooling > 0) {
      // Members of a shoal start together.
      let c = this.batch.get('resident:' + fish.species.id);
      if (!c || this.batchT !== world.clock.realSeconds) {
        if (this.batchT !== world.clock.realSeconds) {
          this.batchT = world.clock.realSeconds;
          this.batch.clear();
        }
        const x = rx(), z = rz() * 0.7;
        c = [x, h.yAtFrac(x, z, hf()), z];
        this.batch.set('resident:' + fish.species.id, c);
      }
      const R = Math.max(2 * L, p.spacing * L * 2.2);
      setPos(c[0] + rng.signed() * R, c[1] + rng.signed() * R * 0.35, c[2] + rng.signed() * R * 0.6);
      return;
    }
    const x = rx(), z = rz();
    if (zone === 'bottom') setPos(x, h.floor(x, z) + 0.5 * p.depthFrac * L + 0.004, z);
    else setPos(x, h.yAtFrac(x, z, hf()), z);
    void world;
  }

  // ------------------------------------------------------------------------------------------
  // Disturbances & feeding events
  // ------------------------------------------------------------------------------------------

  /** Something startled the tank (glass tap, decor moved, sudden light). */
  startle(world: World, at: [number, number, number], strength: number): void {
    const ctx = this.ctx;
    ctx.world = world;
    ctx.h.sync(world);
    const hab = 1 - 0.6 * ctx.habituation;
    ctx.habituation = Math.min(1, ctx.habituation + 0.25 * strength);
    for (const f of world.fish) {
      const b = brainOf(f);
      const k = f.kin;
      const dx = k.pos[0] - at[0], dy = k.pos[1] - at[1], dz = k.pos[2] - at[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // The pressure pulse reaches the whole tank; nearby animals get the full shock.
      const I = strength * (0.25 + 0.75 * Math.exp(-d / 0.3)) * (1.25 - b.boldness) * (1 - 0.4 * b.rest) * hab;
      if (I <= 0.01) continue;
      const inc = Math.min(1 - f.state.stress, I * 0.25);
      if (inc > 0) {
        f.state.stress += inc;
        b.stressAdded += inc;
      }
      b.fear = Math.min(1, b.fear + I * 0.8);
      if (I < 0.12 + 0.2 * b.boldness) continue; // alert only (shoals tighten via fear)
      const p = b.p;
      if (p.move === 'swimmer') {
        if (b.buried > 0.5) continue; // stays put in the sand
        if (b.surf !== SURF_NONE && p.t.clings && I < 0.5) continue; // clamps down instead
        // Latency: Mauthner-cell escapes start within ~10–20 ms; farther fish react a beat later.
        const delay = 0.01 + d / 20 + ctx.rng.next() * 0.08;
        startFlee(ctx, f, b, at[0], at[1], at[2], clamp(I, 0, 1), delay);
        if (b.mode === 'rest' && b.restKind === RK_BURY) b.buried = 0;
      } else if (p.move === 'walker') {
        if ((f.species.group === 'shrimp' || f.species.group === 'crayfish') && I > 0.25) startTailflip(ctx, f, b, at[0], at[2], clamp(I, 0, 1));
        else startRetract(ctx, b, I);
      } else if (p.move === 'crawler') {
        startRetract(ctx, b, I);
        if (I > 0.7 && b.surf !== SURF_NONE && b.ny < 0.3 && ctx.rng.chance(0.3)) startFall(f, b);
      }
    }
  }

  private onFoodDropped(world: World, kind: FoodKind, at: [number, number, number]): void {
    const ctx = this.ctx;
    const type = FOODS[kind];
    if (!type) return;
    for (const f of world.fish) {
      const b = brainOf(f);
      const app = appetite(f);
      if (app < 0.12) continue;
      const aff = type.affinity[f.species.diet] ?? 0;
      if (aff < 0.15 && !b.p.t.scavenger) continue;
      // Aquarium fish learn the feeding routine: the splash and the lid bring them up.
      const dx = f.kin.pos[0] - at[0], dz = f.kin.pos[2] - at[2];
      const w = Math.exp(-Math.sqrt(dx * dx + dz * dz) / 0.5);
      const e = clamp(b.p.enthusiasm * app * (0.5 + 0.7 * w) * (1 - 0.7 * b.rest) * (0.6 + 0.4 * aff), 0, 1);
      b.excite = Math.max(b.excite, e);
      b.scanT = Math.min(b.scanT, 0.05 + ctx.rng.next() * 0.35);
      if (b.p.move === 'swimmer' && b.p.schooling > 0 && e > 0.3) {
        const g = ctx.groups.get(f.species.id);
        if (g) {
          g.surgeX = at[0];
          g.surgeZ = at[2];
          if (g.surgeT <= 0) for (let i = 0; i < g.nAnchors && i < g.anchors.length; i++) ctx.retarget(g, g.anchors[i]);
          g.surgeT = 15;
        }
      }
    }
  }
}
