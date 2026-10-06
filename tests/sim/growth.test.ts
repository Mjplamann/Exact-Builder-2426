import { describe, expect, it } from 'vitest';
import { attachFish } from '../../src/core/world';
import { MS_PER_YEAR } from '../../src/core/clock';
import {
  asymptoticLength,
  growthK,
  massG,
  optimalGrowthTemp,
  stomachCapacityMg,
  foodMgPerNutrition,
  vbLength,
} from '../../src/sim/biology';
import type { FoodParticle } from '../../src/core/types';
import { DAY, feeder, makeTank, mean, plant, stock } from './helpers';

const NEON = 'paracheirodon-innesi';

function newborns(t: ReturnType<typeof makeTank>, id: string, n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const e = t.sim.createFish(t.world, id, { newborn: true })!;
    attachFish(t.world, e);
    out.push(e);
  }
  return out;
}

describe('growth (von Bertalanffy on the sim clock)', () => {
  it('a well-kept shoal of neons follows the VB curve to maturity', { timeout: 30_000 }, () => {
    const t = makeTank({});
    const sp = t.world.species.get(NEON)!;
    // Ideal conditions: optimal temperature, a planted tank, small regular meals.
    const topt = optimalGrowthTemp(sp);
    t.world.tank.equipment.heater.targetC = topt;
    t.world.tank.waterParams.temperatureC = topt;
    plant(t, 'rotala-rotundifolia', 10);
    feeder(t, 1, [9]);
    const fish = newborns(t, NEON, 12);
    t.sim.catchUp(t.world, (sp.maturityMonths * 30.44) * DAY);

    expect(t.world.fish.length).toBeGreaterThanOrEqual(12);
    const k = growthK(sp);
    const expected = mean(
      fish.map((f) => vbLength(asymptoticLength(sp, f.state), sp.birthLengthCm, k, (t.world.clock.simTime - f.state.bornAt) / MS_PER_YEAR)),
    );
    const actual = mean(fish.map((f) => f.state.lengthCm));
    // The species' K is calibrated so ~75% of L∞ is reached at maturity.
    expect(actual / expected).toBeGreaterThan(0.95);
    expect(actual / expected).toBeLessThan(1.02);
    expect(actual).toBeGreaterThan(0.7 * sp.adultLengthCm);
    for (const f of fish) expect(f.state.lengthCm).toBeLessThanOrEqual(asymptoticLength(sp, f.state) + 1e-9);
  });

  it('hungry, cold or cramped fish grow more slowly', { timeout: 30_000 }, () => {
    // Juveniles past the fry stage (fry live on infusoria in a mature tank even if never fed).
    const grow = (setup: (t: ReturnType<typeof makeTank>) => void) => {
      const t = makeTank({ careMode: 'gentle' });
      setup(t);
      const fish = stock(t, NEON, 10, { ageMonths: 2 });
      const before = mean(fish.map((f) => f.state.lengthCm));
      t.sim.catchUp(t.world, 60 * DAY);
      return mean(fish.map((f) => f.state.lengthCm)) - before;
    };
    const fed = grow((t) => feeder(t, 1, [9]));
    const hungry = grow(() => {});
    const cold = grow((t) => {
      feeder(t, 1, [9]);
      t.world.tank.equipment.heater.on = false; // room temperature ≈ 22 °C, then the room cools at night
      t.world.tank.equipment.heater.targetC = 18;
    });
    expect(fed).toBeGreaterThan(0.3);
    expect(hungry).toBeLessThan(fed * 0.5);
    expect(cold).toBeLessThan(fed * 0.97);
  });

  it('a big fish in a small tank is stunted', { timeout: 30_000 }, () => {
    const angel = 'pterophyllum-scalare';
    const run = (size: { widthCm: number; heightCm: number; depthCm: number }) => {
      const t = makeTank({ size, careMode: 'gentle' });
      feeder(t, 4, [9, 18]);
      const [f] = stock(t, angel, 1, { ageMonths: 3 });
      t.sim.catchUp(t.world, 2 * 365 * DAY);
      return f.state.lengthCm;
    };
    const roomy = run({ widthCm: 120, heightCm: 60, depthCm: 50 });
    const cramped = run({ widthCm: 45, heightCm: 30, depthCm: 30 });
    expect(cramped).toBeLessThan(roomy * 0.92);
  });

  it('a few flakes fill a 3–4 cm fish; a big fish needs far more', () => {
    const t = makeTank({});
    const [neon] = stock(t, NEON, 1, { ageMonths: 8 });
    const [angel] = stock(t, 'pterophyllum-scalare', 1, { ageMonths: 14 });
    neon.state.stomach = 0;
    angel.state.stomach = 0;
    const flake: FoodParticle = { id: 1, kind: 'flakes', pos: [0, 0, 0], vel: [0, 0, 0], rot: [0, 0, 0], sizeM: 0.004, nutrition: 0.05, state: 'floating', age: 0, seed: 1 };
    const flakesToFill = (f: typeof neon) => stomachCapacityMg(massG(f.species, f.state.lengthCm)) / (0.05 * foodMgPerNutrition('flakes'));
    expect(flakesToFill(neon)).toBeGreaterThan(1.5);
    expect(flakesToFill(neon)).toBeLessThan(6);
    expect(flakesToFill(angel)).toBeGreaterThan(60);
    t.sim.onEat(t.world, neon, flake, 0.05);
    t.sim.onEat(t.world, angel, flake, 0.05);
    expect(neon.state.stomach).toBeGreaterThan(0.15);
    expect(angel.state.stomach).toBeLessThan(0.02);
    expect(neon.state.hunger).toBeLessThan(0.4);
  });
});
