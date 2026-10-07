import { describe, expect, it } from 'vitest';
import { Box3, Group, PerspectiveCamera, Vector3, type BufferAttribute, type Mesh } from 'three';
import type { PlantSpecies } from '../src/core/types';
import { PlantIndex } from '../src/data/plantIndex';
import { newTank } from '../src/sim/tankFactory';
import { speckleHash, type LeafTexSpec } from '../src/render/decor/textures';
import { leafMicroFor } from '../src/render/decor/plants/parts';
import { closeUpAmount } from '../src/render/decor/shaders';
import { FISH_CLOSEUP } from '../src/render/fish/fishMaterial';
import { FishVariant } from '../src/render/fish/variant';
import { FIN_DEPTH_ALPHA } from '../src/render/fish/fishMaterial';
import { FishRenderer } from '../src/render/fish/FishRenderer';
import { resolveBody } from '../src/render/fish/archetypes';
import { buildFishGeometry, lodFor } from '../src/render/fish/fishGeometry';
import { PART } from '../src/render/fish/geometryBuilder';
import type { Engine } from '../src/render/Engine';
import { SPECIES, makeTank, stock } from './sim/helpers';

/**
 * Close-up detail (zoom up to 8×, following with depth of field): what the camera shows when
 * a fish fills a third of the screen and a leaf a whole one.
 */

describe('leaf textures', () => {
  it('per-texel speckle has no lattice (a plain XOR hash painted a diamond net over every leaf)', () => {
    let worst = 0;
    for (let dx = 0; dx <= 12; dx++) {
      for (let dy = 0; dy <= 12; dy++) {
        if (!dx && !dy) continue;
        let s = 0;
        let n = 0;
        for (let y = 0; y < 64; y++) {
          for (let x = 0; x < 64; x++) {
            s += (speckleHash(x, y, 1234) - 0.5) * (speckleHash(x + dx, y + dy, 1234) - 0.5);
            n++;
          }
        }
        worst = Math.max(worst, Math.abs(s / n / (1 / 12)));
      }
    }
    // The old hash correlated 0.78 with itself 11 texels over.
    expect(worst).toBeLessThan(0.15);
  });

  it('real blades get close-up venation; roots, moss shoots and polyp sheets do not', () => {
    const base: LeafTexSpec = { outline: 'strap', width: 32, height: 512, base: '#4a8a30', seed: 1 };
    expect(leafMicroFor({ ...base, veins: 'parallel' }, 0.6)?.kind).toBe('parallel');
    expect(leafMicroFor({ ...base, outline: 'lanceolate', veins: 'pinnate' }, 0.6)).toMatchObject({ kind: 'net', relief: 1 });
    // Leathery anubias / java fern: sunken vein nets.
    expect(leafMicroFor({ ...base, outline: 'ovate', veins: 'pinnate' }, 0.32)).toMatchObject({ kind: 'net', relief: -1 });
    for (const outline of ['moss', 'root', 'feathery-root', 'fern-frond', 'star-polyp', 'carpet-mat'] as const) {
      expect(leafMicroFor({ ...base, outline }, 0.6), outline).toBeUndefined();
    }
    expect(leafMicroFor({ ...base, veins: 'none' }, 0.6)).toBeUndefined();
  });
});

describe('close-up detail is close-up only', () => {
  it('the whole-tank view (any display) never shows or pays for it; zooming or following fades it in', () => {
    expect(closeUpAmount(1, false)).toBe(0);
    expect(closeUpAmount(1.1, false)).toBe(0);
    expect(closeUpAmount(1.3, false)).toBeGreaterThan(0);
    expect(closeUpAmount(1.3, false)).toBeLessThan(1);
    expect(closeUpAmount(2, false)).toBe(1);
    expect(closeUpAmount(1, true)).toBe(1);
  });
});

describe('fins under depth of field', () => {
  it('every animal has a depth-only fin twin (fins, shrimp legs and antennae keep their own depth)', () => {
    for (const id of ['paracheirodon-innesi', 'pterophyllum-scalare', 'neocaridina-davidi-red-cherry', 'amphiprion-ocellaris']) {
      const sp = SPECIES.get(id)!;
      const v = new FishVariant(id, sp, 'unknown', { envMap: null, underwater: false });
      const d = v.finDepthMesh;
      expect(d, id).toBeTruthy();
      expect(d.geometry).toBe(v.finMesh.geometry);
      expect(d.instanceMatrix).toBe(v.bodyMesh.instanceMatrix);
      const m = v.mats.finDepth;
      expect(m.colorWrite).toBe(false);
      expect(m.depthWrite).toBe(true);
      // In the translucent list, after the fins and everything else translucent.
      expect(m.transparent).toBe(true);
      expect(d.renderOrder).toBeGreaterThan(v.finMesh.renderOrder);
      expect(m.map).toBe(v.mats.fins.map);
      expect(m.alphaTest).toBe(FIN_DEPTH_ALPHA);
      expect(FIN_DEPTH_ALPHA).toBeGreaterThan(0);
      expect(FIN_DEPTH_ALPHA).toBeLessThan(0.1);
      expect(d.castShadow).toBe(false);
      expect(d.visible).toBe(false);
      v.dispose();
    }
  }, 60_000);

  it('the fin depth is only drawn in close-ups (no extra draw calls in the whole-tank view)', () => {
    const t = makeTank();
    stock(t, 'paracheirodon-innesi', 6);
    stock(t, 'neocaridina-davidi-red-cherry', 3);
    const engine = { contents: new Group(), renderer: {}, camera: new PerspectiveCamera(), zoomLevel: 1, qualityLevel: 'high' };
    const r = new FishRenderer(engine as unknown as Engine);
    r.sync(t.world);
    const depthMeshes = () => r.group.children.filter((o) => o.name.startsWith('fin-depth:'));
    expect(depthMeshes().length).toBe(2);
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => !m.visible)).toBe(true);
    expect(FISH_CLOSEUP.value).toBe(0);
    engine.zoomLevel = 3;
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => m.visible)).toBe(true);
    expect(FISH_CLOSEUP.value).toBe(1);
    engine.zoomLevel = 1;
    t.world.follow = t.world.fish[0].state.id;
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => m.visible)).toBe(true);
    // Low quality has no depth of field at all.
    engine.qualityLevel = 'low';
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => !m.visible)).toBe(true);
    r.dispose();
  }, 60_000);
});

describe('close-up scale lattice', () => {
  it("body vertices carry the painter's half height, so the shader can rebuild its scale rows", () => {
    const sp = SPECIES.get('pterophyllum-scalare')!;
    const body = resolveBody(sp, 'unknown');
    const g = buildFishGeometry(body, lodFor(sp.adultLengthCm, false, 'tank'));
    const prof = g.info.profile!;
    const spine = g.body.getAttribute('aSpine');
    const fin = g.body.getAttribute('aFin');
    let checked = 0;
    for (let i = 0; i < spine.count; i++) {
      if (spine.getY(i) !== PART.body) continue;
      const x = spine.getX(i);
      if (x < 0.05 || x > 0.95) continue;
      expect(fin.getY(i)).toBeCloseTo(prof.textureHalfHeight(x), 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  }, 30_000);
});

describe('reef corals read as the real thing', () => {
  const plantFiles = import.meta.glob('../src/data/plants/*.json', { eager: true, import: 'default' }) as Record<string, PlantSpecies[]>;
  const plantIdx = new PlantIndex(Object.values(plantFiles).flat());
  function shimCanvas(): void {
    const g = globalThis as Record<string, unknown>;
    if (typeof g.document !== 'undefined') return;
    const ctx2d = (w: number, h: number) => new Proxy({ canvas: { width: w, height: h }, getImageData: (_x: number, _y: number, ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) }), createImageData: (ww: number, hh: number) => ({ data: new Uint8ClampedArray(ww * hh * 4) }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : () => undefined), set: () => true });
    g.document = { createElement: () => { const c: Record<string, unknown> = { width: 1, height: 1 }; c.getContext = () => ctx2d(c.width as number, c.height as number); return c; } };
    g.Path2D = class { moveTo() {} lineTo() {} closePath() {} quadraticCurveTo() {} bezierCurveTo() {} ellipse() {} arc() {} };
  }
  async function build(id: string) {
    shimCanvas();
    const { PlantSystem } = await import('../src/render/decor/plants/PlantSystem');
    const tank = newTank({ size: { widthCm: 90, heightCm: 50, depthCm: 50 }, water: 'marine', seed: 5, now: 1.7e12, substrate: 'aragonite' });
    tank.plants = [{ id: 'c', speciesId: id, seed: 7, position: [0, 0.03, 0], rotationY: 0.3, growth: 1, plantedAt: 0, health: 1 }];
    const sys = new PlantSystem();
    sys.sync({ tank, plants: plantIdx, settings: { quality: 'high' } } as never);
    const built = (sys as unknown as { built: Map<string, { build: { meshes: Mesh[]; parts: Map<string, { inst: unknown[] }> } }> }).built.get('c')!.build;
    return { sys, built, sp: plantIdx.get(id)! };
  }

  it('a table Acropora is a broad plate (not a skewer seen edge-on), cupped, bristling with branchlets', async () => {
    const { sys, built, sp } = await build('acropora-hyacinthus');
    const box = new Box3();
    for (const m of built.meshes) box.union(new Box3().setFromBufferAttribute(m.geometry.getAttribute('position') as BufferAttribute));
    const size = box.getSize(new Vector3());
    const spread = sp.spreadCm / 100;
    // Broad in both horizontal directions, shallow in height.
    expect(Math.min(size.x, size.z)).toBeGreaterThan(spread * 0.6);
    expect(size.y).toBeLessThan(Math.max(size.x, size.z) * 0.6);
    // A solid plate under the branchlets (the fused meshwork), plus the branch mesh.
    expect(built.meshes.length).toBeGreaterThanOrEqual(2);
    sys.dispose();
  }, 60_000);

  it('a toadstool leather has a folded, rolled cap carpeted with polyps', async () => {
    const { sys, built, sp } = await build('sarcophyton-toadstool');
    const polyps = [...built.parts.entries()].find(([k]) => k.endsWith('/polyp-crown'))?.[1].inst.length ?? 0;
    // Hundreds of short polyps (a fuzzy lawn by day), not a few dozen blades of grass.
    expect(polyps).toBeGreaterThan(700);
    // The cap margin waves up and down (lobes), it is not a flat plate.
    const pos = built.meshes[0].geometry.getAttribute('position');
    let yMax = -Infinity;
    for (let i = 0; i < pos.count; i++) yMax = Math.max(yMax, pos.getY(i));
    const rim: number[] = [];
    const r = sp.spreadCm / 200;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getZ(i));
      if (d > r * 0.85) rim.push(pos.getY(i));
    }
    expect(rim.length).toBeGreaterThan(20);
    expect(Math.max(...rim) - Math.min(...rim)).toBeGreaterThan(r * 0.12);
    sys.dispose();
  }, 60_000);
});
