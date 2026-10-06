import { describe, expect, it } from 'vitest';
import { tankBounds } from '../../src/core/tankGeometry';
import { Habitat } from '../../src/behavior/habitat';
import type { Brain } from '../../src/behavior/brain';
import { makeSim, meanNearestNeighbor, polarization } from './harness';

const ALL_REFERENCE = [
  ['paracheirodon-innesi', 12],
  ['trigonostigma-heteromorpha', 10],
  ['danio-rerio', 6],
  ['corydoras-panda', 6],
  ['ancistrus-cirrhosus', 1],
  ['otocinclus-vittatus', 4],
  ['pterophyllum-scalare', 2],
  ['betta-splendens-halfmoon-red', 1],
  ['poecilia-reticulata', 4],
  ['mikrogeophagus-ramirezi', 2],
  ['trichopodus-leerii', 2],
  ['pangio-kuhlii', 4],
  ['caridina-multidentata', 5],
  ['neocaridina-davidi-red-cherry', 6],
  ['neritina-natalensis', 4],
] as const;

describe('behavior: containment', () => {
  it('no animal leaves the water volume or sinks into decor over 60 s (random decor)', () => {
    for (const seed of [3, 11]) {
      const sim = makeSim({ seed, decor: 9 });
      for (const [id, n] of ALL_REFERENCE) sim.add(id, n);
      const b = tankBounds(sim.world.tank);
      const h = new Habitat();
      h.rebuild(sim.world);
      let worstOut = 0;
      let worstDecor = 0;
      let nan = 0;
      sim.run(60, 1 / 60, () => {
        for (const f of sim.world.fish) {
          const [x, y, z] = f.kin.pos;
          if (!Number.isFinite(x + y + z)) nan++;
          const brain = f.brain.behavior as Brain;
          const floor = h.floor(x, z);
          const buriedAllowance = brain.buried * f.state.lengthCm / 100;
          worstOut = Math.max(worstOut, Math.abs(x) - b.halfW, Math.abs(z) - b.halfD, y - b.surfaceY, floor - buriedAllowance - y);
          if (!brain.shelterOwner) worstDecor = Math.max(worstDecor, -h.nearestDecor(x, y, z));
        }
      });
      expect(nan).toBe(0);
      expect(worstOut).toBeLessThanOrEqual(1e-6);
      // Body centres never end up inside rock or wood (a few mm of numerical slack).
      expect(worstDecor).toBeLessThan(0.004);
    }
  });

  it('stays bounded and finite with large dt steps (low frame rate)', () => {
    const sim = makeSim({ seed: 5, decor: 6 });
    sim.add('danio-rerio', 8);
    sim.add('paracheirodon-innesi', 10);
    const b = tankBounds(sim.world.tank);
    sim.run(20, 0.1);
    for (const f of sim.world.fish) {
      const [x, y, z] = f.kin.pos;
      expect(Number.isFinite(x + y + z)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(b.halfW);
      expect(Math.abs(z)).toBeLessThanOrEqual(b.halfD);
      expect(y).toBeLessThanOrEqual(b.surfaceY);
    }
  });
});

describe('behavior: social', () => {
  it('schooling fish converge into a polarized group', () => {
    const sim = makeSim({ seed: 21 });
    const school = sim.add('trigonostigma-heteromorpha', 12);
    // Scatter them across the tank first.
    const b = tankBounds(sim.world.tank);
    school.forEach((f, i) => {
      f.kin.pos[0] = -b.halfW * 0.8 + (i / 11) * b.halfW * 1.6;
      f.kin.pos[2] = (i % 3 - 1) * b.halfD * 0.5;
      f.kin.pos[1] = b.surfaceY * (0.3 + 0.4 * ((i * 7) % 5) / 5);
    });
    const before = meanNearestNeighbor(school);
    sim.run(40);
    const after = meanNearestNeighbor(school);
    let pol = 0;
    sim.run(10, 1 / 60, () => (pol += polarization(school) / 600));
    expect(after).toBeLessThan(before * 0.6);
    // Nearest neighbours within a few body lengths (4.5 cm fish).
    expect(after).toBeLessThan(0.12);
    expect(pol).toBeGreaterThan(0.55);
  });

  it('different species do not school together', () => {
    const sim = makeSim({ seed: 9 });
    const a = sim.add('trigonostigma-heteromorpha', 10);
    const c = sim.add('paracheirodon-innesi', 10);
    sim.run(40);
    const ca = centroid(a), cc = centroid(c);
    const spreadA = meanNearestNeighbor(a);
    // The two groups keep their own identity: centroids not on top of each other relative to spacing.
    expect(Math.hypot(ca[0] - cc[0], ca[1] - cc[1], ca[2] - cc[2])).toBeGreaterThan(spreadA * 0.5);
  });
});

describe('behavior: feeding', () => {
  it('hungry fish find and eat flakes; food decreases', () => {
    const sim = makeSim({ seed: 4 });
    sim.add('paracheirodon-innesi', 10, { hunger: 0.9 });
    sim.add('danio-rerio', 6, { hunger: 0.9 });
    sim.run(5);
    sim.food.drop(sim.world, 'flakes', [0, 0, 0], 1);
    sim.world.events.emit('food-dropped', { kind: 'flakes', at: [0, sim.world.env.surfaceY, 0], count: 1 });
    const start = sim.world.food.length;
    sim.run(60);
    expect(sim.bites).toBeGreaterThan(5);
    expect(sim.world.food.length).toBeLessThan(start * 0.6);
  });

  it('bottom feeders take settled pellets; satiated fish ignore food', () => {
    const sim = makeSim({ seed: 8 });
    const cories = sim.add('corydoras-panda', 6, { hunger: 0.9 });
    const full = sim.add('paracheirodon-innesi', 6, { hunger: 0 });
    for (const f of full) f.state.stomach = 1;
    sim.run(3);
    sim.food.drop(sim.world, 'sinking-pellets', [0, 0, 0], 1);
    sim.run(90);
    const coryFed = cories.filter((f) => f.state.hunger < 0.85).length;
    expect(coryFed).toBeGreaterThan(2);
    for (const f of full) expect(f.state.hunger).toBe(0);
  });

  it('snails and plecos converge slowly on a wafer', () => {
    const sim = makeSim({ seed: 2 });
    const snails = sim.add('neritina-natalensis', 3, { hunger: 0.9 });
    sim.food.drop(sim.world, 'algae-wafers', [0, 0, 0.05], 1);
    sim.run(20);
    const wafer = sim.world.food[0];
    expect(wafer.state).toBe('settled');
    const d0 = snails.map((s) => Math.hypot(s.kin.pos[0] - wafer.pos[0], s.kin.pos[2] - wafer.pos[2]));
    sim.run(120);
    const d1 = snails.map((s) => Math.hypot(s.kin.pos[0] - wafer.pos[0], s.kin.pos[2] - wafer.pos[2]));
    // At least one snail made progress toward the wafer (they are slow: ~1 mm/s).
    expect(Math.min(...d1.map((d, i) => d - d0[i]))).toBeLessThan(-0.02);
  });
});

describe('behavior: startle', () => {
  it('a glass tap triggers fast escapes, then calm returns', () => {
    const sim = makeSim({ seed: 12 });
    const fish = sim.add('paracheirodon-innesi', 10);
    sim.add('danio-rerio', 6);
    sim.run(10);
    const speed = () => sim.world.fish.filter((f) => f.species.group === 'fish').reduce((s, f) => s + f.kin.speed, 0) / sim.world.fish.length;
    let calm = 0;
    sim.run(1, 1 / 60, () => (calm += speed() / 60));
    const b = tankBounds(sim.world.tank);
    sim.behavior.startle(sim.world, [0, b.surfaceY * 0.5, b.halfD], 1);
    let peak = 0;
    sim.run(0.6, 1 / 60, () => (peak = Math.max(peak, speed())));
    expect(peak).toBeGreaterThan(calm * 2.5);
    const fear = () => fish.reduce((s, f) => s + (f.brain.behavior as Brain).fear, 0) / fish.length;
    expect(fear()).toBeGreaterThan(0.3);
    sim.run(30);
    expect(fear()).toBeLessThan(0.05);
  });

  it('shrimp tail-flip and snails retract', () => {
    const sim = makeSim({ seed: 14 });
    const shrimp = sim.add('caridina-multidentata', 4);
    const snails = sim.add('neritina-natalensis', 3);
    sim.run(3);
    for (const s of [...shrimp, ...snails]) sim.behavior.startle(sim.world, [s.kin.pos[0], s.kin.pos[1], s.kin.pos[2] + 0.03], 1);
    sim.step(1 / 60);
    expect(shrimp.some((s) => (s.brain.behavior as Brain).mode === 'tailflip')).toBe(true);
    expect(snails.every((s) => (s.brain.behavior as Brain).mode === 'retract' || (s.brain.behavior as Brain).mode === 'fall')).toBe(true);
  });
});

describe('behavior: kinematics', () => {
  it('fish keep nearly level and tail-beat follows Bainbridge', () => {
    const sim = makeSim({ seed: 30 });
    sim.add('danio-rerio', 6);
    sim.add('paracheirodon-innesi', 8);
    let maxPitch = 0;
    sim.run(30, 1 / 60, () => {
      for (const f of sim.world.fish) {
        const b = f.brain.behavior as Brain;
        if (b.mode === 'gulp' || b.mode === 'flee' || b.mode === 'feed' || b.mode === 'forage') continue;
        maxPitch = Math.max(maxPitch, Math.abs(f.kin.pitch));
      }
    });
    expect(maxPitch).toBeLessThan((26 * Math.PI) / 180);
    // Tail phase rate for a fish at speed U: 2π(U/L + 1)/0.75.
    const f = sim.world.fish[0];
    const b = f.brain.behavior as Brain;
    const p0 = f.kin.tailPhase;
    sim.step(1 / 60);
    const rate = ((f.kin.tailPhase - p0 + Math.PI * 128) % (Math.PI * 128)) * 60;
    const expected = (2 * Math.PI * (Math.abs(b.speed) / b.L + 1)) / 0.75;
    expect(Math.abs(rate - Math.min(expected, 2 * Math.PI * b.tailHzMax)) / expected).toBeLessThan(0.25);
  });

  it('night: diurnal fish rest low and slow; colors fade via rest', () => {
    const sim = makeSim({ seed: 40, daylight: 0 });
    const fish = sim.add('paracheirodon-innesi', 10);
    sim.run(40);
    const meanRest = fish.reduce((s, f) => s + f.kin.rest, 0) / fish.length;
    const meanSpeed = fish.reduce((s, f) => s + f.kin.speed / (f.state.lengthCm / 100), 0) / fish.length;
    expect(meanRest).toBeGreaterThan(0.9);
    expect(meanSpeed).toBeLessThan(0.4); // body lengths per second
  });

  it('300 animals update within budget', () => {
    const sim = makeSim({ seed: 50, decor: 12, size: { widthCm: 180, heightCm: 60, depthCm: 60 } });
    while (sim.world.fish.length < 300) for (const [id, n] of ALL_REFERENCE) sim.add(id, n);
    sim.run(2);
    const t0 = performance.now();
    const frames = 120;
    sim.run(frames / 60);
    const ms = (performance.now() - t0) / frames;
    console.log(`behavior: ${sim.world.fish.length} animals, ${ms.toFixed(2)} ms/frame`);
    expect(sim.world.fish.length).toBeGreaterThanOrEqual(300);
    // Generous bound for CI machines; typically well under 2 ms.
    expect(ms).toBeLessThan(12);
  });
});

function centroid(fish: { kin: { pos: [number, number, number] } }[]): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (const f of fish) for (let i = 0; i < 3; i++) c[i] += f.kin.pos[i] / fish.length;
  return c;
}
