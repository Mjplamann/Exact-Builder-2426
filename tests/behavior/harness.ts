/**
 * Minimal headless world for behavior tests: reference species, a tank, optional random decor
 * colliders & cover points, and helpers to add animals and step the systems.
 */
import type { Collider, CoverPoint, FishEntity, TankSize } from '../../src/core/types';
import { DEFAULT_SETTINGS, attachFish, createWorld, makeFishEntity, type World } from '../../src/core/world';
import { substrateHeight, tankBounds } from '../../src/core/tankGeometry';
import { Rng } from '../../src/core/rng';
import { SpeciesIndex } from '../../src/data/speciesIndex';
import { PlantIndex } from '../../src/data/plantIndex';
import { newTank } from '../../src/sim/tankFactory';
import { BehaviorSystem } from '../../src/behavior/BehaviorSystem';
import { FoodSystem } from '../../src/behavior/FoodSystem';
import reference from '../../src/data/species/reference.json';
import type { Species } from '../../src/core/types';

export const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

export interface Sim {
  world: World;
  behavior: BehaviorSystem;
  food: FoodSystem;
  eaten: number;
  bites: number;
  step(dt: number): void;
  run(seconds: number, dt?: number, each?: () => void): void;
  add(speciesId: string, count: number, opts?: { hunger?: number; resident?: boolean }): FishEntity[];
}

export function makeSim(opts: { size?: TankSize; seed?: number; decor?: number; daylight?: number; water?: 'freshwater' | 'marine' } = {}): Sim {
  const tank = newTank({ size: opts.size ?? { widthCm: 90, heightCm: 45, depthCm: 45 }, water: opts.water ?? 'freshwater', substrate: 'river-sand', seed: opts.seed ?? 7, now: NOW });
  const species = new SpeciesIndex(reference as unknown as Species[]);
  const world = createWorld({ tank, species, plants: new PlantIndex([]), settings: { ...DEFAULT_SETTINGS } });
  world.env.daylight = opts.daylight ?? 1;
  world.env.isNight = (opts.daylight ?? 1) < 0.05;
  const b = tankBounds(tank);
  world.env.surfaceY = b.surfaceY;
  world.env.current = { dir: [1, 0, 0], speed: 0.05, origin: [-b.halfW + 0.05, b.surfaceY - 0.05, -b.halfD + 0.05] };
  if (opts.decor) addRandomDecor(world, opts.decor, opts.seed ?? 7);
  const behavior = new BehaviorSystem(world);
  const food = new FoodSystem();
  const sim: Sim = {
    world,
    behavior,
    food,
    eaten: 0,
    bites: 0,
    step(dt: number) {
      const simDt = world.clock.tick(dt);
      food.update(world, dt, simDt);
      behavior.update(world, dt);
    },
    run(seconds: number, dt = 1 / 60, each?: () => void) {
      const n = Math.round(seconds / dt);
      for (let i = 0; i < n; i++) {
        sim.step(dt);
        each?.();
      }
    },
    add(speciesId: string, count: number, o = {}) {
      const out: FishEntity[] = [];
      const rng = new Rng(out.length + count * 31 + speciesId.length * 7 + world.fish.length * 13);
      for (let i = 0; i < count; i++) {
        const sp = species.get(speciesId)!;
        const e = makeFishEntity(world, {
          id: `${speciesId}-${world.fish.length}`,
          speciesId,
          sex: i % 2 ? 'male' : 'female',
          bornAt: world.clock.simTime - 200 * 86400000,
          addedAt: o.resident === false ? world.clock.simTime + 3600_000 : world.clock.simTime,
          lengthCm: sp.adultLengthCm * 0.9,
          sizeFactor: 1,
          colorSeed: Math.floor(rng.next() * 2 ** 31),
          hunger: o.hunger ?? 0.3,
          health: 1,
          stress: 0,
          stomach: 0.3,
          generation: 0,
        })!;
        attachFish(world, e);
        behavior.placeNewFish(world, e);
        out.push(e);
      }
      return out;
    },
  };
  behavior.onEat = (fish, f, amount) => {
    const taken = food.consume(world, f, amount);
    if (taken > 0) {
      sim.bites++;
      sim.eaten += taken;
      fish.state.hunger = Math.max(0, fish.state.hunger - taken);
      fish.state.stomach = Math.min(1, fish.state.stomach + taken);
    }
  };
  return sim;
}

/** Scatter rocks (spheres), wood (capsules) and slabs (rotated boxes) plus a few cover points. */
export function addRandomDecor(world: World, n: number, seed: number): void {
  const rng = new Rng(seed * 977 + 13);
  const t = world.tank;
  const b = tankBounds(t);
  const colliders: Collider[] = [];
  const cover: CoverPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = rng.range(-b.halfW * 0.8, b.halfW * 0.8);
    const z = rng.range(-b.halfD * 0.8, b.halfD * 0.5);
    const y = substrateHeight(t, x, z);
    const id = `d${i}`;
    t.decor.push({ id, kind: i % 3 === 1 ? 'driftwood' : 'rock', variant: 'test', seed: i, position: [x, y, z], rotation: [0, 0, 0], scale: 1 });
    if (i % 3 === 0) {
      const r = rng.range(0.03, 0.08);
      colliders.push({ type: 'sphere', center: [x, y + r * 0.6, z], radius: r, ownerId: id });
    } else if (i % 3 === 1) {
      const len = rng.range(0.1, 0.25);
      const a = rng.next() * Math.PI;
      colliders.push({ type: 'capsule', a: [x - Math.cos(a) * len, y + 0.02, z - Math.sin(a) * len * 0.5], b: [x + Math.cos(a) * len, y + rng.range(0.05, 0.18), z + Math.sin(a) * len * 0.5], radius: rng.range(0.012, 0.025), ownerId: id });
    } else {
      colliders.push({ type: 'box', center: [x, y + 0.03, z], halfExtents: [rng.range(0.03, 0.07), 0.03, rng.range(0.02, 0.05)], rotationY: rng.next() * Math.PI, ownerId: id });
      cover.push({ position: [x, y + 0.01, z + 0.06], radius: 0.05, ownerId: id, kind: 'overhang' });
    }
  }
  cover.push({ position: [b.halfW * 0.5, substrateHeight(t, b.halfW * 0.5, -b.halfD * 0.5) + 0.06, -b.halfD * 0.5], radius: 0.08, ownerId: 'plants-1', kind: 'plants' });
  world.colliders = colliders;
  world.cover = cover;
}

export function meanNearestNeighbor(fish: FishEntity[]): number {
  let sum = 0;
  for (const a of fish) {
    let best = Infinity;
    for (const b of fish) {
      if (a === b) continue;
      const d = Math.hypot(a.kin.pos[0] - b.kin.pos[0], a.kin.pos[1] - b.kin.pos[1], a.kin.pos[2] - b.kin.pos[2]);
      best = Math.min(best, d);
    }
    sum += best;
  }
  return sum / fish.length;
}

export function polarization(fish: FishEntity[]): number {
  let x = 0, y = 0, z = 0;
  for (const f of fish) {
    x += f.kin.forward[0];
    y += f.kin.forward[1];
    z += f.kin.forward[2];
  }
  return Math.hypot(x, y, z) / fish.length;
}
