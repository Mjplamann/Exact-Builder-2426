import { describe, expect, it } from 'vitest';
import { tankBounds, substrateHeight } from '../../src/core/tankGeometry';
import { MAX_FOOD, type FoodRT } from '../../src/behavior/FoodSystem';
import { FOODS } from '../../src/data/foods';
import { makeSim } from './harness';

describe('food physics', () => {
  it('flakes float on the film, soak, flutter down and settle on the substrate', () => {
    const sim = makeSim({ seed: 1 });
    const b = tankBounds(sim.world.tank);
    sim.food.drop(sim.world, 'flakes', [0, b.surfaceY, 0], 1);
    const n = sim.world.food.length;
    expect(n).toBe(FOODS.flakes.particlesPerPinch);
    // Pinch spread: within ~6 cm of the drop point.
    for (const f of sim.world.food) expect(Math.hypot(f.pos[0], f.pos[2])).toBeLessThan(0.08);
    sim.run(2);
    const floating = sim.world.food.filter((f) => f.state === 'floating').length;
    expect(floating).toBeGreaterThan(n * 0.75);
    for (const f of sim.world.food) if (f.state === 'floating') expect(b.surfaceY - f.pos[1]).toBeLessThan(0.003);
    // Flakes spread over the film and drift with the current.
    sim.run(10);
    const spread = Math.max(...sim.world.food.map((f) => Math.hypot(f.pos[0], f.pos[2])));
    expect(spread).toBeGreaterThan(0.03);
    // Fluttering descent at ~1–2 cm/s.
    sim.run(30);
    const sinking = sim.world.food.filter((f) => f.state === 'sinking');
    expect(sinking.length).toBeGreaterThan(0);
    for (const f of sinking) expect(Math.abs(f.vel[1])).toBeLessThan(0.03);
    sim.run(90);
    const settled = sim.world.food.filter((f) => f.state === 'settled');
    expect(settled.length).toBe(n);
    for (const f of settled) expect(f.pos[1] - substrateHeight(sim.world.tank, f.pos[0], f.pos[2])).toBeLessThan(0.004);
  });

  it('sinking pellets fall at terminal velocity and settle on decor tops', () => {
    const sim = makeSim({ seed: 2 });
    const t = sim.world.tank;
    const b = tankBounds(t);
    const floor = substrateHeight(t, 0, 0);
    sim.world.colliders = [{ type: 'sphere', center: [0, floor + 0.02, 0], radius: 0.06, ownerId: 'rock' }];
    sim.world.tank.decor.push({ id: 'rock', kind: 'rock', variant: 'test', seed: 1, position: [0, floor, 0], rotation: [0, 0, 0], scale: 1 });
    sim.food.drop(sim.world, 'sinking-pellets', [0, b.surfaceY, 0], 1);
    sim.run(1.5);
    const vs = sim.world.food.filter((f) => f.state === 'sinking').map((f) => -f.vel[1]);
    for (const v of vs) expect(Math.abs(v - FOODS['sinking-pellets'].sinkSpeed)).toBeLessThan(0.02);
    sim.run(15);
    const onRock = sim.world.food.filter((f) => f.state === 'settled' && (f as FoodRT).restOn === 0);
    expect(onRock.length).toBeGreaterThan(0);
    for (const f of onRock) expect(f.pos[1]).toBeGreaterThan(floor + 0.03);
  });

  it('uneaten food decays after its decay time (sim hours) and reports it', () => {
    const sim = makeSim({ seed: 3 });
    const b = tankBounds(sim.world.tank);
    let decayed = 0;
    sim.food.onDecay = () => decayed++;
    sim.food.drop(sim.world, 'sinking-pellets', [0, b.surfaceY, 0], 1);
    sim.run(20);
    const n = sim.world.food.length;
    expect(sim.world.food.every((f) => f.state === 'settled')).toBe(true);
    // 1 real second = 1 sim hour.
    sim.world.clock.timeScale = 3600;
    sim.run(FOODS['sinking-pellets'].decayHours - 2, 0.25);
    expect(decayed).toBe(0);
    sim.run(4, 0.25);
    expect(decayed).toBe(n);
    expect(sim.world.food.length).toBe(0);
  });

  it('keeps at most MAX_FOOD particles (oldest settled expire first)', () => {
    const sim = makeSim({ seed: 4 });
    const b = tankBounds(sim.world.tank);
    let decayed = 0;
    sim.food.onDecay = () => decayed++;
    for (let i = 0; i < 30; i++) sim.food.drop(sim.world, 'daphnia', [0, b.surfaceY, 0], 1);
    expect(sim.world.food.length).toBeLessThanOrEqual(MAX_FOOD);
    expect(decayed).toBeGreaterThan(0);
  });

  it('live brine shrimp swim in the water column, then die and sink in fresh water', () => {
    const sim = makeSim({ seed: 5 });
    const b = tankBounds(sim.world.tank);
    sim.food.drop(sim.world, 'brine-shrimp', [0, b.surfaceY, 0], 1);
    sim.run(20);
    const swimming = sim.world.food.filter((f) => f.state === 'swimming');
    expect(swimming.length).toBe(FOODS['brine-shrimp'].particlesPerPinch);
    const ys = swimming.map((f) => f.pos[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.01);
    // ~40 min in fresh water (sim): fast-forward.
    sim.world.clock.timeScale = 600;
    sim.run(10, 0.1);
    expect(sim.world.food.filter((f) => f.state === 'swimming').length).toBe(0);
  });

  it('nori is clipped to the side glass and stays put', () => {
    const sim = makeSim({ seed: 6 });
    const b = tankBounds(sim.world.tank);
    sim.food.drop(sim.world, 'nori', [0.2, b.surfaceY, 0], 1);
    const f = sim.world.food[0];
    const p0 = [...f.pos];
    expect(Math.abs(f.pos[0])).toBeGreaterThan(b.halfW - 0.02);
    sim.run(10);
    expect(f.state).toBe('settled');
    expect(f.pos).toEqual(p0);
  });
});
