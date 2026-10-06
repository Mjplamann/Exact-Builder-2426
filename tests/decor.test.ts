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

// ---------------------------------------------------------------------------------------------
// Editing & picking regressions (decor review)
// ---------------------------------------------------------------------------------------------

describe('epiphyte anchoring and host edits', () => {
  it('an epiphyte stored on the side of a stone stays on that side', async () => {
    const { projectToSurface, itemTransform, toWorld, toLocal } = await import('../src/decor/shapes');
    const { plantMetrics } = await import('../src/decor/plantMetrics');
    const tank = tankFor(SIZES[1], 'freshwater', 3);
    const rock = { id: 'r1', kind: 'rock' as const, variant: 'dragon-stone', seed: 21, position: [0, 0.03, 0] as [number, number, number], rotation: [0, 0.4, 0] as [number, number, number], scale: 1 };
    tank.decor = [rock];
    const shape = decorShape(rock);
    // A point on the stone's front face, half way up.
    const loc: [number, number, number] = [0, (shape.bounds.max[1] + Math.max(0, shape.bounds.min[1])) * 0.45, shape.bounds.max[2] + 0.02];
    projectToSurface(shape.sdf!, loc);
    const side = toWorld(itemTransform(rock), loc, [0, 0, 0]);
    const sp = plants.get('anubias-barteri')!;
    const p = { id: 'p1', speciesId: sp.id, seed: 1, position: [side[0], side[1], side[2]] as [number, number, number], rotationY: 0, growth: 0.6, plantedAt: 0, attachedTo: 'r1', health: 1 };
    tank.plants = [p];
    const m = plantMetrics(sp, p, tank);
    expect(Math.hypot(m.anchor[0] - side[0], m.anchor[1] - side[1], m.anchor[2] - side[2])).toBeLessThan(0.003);
    // Re-anchoring the anchor is stable (no creep between rebuilds).
    const again = hostAnchor(rock, m.anchor[0], m.anchor[2], m.anchor[1]);
    expect(Math.hypot(again.p[0] - m.anchor[0], again.p[1] - m.anchor[1], again.p[2] - m.anchor[2])).toBeLessThan(0.001);
    void toLocal;
  });

  it('aquascape epiphytes re-anchor where they were placed', async () => {
    const { plantMetrics } = await import('../src/decor/plantMetrics');
    for (const id of ['amazon', 'nature', 'nano-shrimp', 'blackwater', 'reef']) {
      const scape = AQUASCAPES.find((s) => s.id === id)!;
      const tank = tankFor(SIZES[1], scape.water, 11);
      const built = scape.build(tank, plants, 11);
      tank.decor = built.decor;
      tank.plants = built.plants;
      for (const p of tank.plants.filter((q) => q.attachedTo)) {
        const m = plantMetrics(plants.get(p.speciesId)!, p, tank);
        expect(Math.hypot(m.anchor[0] - p.position[0], m.anchor[1] - p.position[1], m.anchor[2] - p.position[2]), `${id} ${p.speciesId}`).toBeLessThan(0.004);
      }
    }
  });

  it('carryAttached keeps attached plants on the same spot of a moved, turned, resized host', async () => {
    const { carryAttached, hostPose } = await import('../src/decor/attach');
    const { itemTransform, toLocal } = await import('../src/decor/shapes');
    const { plantMetrics } = await import('../src/decor/plantMetrics');
    const tank = tankFor(SIZES[1], 'freshwater', 4);
    const wood = { id: 'w1', kind: 'driftwood' as const, variant: 'spiderwood', seed: 9, position: [0.1, 0.03, 0] as [number, number, number], rotation: [0, 0.2, 0] as [number, number, number], scale: 1 };
    tank.decor = [wood];
    const a0 = hostAnchor(wood, 0.12, 0.02);
    const sp = plants.get('microsorum-pteropus')!;
    const p = { id: 'p1', speciesId: sp.id, seed: 1, position: a0.p, rotationY: 0, growth: 0.6, plantedAt: 0, attachedTo: 'w1', health: 1 };
    tank.plants = [p];
    const before = hostPose(wood);
    const localBefore = toLocal(itemTransform(wood), plantMetrics(sp, p, tank).anchor, [0, 0, 0]);
    wood.position = [-0.2, 0.03, 0.05];
    wood.rotation = [0, 1.9, 0];
    wood.scale = 1.2;
    expect(carryAttached(tank, wood, before)).toEqual(['p1']);
    const localAfter = toLocal(itemTransform(wood), plantMetrics(sp, p, tank).anchor, [0, 0, 0]);
    expect(Math.hypot(localAfter[0] - localBefore[0], localAfter[1] - localBefore[1], localAfter[2] - localBefore[2])).toBeLessThan(0.002);
    expect(p.rotationY).toBeCloseTo(1.7, 6);
  });
});

describe('stone colliders follow the visible solid', () => {
  it('almost no exposed surface lies more than 2.5 cm outside the colliders', async () => {
    const { projectToSurface } = await import('../src/decor/shapes');
    const { Rng } = await import('../src/core/rng');
    for (const variant of ['seiryu', 'dragon-stone', 'lava', 'texas-holey', 'elephant-skin', 'frodo', 'live-rock']) {
      let n = 0, deep = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const s = decorShape({ kind: 'rock', variant, seed });
        const rng = new Rng(seed);
        const b = s.bounds;
        for (let i = 0; i < 120; i++) {
          const p: [number, number, number] = [rng.range(b.min[0], b.max[0]), rng.range(Math.max(0, b.min[1]), b.max[1]), rng.range(b.min[2], b.max[2])];
          projectToSurface(s.sdf!, p);
          if (Math.abs(sdfEval(s.sdf!, p[0], p[1], p[2])) > 0.002 || p[1] < 0.005) continue;
          n++;
          let best = Infinity;
          for (const c of s.colliders) {
            if (c.type === 'sphere') best = Math.min(best, Math.hypot(p[0] - c.a[0], p[1] - c.a[1], p[2] - c.a[2]) - (c.radius ?? 0));
            else if (c.type === 'capsule' && c.b) {
              const ab = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]], ap = [p[0] - c.a[0], p[1] - c.a[1], p[2] - c.a[2]];
              const t = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1)));
              best = Math.min(best, Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - (c.radius ?? 0));
            } else best = Math.min(best, 0);
          }
          if (best > 0.025) deep++;
        }
      }
      expect(deep / Math.max(1, n), variant).toBeLessThan(0.06);
    }
  });
});

describe('plant picking', () => {
  it('hits leaves, not the air around the plant', async () => {
    // Minimal canvas stub: leaf textures are painted on a 2-D canvas.
    const g = globalThis as Record<string, unknown>;
    if (typeof g.document === 'undefined') {
      const ctx2d = (w: number, h: number) => new Proxy({ canvas: { width: w, height: h }, getImageData: (_x: number, _y: number, ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) }), createImageData: (ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => undefined), set: () => true });
      g.document = { createElement: () => { const c: Record<string, unknown> = { width: 1, height: 1 }; c.getContext = () => ctx2d(c.width as number, c.height as number); return c; } };
      g.Path2D = class { moveTo() {} lineTo() {} closePath() {} quadraticCurveTo() {} bezierCurveTo() {} ellipse() {} arc() {} };
    }
    const { Ray, Vector3 } = await import('three');
    const { PlantSystem } = await import('../src/render/decor/plants/PlantSystem');
    const { plantMetrics } = await import('../src/decor/plantMetrics');
    const tank = tankFor(SIZES[1], 'freshwater', 8);
    const carpet = plants.get('micranthemum-monte-carlo')!;
    const sword = plants.get('echinodorus-grisebachii-bleherae')!;
    const pc = { id: 'c', speciesId: carpet.id, seed: 1, position: [-0.25, 0, 0.12] as [number, number, number], rotationY: 0, growth: 0.9, plantedAt: 0, health: 1 };
    const ps0 = { id: 's', speciesId: sword.id, seed: 2, position: [0.25, 0, -0.05] as [number, number, number], rotationY: 0, growth: 0.95, plantedAt: 0, health: 1 };
    tank.plants = [pc, ps0];
    const sys = new PlantSystem();
    sys.sync({ tank, plants, settings: { quality: 'high' } } as never);
    const mc = plantMetrics(carpet, pc, tank);
    const ms = plantMetrics(sword, ps0, tank);
    const ray = (o: [number, number, number], d: [number, number, number]) => new Ray(new Vector3(...o), new Vector3(...d).normalize());
    // Looking down onto the carpet: hit. Skimming 3 cm above its top: miss.
    expect(sys.pick(ray([mc.anchor[0], mc.anchor[1] + 0.3, mc.anchor[2]], [0, -1, 0]))?.id).toBe('c');
    expect(sys.pick(ray([mc.anchor[0], mc.anchor[1] + mc.height + 0.03, 0.6], [0, 0, -1]))).toBeNull();
    // Into the sword's crown: hit; well above its tallest leaf: miss.
    expect(sys.pick(ray([ms.anchor[0], ms.anchor[1] + 0.03, 0.6], [0, 0, -1]))?.id).toBe('s');
    expect(sys.pick(ray([ms.anchor[0], ms.anchor[1] + ms.height + 0.04, 0.6], [0, 0, -1]))).toBeNull();
    sys.dispose();
  });
});

describe('growth rebuilds', () => {
  it('each geometry rebuild grows a plant by only a few millimetres', async () => {
    const { growthStep } = await import('../src/render/decor/plants/PlantSystem');
    for (const sp of [...plants.forWater('freshwater'), ...plants.forWater('marine')]) {
      const step = growthStep(sp);
      const dH = step * 0.82 * (sp.maxHeightCm / 100);
      const dS = step * 0.75 * (sp.spreadCm / 100);
      expect(Math.max(dH, dS), sp.id).toBeLessThan(0.0051);
    }
  });
});

describe('caves stay open', () => {
  it('cave cover points lie in open water inside their stone', () => {
    for (const [kind, variant] of [['cave', 'rock-cave'], ['cave', 'coconut'], ['cave', 'slate-cave'], ['rock', 'live-rock']] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = decorShape({ kind, variant, seed });
        for (const c of s.cover.filter((q) => q.kind === 'cave')) expect(sdfEval(s.sdf!, c.p[0], c.p[1], c.p[2]), `${variant}/${seed}`).toBeGreaterThan(0.005);
      }
    }
  });
});

describe('coral meshes face outward', () => {
  it('domes, lathed columns and plates are wound outward (front faces visible)', async () => {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.document === 'undefined') {
      const ctx2d = (w: number, h: number) => new Proxy({ canvas: { width: w, height: h }, getImageData: (_x: number, _y: number, ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) }), createImageData: (ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => undefined), set: () => true });
      g.document = { createElement: () => { const c: Record<string, unknown> = { width: 1, height: 1 }; c.getContext = () => ctx2d(c.width as number, c.height as number); return c; } };
      g.Path2D = class { moveTo() {} lineTo() {} closePath() {} quadraticCurveTo() {} bezierCurveTo() {} ellipse() {} arc() {} };
    }
    const { PlantSystem } = await import('../src/render/decor/plants/PlantSystem');
    const tank = tankFor(SIZES[1], 'marine', 5);
    const ids = ['dipsastraea-speciosa', 'favites-abdita', 'micromussa-lordhowensis', 'platygyra-sinensis', 'trachyphyllia-geoffroyi', 'danafungia-scruposa', 'sarcophyton-toadstool', 'entacmaea-quadricolor', 'montipora-capricornis'];
    for (const id of ids) {
      if (!plants.get(id)) continue;
      tank.plants = [{ id: 'c', speciesId: id, seed: 3, position: [0, 0, 0], rotationY: 0.4, growth: 0.9, plantedAt: 0, health: 1 }];
      const sys = new PlantSystem();
      sys.sync({ tank, plants, settings: { quality: 'medium' } } as never);
      for (const mesh of sys.uniqueMeshes()) {
        const pos = mesh.geometry.getAttribute('position');
        const idx = mesh.geometry.getIndex()!;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < pos.count; i++) {
          cx += pos.getX(i) / pos.count;
          cy += pos.getY(i) / pos.count;
          cz += pos.getZ(i) / pos.count;
        }
        let out = 0, up = 0;
        for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
          const ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a);
          const vx = pos.getX(c) - pos.getX(a), vy = pos.getY(c) - pos.getY(a), vz = pos.getZ(c) - pos.getZ(a);
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const mx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 - cx, my = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 - cy, mz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3 - cz;
          out += nx * mx + ny * my + nz * mz;
          up += ny;
        }
        if (id === 'montipora-capricornis') expect(up, id).toBeGreaterThan(0);
        else expect(out, id).toBeGreaterThan(0);
      }
      sys.dispose();
    }
  });
});
