import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import { speckleHash, type LeafTexSpec } from '../src/render/decor/textures';
import { leafMicroFor } from '../src/render/decor/plants/parts';
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
  });

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
    engine.zoomLevel = 3;
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => m.visible)).toBe(true);
    engine.zoomLevel = 1;
    t.world.follow = t.world.fish[0].state.id;
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => m.visible)).toBe(true);
    // Low quality has no depth of field at all.
    engine.qualityLevel = 'low';
    r.update(t.world, 1 / 60);
    expect(depthMeshes().every((m) => !m.visible)).toBe(true);
    r.dispose();
  });
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
  });
});
