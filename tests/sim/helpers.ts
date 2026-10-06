import type { CareMode, FishEntity, PlantInstance, PlantSpecies, Species, TankSize, WaterType } from '../../src/core/types';
import { DEFAULT_SETTINGS, attachFish, createWorld, type World } from '../../src/core/world';
import { SpeciesIndex } from '../../src/data/speciesIndex';
import { PlantIndex } from '../../src/data/plantIndex';
import { newTank } from '../../src/sim/tankFactory';
import { LifeSim } from '../../src/sim/LifeSim';
import reference from '../../src/data/species/reference.json';

/** Shared fixtures for the life-sim tests: the reference species and a few real plants. */
export const SPECIES = new SpeciesIndex(reference as unknown as Species[]);

export const TEST_PLANTS: PlantSpecies[] = [
  {
    id: 'taxiphyllum-barbieri', commonName: 'Java moss', scientificName: 'Taxiphyllum barbieri', water: 'freshwater',
    form: 'moss', placement: 'epiphyte', color: '#3f6b2a', maxHeightCm: 8, spreadCm: 15, growthCmPerWeek: 0.5,
    light: 'low', palatable: true, description: 'Dense moss that shrimp graze and fry hide in.',
  },
  {
    id: 'rotala-rotundifolia', commonName: 'Rotala', scientificName: 'Rotala rotundifolia', water: 'freshwater',
    form: 'stem', placement: 'background', color: '#7aa04a', maxHeightCm: 40, spreadCm: 8, growthCmPerWeek: 5,
    light: 'medium', palatable: true, description: 'Fast-growing stem plant that turns pink under strong light.',
  },
  {
    id: 'anubias-barteri', commonName: 'Anubias', scientificName: 'Anubias barteri', water: 'freshwater',
    form: 'epiphyte-broadleaf', placement: 'epiphyte', color: '#2f5a2a', maxHeightCm: 25, spreadCm: 25, growthCmPerWeek: 0.3,
    light: 'low', palatable: false, description: 'Tough, slow-growing broadleaf epiphyte that nothing eats.',
  },
  {
    id: 'limnobium-laevigatum', commonName: 'Amazon frogbit', scientificName: 'Limnobium laevigatum', water: 'freshwater',
    form: 'floating', placement: 'floating', color: '#5d8c3a', maxHeightCm: 5, spreadCm: 20, growthCmPerWeek: 2,
    light: 'low', palatable: true, description: 'Floating rosettes with long roots that fry hide among.',
  },
];
export const PLANTS = new PlantIndex(TEST_PLANTS);

export const SIZE_60P: TankSize = { widthCm: 60, heightCm: 36, depthCm: 30 };
export const SIZE_120: TankSize = { widthCm: 120, heightCm: 50, depthCm: 50 };

export interface TestTank {
  world: World;
  sim: LifeSim;
}

/** A fresh world + LifeSim. Deterministic for a given seed. */
export function makeTank(
  opts: { size?: TankSize; water?: WaterType; seed?: number; careMode?: CareMode; cycled?: boolean; now?: number } = {},
): TestTank {
  const now = opts.now ?? Date.UTC(2026, 0, 5, 12, 0, 0);
  const tank = newTank({
    size: opts.size ?? SIZE_60P,
    water: opts.water ?? 'freshwater',
    seed: opts.seed ?? 1234,
    now,
    cycled: opts.cycled,
  });
  // A tank that has been running a couple of months (mature biofilm).
  tank.createdAt = now - 60 * 86_400_000;
  const world = createWorld({ tank, species: SPECIES, plants: PLANTS, settings: { ...DEFAULT_SETTINGS, careMode: opts.careMode ?? 'realistic' } });
  const sim = new LifeSim(world);
  return { world, sim };
}

/** Add `count` store-bought animals (optionally of a given sex / age). */
export function stock(t: TestTank, speciesId: string, count: number, o: { sex?: 'male' | 'female'; ageMonths?: number } = {}): FishEntity[] {
  const out: FishEntity[] = [];
  for (let i = 0; i < count; i++) {
    const e = t.sim.createFish(t.world, speciesId, { sex: o.sex, ageMonths: o.ageMonths });
    if (!e) throw new Error(`unknown species ${speciesId}`);
    attachFish(t.world, e);
    out.push(e);
  }
  return out;
}

/** Plant `n` instances of a test plant at full health. */
export function plant(t: TestTank, speciesId: string, n: number, growth = 0.6): void {
  for (let i = 0; i < n; i++) {
    const p: PlantInstance = {
      id: `plant_${speciesId}_${i}`,
      speciesId,
      seed: 1000 + i,
      position: [-0.2 + (0.4 * i) / Math.max(1, n), 0.03, -0.05],
      rotationY: 0,
      growth,
      plantedAt: t.world.clock.simTime,
      health: 1,
    };
    t.world.tank.plants.push(p);
  }
}

export function feeder(t: TestTank, pinches: number, hours = [8, 13, 19], food: 'flakes' | 'mysis' = 'flakes'): void {
  t.world.tank.equipment.autoFeeder = { enabled: true, food, hours, pinches };
}

export const DAY = 86_400;

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
