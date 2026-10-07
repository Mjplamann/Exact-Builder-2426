import { describe, expect, it } from 'vitest';
import type { TankSize, WaterType } from '../../src/core/types';
import { DEFAULT_SETTINGS, createWorld, type World } from '../../src/core/world';
import { loadBundledSpecies } from '../../src/data/speciesIndex';
import { loadBundledPlants } from '../../src/data/plantIndex';
import { LifeSim } from '../../src/sim/LifeSim';
import { SHAPE_SIZES, aquascapesFor, tankFromSpec } from '../../src/app/biotopes';
import { suggestStock } from '../../src/app/stockAdvisor';
import { AQUASCAPES } from '../../src/decor/aquascapes';

/**
 * The pH a tank shows follows its CO₂ through the day. The dissolved CO₂ isn't saved, so every
 * time a tank is opened the chemistry has to find its place on that daily cycle again.
 */
const species = loadBundledSpecies();
const plants = loadBundledPlants();

/** A tank the guided builder would make in `aquascape`'s style, stocked with its first suggestion. */
function setUp(water: WaterType, aquascape: string, startHour: number, size: TankSize = SHAPE_SIZES.standard.size): { world: World; life: LifeSim } {
  const d = aquascapesFor(water, size).find((a) => a.id === aquascape)!.defaults!;
  const spec = {
    name: 'Test tank', water, shape: 'custom' as const, size, aquascape, cycled: true, stock: [],
    substrate: d.substrate!, background: d.background!, substrateDepthFrontCm: d.substrateDepthFrontCm, substrateDepthBackCm: d.substrateDepthBackCm,
    waterParams: d.waterParams, equipment: d.equipment,
  };
  const tank = tankFromSpec(spec, { now: Date.UTC(2026, 5, 1, startHour), seed: 21 });
  const built = AQUASCAPES.find((a) => a.id === aquascape)!.build(tank, plants, tank.seed);
  tank.decor = built.decor;
  tank.plants = built.plants;
  const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } });
  const life = new LifeSim(world);
  for (const q of suggestStock(spec, species, plants)[0]?.stock ?? []) life.addFish(world, q.speciesId, q.count);
  return { world, life };
}

/** The tank as saved and opened again (a page reload, or switching back to it from another tank). */
function reopen(t: { world: World; life: LifeSim }): void {
  const w = t.world;
  w.tank.simTime = w.clock.simTime; // what App.save stamps
  const tank = JSON.parse(JSON.stringify(w.tank));
  const fish = w.fish.slice();
  const world = createWorld({ tank, species, plants, settings: { ...DEFAULT_SETTINGS } });
  world.clock.simTime = w.clock.simTime;
  world.fish.length = 0;
  world.fish.push(...fish);
  t.world = world;
  t.life = new LifeSim(world);
}

/** pH at 09:00 (an injected tank's nightly high, just before the diffuser starts) and 16:00, day by day. */
function readings(t: { world: World; life: LifeSim }, days: number, reopenEverySteps = 0): { morning: number[]; afternoon: number[] } {
  const morning: number[] = [];
  const afternoon: number[] = [];
  for (let step = 1; step <= days * 96; step++) {
    // (From the second day: a brand-new tank's water first settles from its set-up values.)
    if (reopenEverySteps && step > 96 && step % reopenEverySteps === 0) reopen(t);
    t.world.clock.simTime += 900_000;
    t.life.update(t.world, 900);
    const d = new Date(t.world.clock.simTime);
    const hm = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (hm === 9 * 60) morning.push(t.world.tank.waterParams.ph);
    if (hm === 16 * 60) afternoon.push(t.world.tank.waterParams.ph);
  }
  return { morning, afternoon };
}

describe('the daily CO₂ cycle', () => {
  it('a new CO₂-injected tank set up in the evening spends its first night like every later one', () => {
    for (const style of ['dutch', 'iwagumi', 'nature']) {
      const { morning, afternoon } = readings(setUp('freshwater', style, 22), 4);
      // It used to start at the respiration equilibrium and degas below it overnight: the first
      // morning read ≈0.3 above the later ones (a night of "caution" for soft-water fish).
      expect(Math.abs(morning[0] - morning[2]), `${style} ${morning.map((p) => p.toFixed(2))}`).toBeLessThan(0.03);
      expect(Math.abs(afternoon[0] - afternoon[2]), style).toBeLessThan(0.03);
      // Injection still takes a little over a unit off by midday.
      expect(morning[2] - afternoon[2], style).toBeGreaterThan(0.9);
    }
  });

  it('injection swings the pH within what the stock advisor allows for (1.3 below to 0.1 above the starting pH)', { timeout: 60_000 }, () => {
    // Paired with `context()` in src/app/stockAdvisor.ts: it checks animals against
    // [pH − 1.3, pH + 0.1] for CO₂ tanks, with the sim's own 0.2 margin below and 0.15 + 0.05 slack above.
    const sizes: TankSize[] = [SHAPE_SIZES.nano.size, SHAPE_SIZES.cube.size, SHAPE_SIZES.standard.size, { widthCm: 90, heightCm: 75, depthCm: 50 }, { widthCm: 300, heightCm: 120, depthCm: 120 }];
    let lowest = Infinity;
    let highest = -Infinity;
    for (const style of ['dutch', 'iwagumi', 'nature']) {
      for (const size of sizes) {
        for (const hour of [6, 13, 22]) {
          const t = setUp('freshwater', style, hour, size);
          const ph0 = t.world.tank.waterParams.ph;
          for (let step = 0; step < 4 * 96; step++) {
            t.world.clock.simTime += 900_000;
            t.life.update(t.world, 900);
            lowest = Math.min(lowest, t.world.tank.waterParams.ph - ph0);
            highest = Math.max(highest, t.world.tank.waterParams.ph - ph0);
          }
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(-1.3);
    expect(lowest).toBeLessThan(-1.15); // and it does reach most of the way down
    expect(highest).toBeLessThanOrEqual(0.15);
  });

  it('opening a tank again carries on where it was — the pH neither jumps nor creeps with each reload', { timeout: 30_000 }, () => {
    for (const [water, style] of [['freshwater', 'dutch'], ['freshwater', 'amazon'], ['freshwater', 'malawi'], ['marine', 'reef']] as const) {
      const steady = readings(setUp(water, style, 13), 4);
      // Reopened every 5¼ hours, so it lands on every part of the day and night.
      const reopened = readings(setUp(water, style, 13), 4, 21);
      for (let d = 1; d < 4; d++) {
        // Each reload used to re-guess the CO₂ and shift the pH by 0.1–1.2: a few switches between
        // tanks pushed a planted tank to pH 9 or a CO₂ tank below pH 5.
        expect(Math.abs(reopened.morning[d] - steady.morning[d]), `${style} morning ${d}`).toBeLessThan(0.06);
        expect(Math.abs(reopened.afternoon[d] - steady.afternoon[d]), `${style} afternoon ${d}`).toBeLessThan(0.06);
      }
    }
  });
});
