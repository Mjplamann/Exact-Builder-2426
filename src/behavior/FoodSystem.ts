import type { FoodKind, FoodParticle, FoodType } from '../core/types';
import type { World } from '../core/world';
import { FOODS } from '../data/foods';
import { Habitat, hit } from './habitat';
import { FastRng, TAU, approach, clamp } from './math';

/**
 * Runtime extension of a FoodParticle. Particles created here carry extra physics state; code
 * reading `world.food` must treat these fields as optional (other systems may push plain
 * FoodParticles).
 */
export interface FoodRT extends FoodParticle {
  type: FoodType;
  /** Nutrition when dropped (big items are eaten in bites). */
  nutrition0: number;
  /** Number of animals currently heading for this particle (feeding competition). */
  claims: number;
  /** 0 dry … 1 waterlogged (flakes darken, then sink). */
  soak: number;
  /** Seconds left on the surface film. */
  floatT: number;
  /** Flutter / swim-beat phase, frequency (Hz) and amplitude (m). */
  phase: number;
  hz: number;
  amp: number;
  /** Flutter swing direction or live-food heading (unit). */
  dirX: number;
  dirY: number;
  dirZ: number;
  /** Tumbling angular velocity (rad/s). */
  spinX: number;
  spinY: number;
  spinZ: number;
  /** Live food: seconds to the next jerk / hop. */
  timer: number;
  /** Live food: sim ms of death (then it sinks). */
  dieAtSim: number;
  droppedAtSim: number;
  /** −1 substrate, −2 clip on the glass, ≥0 collider index it rests on. */
  restOn: number;
  restOwner: string;
  /** Shape scale multipliers for the renderer (irregular flakes, curled worms). */
  sx: number;
  sy: number;
  sz: number;
  /** Cloud (phytoplankton) opacity 0..1. */
  alpha: number;
  /** Size when dropped (big items shrink as they are eaten). */
  size0: number;
  /** Live food has died. */
  dead: boolean;
}

/** Hard cap on simultaneous particles (oldest settled food is expired first). */
export const MAX_FOOD = 600;

const cur = new Float64Array(3);

/**
 * Food physics: floating on the surface film (spreading, drifting with the filter current and
 * piling up against the glass), soaking and fluttering down, sinking at terminal velocity with
 * tumbling, settling on substrate and decor, live foods swimming, phytoplankton clouds
 * dispersing, nori clipped to the glass, and decay of uneaten food in sim time.
 *
 * Physical values (FOODS): flakes float ~10–40 s then flutter down at ~1–2 cm/s; pellets fall
 * ~5 cm/s; wafers ~7 cm/s; frozen bloodworms ~3 cm/s; Artemia swim ~2 cm/s; Daphnia hop.
 *
 * OWNER: behavior module.
 */
export class FoodSystem {
  /** Called when uneaten food rots away (LifeSim adds ammonia). */
  onDecay: (food: FoodParticle) => void = () => {};
  private nextId = 1;
  private rng = new FastRng(0xf00d);
  private h = new Habitat();

  /** Drop `pinches` pinches of a food at x,z (y ignored: floating foods start on the surface, others just below). */
  drop(world: World, kind: FoodKind, at: [number, number, number], pinches = 1): void {
    const type = FOODS[kind];
    if (!type) return;
    this.h.sync(world);
    const B = this.h.b;
    const rng = this.rng;
    const n = Math.max(1, Math.round(type.particlesPerPinch * Math.max(0.2, pinches)));
    this.makeRoom(world, n);
    const sim = world.clock.simTime;
    const marine = world.tank.water === 'marine';

    if (type.buoyancy === 'clip') {
      // A nori sheet on a suction clip on the side pane nearest the drop point.
      const right = at[0] >= 0;
      const x = right ? B.halfW - 0.012 : -B.halfW + 0.012;
      const z = clamp(at[2], -B.halfD * 0.6, B.halfD * 0.6);
      const y = B.surfaceY * 0.58;
      const f = this.make(type, x, y, z, sim);
      f.state = 'settled';
      f.restOn = -2;
      f.settledAtSim = sim;
      f.rot[0] = 0;
      f.rot[1] = right ? -Math.PI / 2 : Math.PI / 2;
      f.rot[2] = rng.signed() * 0.15;
      f.sx = 1;
      f.sy = 1;
      f.sz = 1;
      world.food.push(f);
      return;
    }

    // Pinch geometry: most particles land within ~3–6 cm of the fingertips.
    const sigma = type.buoyancy === 'suspended' ? 0.02 : type.sizeM > 0.02 ? 0.012 : 0.018;
    for (let i = 0; i < n; i++) {
      const r = sigma * Math.abs(rng.gauss());
      const a = rng.next() * TAU;
      const x = clamp(at[0] + Math.cos(a) * r, -B.halfW + 0.005, B.halfW - 0.005);
      const z = clamp(at[2] + Math.sin(a) * r, -B.halfD + 0.005, B.halfD - 0.005);
      const f = this.make(type, x, B.surfaceY, z, sim);
      // Individual size variation (flakes are very irregular; pellets uniform).
      const sv = type.shape === 'flake' ? rng.range(0.55, 1.45) : type.shape === 'pellet' ? rng.range(0.85, 1.15) : rng.range(0.8, 1.2);
      f.sizeM = type.sizeM * sv;
      f.size0 = f.sizeM;
      f.nutrition = type.nutrition * sv * sv;
      f.nutrition0 = f.nutrition;
      f.rot[0] = rng.signed() * 0.25;
      f.rot[1] = rng.next() * TAU;
      f.rot[2] = rng.signed() * 0.25;
      if (type.shape === 'flake') {
        f.sx = rng.range(0.6, 1.3);
        f.sz = rng.range(0.55, 1.15);
        f.sy = 1;
      } else if (type.shape === 'worm' || type.shape === 'shrimp') {
        f.sx = rng.range(0.8, 1.2);
        f.sy = 1;
        f.sz = 1;
      }
      switch (type.buoyancy) {
        case 'floating': {
          f.state = 'floating';
          f.pos[1] = B.surfaceY - f.sizeM * 0.1;
          // A few flakes are wet on contact and sink almost at once.
          f.floatT = rng.chance(0.08) ? rng.range(0.5, 3) : type.floatSeconds * rng.range(0.5, 1.5);
          // Oils in the flakes spread the pinch out across the film (Marangoni spreading).
          const sp = rng.range(0.006, 0.025);
          f.vel[0] = Math.cos(a) * sp;
          f.vel[2] = Math.sin(a) * sp;
          break;
        }
        case 'slow-sinking':
        case 'sinking': {
          f.state = type.floatSeconds > 0 && rng.chance(0.6) ? 'floating' : 'sinking';
          f.floatT = type.floatSeconds * rng.range(0.3, 1.3);
          f.pos[1] = B.surfaceY - (f.state === 'floating' ? f.sizeM * 0.2 : f.sizeM * 0.6 + rng.next() * 0.004);
          // Entering the water with a little momentum, then braking to terminal velocity.
          f.vel[1] = f.state === 'sinking' ? -rng.range(0.04, 0.12) : 0;
          f.spinX = rng.signed() * 3;
          f.spinY = rng.signed() * 3;
          f.spinZ = rng.signed() * 3;
          break;
        }
        case 'live-swimming': {
          f.state = 'swimming';
          f.pos[1] = B.surfaceY - rng.range(0.005, 0.03);
          const life = kind === 'brine-shrimp' ? (marine ? 8 * 3600 : 40 * 60) : marine ? 20 * 60 : 12 * 3600;
          f.dieAtSim = sim + life * rng.range(0.6, 1.4) * 1000;
          this.newHeading(f);
          f.timer = rng.range(0, 0.5);
          f.hz = kind === 'brine-shrimp' ? rng.range(4, 7) : rng.range(2, 3.5);
          break;
        }
        case 'suspended': {
          f.state = 'sinking';
          f.pos[1] = B.surfaceY - rng.range(0.002, 0.02);
          // The dose plumes down and outward from where it was poured.
          f.vel[0] = Math.cos(a) * rng.range(0.005, 0.02);
          f.vel[1] = -rng.range(0.01, 0.04);
          f.vel[2] = Math.sin(a) * rng.range(0.005, 0.02);
          f.alpha = 1;
          break;
        }
      }
      if (type.shape === 'flake') {
        f.hz = rng.range(0.35, 0.75);
        f.amp = rng.range(0.003, 0.009);
        const d = rng.next() * TAU;
        f.dirX = Math.cos(d);
        f.dirZ = Math.sin(d);
      }
      world.food.push(f);
    }
  }

  private make(type: FoodType, x: number, y: number, z: number, sim: number): FoodRT {
    return {
      id: this.nextId++,
      kind: type.kind,
      pos: [x, y, z],
      vel: [0, 0, 0],
      rot: [0, 0, 0],
      sizeM: type.sizeM,
      nutrition: type.nutrition,
      state: 'sinking',
      age: 0,
      settledAtSim: undefined,
      seed: Math.floor(this.rng.next() * 2 ** 31),
      type,
      nutrition0: type.nutrition,
      claims: 0,
      soak: 0,
      floatT: 0,
      phase: this.rng.next() * TAU,
      hz: 0,
      amp: 0,
      dirX: 1,
      dirY: 0,
      dirZ: 0,
      spinX: 0,
      spinY: 0,
      spinZ: 0,
      timer: 0,
      dieAtSim: Infinity,
      droppedAtSim: sim,
      restOn: -1,
      restOwner: '',
      sx: 1,
      sy: 1,
      sz: 1,
      alpha: 1,
      size0: type.sizeM,
      dead: false,
    };
  }

  /** Expire the oldest particles (settled first) so the total stays under MAX_FOOD. */
  private makeRoom(world: World, incoming: number): void {
    let excess = world.food.length + incoming - MAX_FOOD;
    if (excess <= 0) return;
    // Pass 1: oldest settled; pass 2: anything oldest.
    for (let pass = 0; pass < 2 && excess > 0; pass++) {
      for (let i = 0; i < world.food.length && excess > 0; ) {
        const f = world.food[i];
        if (pass === 0 && f.state !== 'settled') {
          i++;
          continue;
        }
        world.food.splice(i, 1);
        f.state = 'eaten';
        if (f.kind !== 'phytoplankton') this.onDecay(f);
        excess--;
      }
    }
  }

  private newHeading(f: FoodRT): void {
    const rng = this.rng;
    // Artemia and Daphnia are positively phototactic: a slight upward bias.
    let x = rng.signed(), y = rng.signed() * 0.6 + 0.15, z = rng.signed();
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    x /= l;
    y /= l;
    z /= l;
    f.dirX = x;
    f.dirY = y;
    f.dirZ = z;
  }

  /** Physics in real seconds; decay in sim seconds. */
  update(world: World, dt: number, simDt: number): void {
    void simDt;
    if (dt <= 0 || world.food.length === 0) return;
    this.h.sync(world);
    const t = world.clock.realSeconds;
    const sim = world.clock.simTime;
    const rng = this.rng;
    const food = world.food;
    // Sub-step fast movers for stable settling (≤ 1/30 s).
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 30))));
    const h1 = dt / steps;

    for (let i = food.length - 1; i >= 0; i--) {
      const f = food[i] as FoodRT;
      if (f.type === undefined) continue; // foreign particle: leave it alone
      f.age += dt;
      const type = f.type;

      // ---- decay & death (sim time) -------------------------------------------------------
      const decayMs = type.decayHours * 3_600_000;
      const since = f.state === 'settled' && f.settledAtSim !== undefined ? sim - f.settledAtSim : f.state === 'floating' && type.floatSeconds > 1e6 ? sim - f.droppedAtSim : -1;
      if (since > decayMs) {
        food.splice(i, 1);
        f.state = 'eaten';
        this.onDecay(f);
        continue;
      }
      if (f.state === 'swimming' && sim > f.dieAtSim) {
        f.state = 'sinking';
        f.dead = true;
        f.spinX = rng.signed();
        f.spinZ = rng.signed();
      }
      if (type.buoyancy === 'suspended') {
        // Phytoplankton disperses through the water column within a couple of minutes.
        f.alpha = Math.exp(-f.age / 55);
        if (f.alpha < 0.03) {
          food.splice(i, 1);
          f.state = 'eaten';
          continue;
        }
      }

      for (let s = 0; s < steps; s++) {
        if (f.state === 'eaten') break;
        switch (f.state) {
          case 'floating':
            this.stepFloating(f, h1, t);
            break;
          case 'sinking':
            this.stepSinking(world, f, h1, t, sim);
            break;
          case 'swimming':
            this.stepLive(f, h1, t);
            break;
          case 'settled':
            this.stepSettled(f, h1, t);
            break;
        }
      }
    }
  }

  private stepFloating(f: FoodRT, dt: number, t: number): void {
    const h = this.h;
    const B = h.b;
    const env = h.world.env;
    h.current(env, t, f.pos[0], B.surfaceY - 0.003, f.pos[2], cur);
    // Spreading velocity decays (τ ≈ 2 s); the film carries floating food at a little under the
    // water speed (partly submerged flakes drag in the surface boundary layer).
    f.vel[0] = approach(f.vel[0], cur[0] * 0.65, 2, dt);
    f.vel[2] = approach(f.vel[2], cur[2] * 0.65, 2, dt);
    f.vel[1] = 0;
    f.pos[0] += f.vel[0] * dt;
    f.pos[2] += f.vel[2] * dt;
    // Film bobbing on tiny surface ripples.
    f.pos[1] = B.surfaceY - f.sizeM * 0.12 + Math.sin(t * 2.1 + f.phase) * 0.0004;
    f.rot[1] += (f.vel[0] * 3 + Math.sin(t * 0.3 + f.phase) * 0.05) * dt;
    f.rot[0] = Math.sin(t * 1.7 + f.phase) * 0.06;
    f.rot[2] = Math.cos(t * 1.3 + f.phase) * 0.06;
    // Floating food piles up against the glass (meniscus).
    const m = f.sizeM * 0.6;
    if (f.pos[0] < -B.halfW + m) { f.pos[0] = -B.halfW + m; f.vel[0] = 0; }
    if (f.pos[0] > B.halfW - m) { f.pos[0] = B.halfW - m; f.vel[0] = 0; }
    if (f.pos[2] < -B.halfD + m) { f.pos[2] = -B.halfD + m; f.vel[2] = 0; }
    if (f.pos[2] > B.halfD - m) { f.pos[2] = B.halfD - m; f.vel[2] = 0; }
    if (f.type.shape === 'insect') {
      // Trapped insects twitch on the film.
      if (Math.sin(t * 7 + f.phase * 3) > 0.97) f.rot[1] += 0.4;
      return;
    }
    f.floatT -= dt;
    f.soak = Math.min(0.6, f.soak + dt / Math.max(1, f.type.floatSeconds * 1.5));
    if (f.floatT <= 0) {
      f.state = 'sinking';
      f.pos[1] = B.surfaceY - f.sizeM * 0.6;
      f.vel[1] = 0;
    }
  }

  private stepSinking(world: World, f: FoodRT, dt: number, t: number, sim: number): void {
    const h = this.h;
    const B = h.b;
    const type = f.type;
    h.current(h.world.env, t, f.pos[0], f.pos[1], f.pos[2], cur);
    f.soak = Math.min(1, f.soak + dt / 20);
    const flutter = type.shape === 'flake' || type.shape === 'sheet';
    const live = type.buoyancy === 'live-swimming';
    const cloud = type.buoyancy === 'suspended';
    const vTerm = live ? type.sinkSpeed * 2.5 + 0.004 : type.sinkSpeed;
    if (flutter) {
      // Falling-leaf flutter: side-to-side swing, faster descent through the middle of each swing.
      f.phase += TAU * f.hz * dt;
      const sw = Math.cos(f.phase);
      const hv = f.amp * TAU * f.hz * sw;
      f.vel[0] = cur[0] * 0.8 + f.dirX * hv;
      f.vel[2] = cur[2] * 0.8 + f.dirZ * hv;
      f.vel[1] = approach(f.vel[1], -vTerm * (0.75 + 0.5 * Math.abs(Math.sin(f.phase))) + cur[1] * 0.5, 0.25, dt);
      f.rot[0] = approach(f.rot[0], 0.55 * Math.sin(f.phase) * f.dirZ, 0.1, dt);
      f.rot[2] = approach(f.rot[2], -0.55 * Math.sin(f.phase) * f.dirX, 0.1, dt);
      f.rot[1] += 0.25 * dt;
    } else if (cloud) {
      // Turbulent diffusion of a microalgae plume.
      f.vel[0] = approach(f.vel[0], cur[0] + Math.sin(t * 0.7 + f.phase * 5) * 0.006, 3, dt);
      f.vel[1] = approach(f.vel[1], cur[1] - vTerm + Math.cos(t * 0.5 + f.phase * 3) * 0.003, 3, dt);
      f.vel[2] = approach(f.vel[2], cur[2] + Math.cos(t * 0.6 + f.phase * 7) * 0.006, 3, dt);
    } else {
      // Terminal velocity reached in ~0.1–0.2 s; heavier items drift less with the current.
      const drift = clamp(0.02 / Math.max(0.005, type.sinkSpeed), 0.15, 0.9);
      f.vel[0] = approach(f.vel[0], cur[0] * drift, 0.3, dt);
      f.vel[2] = approach(f.vel[2], cur[2] * drift, 0.3, dt);
      f.vel[1] = approach(f.vel[1], -vTerm + cur[1] * drift * 0.5, 0.15, dt);
      if (type.shape === 'wafer' || type.shape === 'slice') {
        // Falling discs rock gently and stay roughly flat.
        f.phase += TAU * 1.1 * dt;
        f.rot[0] = 0.18 * Math.sin(f.phase);
        f.rot[2] = 0.14 * Math.cos(f.phase * 0.8);
        f.rot[1] += 0.3 * dt;
      } else {
        f.rot[0] += f.spinX * dt;
        f.rot[1] += f.spinY * dt;
        f.rot[2] += f.spinZ * dt;
      }
    }
    f.pos[0] += f.vel[0] * dt;
    f.pos[1] += f.vel[1] * dt;
    f.pos[2] += f.vel[2] * dt;
    const m = f.sizeM * 0.5;
    f.pos[0] = clamp(f.pos[0], -B.halfW + m, B.halfW - m);
    f.pos[2] = clamp(f.pos[2], -B.halfD + m, B.halfD - m);
    if (f.pos[1] > B.surfaceY - m) f.pos[1] = B.surfaceY - m;

    // Decor: settle on tops, slide off steep faces.
    const d = h.nearestDecor(f.pos[0], f.pos[1], f.pos[2]);
    const rad = f.sizeM * 0.3;
    if (d < rad && h.nearestIndex >= 0) {
      const ci = h.nearestIndex;
      const nx = hit.nx, ny = hit.ny, nz = hit.nz;
      const push = rad - d;
      f.pos[0] += nx * push;
      f.pos[1] += ny * push;
      f.pos[2] += nz * push;
      if (ny > 0.55 && !cloud) {
        this.settle(f, sim, ci, world);
        return;
      }
      // Slide down the face.
      const vn = f.vel[0] * nx + f.vel[1] * ny + f.vel[2] * nz;
      if (vn < 0) {
        f.vel[0] -= vn * nx;
        f.vel[1] -= vn * ny;
        f.vel[2] -= vn * nz;
      }
    }
    const floor = h.floor(f.pos[0], f.pos[2]);
    if (f.pos[1] <= floor + rad) {
      f.pos[1] = floor + rad;
      if (cloud) {
        f.vel[1] = Math.max(0, f.vel[1]);
        return;
      }
      this.settle(f, sim, -1, world);
    }
  }

  private settle(f: FoodRT, sim: number, onCollider: number, world: World): void {
    f.state = 'settled';
    f.settledAtSim = sim;
    f.vel[0] = f.vel[1] = f.vel[2] = 0;
    f.restOn = onCollider;
    f.restOwner = onCollider >= 0 ? this.h.colliders[onCollider]?.ownerId ?? '' : '';
    const flat = f.type.shape === 'flake' || f.type.shape === 'wafer' || f.type.shape === 'slice' || f.type.shape === 'sheet';
    if (flat) {
      f.rot[0] = (this.rng.signed() * 0.12);
      f.rot[2] = (this.rng.signed() * 0.12);
    } else if (f.type.shape === 'worm' || f.type.shape === 'shrimp' || f.type.shape === 'stick') {
      // Elongated items lie on their side.
      f.rot[0] = this.rng.signed() * 0.2;
      f.rot[2] = this.rng.signed() * 0.2;
    }
    if (onCollider < 0) f.pos[1] = this.h.floor(f.pos[0], f.pos[2]) + f.sizeM * (flat ? 0.08 : 0.3);
    void world;
  }

  private stepLive(f: FoodRT, dt: number, t: number): void {
    const h = this.h;
    const B = h.b;
    const type = f.type;
    const v = type.liveSpeed ?? 0.01;
    h.current(h.world.env, t, f.pos[0], f.pos[1], f.pos[2], cur);
    f.timer -= dt;
    f.phase += TAU * f.hz * dt;
    if (f.kind === 'daphnia') {
      // Daphnia "hop": a stroke of the second antennae lifts it ~3–5 mm, then it sinks.
      if (f.timer <= 0) {
        f.timer = this.rng.range(0.25, 0.7);
        f.vel[0] += f.dirX * v * 0.5;
        f.vel[1] = v * this.rng.range(0.9, 1.6);
        f.vel[2] += f.dirZ * v * 0.5;
        if (this.rng.chance(0.3)) this.newHeading(f);
      }
      f.vel[0] = approach(f.vel[0], cur[0] * 0.6, 0.4, dt);
      f.vel[2] = approach(f.vel[2], cur[2] * 0.6, 0.4, dt);
      f.vel[1] = approach(f.vel[1], -type.sinkSpeed, 0.25, dt);
      f.rot[0] = 0.4 * Math.sin(f.phase);
    } else {
      // Artemia: steady rowing with the thoracopods, jerky at small scale, wandering course.
      if (f.timer <= 0) {
        f.timer = this.rng.range(0.4, 1.4);
        // Turn partly toward a new heading.
        const ox = f.dirX, oy = f.dirY, oz = f.dirZ;
        this.newHeading(f);
        f.dirX = f.dirX * 0.6 + ox * 0.4;
        f.dirY = f.dirY * 0.6 + oy * 0.4;
        f.dirZ = f.dirZ * 0.6 + oz * 0.4;
        const l = Math.sqrt(f.dirX * f.dirX + f.dirY * f.dirY + f.dirZ * f.dirZ) || 1;
        f.dirX /= l;
        f.dirY /= l;
        f.dirZ /= l;
      }
      const pulse = v * (0.6 + 0.5 * Math.max(0, Math.sin(f.phase)));
      f.vel[0] = approach(f.vel[0], f.dirX * pulse + cur[0] * 0.5, 0.08, dt);
      f.vel[1] = approach(f.vel[1], f.dirY * pulse + cur[1] * 0.3, 0.08, dt);
      f.vel[2] = approach(f.vel[2], f.dirZ * pulse + cur[2] * 0.5, 0.08, dt);
      f.rot[1] = Math.atan2(-f.dirZ, f.dirX);
      f.rot[2] = Math.asin(clamp(f.dirY, -1, 1));
    }
    f.pos[0] += f.vel[0] * dt;
    f.pos[1] += f.vel[1] * dt;
    f.pos[2] += f.vel[2] * dt;
    // Bounce off glass, surface, substrate and decor.
    const m = 0.006;
    if (f.pos[0] < -B.halfW + m || f.pos[0] > B.halfW - m) {
      f.dirX = -f.dirX;
      f.vel[0] = -f.vel[0];
      f.pos[0] = clamp(f.pos[0], -B.halfW + m, B.halfW - m);
    }
    if (f.pos[2] < -B.halfD + m || f.pos[2] > B.halfD - m) {
      f.dirZ = -f.dirZ;
      f.vel[2] = -f.vel[2];
      f.pos[2] = clamp(f.pos[2], -B.halfD + m, B.halfD - m);
    }
    if (f.pos[1] > B.surfaceY - m) {
      f.pos[1] = B.surfaceY - m;
      f.dirY = -Math.abs(f.dirY);
      f.vel[1] = Math.min(0, f.vel[1]);
    }
    const fl = h.floor(f.pos[0], f.pos[2]) + m;
    if (f.pos[1] < fl) {
      f.pos[1] = fl;
      f.dirY = Math.abs(f.dirY) + 0.3;
      f.vel[1] = Math.max(0, f.vel[1]);
    }
    const d = h.nearestDecor(f.pos[0], f.pos[1], f.pos[2]);
    if (d < m) {
      f.pos[0] += hit.nx * (m - d);
      f.pos[1] += hit.ny * (m - d);
      f.pos[2] += hit.nz * (m - d);
      const dn = f.dirX * hit.nx + f.dirY * hit.ny + f.dirZ * hit.nz;
      if (dn < 0) {
        f.dirX -= 2 * dn * hit.nx;
        f.dirY -= 2 * dn * hit.ny;
        f.dirZ -= 2 * dn * hit.nz;
      }
    }
  }

  private stepSettled(f: FoodRT, dt: number, t: number): void {
    const h = this.h;
    if (f.restOn === -2) {
      // Clipped nori: the sheet waves gently in the current (renderer reads rot).
      f.rot[2] = Math.sin(t * 0.8 + f.phase) * 0.08;
      return;
    }
    if (f.restOn >= 0) {
      // Resting on decor: if that decor moved or vanished, start sinking again.
      const c = h.colliders[f.restOn];
      if (!c || c.ownerId !== f.restOwner || h.sdf(f.restOn, f.pos[0], f.pos[1], f.pos[2]) > f.sizeM * 0.6) {
        f.state = 'sinking';
        f.restOn = -1;
        f.settledAtSim = undefined;
      }
      return;
    }
    // Light, soaked flakes creep along the bottom in the return current; heavy food stays put.
    if (f.type.shape === 'flake' || f.type.buoyancy === 'slow-sinking') {
      h.current(h.world.env, t, f.pos[0], f.pos[1] + 0.005, f.pos[2], cur);
      const sp = Math.sqrt(cur[0] * cur[0] + cur[2] * cur[2]);
      if (sp > 0.006) {
        const k = 0.06 * (sp - 0.006) / sp;
        f.pos[0] += cur[0] * k * dt;
        f.pos[2] += cur[2] * k * dt;
        const B = h.b;
        f.pos[0] = clamp(f.pos[0], -B.halfW + 0.003, B.halfW - 0.003);
        f.pos[2] = clamp(f.pos[2], -B.halfD + 0.003, B.halfD - 0.003);
        f.pos[1] = h.floor(f.pos[0], f.pos[2]) + f.sizeM * 0.08;
      }
    }
  }

  /** Take up to `amount` nutrition from a particle; removes it when exhausted. Returns nutrition taken. */
  consume(world: World, food: FoodParticle, amount: number): number {
    if (food.state === 'eaten') return 0;
    const taken = Math.min(Math.max(0, amount), food.nutrition);
    food.nutrition -= taken;
    // Big items visibly shrink as they are nibbled (area ∝ remaining nutrition).
    const rt = food as Partial<FoodRT>;
    if (rt.nutrition0 && rt.nutrition0 > 0 && rt.type) {
      const frac = clamp(food.nutrition / rt.nutrition0, 0, 1);
      if (rt.type.shape === 'wafer' || rt.type.shape === 'slice' || rt.type.shape === 'sheet') {
        food.sizeM = (rt.size0 ?? rt.type.sizeM) * Math.max(0.25, Math.sqrt(frac));
      }
    }
    if (food.nutrition <= 1e-6) {
      food.state = 'eaten';
      const i = world.food.indexOf(food);
      if (i >= 0) world.food.splice(i, 1);
    }
    return taken;
  }
}
