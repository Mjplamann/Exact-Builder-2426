import { describe, expect, it } from 'vitest';
import type { FoodParticle } from '../../src/core/types';
import { freeAmmoniaFraction, oxygenSaturation } from '../../src/sim/chemistry';
import { DAY, feeder, makeTank, plant, stock } from './helpers';

const NEON = 'paracheirodon-innesi';

function rot(t: ReturnType<typeof makeTank>, pinches: number) {
  // Uneaten flakes rotting on the bottom (as FoodSystem reports them).
  for (let i = 0; i < pinches * 26; i++) {
    const f: FoodParticle = { id: i, kind: 'flakes', pos: [0, 0, 0], vel: [0, 0, 0], rot: [0, 0, 0], sizeM: 0.004, nutrition: 0.05, state: 'settled', age: 0, seed: i };
    t.sim.onFoodDecay(t.world, f);
  }
}

describe('nitrogen cycle & water chemistry', () => {
  it('overfeeding raises ammonia, then nitrate; a water change dilutes it', () => {
    const t = makeTank({});
    feeder(t, 1, [9]);
    stock(t, NEON, 12, { ageMonths: 8 });
    t.sim.catchUp(t.world, 10 * DAY);
    const wp = t.world.tank.waterParams;
    const nh3Before = wp.ammonia;
    const no3Before = wp.nitrate;

    rot(t, 40); // a big overfeed: ~1.2 g of flakes rotting in ~50 L
    t.sim.catchUp(t.world, 0.5 * DAY);
    expect(wp.ammonia).toBeGreaterThan(nh3Before + 0.1);

    t.sim.catchUp(t.world, 7 * DAY);
    expect(wp.ammonia).toBeLessThan(0.1); // a cycled filter clears the spike within days
    expect(wp.nitrate).toBeGreaterThan(no3Before + 5);

    const before = wp.nitrate;
    t.sim.waterChange(t.world, 0.5);
    expect(wp.nitrate).toBeCloseTo(before * 0.5 + 5 * 0.5, 5);
    expect(wp.lastWaterChange).toBe(t.world.clock.simTime);
  });

  it('an uncycled tank goes through the classic ammonia → nitrite → nitrate cycle', { timeout: 30_000 }, () => {
    // A "fish-in" cycle: a new filter, a shoal of hardy danios fed twice a day.
    const t = makeTank({ cycled: false, careMode: 'gentle' });
    feeder(t, 2, [9, 18]);
    stock(t, 'danio-rerio', 12, { ageMonths: 6 });
    const wp = t.world.tank.waterParams;
    let peakNH3 = 0, peakNO2 = 0, dayNH3 = 0, dayNO2 = 0;
    for (let d = 1; d <= 60; d++) {
      t.sim.catchUp(t.world, DAY);
      if (wp.ammonia > peakNH3) (peakNH3 = wp.ammonia), (dayNH3 = d);
      if (wp.nitrite > peakNO2) (peakNO2 = wp.nitrite), (dayNO2 = d);
    }
    expect(peakNH3).toBeGreaterThan(0.5);
    expect(peakNO2).toBeGreaterThan(0.5);
    expect(dayNO2).toBeGreaterThan(dayNH3); // nitrite peaks after ammonia
    expect(wp.ammonia).toBeLessThan(0.1); // cycled within ~6 weeks
    expect(wp.nitrite).toBeLessThan(0.2);
    expect(wp.bacteria).toBeGreaterThan(0.7);
    expect(wp.nitrate).toBeGreaterThan(5);
  });

  it('pH slides as alkalinity is consumed and recovers with water changes', { timeout: 30_000 }, () => {
    const t = makeTank({});
    feeder(t, 2, [9, 18]);
    stock(t, NEON, 20, { ageMonths: 8 });
    const wp = t.world.tank.waterParams;
    t.sim.catchUp(t.world, 2 * DAY);
    const ph0 = wp.ph, kh0 = wp.kh;
    t.sim.catchUp(t.world, 60 * DAY);
    expect(wp.kh).toBeLessThan(kh0 - 0.5);
    expect(wp.ph).toBeLessThan(ph0 - 0.1);
    const phLow = wp.ph;
    for (let i = 0; i < 3; i++) t.sim.waterChange(t.world, 0.4);
    t.sim.catchUp(t.world, DAY);
    expect(wp.ph).toBeGreaterThan(phLow + 0.1);
  });

  it('limestone buffers pH upward', () => {
    const run = (rocks: number) => {
      const t = makeTank({});
      for (let i = 0; i < rocks; i++)
        t.world.tank.decor.push({ id: `r${i}`, kind: 'rock', variant: 'texas-holey', seed: i, position: [0, 0.05, 0], rotation: [0, 0, 0], scale: 1 });
      t.sim.catchUp(t.world, 30 * DAY);
      return t.world.tank.waterParams;
    };
    const plain = run(0);
    const holey = run(4);
    expect(holey.kh).toBeGreaterThan(plain.kh + 0.5);
    expect(holey.ph).toBeGreaterThan(plain.ph);
  });

  it('temperature follows the heater, or drifts to room temperature without one', () => {
    const t = makeTank({});
    const wp = t.world.tank.waterParams;
    t.world.tank.equipment.heater.targetC = 27;
    t.sim.catchUp(t.world, 2 * DAY);
    expect(wp.temperatureC).toBeGreaterThan(26.8);
    expect(wp.temperatureC).toBeLessThan(27.6);
    t.world.tank.equipment.heater.on = false;
    t.sim.catchUp(t.world, 3 * DAY);
    expect(wp.temperatureC).toBeGreaterThan(20);
    expect(wp.temperatureC).toBeLessThan(24);
  });

  it('driftwood stains the water with tannins; water changes clear them', () => {
    const t = makeTank({});
    t.world.tank.decor.push({ id: 'w', kind: 'driftwood', variant: 'malaysian', seed: 1, position: [0, 0.05, 0], rotation: [0, 0, 0], scale: 1 });
    t.sim.catchUp(t.world, 40 * DAY);
    const wp = t.world.tank.waterParams;
    expect(wp.tannins).toBeGreaterThan(0.15);
    const tan = wp.tannins;
    t.sim.waterChange(t.world, 0.5);
    expect(wp.tannins).toBeCloseTo(tan * 0.5, 5);
  });

  it('plants take up nitrogen; physical constants are right', { timeout: 30_000 }, () => {
    const bare = makeTank({});
    const planted = makeTank({});
    for (const t of [bare, planted]) {
      feeder(t, 1, [9]);
      stock(t, NEON, 12, { ageMonths: 8 });
    }
    plant(planted, 'limnobium-laevigatum', 12, 0.8);
    plant(planted, 'rotala-rotundifolia', 15, 0.8);
    bare.sim.catchUp(bare.world, 45 * DAY);
    planted.sim.catchUp(planted.world, 45 * DAY);
    expect(planted.world.tank.waterParams.nitrate).toBeLessThan(bare.world.tank.waterParams.nitrate);

    expect(oxygenSaturation(25, 'freshwater')).toBeCloseTo(8.26, 1);
    expect(oxygenSaturation(30, 'freshwater')).toBeLessThan(oxygenSaturation(20, 'freshwater'));
    expect(freeAmmoniaFraction(7, 25)).toBeGreaterThan(0.004);
    expect(freeAmmoniaFraction(7, 25)).toBeLessThan(0.007);
    expect(freeAmmoniaFraction(8.2, 25)).toBeGreaterThan(freeAmmoniaFraction(7, 25) * 10);
  });

  it('algae creeps over the glass in a bright tank, algae-eaters hold it back, scrubbing clears it', () => {
    const run = (grazers: boolean) => {
      const t = makeTank({});
      feeder(t, 1, [9]);
      stock(t, NEON, 10, { ageMonths: 8 });
      if (grazers) stock(t, 'otocinclus-vittatus', 5, { ageMonths: 10 });
      t.sim.catchUp(t.world, 21 * DAY);
      return t;
    };
    const plain = run(false);
    const crew = run(true);
    expect(plain.world.tank.waterParams.glassAlgae).toBeGreaterThan(0.1);
    expect(crew.world.tank.waterParams.glassAlgae).toBeLessThan(plain.world.tank.waterParams.glassAlgae * 0.6);
    plain.sim.cleanGlass(plain.world);
    expect(plain.world.tank.waterParams.glassAlgae).toBe(0);
  });
});
