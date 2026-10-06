import { describe, expect, it } from 'vitest';
import { DAY, SIZE_120, feeder, makeTank, mean, plant, stock } from './helpers';

/** A busy 300 L community of ~150 animals. */
function community(seed: number) {
  const t = makeTank({ size: SIZE_120, seed });
  plant(t, 'rotala-rotundifolia', 25);
  plant(t, 'taxiphyllum-barbieri', 8);
  plant(t, 'anubias-barteri', 6);
  t.world.tank.decor.push({ id: 'wood', kind: 'driftwood', variant: 'spiderwood', seed: 3, position: [0.1, 0.05, -0.1], rotation: [0, 0, 0], scale: 1 });
  stock(t, 'paracheirodon-axelrodi', 40);
  stock(t, 'paracheirodon-innesi', 30);
  stock(t, 'trigonostigma-heteromorpha', 20);
  stock(t, 'corydoras-panda', 12);
  stock(t, 'otocinclus-vittatus', 8);
  stock(t, 'neocaridina-davidi-red-cherry', 20);
  stock(t, 'poecilia-reticulata', 8);
  stock(t, 'mikrogeophagus-ramirezi', 2);
  stock(t, 'ancistrus-cirrhosus', 2);
  stock(t, 'danio-rerio', 8);
  feeder(t, 5, [9, 18]);
  return t;
}

function fingerprint(t: ReturnType<typeof community>) {
  const wp = t.world.tank.waterParams;
  return {
    simTime: t.world.clock.simTime,
    fish: t.world.fish.map((f) => `${f.state.speciesId}:${f.state.sex}:${f.state.lengthCm.toFixed(6)}:${f.state.health.toFixed(6)}`),
    water: [wp.ammonia, wp.nitrite, wp.nitrate, wp.ph, wp.kh, wp.glassAlgae, wp.oxygen].map((v) => v.toFixed(8)),
    stats: { ...t.world.tank.stats },
    plants: t.world.tank.plants.map((p) => p.growth.toFixed(6)),
  };
}

describe('catch-up', () => {
  it('fast-forwards a year with ~150 animals in well under a second, deterministically', () => {
    const a = community(42);
    const b = community(42);
    expect(a.world.fish.length).toBe(150);
    const t0 = performance.now();
    const sa = a.sim.catchUp(a.world, 365 * DAY);
    const ms = performance.now() - t0;
    const sb = b.sim.catchUp(b.world, 365 * DAY);
    expect(ms).toBeLessThan(1000);
    expect(sa.text).toBe(sb.text);
    expect(fingerprint(a)).toEqual(fingerprint(b));
    expect(sa.text).toMatch(/^While you were away, a year passed\./);
  });

  it('advances the sim clock by exactly the elapsed time', () => {
    const t = makeTank({});
    const start = t.world.clock.simTime;
    t.sim.catchUp(t.world, 3.5 * DAY);
    expect(t.world.clock.simTime).toBeCloseTo(start + 3.5 * DAY * 1000, 0);
    expect(t.world.tank.simTime).toBe(t.world.clock.simTime);
  });

  it('the auto-feeder keeps fish fed while you are away; without it they go hungry', () => {
    const fed = makeTank({ careMode: 'gentle' });
    feeder(fed, 1, [9, 18]);
    const a = stock(fed, 'paracheirodon-innesi', 12, { ageMonths: 8 });
    const unfed = makeTank({ careMode: 'gentle' });
    const b = stock(unfed, 'paracheirodon-innesi', 12, { ageMonths: 8 });
    const sa = fed.sim.catchUp(fed.world, 14 * DAY);
    const sb = unfed.sim.catchUp(unfed.world, 14 * DAY);
    expect(mean(a.map((f) => f.state.hunger))).toBeLessThan(0.5);
    expect(mean(a.map((f) => f.state.health))).toBeGreaterThan(0.9);
    expect(mean(b.map((f) => f.state.hunger))).toBeGreaterThan(0.85);
    expect(fed.world.tank.stats.feedings).toBe(28);
    expect(sa.text).not.toMatch(/hungry/);
    expect(sb.text).toMatch(/the fish are hungry/i);
  });

  it('writes a gentle summary', () => {
    const t = makeTank({});
    feeder(t, 1, [9]);
    plant(t, 'taxiphyllum-barbieri', 6);
    stock(t, 'neocaridina-davidi-red-cherry', 4, { sex: 'male', ageMonths: 5 });
    stock(t, 'neocaridina-davidi-red-cherry', 6, { sex: 'female', ageMonths: 5 });
    const s = t.sim.catchUp(t.world, 50 * DAY);
    expect(s.born).toBeGreaterThan(0);
    expect(s.text).toMatch(/While you were away, 7 weeks passed\./);
    expect(s.text).toMatch(/cherry shrimp were born/);
    expect(s.text).toMatch(/glass/);
    const quiet = makeTank({});
    expect(quiet.sim.catchUp(quiet.world, 2 * 3600).text).toBe('While you were away, 2 hours passed. All is calm in the tank.');
  });
});
