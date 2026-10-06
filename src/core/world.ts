import { SimClock } from './clock';
import { EventBus } from './events';
import type {
  Collider,
  CoverPoint,
  EnvState,
  FishEntity,
  FishKinematics,
  FishState,
  FoodParticle,
  Settings,
  TankState,
} from './types';
import type { SpeciesIndex } from '../data/speciesIndex';
import type { PlantIndex } from '../data/plantIndex';
import { tankBounds } from './tankGeometry';

/**
 * The single mutable runtime world shared by every system. One instance per running tank.
 * Persisted data lives in `tank`; everything else is derived/transient.
 */
export interface World {
  tank: TankState;
  fish: FishEntity[];
  fishById: Map<string, FishEntity>;
  food: FoodParticle[];
  species: SpeciesIndex;
  plants: PlantIndex;
  clock: SimClock;
  events: EventBus;
  settings: Settings;
  /** Recomputed every frame by sim/environment.ts. */
  env: EnvState;
  /** Built from decor by the decor module (colliders.ts) whenever decor changes. */
  colliders: Collider[];
  cover: CoverPoint[];
  selection: { fishId?: string; decorId?: string; plantId?: string };
  /** Camera-follow target (fish id) or null. */
  follow: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  sound: false,
  volume: 0.5,
  uiAutoHide: true,
  showStats: false,
  cameraDrift: true,
  careMode: 'realistic',
  units: 'metric',
  dayNight: true,
};

export function emptyKinematics(pos: [number, number, number] = [0, 0.2, 0], heading = 0): FishKinematics {
  return {
    pos: [...pos],
    vel: [0, 0, 0],
    forward: [Math.cos(heading), 0, Math.sin(heading)],
    pitch: 0,
    roll: 0,
    speed: 0,
    tailPhase: 0,
    tailAmp: 0,
    bend: 0,
    finPhase: 0,
    finAmp: 0,
    mouth: 0,
    gillPhase: 0,
    rest: 0,
    activity: 'idle',
  };
}

/** Wrap a persisted FishState into a runtime entity. Returns null if the species is unknown. */
export function makeFishEntity(world: Pick<World, 'species' | 'tank'>, state: FishState): FishEntity | null {
  const species = world.species.get(state.speciesId);
  if (!species) return null;
  const b = tankBounds(world.tank);
  const pos = state.pos ?? [0, b.surfaceY * 0.5, 0];
  return { state, species, kin: emptyKinematics(pos, state.heading ?? 0), brain: {} };
}

export function createWorld(opts: {
  tank: TankState;
  species: SpeciesIndex;
  plants: PlantIndex;
  settings: Settings;
}): World {
  const world: World = {
    tank: opts.tank,
    fish: [],
    fishById: new Map(),
    food: [],
    species: opts.species,
    plants: opts.plants,
    clock: new SimClock(opts.tank.simTime, opts.tank.timeScale),
    events: new EventBus(),
    settings: opts.settings,
    env: {
      hour: 12,
      daylight: 1,
      moonlight: 0,
      roomLight: 0.3,
      isNight: false,
      lightColor: [1, 1, 1],
      surfaceY: tankBounds(opts.tank).surfaceY,
      current: { dir: [1, 0, 0], speed: 0.05, origin: [0, 0, 0] },
      waterTint: [0.85, 0.95, 0.95],
      turbidity: 0.15,
    },
    colliders: [],
    cover: [],
    selection: {},
    follow: null,
  };
  rebuildFishEntities(world);
  return world;
}

/** (Re)create runtime entities from `world.tank.fish`. Unknown species are dropped with a warning. */
export function rebuildFishEntities(world: World): void {
  world.fish = [];
  world.fishById.clear();
  for (const s of world.tank.fish) {
    const e = makeFishEntity(world, s);
    if (!e) {
      console.warn(`[world] unknown species "${s.speciesId}" — skipping fish ${s.id}`);
      continue;
    }
    world.fish.push(e);
    world.fishById.set(s.id, e);
  }
}

/** Add an entity to both the persisted list and the runtime list. */
export function attachFish(world: World, e: FishEntity): void {
  world.tank.fish.push(e.state);
  world.fish.push(e);
  world.fishById.set(e.state.id, e);
}

/** Remove from both lists. */
export function detachFish(world: World, fishId: string): FishEntity | undefined {
  const e = world.fishById.get(fishId);
  if (!e) return undefined;
  world.fishById.delete(fishId);
  world.fish.splice(world.fish.indexOf(e), 1);
  const i = world.tank.fish.indexOf(e.state);
  if (i >= 0) world.tank.fish.splice(i, 1);
  return e;
}
