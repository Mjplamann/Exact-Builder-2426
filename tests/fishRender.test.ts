import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import type { Sex, Species } from '../src/core/types';
import { ARCHETYPES } from '../src/core/enums';
import { ARCHETYPE_PRESETS, resolveBody, resolveLook, sexMatters } from '../src/render/fish/archetypes';
import { buildFishGeometry, lodFor } from '../src/render/fish/fishGeometry';
import { buildSeahorse } from '../src/render/fish/seahorse';
import { buildInvertebrate } from '../src/render/fish/invertebrates';
import { paintFishAtlas } from '../src/render/fish/textures';

/**
 * Fish renderer robustness: every bundled species (any valid Species, not just the reference
 * ones) must produce finite, non-empty geometry and a painted atlas without throwing.
 */
const files = import.meta.glob('../src/data/species/*.json', { eager: true, import: 'default' }) as Record<string, Species[]>;
const all: Species[] = [];
for (const list of Object.values(files)) if (Array.isArray(list)) all.push(...list);

function finite(attr: BufferAttribute): boolean {
  const a = attr.array as Float32Array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

function build(sp: Species, sex: Sex, paint: boolean) {
  const body = resolveBody(sp, sex);
  const look = resolveLook(sp, sex);
  if (body.kind === 'fish' || body.kind === 'ray') {
    const g = buildFishGeometry(body, lodFor(sp.adultLengthCm, body.depth < 0.13, 'thumb'));
    const tex = paint ? paintFishAtlas(sp, body, look, g.info.profile!, 64) : null;
    return { g, tex };
  }
  if (body.kind === 'seahorse') {
    const g = buildSeahorse(body, 0.6);
    const tex = paint ? paintFishAtlas(sp, body, look, g.info.profile!, 64) : null;
    return { g, tex };
  }
  const g = buildInvertebrate(sp, body, look, 0.6);
  const tex = paint ? g.paint(64) : null;
  return { g, tex };
}

describe('fish renderer', () => {
  it('has a preset for every archetype', () => {
    for (const a of ARCHETYPES) expect(ARCHETYPE_PRESETS[a], a).toBeTruthy();
  });

  it('builds finite geometry for every species and sex variant', () => {
    const problems: string[] = [];
    for (const sp of all) {
      const sexes: Sex[] = ['unknown'];
      if (sexMatters(sp, 'male')) sexes.push('male');
      if (sexMatters(sp, 'female')) sexes.push('female');
      for (const sex of sexes) {
        try {
          const { g } = build(sp, sex, false);
          for (const geo of [g.body, g.fins]) {
            const pos = geo.getAttribute('position') as BufferAttribute;
            if (!pos || pos.count < 3) problems.push(`${sp.id}/${sex}: empty geometry`);
            else if (!finite(pos) || !finite(geo.getAttribute('normal') as BufferAttribute)) problems.push(`${sp.id}/${sex}: non-finite vertices`);
            // Total length is normalised to ~1 (inverts: characteristic size 1).
            geo.computeBoundingBox();
            const sz = geo.boundingBox!.max.x - geo.boundingBox!.min.x;
            if (sz > 6) problems.push(`${sp.id}/${sex}: implausible extent ${sz.toFixed(2)}`);
          }
        } catch (err) {
          problems.push(`${sp.id}/${sex}: ${(err as Error).message}`);
        }
      }
    }
    expect(problems, problems.slice(0, 40).join('\n')).toEqual([]);
  }, 300_000);

  it('paints atlases for a sample of species', () => {
    const sample = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 60)) === 0);
    for (const sp of sample) {
      const { tex } = build(sp, 'unknown', true);
      expect(tex, sp.id).toBeTruthy();
      const img = tex!.map.image as { data: Uint8Array };
      expect(img.data.length).toBeGreaterThan(0);
      tex!.dispose();
    }
  }, 300_000);

  it('fish are normalised to unit total length with the snout forward', () => {
    const neon = all.find((s) => s.id === 'paracheirodon-innesi');
    if (!neon) return;
    const body = resolveBody(neon, 'unknown');
    const g = buildFishGeometry(body, lodFor(3.5, false));
    g.body.computeBoundingBox();
    g.fins.computeBoundingBox();
    const box = g.body.boundingBox!.clone().union(g.fins.boundingBox!);
    expect(box.max.x).toBeGreaterThan(0.4);
    expect(box.max.x).toBeLessThan(0.56);
    expect(box.min.x).toBeGreaterThan(-0.56);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.9);
    expect(box.max.x - box.min.x).toBeLessThan(1.1);
  });
});
