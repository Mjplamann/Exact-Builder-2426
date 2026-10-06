import { describe, expect, it } from 'vitest';
import type { PlantSpecies, TankState } from '../src/core/types';
import { PlantIndex } from '../src/data/plantIndex';
import { newTank } from '../src/sim/tankFactory';
import { tankBounds } from '../src/core/tankGeometry';
import { DECOR_CATALOG } from '../src/decor/catalog';
import { decorShape, hostAnchor, itemWorldBounds, sdfEval } from '../src/decor/shapes';
import { buildColliders } from '../src/decor/colliders';
import { AQUASCAPES, suggestPlacement } from '../src/decor/aquascapes';

const files = import.meta.glob('../src/data/plants/*.json', { eager: true, import: 'default' }) as Record<string, PlantSpecies[]>;
const plants = new PlantIndex(Object.values(files).flat());

const SIZES = [
  { widthCm: 45, heightCm: 30, depthCm: 30 },
  { widthCm: 120, heightCm: 50, depthCm: 50 },
  { widthCm: 180, heightCm: 60, depthCm: 60 },
];

function tankFor(size: (typeof SIZES)[number], water: TankState['water'], seed: number): TankState {
  return newTank({ size, water, seed, now: 1.7e12, substrate: water === 'marine' ? 'aragonite' : 'river-sand' });
}

const finite = (v: unknown): boolean => (Array.isArray(v) ? v.every(finite) : typeof v === 'number' ? Number.isFinite(v) : true);

describe('decor shapes', () => {
  it('every catalog variant has a deterministic shape with colliders inside its bounds', () => {
    for (const d of DECOR_CATALOG) {
      for (const seed of [1, 77, 123456]) {
        const a = decorShape({ kind: d.kind, variant: d.variant, seed });
        const b = JSON.parse(JSON.stringify(decorShape({ kind: d.kind, variant: d.variant, seed })));
        expect(JSON.parse(JSON.stringify(a))).toEqual(b);
        expect(a.bounds.max[0]).toBeGreaterThan(a.bounds.min[0]);
        expect(a.bounds.max[1]).toBeGreaterThan(0);
        // Natural size roughly matches the catalog footprint.
        const w = Math.max(a.bounds.max[0] - a.bounds.min[0], a.bounds.max[2] - a.bounds.min[2]);
        expect(w, `${d.variant} footprint`).toBeLessThan(d.size * 2.4 + 0.05);
        for (const c of a.colliders) expect(finite([c.a, c.b ?? 0, c.radius ?? 0])).toBe(true);
      }
    }
  });

  it('rock SDFs are solid inside and empty far outside', () => {
    for (const d of DECOR_CATALOG.filter((x) => x.kind === 'rock')) {
      const s = decorShape({ kind: d.kind, variant: d.variant, seed: 9 });
      expect(s.sdf).toBeDefined();
      expect(sdfEval(s.sdf!, 0, 2, 0)).toBeGreaterThan(0);
    }
  });
});

describe('aquascapes', () => {
  it('build deterministic, in-bounds layouts with valid references for every tank size', () => {
    for (const scape of AQUASCAPES) {
      for (const size of SIZES) {
        const tank = tankFor(size, scape.water, 4242);
        const a = scape.build(tank, plants, tank.seed);
        const b = scape.build(tank, plants, tank.seed);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
        const bnd = tankBounds(tank);
        const ids = new Set(a.decor.map((d) => d.id));
        for (const d of a.decor) {
          const wb = itemWorldBounds(d);
          expect(wb.min[0], `${scape.id} ${d.variant} left`).toBeGreaterThan(-bnd.halfW - 1e-6);
          expect(wb.max[0], `${scape.id} ${d.variant} right`).toBeLessThan(bnd.halfW + 1e-6);
          expect(wb.min[2], `${scape.id} ${d.variant} back`).toBeGreaterThan(-bnd.halfD - 1e-6);
          expect(wb.max[2], `${scape.id} ${d.variant} front`).toBeLessThan(bnd.halfD + 1e-6);
        }
        for (const p of a.plants) {
          expect(plants.get(p.speciesId), p.speciesId).toBeDefined();
          if (p.attachedTo) expect(ids.has(p.attachedTo)).toBe(true);
          expect(Math.abs(p.position[0])).toBeLessThanOrEqual(bnd.halfW);
          expect(Math.abs(p.position[2])).toBeLessThanOrEqual(bnd.halfD);
          expect(p.growth).toBeGreaterThan(0);
        }
        expect(new Set(a.plants.map((p) => p.id)).size).toBe(a.plants.length);
        if (scape.id !== 'empty') expect(a.decor.length + a.plants.length).toBeGreaterThan(3);
      }
    }
  });

  it('the reef has an anemone host for clownfish and the amazon has cover', () => {
    const reefTank = tankFor(SIZES[2], 'marine', 7);
    const reef = AQUASCAPES.find((s) => s.id === 'reef')!.build(reefTank, plants, 7);
    reefTank.decor = reef.decor;
    reefTank.plants = reef.plants;
    const rc = buildColliders(reefTank, plants);
    expect(rc.cover.some((c) => c.kind === 'anemone')).toBe(true);
    expect(rc.colliders.length).toBeGreaterThan(5);

    const amTank = tankFor(SIZES[1], 'freshwater', 7);
    const am = AQUASCAPES.find((s) => s.id === 'amazon')!.build(amTank, plants, 7);
    amTank.decor = am.decor;
    amTank.plants = am.plants;
    const ac = buildColliders(amTank, plants);
    expect(ac.cover.some((c) => c.kind === 'overhang')).toBe(true);
    expect(ac.cover.some((c) => c.kind === 'plants')).toBe(true);
    for (const c of [...ac.colliders, ...rc.colliders]) expect(c.ownerId).toBeTruthy();
    expect(finite(ac.cover.map((c) => c.position))).toBe(true);
    expect(JSON.stringify(buildColliders(amTank, plants))).toEqual(JSON.stringify(ac));
  });

  it('epiphyte anchors sit on their host', () => {
    const tank = tankFor(SIZES[1], 'freshwater', 99);
    const am = AQUASCAPES.find((s) => s.id === 'amazon')!.build(tank, plants, 99);
    for (const p of am.plants.filter((q) => q.attachedTo)) {
      const host = am.decor.find((d) => d.id === p.attachedTo)!;
      const a = hostAnchor(host, p.position[0], p.position[2]);
      const wb = itemWorldBounds(host);
      expect(a.p[1]).toBeGreaterThanOrEqual(wb.min[1] - 0.01);
      expect(a.p[1]).toBeLessThanOrEqual(wb.max[1] + 0.01);
    }
  });

  it('suggests placements inside the tank', () => {
    const tank = tankFor(SIZES[1], 'freshwater', 5);
    const built = AQUASCAPES.find((s) => s.id === 'nature')!.build(tank, plants, 5);
    tank.decor = built.decor;
    tank.plants = built.plants;
    const b = tankBounds(tank);
    for (const d of DECOR_CATALOG.filter((x) => x.water.includes('freshwater'))) {
      const s = suggestPlacement(tank, { decor: { kind: d.kind, variant: d.variant } }, plants);
      expect(Math.abs(s.at[0])).toBeLessThan(b.halfW);
      expect(Math.abs(s.at[1])).toBeLessThan(b.halfD);
    }
    for (const sp of plants.forWater('freshwater')) {
      const s = suggestPlacement(tank, { plant: sp }, plants);
      expect(Math.abs(s.at[0])).toBeLessThan(b.halfW);
      expect(Math.abs(s.at[1])).toBeLessThan(b.halfD);
      if (s.attachTo) expect(tank.decor.some((d) => d.id === s.attachTo)).toBe(true);
    }
  });
});
