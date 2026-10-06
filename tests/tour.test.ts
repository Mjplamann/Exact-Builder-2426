import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { emptyKinematics, type World } from '../src/core/world';
import type { Collider, CoverPoint, FishEntity, Species } from '../src/core/types';
import { Tour, colourfulness, occluded, scoreAnimal } from '../src/app/tour';

const DT = 0.1;

function species(id: string, over: Partial<Species> = {}): Species {
  return {
    id,
    commonName: id,
    activity: 'diurnal',
    group: 'fish',
    social: 'shoal',
    adultLengthCm: 4,
    look: { base: '#b0b0a8', fin: '#d0d0d0', finOpacity: 0.3 },
    ...over,
  } as Species;
}

const NEON = species('neon', {
  look: {
    base: '#b9b7a4',
    fin: '#e6e6e0',
    finOpacity: 0.18,
    iridescence: 1,
    patterns: [
      { type: 'region', color: '#d7232c', x0: 0.5, x1: 1, y0: -1, y1: 0.02 },
      { type: 'stripe', color: '#1f8cff', y: 0.16, width: 0.17 },
    ],
  },
});
const DULL = species('dull');
const NIGHT = species('night', { activity: 'nocturnal' });

let nextId = 0;
function fish(sp: Species, pos: [number, number, number], over: { speed?: number; activity?: string; rest?: number; lengthCm?: number } = {}): FishEntity {
  const kin = emptyKinematics(pos);
  kin.speed = over.speed ?? 0.05;
  kin.activity = over.activity ?? 'cruising';
  kin.rest = over.rest ?? 0;
  return { state: { id: `f${nextId++}`, speciesId: sp.id, lengthCm: over.lengthCm ?? 4 } as FishEntity['state'], species: sp, kin, brain: {} };
}

function world(animals: FishEntity[], opts: { night?: boolean; cover?: CoverPoint[]; colliders?: Collider[] } = {}): World {
  return {
    tank: { size: { widthCm: 60, heightCm: 36, depthCm: 30 } },
    fish: animals,
    fishById: new Map(animals.map((f) => [f.state.id, f])),
    cover: opts.cover ?? [],
    colliders: opts.colliders ?? [],
    env: { isNight: !!opts.night, daylight: opts.night ? 0 : 1 },
    follow: null,
  } as unknown as World;
}

/** A host that records every camera request, like the App's followAnimal. */
function host(w: World) {
  const calls: { t: number; id: string | null; fill?: number }[] = [];
  let t = 0;
  return {
    calls,
    tick: (dt: number) => (t += dt),
    host: {
      world: w,
      followAnimal(id: string | null, fill?: number) {
        w.follow = id && w.fishById.has(id) ? id : null;
        calls.push({ t, id: w.follow, fill });
      },
    },
  };
}

function run(tour: Tour, h: ReturnType<typeof host>, seconds: number, each?: () => void): void {
  for (let s = 0; s < seconds; s += DT) {
    h.tick(DT);
    each?.();
    tour.update(DT);
  }
}

const seeded = (seed: number) => {
  const r = new Rng(seed);
  return () => r.next();
};

describe('tour scoring', () => {
  it('rates colourful, active animals in plain view above hiding or dull ones', () => {
    const w = world([]);
    const feeding = fish(NEON, [0, 0.15, 0.1], { activity: 'feeding', speed: 0.08 });
    const hiding = fish(NEON, [0, 0.15, 0.1], { activity: 'hiding in a cave', speed: 0 });
    const dull = fish(DULL, [0, 0.15, 0.1], { speed: 0.02 });
    const back = fish(NEON, [0, 0.15, -0.14], { activity: 'feeding', speed: 0.08 });
    expect(colourfulness(NEON)).toBeGreaterThan(0.75);
    expect(colourfulness(DULL)).toBeLessThan(0.2);
    expect(scoreAnimal(w, feeding)).toBeGreaterThan(scoreAnimal(w, dull) * 2);
    expect(scoreAnimal(w, hiding)).toBeLessThan(scoreAnimal(w, dull) * 0.2);
    expect(scoreAnimal(w, back)).toBeLessThan(scoreAnimal(w, feeding) * 0.6);
  });

  it('prefers nocturnal animals at night and sees past nothing solid', () => {
    const asleep = fish(NEON, [0, 0.05, 0.1], { activity: 'resting', rest: 0.9, speed: 0 });
    const prowling = fish(NIGHT, [0, 0.05, 0.1], { activity: 'foraging', speed: 0.03 });
    const night = world([asleep, prowling], { night: true });
    expect(scoreAnimal(night, prowling)).toBeGreaterThan(scoreAnimal(night, asleep) * 5);

    const behindRock = fish(DULL, [0.1, 0.08, -0.05]);
    const inClear = fish(DULL, [-0.1, 0.08, -0.05]);
    const rock: Collider = { type: 'sphere', center: [0.1, 0.08, 0.05], radius: 0.05, ownerId: 'rock' };
    const box: Collider = { type: 'box', center: [-0.1, 0.08, -0.12], halfExtents: [0.05, 0.05, 0.02], rotationY: 0.4, ownerId: 'wood' };
    const w = world([behindRock, inClear], { colliders: [rock, box] });
    expect(occluded(w, behindRock)).toBe(true);
    expect(occluded(w, inClear)).toBe(false); // the box is behind it
    expect(scoreAnimal(w, behindRock)).toBeLessThan(scoreAnimal(w, inClear) * 0.5);
  });
});

describe('tour', () => {
  it('stays wide in an empty tank', () => {
    const w = world([]);
    const h = host(w);
    const tour = new Tour(h.host, { random: seeded(1) });
    tour.start();
    run(tour, h, 120);
    expect(h.calls.every((c) => c.id === null)).toBe(true);
    expect(tour.subjectId).toBeNull();
  });

  it('opens wide, then features the most interesting animal', () => {
    const star = fish(NEON, [0.05, 0.15, 0.1], { activity: 'feeding', speed: 0.08 });
    const others = [fish(DULL, [0, 0.1, -0.1], { activity: 'resting', speed: 0 }), fish(DULL, [0.1, 0.05, 0], { activity: 'hiding', speed: 0 })];
    const w = world([star, ...others]);
    const h = host(w);
    const tour = new Tour(h.host, { random: seeded(2) });
    tour.start();
    run(tour, h, 4);
    expect(h.calls.filter((c) => c.id)).toHaveLength(0);
    run(tour, h, 2);
    expect(tour.subjectId).toBe(star.state.id);
    expect(w.follow).toBe(star.state.id);
  });

  it('lingers 20–40 s (a little longer on spectacular animals), varies, and avoids repeats', () => {
    const animals = Array.from({ length: 6 }, (_, i) => fish(i % 2 ? NEON : DULL, [-0.2 + i * 0.08, 0.15, 0.05], { speed: 0.05 }));
    const w = world(animals);
    const h = host(w);
    const tour = new Tour(h.host, { random: seeded(3) });
    tour.start();
    run(tour, h, 600);
    const shots = h.calls;
    const subjects = shots.filter((c) => c.id);
    expect(subjects.length).toBeGreaterThan(10);
    for (let i = 1; i < subjects.length; i++) expect(subjects[i].id).not.toBe(subjects[i - 1].id);
    // Shot lengths: animal shots 20–50 s, whole-tank interludes 10–20 s.
    expect(shots[0].t).toBeCloseTo(5, 0); // after the whole-tank opening
    for (let i = 0; i + 1 < shots.length; i++) {
      const len = shots[i + 1].t - shots[i].t;
      if (shots[i].id) expect(len).toBeGreaterThanOrEqual(20 - DT), expect(len).toBeLessThanOrEqual(50 + DT);
      else expect(len).toBeGreaterThanOrEqual(10 - DT), expect(len).toBeLessThanOrEqual(20 + DT);
    }
    expect(shots.some((c) => c.id === null)).toBe(true); // pulled back now and then
    expect(subjects.some((c) => c.fill === undefined) && subjects.some((c) => c.fill !== undefined)).toBe(true); // close and medium
    expect(new Set(subjects.map((c) => c.id)).size).toBeGreaterThanOrEqual(5);
  });

  it('moves on when the subject dies or hides', () => {
    const a = fish(NEON, [0, 0.15, 0.1], { activity: 'feeding', speed: 0.08 });
    const b = fish(NEON, [0.1, 0.15, 0.1], { activity: 'cruising', speed: 0.05 });
    const c = fish(DULL, [-0.1, 0.15, 0.1], { activity: 'cruising', speed: 0.05 });
    const w = world([a, b, c]);
    const h = host(w);
    const tour = new Tour(h.host, { random: seeded(4) });
    tour.start();
    run(tour, h, 6);
    const first = tour.subjectId!;
    expect(first).toBeTruthy();
    // It slips into a cave: gone within a few seconds, gracefully.
    const f = w.fishById.get(first)!;
    f.kin.activity = 'hiding in a cave';
    run(tour, h, 4);
    expect(tour.subjectId).not.toBe(first);
    const second = tour.subjectId!;
    expect(second).toBeTruthy();
    // It dies (the App drops the follow and the animal).
    w.fishById.delete(second);
    w.fish = w.fish.filter((x) => x.state.id !== second);
    w.follow = null;
    run(tour, h, 0.3);
    expect(tour.subjectId).not.toBe(second);
  });

  it('is reproducible with a seed', () => {
    const make = () => {
      nextId = 100;
      const animals = Array.from({ length: 8 }, (_, i) => fish(i % 3 ? DULL : NEON, [-0.25 + i * 0.07, 0.12, 0], { speed: 0.03 + 0.01 * i }));
      const w = world(animals);
      const h = host(w);
      const tour = new Tour(h.host, { random: seeded(42) });
      tour.start();
      run(tour, h, 300);
      return h.calls.map((c) => `${c.id}@${c.t.toFixed(1)}`);
    };
    expect(make()).toEqual(make());
  });

  it('stop() keeps the current shot', () => {
    const a = fish(NEON, [0, 0.15, 0.1], { activity: 'feeding', speed: 0.08 });
    const w = world([a]);
    const h = host(w);
    const tour = new Tour(h.host, { random: seeded(5) });
    tour.start();
    run(tour, h, 6);
    const n = h.calls.length;
    tour.stop();
    run(tour, h, 60);
    expect(h.calls).toHaveLength(n);
    expect(w.follow).toBe(a.state.id);
    expect(tour.subjectId).toBeNull();
  });
});
