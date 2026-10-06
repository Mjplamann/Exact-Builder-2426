import type { FishEntity, FoodParticle, Sex, Species } from '../core/types';
import type { World } from '../core/world';
import { attachFish, detachFish, makeFishEntity } from '../core/world';
import { MS_PER_YEAR } from '../core/clock';
import { Rng, newId } from '../core/rng';

export interface CatchUpSummary {
  simSeconds: number;
  born: number;
  died: { name: string; cause: string }[];
  /** Short human-readable paragraph ("While you were away 3 days passed..."). */
  text: string;
}

export interface CompatibilityReport {
  level: 'good' | 'caution' | 'bad';
  issues: string[];
}

export interface StockingReport {
  /** Total adult bioload (cm of adult fish, weighted) vs. what the tank & filter can support. */
  bioload: number;
  capacity: number;
  /** 0..1+ */
  ratio: number;
}

/**
 * The biology of the tank, in sim time: von Bertalanffy growth, aging & natural lifespan,
 * hunger/stomach/metabolism scaled by size & temperature, health & stress, the nitrogen cycle,
 * oxygen, temperature drift, algae, tannins, plant growth, breeding (livebearer broods,
 * spawning pairs, shrimp colonies), deaths, the auto-feeder, and offline catch-up.
 *
 * OWNER: life-sim module. Placeholder: creates fish, no biology.
 */
export class LifeSim {
  private rng = new Rng(1);

  constructor(world: World) {
    this.rng = new Rng(world.tank.seed ^ 0x5bd1e995);
  }

  update(world: World, simDt: number): void {
    void world;
    void simDt;
  }

  catchUp(world: World, simSeconds: number): CatchUpSummary {
    void world;
    return { simSeconds, born: 0, died: [], text: '' };
  }

  /** A store-bought animal: juvenile-to-young-adult age as sold in the trade. Not yet attached to the world. */
  createFish(world: World, speciesId: string, opts: { sex?: Sex; ageMonths?: number; name?: string } = {}): FishEntity | null {
    const sp = world.species.get(speciesId);
    if (!sp) return null;
    const now = world.clock.simTime;
    const ageMonths = opts.ageMonths ?? Math.max(1, sp.maturityMonths * this.rng.range(0.5, 0.9));
    const sex: Sex = opts.sex ?? (sp.group === 'snail' ? 'unknown' : this.rng.chance(0.5) ? 'male' : 'female');
    const sizeFactor = Math.max(0.8, Math.min(1.2, this.rng.normal(1, 0.06)));
    const k = sp.growthK ?? 1;
    const ageY = (ageMonths * 30.44 * 86400000) / MS_PER_YEAR;
    const lengthCm = (sp.adultLengthCm * sizeFactor - (sp.adultLengthCm * sizeFactor - sp.birthLengthCm) * Math.exp(-k * ageY));
    return makeFishEntity(world, {
      id: newId('fish'),
      speciesId,
      name: opts.name,
      sex,
      bornAt: now - ageMonths * 30.44 * 86400000,
      addedAt: now,
      lengthCm,
      sizeFactor,
      colorSeed: Math.floor(this.rng.next() * 2 ** 31),
      hunger: 0.3,
      health: 1,
      stress: 0.4,
      stomach: 0.3,
      generation: 0,
    });
  }

  /** Create, attach and announce `count` animals of a species. */
  addFish(world: World, speciesId: string, count: number): FishEntity[] {
    const out: FishEntity[] = [];
    for (let i = 0; i < count; i++) {
      const e = this.createFish(world, speciesId);
      if (!e) break;
      attachFish(world, e);
      world.events.emit('fish-added', { fish: e });
      out.push(e);
    }
    return out;
  }

  removeFish(world: World, fishId: string): void {
    if (detachFish(world, fishId)) world.events.emit('fish-removed', { fishId });
  }

  onEat(world: World, fish: FishEntity, food: FoodParticle, nutrition: number): void {
    void world;
    fish.state.stomach = Math.min(1, fish.state.stomach + nutrition);
    fish.state.hunger = Math.max(0, fish.state.hunger - nutrition);
    void food;
  }

  onFoodDecay(world: World, food: FoodParticle): void {
    void world;
    void food;
  }

  waterChange(world: World, fraction: number): void {
    void world;
    void fraction;
  }

  cleanGlass(world: World): void {
    world.tank.waterParams.glassAlgae = 0;
  }

  trimPlants(world: World): void {
    void world;
  }

  compatibility(world: World, species: Species): CompatibilityReport {
    void world;
    void species;
    return { level: 'good', issues: [] };
  }

  stocking(world: World): StockingReport {
    void world;
    return { bioload: 0, capacity: 1, ratio: 0 };
  }
}
