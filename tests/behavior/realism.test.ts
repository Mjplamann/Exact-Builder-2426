/**
 * Regression tests for watchability & realism in real preset tanks (full species database, real
 * aquascape colliders and cover): shelter persistence across decor/plant changes, clownfish in
 * their anemone, nocturnal fish seen by day, burrowing, smooth surface landings, feeding zones,
 * seahorse holdfasts, unreachable food, crabs that sink.
 */
import { describe, expect, it } from 'vitest';
import type { Brain } from '../../src/behavior/brain';
import { Habitat } from '../../src/behavior/habitat';
import { substrateHeight, tankBounds } from '../../src/core/tankGeometry';
import type { FishEntity } from '../../src/core/types';
import { makePresetSim } from './harness';

const brain = (f: FishEntity) => f.brain.behavior as Brain;

describe('behavior realism: shelter & sleep', () => {
  it('a plant/decor change does not turn sleeping fish out of their shelter', () => {
    const sim = makePresetSim('amazon-community', { hour: 23.5 });
    sim.run(150);
    const sheltered = () => sim.world.fish.filter((f) => brain(f).coverIdx >= 0).length;
    const before = sheltered();
    expect(before).toBeGreaterThan(10);
    const B = tankBounds(sim.world.tank);
    for (let i = 0; i < 3; i++) {
      // What LifeSim emits periodically as plants grow (colliders & cover are rebuilt).
      sim.world.events.emit('plants-changed', {});
      sim.run(20);
    }
    expect(sheltered()).toBeGreaterThanOrEqual(before - 2);
    // Nobody fled to the back corners (the old "no cover" fallback).
    const corners = sim.world.fish.filter((f) => brain(f).p.move === 'swimmer' && f.kin.pos[2] < -B.halfD + 0.06 && Math.abs(f.kin.pos[0]) > B.halfW - 0.25);
    expect(corners.length).toBeLessThan(4);
  }, 60_000);

  it('clownfish spend the night nestled in their anemone', () => {
    const sim = makePresetSim('reef', { hour: 23.5 });
    sim.run(200);
    const anemones = sim.world.cover.filter((c) => c.kind === 'anemone');
    expect(anemones.length).toBeGreaterThan(0);
    const clowns = sim.world.fish.filter((f) => f.species.traits.includes('anemone-host'));
    expect(clowns.length).toBeGreaterThan(0);
    for (const f of clowns) {
      const d = Math.min(...anemones.map((c) => Math.hypot(c.position[0] - f.kin.pos[0], c.position[1] - f.kin.pos[1], c.position[2] - f.kin.pos[2]) - c.radius));
      expect(d).toBeLessThan(0.06);
      expect(brain(f).label).toContain('anemone');
    }
  }, 60_000);

  it('sand-sleeping wrasses are actually under the sand at night', () => {
    const sim = makePresetSim('reef', { hour: 23.5, stock: false });
    const [w] = sim.add('halichoeres-hortulanus', 1);
    sim.run(90);
    const b = brain(w);
    expect(b.buried).toBeGreaterThan(0.9);
    const floor = substrateHeight(sim.world.tank, w.kin.pos[0], w.kin.pos[2]);
    // Body centre below the sand surface (the renderer draws the sand over it).
    expect(w.kin.pos[1]).toBeLessThan(floor);
  }, 60_000);
});

describe('behavior realism: a living tank by day', () => {
  it('nocturnal day-hiders still come out now and then in daylight', () => {
    const sim = makePresetSim('amazon-community', { hour: 12, stock: false });
    const ids = ['ancistrus-cirrhosus', 'pangio-kuhlii', 'apteronotus-albifrons', 'polypterus-senegalus'];
    const animals = ids.flatMap((id) => sim.add(id, id === 'pangio-kuhlii' ? 4 : 1));
    expect(animals.length).toBe(7);
    const out = new Map<string, number>();
    let samples = 0;
    let n = 0;
    sim.run(900, 1 / 15, () => {
      if (n++ % 15) return;
      samples++;
      for (const f of animals) {
        const b = brain(f);
        const hidden = b.mode === 'hide' || b.buried > 0.5;
        if (!hidden) out.set(f.species.id, (out.get(f.species.id) ?? 0) + 1 / (f.species.id === 'pangio-kuhlii' ? 4 : 1));
      }
    });
    for (const id of ids) {
      const frac = (out.get(id) ?? 0) / samples;
      // Mostly in hiding, as they should be — but seen regularly.
      expect(frac, id).toBeGreaterThan(0.08);
      expect(frac, id).toBeLessThan(0.75);
    }
  }, 90_000);

  it('animals settle onto glass, rock and sand without one-frame jumps', () => {
    const sim = makePresetSim('reef', { hour: 13, stock: true });
    for (const id of ['paracirrhites-arcatus', 'ecsenius-bicolor', 'lythrypnus-dalli', 'stenopus-hispidus', 'mithraculus-sculptus', 'hippocampus-erectus']) sim.add(id, 1);
    const fresh = makePresetSim('amazon-community', { hour: 13, stock: true });
    for (const id of ['chromobotia-macracanthus', 'pangio-kuhlii', 'beaufortia-kweichowensis', 'procambarus-alleni']) fresh.add(id, 2);
    for (const s of [sim, fresh]) {
      const prev = new Map<string, number[]>();
      let worst = 0, who = '';
      s.run(150, 1 / 30, () => {
        for (const f of s.world.fish) {
          const p = prev.get(f.state.id);
          const b = brain(f);
          if (p && b.mode !== 'tailflip') {
            const j = Math.hypot(f.kin.pos[0] - p[0], f.kin.pos[1] - p[1], f.kin.pos[2] - p[2]);
            const allowed = Math.max(0.02, f.kin.speed / 30 * 2.5 + 0.01, (b.p.burst * b.L) / 30 * 1.5);
            if (j / allowed > worst) {
              worst = j / allowed;
              who = `${f.species.id} ${b.mode}/${b.surf}/${b.label} ${(j * 100).toFixed(1)}cm`;
            }
          }
          prev.set(f.state.id, [f.kin.pos[0], f.kin.pos[1], f.kin.pos[2]]);
        }
      });
      expect(worst, who).toBeLessThan(1.6);
    }
  }, 90_000);

  it('bottom feeders wait for food to come down; surface skimmers stay up', () => {
    const sim = makePresetSim('amazon-community', { hour: 13 });
    for (const f of sim.world.fish) {
      f.state.hunger = 0.7;
      f.state.stomach = 0.15;
    }
    sim.run(10);
    const h = new Habitat();
    h.rebuild(sim.world);
    const B = tankBounds(sim.world.tank);
    sim.feed('flakes', [-0.15, B.surfaceY, 0.05], 1);
    sim.feed('sinking-pellets', [0.2, B.surfaceY, 0.05], 1);
    let coryHigh = 0, hatchetLow = 0;
    sim.run(60, 1 / 30, () => {
      for (const f of sim.world.fish) {
        const b = brain(f);
        if (b.mode !== 'feed') continue;
        const hf = h.heightFrac(f.kin.pos[0], f.kin.pos[1], f.kin.pos[2]);
        if (f.species.body.archetype === 'corydoras' && hf > 0.75) coryHigh++;
        if (b.p.t['surface-skimmer'] && hf < 0.5) hatchetLow++;
      }
    });
    expect(sim.bites).toBeGreaterThan(20);
    expect(coryHigh).toBe(0);
    expect(hatchetLow).toBe(0);
  }, 60_000);

  it('gobies and hawkfish hop between nearby perches in short darts', () => {
    const sim = makePresetSim('reef', { hour: 13, stock: false });
    const perchers = [...sim.add('paracirrhites-arcatus', 2), ...sim.add('elacatinus-oceanops', 2)];
    const hops: number[] = [];
    const start = new Map<string, number>();
    let t = 0;
    sim.run(300, 1 / 30, () => {
      t += 1 / 30;
      for (const f of perchers) {
        const b = brain(f);
        const hopping = b.mode === 'perch' && b.surf === 0 && b.label === 'hopping';
        if (hopping && !start.has(f.state.id)) start.set(f.state.id, t);
        else if (!hopping && start.has(f.state.id)) {
          hops.push(t - start.get(f.state.id)!);
          start.delete(f.state.id);
        }
      }
    });
    expect(hops.length).toBeGreaterThan(5);
    hops.sort((a, b) => a - b);
    // A hop is a dart of well under a few seconds (no orbiting the perch).
    expect(hops[Math.floor(hops.length / 2)]).toBeLessThan(2.5);
  }, 60_000);

  it('seahorses hold on to a holdfast upright, whatever its slope', () => {
    const sim = makePresetSim('reef', { hour: 13, stock: false });
    const horses = sim.add('hippocampus-erectus', 2);
    let held = 0, samples = 0, worstTilt = 0;
    let n = 0;
    sim.run(240, 1 / 30, () => {
      if (n++ % 10) return;
      for (const f of horses) {
        samples++;
        const b = brain(f);
        if (b.surf === 0) continue;
        held++;
        if (b.landT >= 0) continue;
        const up = f.kin.up ?? [0, 1, 0];
        worstTilt = Math.max(worstTilt, Math.acos(Math.min(1, up[1])));
      }
    });
    expect(held / samples).toBeGreaterThan(0.4);
    expect(worstTilt).toBeLessThan((15 * Math.PI) / 180);
  }, 60_000);
});

describe('behavior realism: food & decor edits', () => {
  it('food covered by newly placed decor is pushed out, not left inside the rock', () => {
    const sim = makePresetSim('amazon-community', { hour: 13, stock: false });
    const B = tankBounds(sim.world.tank);
    sim.feed('sinking-pellets', [0.3, B.surfaceY, 0.1], 1);
    sim.run(15);
    const settled = sim.world.food.filter((f) => f.state === 'settled');
    expect(settled.length).toBeGreaterThan(5);
    const t = sim.world.tank;
    t.decor.push({ id: 'test-rock', kind: 'rock', variant: 'seiryu', seed: 9, position: [0.3, substrateHeight(t, 0.3, 0.1), 0.1], rotation: [0, 0, 0], scale: 1.4 });
    sim.world.events.emit('decor-changed', {});
    sim.run(8);
    const h = new Habitat();
    h.rebuild(sim.world);
    for (const f of sim.world.food) expect(h.nearestDecor(f.pos[0], f.pos[1], f.pos[2])).toBeGreaterThan(-0.002);
  }, 60_000);

  it('crabs sink to the bottom when released (they cannot swim)', () => {
    const sim = makePresetSim('reef', { hour: 13, stock: false });
    sim.run(25); // later than set-up: this one comes from the shop and is released at the surface
    const [crab] = sim.add('mithraculus-sculptus', 1);
    expect(crab.kin.pos[1]).toBeGreaterThan(tankBounds(sim.world.tank).surfaceY - 0.1);
    const modes = new Set<string>();
    sim.run(20, 1 / 30, () => modes.add(brain(crab).mode));
    expect(modes.has('swim')).toBe(false);
    expect(brain(crab).surf).not.toBe(0);
  }, 60_000);
});
