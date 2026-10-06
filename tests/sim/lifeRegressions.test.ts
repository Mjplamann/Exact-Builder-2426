import { describe, expect, it } from 'vitest';
import { attachFish } from '../../src/core/world';
import { DAY, feeder, makeTank, plant, stock } from './helpers';

const NEON = 'paracheirodon-innesi';

describe('life-sim regressions', () => {
  it('a mature filter keeps ammonia and nitrite below test-kit detection, even in soft acidic water', () => {
    for (const ph of [6.0, 7.0]) {
      const t = makeTank({});
      const wp = t.world.tank.waterParams;
      wp.ph = ph;
      wp.kh = ph < 6.5 ? 2 : 4;
      wp.tannins = ph < 6.5 ? 0.4 : 0;
      t.sim = new (t.sim.constructor as new (w: typeof t.world) => typeof t.sim)(t.world);
      feeder(t, 2, [9, 18]);
      stock(t, NEON, 20, { ageMonths: 8 });
      t.sim.catchUp(t.world, 14 * DAY);
      expect(wp.nitrite, `pH ${ph}`).toBeLessThan(0.05);
      expect(wp.ammonia, `pH ${ph}`).toBeLessThan(0.05);
      expect(wp.bacteria, `pH ${ph}`).toBeGreaterThan(1);
    }
  });

  it('plants give back alkalinity: a planted tank loses KH more slowly than a bare one', { timeout: 30_000 }, () => {
    const bare = makeTank({});
    const planted = makeTank({});
    for (const t of [bare, planted]) {
      feeder(t, 2, [9, 18]);
      stock(t, NEON, 20, { ageMonths: 8 });
    }
    plant(planted, 'rotala-rotundifolia', 20, 0.8);
    bare.sim.catchUp(bare.world, 40 * DAY);
    planted.sim.catchUp(planted.world, 40 * DAY);
    const kh0 = 4;
    const lostBare = kh0 - bare.world.tank.waterParams.kh;
    const lostPlanted = kh0 - planted.world.tank.waterParams.kh;
    expect(lostBare).toBeGreaterThan(0.5);
    expect(lostPlanted).toBeLessThan(lostBare * 0.9);
  });

  it('warns once when the KH is used up and the pH starts to slide', { timeout: 30_000 }, () => {
    const t = makeTank({});
    t.world.tank.waterParams.kh = 1.4;
    feeder(t, 4, [9, 18]);
    stock(t, NEON, 25, { ageMonths: 8 });
    t.sim.catchUp(t.world, 60 * DAY);
    const kh = t.world.tank.journal.filter((j) => /carbonate hardness/.test(j.text));
    expect(kh.length).toBe(1);
  });

  it('tank-born young that do not make it vanish quietly; grown fish are mourned', () => {
    const t = makeTank({ careMode: 'realistic' });
    const fry = t.sim.createFish(t.world, NEON, { newborn: true, generation: 1, parents: ['a'] })!;
    attachFish(t.world, fry);
    const [adult] = stock(t, NEON, 1, { ageMonths: 10 });
    for (const f of [fry, adult]) f.state.health = 0.05;
    const removed: string[] = [];
    const died: string[] = [];
    t.world.events.on('fish-removed', ({ fishId }) => removed.push(fishId));
    t.world.events.on('fish-died', ({ fish }) => died.push(fish.state.id));
    // A lethal ammonia spike (an overdose of rotting food in alkaline water).
    const wp = t.world.tank.waterParams;
    wp.ph = 8.2;
    wp.kh = 12;
    wp.ammonia = 12;
    for (let i = 0; i < 4 * 24 && t.world.fish.length; i++) {
      t.world.clock.simTime += 900_000;
      t.sim.update(t.world, 900);
    }
    expect(t.world.fish.length).toBe(0);
    expect(removed).toContain(fry.state.id);
    expect(died).toEqual([adult.state.id]);
    expect(t.world.tank.stats.deaths).toBe(1);
    expect(t.world.tank.journal.filter((j) => j.kind === 'died').length).toBe(1);
  });

  it('green spot algae still films the glass in a tank with otocinclus and a bristlenose', { timeout: 30_000 }, () => {
    const t = makeTank({});
    feeder(t, 2, [9, 18]);
    plant(t, 'rotala-rotundifolia', 15, 0.8);
    stock(t, NEON, 12, { ageMonths: 8 });
    stock(t, 'otocinclus-vittatus', 5, { ageMonths: 10 });
    stock(t, 'ancistrus-cirrhosus', 1, { ageMonths: 10 });
    t.sim.catchUp(t.world, 35 * DAY);
    const g = t.world.tank.waterParams.glassAlgae;
    expect(g).toBeGreaterThan(0.12); // a visible film to wipe now and then…
    expect(g).toBeLessThan(0.45); // …but never enough to nag about
  });
});

describe('life-sim regressions: setup & guards', () => {
  it('a new tank’s auto-feeder portion follows the stock until the keeper sets their own', () => {
    const t = makeTank({ size: { widthCm: 240, heightCm: 75, depthCm: 75 } });
    const af = t.world.tank.equipment.autoFeeder;
    af.enabled = true; // tanks ship with it on (the test helper turns it off)
    expect(af.pinches).toBe(1);
    t.sim.addFish(t.world, 'pterophyllum-scalare', 2);
    const forTwo = af.pinches;
    t.sim.addFish(t.world, 'pterophyllum-scalare', 6);
    expect(af.pinches).toBeGreaterThan(forTwo);
    af.pinches = 3; // the keeper's own setting is left alone
    t.sim.addFish(t.world, 'pterophyllum-scalare', 2);
    expect(af.pinches).toBe(3);
  });

  it('a heater warms the water about a degree an hour; an unheated tank drifts to the room over a day', () => {
    const t = makeTank({ size: { widthCm: 120, heightCm: 50, depthCm: 50 } });
    const wp = t.world.tank.waterParams;
    wp.temperatureC = 22;
    t.world.tank.equipment.heater.targetC = 27;
    t.sim.catchUp(t.world, 2 * 3600);
    expect(wp.temperatureC).toBeGreaterThan(23.3);
    expect(wp.temperatureC).toBeLessThan(24.2);
    t.sim.catchUp(t.world, 10 * 3600);
    expect(wp.temperatureC).toBeGreaterThan(26.5);
    t.world.tank.equipment.heater.on = false;
    t.sim.catchUp(t.world, 3 * 3600);
    expect(wp.temperatureC).toBeGreaterThan(25.5); // ~17 h time constant for 250 L
    t.sim.catchUp(t.world, 3 * 86400);
    expect(wp.temperatureC).toBeLessThan(24);
  });

  it('bad values never poison the water: NaN equipment, a 4 m tetra, a birth in the future', () => {
    const t = makeTank({});
    const [a, b] = stock(t, NEON, 6, { ageMonths: 8 });
    a.state.lengthCm = 400;
    b.state.bornAt = t.world.clock.simTime + 1e12;
    t.world.tank.equipment.heater.targetC = Number.NaN;
    t.world.tank.equipment.lights.onHour = Number.NaN;
    feeder(t, Number.NaN, [9]);
    // Re-attach as after loading a save.
    const sim = new (t.sim.constructor as new (w: typeof t.world) => typeof t.sim)(t.world);
    sim.catchUp(t.world, 3 * DAY);
    const wp = t.world.tank.waterParams;
    for (const [k, v] of Object.entries(wp)) expect(Number.isFinite(v), k).toBe(true);
    expect(a.state.lengthCm).toBeLessThan(5);
    expect(b.state.bornAt).toBeLessThanOrEqual(t.world.clock.simTime);
    expect(wp.ammonia).toBeLessThan(0.1);
    expect(t.world.fish.length).toBe(6);
  });
});
