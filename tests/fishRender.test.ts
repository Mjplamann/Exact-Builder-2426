import { describe, expect, it } from 'vitest';
import type { BufferAttribute } from 'three';
import type { Sex, Species } from '../src/core/types';
import { ARCHETYPES } from '../src/core/enums';
import { ARCHETYPE_PRESETS, resolveBody, resolveLook, sexMatters } from '../src/render/fish/archetypes';
import { ATLAS } from '../src/render/fish/atlas';
import { buildFishGeometry, lodFor } from '../src/render/fish/fishGeometry';
import { PART } from '../src/render/fish/geometryBuilder';
import { BodyProfile } from '../src/render/fish/profile';
import { rasterize, type Surface } from '../src/render/fish/patterns';
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

/** Vertices of one part (PART id) in a built geometry. */
function partCount(geo: import('three').BufferGeometry, part: number): number {
  const a = geo.getAttribute('aSpine') as BufferAttribute;
  let n = 0;
  for (let i = 0; i < a.count; i++) if (Math.round(a.getY(i)) === part) n++;
  return n;
}

/** A minimal valid species (biology copied from the neon) with the given body plan. */
function withBody(body: Species['body'], extra: Partial<Species> = {}): Species {
  const base = all.find((s) => s.id === 'paracheirodon-innesi') ?? all[0];
  return { ...base, id: `test-${body.archetype}`, body, ...extra } as Species;
}

describe('explicit body overrides beat archetype presets', () => {
  it('dorsal2: null removes the second dorsal (sturgeons on the shark preset)', () => {
    const sp = withBody({ archetype: 'shark', dorsal2: null });
    const body = resolveBody(sp, 'unknown');
    expect(body.dorsal2).toBeNull();
    const g = buildFishGeometry(body, lodFor(30, false));
    expect(partCount(g.fins, PART.dorsal2)).toBe(0);
    // The archetype default is still there when the data says nothing.
    expect(resolveBody(withBody({ archetype: 'shark' }), 'unknown').dorsal2).not.toBeNull();
  });

  it('barbels: 0 removes archetype barbels (leaffish chin barbel)', () => {
    const sp = withBody({ archetype: 'leaffish', barbels: 0 });
    const body = resolveBody(sp, 'unknown');
    expect(body.barbels).toBe(0);
    expect(partCount(buildFishGeometry(body, lodFor(8, false)).body, PART.barbel)).toBe(0);
    expect(partCount(buildFishGeometry(resolveBody(withBody({ archetype: 'leaffish' }), 'unknown'), lodFor(8, false)).body, PART.barbel)).toBeGreaterThan(0);
  });

  it('adipose: false removes the tetra adipose fin', () => {
    const body = resolveBody(withBody({ archetype: 'tetra', adipose: false }), 'unknown');
    expect(body.adipose).toBe(false);
    expect(partCount(buildFishGeometry(body, lodFor(4, false)).fins, PART.adipose)).toBe(0);
  });

  it('a sex override can remove a fin, and sex defaults never re-add removed parts', () => {
    const sp = withBody({ archetype: 'rainbowfish' }, { male: { body: { dorsal2: null, barbels: 0 } } });
    expect(resolveBody(sp, 'male').dorsal2).toBeNull();
    expect(resolveBody(sp, 'female').dorsal2).not.toBeNull();
  });

  it("a 'continuous' tail does not stretch an explicit short dorsal (featherbacks)", () => {
    const sp = withBody({
      archetype: 'knifefish',
      caudal: { shape: 'continuous', size: 0.06 },
      dorsal: { start: 0.46, end: 0.5, height: 0.07, shape: 'pointed' },
      anal: { start: 0.28, end: 1, height: 0.1, shape: 'low' },
    });
    const body = resolveBody(sp, 'unknown');
    expect(body.dorsal!.end).toBeCloseTo(0.5, 5);
    expect(body.anal!.end).toBeCloseTo(1, 5);
  });

  it("a species' own snout drops the archetype's snout extension; 'beak' on slender fish stays slim", () => {
    const pointed = resolveBody(withBody({ archetype: 'needlefish', snout: 'pointed' }), 'unknown');
    expect(pointed.snoutLength).toBe(0);
    const beak = resolveBody(withBody({ archetype: 'pike', snout: 'beak', depth: 0.14 }), 'unknown');
    expect(beak.snout).not.toBe('beak');
    const prof = new BodyProfile(beak);
    // Slim jaws: the head near the tip is far narrower than the body.
    expect(prof.halfWidth(0.03)).toBeLessThan(0.35 * prof.halfWidth(0.4));
    expect(resolveBody(withBody({ archetype: 'parrotfish', snout: 'beak' }), 'unknown').snout).toBe('beak');
  });
});

describe('pattern DSL: curved bands', () => {
  const surf = (opX?: number): Surface => {
    const w = 120, h = 60;
    const px = new Float32Array(w), py = new Float32Array(h), hd = new Float32Array(w);
    for (let i = 0; i < w; i++) {
      px[i] = (i + 0.5) / w;
      hd[i] = 0.2;
    }
    for (let j = 0; j < h; j++) py[j] = 1 - (2 * (j + 0.5)) / h;
    return { w, h, px, py, hd, seed: 1, opX };
  };
  const centreX = (s: Surface, m: Float32Array, row: number) => {
    let sum = 0, wsum = 0;
    for (let c = 0; c < s.w; c++) {
      sum += m[row * s.w + c] * s.px[c];
      wsum += m[row * s.w + c];
    }
    return sum / wsum;
  };
  it('curve bows the band toward the tail at mid-height', () => {
    const s = surf();
    const m = new Float32Array(s.w * s.h);
    rasterize({ type: 'region', color: '#ffffff', x0: 0.4, x1: 0.5, y0: -1, y1: 1, curve: 1 }, s, m);
    expect(centreX(s, m, Math.floor(s.h / 2))).toBeGreaterThan(centreX(s, m, 1) + 0.03);
  });
  it('a full-height head bar follows the gill cover automatically', () => {
    const s = surf(0.28);
    const m = new Float32Array(s.w * s.h);
    rasterize({ type: 'bars', color: '#ffffff', count: 1, width: 0.06, x0: 0.25, x1: 0.25 }, s, m);
    expect(centreX(s, m, Math.floor(s.h / 2))).toBeGreaterThan(centreX(s, m, 1) + 0.02);
    const flat = new Float32Array(s.w * s.h);
    rasterize({ type: 'bars', color: '#ffffff', count: 1, width: 0.06, x0: 0.25, x1: 0.25, curve: 0 }, s, flat);
    expect(Math.abs(centreX(s, flat, Math.floor(s.h / 2)) - centreX(s, flat, 1))).toBeLessThan(0.005);
  });
});

describe('fin & pattern details', () => {
  it('a long spiny dorsal without a second dorsal gets a lower spiny part and a taller soft lobe', () => {
    const clown = all.find((s) => s.id === 'amphiprion-ocellaris');
    if (!clown) return;
    const body = resolveBody(clown, 'unknown');
    const g = buildFishGeometry(body, lodFor(11, false));
    const spine = g.fins.getAttribute('aSpine') as BufferAttribute;
    // aFin = (w along the ray, u·2−1 along the fin base, side/flow, distance from the base).
    const fin = g.fins.getAttribute('aFin') as BufferAttribute;
    let front = 0, rear = 0;
    for (let i = 0; i < fin.count; i++) {
      if (Math.round(spine.getY(i)) !== PART.dorsal) continue;
      const u = (fin.getY(i) + 1) / 2;
      if (u < 0.5) front = Math.max(front, fin.getW(i));
      else if (u > 0.62) rear = Math.max(rear, fin.getW(i));
    }
    expect(rear).toBeGreaterThan(front);
  });

  it("a blotch's softness controls its edge (crisp markings stay crisp)", () => {
    const w = 200, h = 100;
    const px = new Float32Array(w), py = new Float32Array(h), hd = new Float32Array(w).fill(0.2);
    for (let i = 0; i < w; i++) px[i] = (i + 0.5) / w;
    for (let j = 0; j < h; j++) py[j] = 1 - (2 * (j + 0.5)) / h;
    const s: Surface = { w, h, px, py, hd, seed: 1 };
    const partial = (soft?: number) => {
      const m = new Float32Array(w * h);
      rasterize({ type: 'blotch', color: '#000000', x: 0.5, y: 0, rx: 0.2, ry: 0.6, softness: soft }, s, m);
      let n = 0;
      for (const v of m) if (v > 0.05 && v < 0.95) n++;
      return n;
    };
    expect(partial(0.05)).toBeLessThan(partial() * 0.5);
  });

  it('eyes have no white sclera and a near-black iris still reads as a ring around the pupil', () => {
    const tang = all.find((s) => s.id === 'paracanthurus-hepatus');
    if (!tang) return;
    const body = resolveBody(tang, 'unknown');
    const g = buildFishGeometry(body, lodFor(25, false));
    const tex = paintFishAtlas(tang, body, resolveLook(tang, 'unknown'), g.info.profile!, 128);
    const img = tex.map.image as { data: Uint8Array; width: number; height: number };
    // Eye cell: sample the pupil centre and a point on the iris ring.
    const cell = ATLAS.eye;
    const at = (lx: number, ly: number) => {
      const x = Math.floor((cell.x + cell.w * lx) * img.width), y = Math.floor((cell.y + cell.h * ly) * img.height);
      const i = (y * img.width + x) * 4;
      return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    };
    const pupil = at(0.5, 0.5), iris = at(0.5 + 0.34, 0.5);
    expect(iris).toBeGreaterThan(pupil + 8);
    // Nothing in the eye is near-white.
    for (let ly = 0.1; ly < 0.9; ly += 0.05) for (let lx = 0.1; lx < 0.9; lx += 0.05) expect(at(lx, ly)).toBeLessThan(200);
    tex.dispose();
  });
});
