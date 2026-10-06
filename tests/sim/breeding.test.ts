import { describe, expect, it } from 'vitest';
import { gestationDays } from '../../src/sim/breeding';
import { DAY, feeder, makeTank, plant, stock } from './helpers';

const GUPPY = 'poecilia-reticulata';
const CHERRY = 'neocaridina-davidi-red-cherry';

describe('breeding', () => {
  it('a guppy pair produces fry within about two months', () => {
    const t = makeTank({});
    feeder(t, 1, [9, 18]);
    plant(t, 'taxiphyllum-barbieri', 6);
    stock(t, GUPPY, 1, { sex: 'male', ageMonths: 4 });
    const [mom] = stock(t, GUPPY, 1, { sex: 'female', ageMonths: 4 });
    mom.state.gravidSince = undefined; // not already pregnant from the shop
    const born: number[] = [];
    t.world.events.on('journal', ({ entry }) => {
      if (entry.kind === 'born') born.push(entry.at);
    });
    t.sim.catchUp(t.world, 60 * DAY);
    expect(t.world.tank.stats.births).toBeGreaterThan(0);
    expect(born.length).toBeGreaterThan(0);
    const fry = t.world.tank.fish.filter((f) => f.generation === 1);
    for (const f of fry) {
      expect(f.parents?.[0]).toBe(mom.state.id);
      expect(f.speciesId).toBe(GUPPY);
    }
  });

  it('gestation follows temperature (Q10 ≈ 2)', () => {
    expect(gestationDays('livebearer', 25)).toBeCloseTo(26, 0);
    expect(gestationDays('livebearer', 28)).toBeLessThan(gestationDays('livebearer', 23));
    expect(gestationDays('egg-carrier', 24)).toBeGreaterThan(24);
  });

  it('a cherry shrimp colony grows in a shrimp-only tank', () => {
    const t = makeTank({});
    feeder(t, 1, [9]);
    plant(t, 'taxiphyllum-barbieri', 8);
    stock(t, CHERRY, 4, { sex: 'male', ageMonths: 5 });
    stock(t, CHERRY, 6, { sex: 'female', ageMonths: 5 });
    t.sim.catchUp(t.world, 120 * DAY);
    expect(t.world.fish.length).toBeGreaterThan(30);
    expect(t.world.tank.journal.some((j) => j.kind === 'born' && /cherry shrimp were born/.test(j.text))).toBe(true);
  });

  it('nerites and amanos never breed in a freshwater tank', () => {
    const t = makeTank({});
    feeder(t, 1, [9]);
    stock(t, 'neritina-natalensis', 4, { ageMonths: 12 });
    stock(t, 'caridina-multidentata', 3, { sex: 'male', ageMonths: 12 });
    stock(t, 'caridina-multidentata', 3, { sex: 'female', ageMonths: 12 });
    t.sim.catchUp(t.world, 180 * DAY);
    expect(t.world.tank.stats.births).toBe(0);
  });

  it('the population stays below the soft cap', () => {
    const t = makeTank({ careMode: 'zen', size: { widthCm: 120, heightCm: 50, depthCm: 50 } });
    feeder(t, 6, [9, 18]);
    plant(t, 'taxiphyllum-barbieri', 20);
    stock(t, GUPPY, 10, { sex: 'male', ageMonths: 4 });
    stock(t, GUPPY, 20, { sex: 'female', ageMonths: 4 });
    stock(t, CHERRY, 10, { sex: 'male', ageMonths: 5 });
    stock(t, CHERRY, 10, { sex: 'female', ageMonths: 5 });
    t.sim.catchUp(t.world, 365 * DAY);
    expect(t.world.fish.length).toBeGreaterThan(100);
    expect(t.world.fish.length).toBeLessThan(400);
  });
});
