import { describe, expect, it } from 'vitest';
import { DAY, feeder, makeTank, mean, stock } from './helpers';

const NEON = 'paracheirodon-innesi';

describe('hunger, health & death', () => {
  it('a week without food makes fish hungry and weaker, but they survive it', () => {
    const t = makeTank({ careMode: 'realistic' });
    const fish = stock(t, NEON, 12, { ageMonths: 8 });
    t.sim.catchUp(t.world, 7 * DAY);
    expect(t.world.fish.length).toBe(12);
    expect(mean(fish.map((f) => f.state.hunger))).toBeGreaterThan(0.85);
    expect(mean(fish.map((f) => f.state.health))).toBeLessThan(0.85);
  });

  it('realistic mode: weeks of starvation are fatal (small fish first)', { timeout: 30_000 }, () => {
    const t = makeTank({ careMode: 'realistic' });
    stock(t, NEON, 10, { ageMonths: 8 });
    t.sim.catchUp(t.world, 30 * DAY);
    expect(t.world.fish.length).toBe(0);
    expect(t.world.tank.stats.deaths).toBe(10);
    const died = t.world.tank.journal.filter((j) => j.kind === 'died');
    expect(died.length).toBe(10);
    expect(died[0].text).toMatch(/neon tetra passed away after going hungry/i);
  });

  it('gentle mode: neglect never kills — only hunger and stress', { timeout: 30_000 }, () => {
    const t = makeTank({ careMode: 'gentle' });
    const fish = stock(t, NEON, 10, { ageMonths: 8 });
    t.sim.catchUp(t.world, 60 * DAY);
    expect(t.world.fish.length).toBe(10);
    for (const f of fish) expect(f.state.health).toBeGreaterThan(0);
    expect(mean(fish.map((f) => f.state.hunger))).toBeGreaterThan(0.9);
  });

  it('a lone schooling fish is stressed; a proper shoal is calm', () => {
    const lone = makeTank({});
    feeder(lone, 1, [9]);
    const [one] = stock(lone, NEON, 1, { ageMonths: 8 });
    lone.sim.catchUp(lone.world, 5 * DAY);
    const shoal = makeTank({});
    feeder(shoal, 1, [9]);
    const many = stock(shoal, NEON, 12, { ageMonths: 8 });
    shoal.sim.catchUp(shoal.world, 5 * DAY);
    expect(one.state.stress).toBeGreaterThan(0.3);
    expect(mean(many.map((f) => f.state.stress))).toBeLessThan(0.15);
  });

  it('old age: fish die near their natural lifespan (not before) unless zen', { timeout: 30_000 }, () => {
    const guppy = 'poecilia-reticulata';
    const t = makeTank({ careMode: 'gentle' });
    feeder(t, 1, [9]);
    const sp = t.world.species.get(guppy)!;
    stock(t, guppy, 20, { sex: 'male', ageMonths: 2 });
    t.sim.catchUp(t.world, sp.lifespanYears * 0.6 * 365 * DAY);
    expect(t.world.fish.length).toBeGreaterThanOrEqual(18);
    t.sim.catchUp(t.world, sp.lifespanYears * 0.8 * 365 * DAY);
    expect(t.world.fish.length).toBeLessThan(5);
    expect(t.world.tank.journal.some((j) => /peacefully of old age/.test(j.text))).toBe(true);

    const z = makeTank({ careMode: 'zen' });
    stock(z, guppy, 10, { sex: 'male', ageMonths: 2 });
    z.sim.catchUp(z.world, sp.lifespanYears * 2 * 365 * DAY);
    expect(z.world.fish.length).toBe(10);
  });
});
