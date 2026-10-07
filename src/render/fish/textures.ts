import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type ColorSpace,
} from 'three';
import type { Appearance, FinLook, Pattern, Species } from '../../core/types';
import { hashString } from '../../core/rng';
import type { FinDef, ResolvedBody } from './archetypes';
import { ATLAS, cellLocal, type Cell } from './atlas';
import { hex, luma, mix, type RGB } from './color';
import { compoundDorsal, rayCount } from './fins';
import { fastNoise, hash2, rasterize, rasterizeRing, smooth, valueNoise, type Surface } from './patterns';
import type { BodyProfile } from './profile';

/**
 * Paints the per-variant texture atlas from the species' Appearance:
 *   map       RGBA  albedo (sRGB) + alpha (fins, translucent bodies)
 *   normal    RGB   tangent-space normal (scales, scutes, plates, fin rays, opercle edge)
 *   orm       RGB   R = iridescence mask, G = roughness, B = metalness (guanine)
 *   emissive  RGB   faint self-glow of "glow" stripes (scaled by daylight in the material)
 *   night     RGBA  night-time albedo for species with the 'night-coloration' trait
 *
 * Everything is CPU-painted into typed arrays (no canvas), so it also runs in tests.
 */

export interface FishTextures {
  N: number;
  map: DataTexture;
  normal: DataTexture;
  orm: DataTexture;
  emissive: DataTexture;
  night: DataTexture | null;
  hasGlow: boolean;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export interface Bufs {
  W: number;
  H: number;
  col: Float32Array;
  alpha: Float32Array;
  height: Float32Array;
  rough: Float32Array;
  metal: Float32Array;
  irid: Float32Array;
  /** Surface specular intensity (packed in ORM alpha): skin low, eye lens / shells higher. */
  spec: Float32Array;
  emis: Float32Array;
  mask: Float32Array;
  /** Thin-tissue mask (packed in the normal map's alpha): how much light passes through. */
  thin: Float32Array;
}

const scratchBySize = new Map<number, Bufs>();
export function bufs(N: number): Bufs {
  const W = 2 * N, H = N, n = W * H;
  let scratch = scratchBySize.get(N) ?? null;
  if (!scratch) {
    scratch = {
      W, H,
      col: new Float32Array(n * 3),
      alpha: new Float32Array(n),
      height: new Float32Array(n),
      rough: new Float32Array(n),
      metal: new Float32Array(n),
      irid: new Float32Array(n),
      spec: new Float32Array(n),
      emis: new Float32Array(n * 3),
      mask: new Float32Array(n),
      thin: new Float32Array(n),
    };
    scratchBySize.set(N, scratch);
  }
  const b = scratch;
  b.col.fill(0.5);
  b.alpha.fill(1);
  b.height.fill(0);
  b.rough.fill(0.45);
  b.metal.fill(0);
  b.irid.fill(0);
  b.spec.fill(0.5);
  b.emis.fill(0);
  b.thin.fill(0);
  return b;
}

/** Pixel rect of a cell. */
export function rect(c: Cell, W: number, H: number): [number, number, number, number] {
  return [Math.round(c.x * W), Math.round(c.y * H), Math.round(c.w * W), Math.round(c.h * H)];
}

/** Build a Surface over a cell rect: px/py from the cell-local mapping. */
export function cellSurface(c: Cell, W: number, H: number, toX: (lx: number) => number, toY: (ly: number) => number, hd: (x: number) => number, seed: number, fin: boolean): { s: Surface; x0: number; y0: number } {
  const [x0, y0, w, h] = rect(c, W, H);
  const px = new Float32Array(w), py = new Float32Array(h), hdA = new Float32Array(w);
  const tmp: [number, number] = [0, 0];
  for (let i = 0; i < w; i++) {
    cellLocal(c, (x0 + i + 0.5) / W, c.y + c.h * 0.5, tmp);
    px[i] = toX(tmp[0]);
    hdA[i] = hd(px[i]);
  }
  for (let j = 0; j < h; j++) {
    cellLocal(c, c.x + c.w * 0.5, (y0 + j + 0.5) / H, tmp);
    py[j] = toY(tmp[1]);
  }
  return { s: { w, h, px, py, hd: hdA, seed, fin }, x0, y0 };
}

/** Composite `color` over a sub-rect of the atlas through the region-local mask. */
export function composite(b: Bufs, s: Surface, x0: number, y0: number, color: RGB, alphaBoost = 0, strength = 1): void {
  const { W, col, alpha, mask } = b;
  for (let r = 0; r < s.h; r++) {
    for (let c = 0; c < s.w; c++) {
      const m = mask[r * s.w + c] * strength;
      if (m <= 0) continue;
      const i = (y0 + r) * W + x0 + c;
      col[i * 3] += (color[0] - col[i * 3]) * m;
      col[i * 3 + 1] += (color[1] - col[i * 3 + 1]) * m;
      col[i * 3 + 2] += (color[2] - col[i * 3 + 2]) * m;
      if (alphaBoost > 0) alpha[i] = Math.max(alpha[i], alpha[i] + (alphaBoost - alpha[i]) * m);
    }
  }
}

export function clearMask(b: Bufs, s: Surface): void {
  b.mask.fill(0, 0, s.w * s.h);
}

// ---------------------------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------------------------

interface BodyCtx {
  sp: Species;
  body: ResolvedBody;
  look: Appearance;
  prof: BodyProfile;
  seed: number;
}

/** Scale / scute / plate relief of the skin → height, edge mask and per-scale random value. */
function skinField(ctx: BodyCtx, x: number, y: number, hd: number, out: Float64Array): void {
  const { body, prof } = ctx;
  const Y = y * hd; // physical height (SL units)
  out[0] = 0; // height
  out[1] = 0; // edge (pigment) mask
  out[2] = 0.5; // per-scale random
  const head = prof.head.opercleX;
  switch (body.skin) {
    case 'scaled': {
      if (body.scaleSize <= 0.02 || x < head * 0.92) {
        out[0] = 0.05 * (fastNoise(x * 90, Y * 90) - 0.5);
        return;
      }
      const ncol = 62 - 40 * body.scaleSize;
      const sx = 1 / ncol, sy = sx * 0.64, R = sx * 0.78;
      const rowF = Y / sy;
      const r0 = Math.floor(rowF);
      let best = -1, bestCx = 1e9, bestD = 0, bestId = 0;
      for (let dr = -1; dr <= 2; dr++) {
        const row = r0 + dr;
        const cy = row * sy;
        const off = (row & 1) * 0.5;
        const ci = Math.floor(x / sx - off);
        for (let dc = -1; dc <= 1; dc++) {
          const col = ci + dc;
          // Real scale rows are not a perfect lattice: jitter each scale a little.
          const cx = (col + off + 0.18 * (hash2(col, row, 77) - 0.5)) * sx;
          const dx = x - cx, dy = Y - cy;
          const d = Math.sqrt(dx * dx + dy * dy * 1.15);
          if (d < R && cx < bestCx) {
            bestCx = cx;
            best = 1;
            bestD = d;
            bestId = hash2(col, row, 911);
          }
        }
      }
      if (best < 0) return;
      const e = (R - bestD) / R; // 0 at the free margin → 1 at the center
      // Overlapping shingles: the free margin is a soft step (the next scale's edge lies on top),
      // the exposed field slopes gently — no crisp, net-like ridges. Scales lie flatter toward
      // the back and belly, and each sits a little differently.
      const lie = (0.55 + 0.45 * hash2(Math.round(bestId * 9973), 7, 13)) * (1 - 0.45 * smooth(0.45, 0.95, Math.abs(y)));
      out[0] = (0.5 * smooth(0, 0.3, e) + 0.3 * (1 - e) - 0.2) * lie;
      out[1] = (1 - smooth(0.0, 0.14, e)) * lie;
      out[2] = bestId;
      return;
    }
    case 'scutes': {
      // Corydoras: two rows of overlapping bony plates meeting along the flank midline.
      if (x < head) {
        out[0] = 0.15 * (fastNoise(x * 40, Y * 40 + 5) - 0.5);
        out[2] = 0.5;
        return;
      }
      const n = 22 + 4 * (1 - body.depth);
      const q = (x - head) * n + Math.abs(y) * 1.1;
      const f = q - Math.floor(q);
      const seam = 1 - smooth(0, 0.22, Math.min(f, 1 - f));
      const zig = 0.06 * Math.sin(q * Math.PI * 2);
      const mid = 1 - smooth(0, 0.1, Math.abs(y - 0.02 - zig));
      out[0] = 0.22 * (1 - f) - 0.42 * seam - 0.38 * mid;
      out[1] = Math.max(seam, mid) * 0.8;
      out[2] = hash2(Math.floor(q), y > 0 ? 1 : 0, 51);
      return;
    }
    case 'plates': {
      // Loricariids: several rows of keeled plates with tiny odontodes.
      const n = 26;
      const rows = [-0.75, -0.35, 0.05, 0.45, 0.8];
      let ri = 0;
      while (ri < rows.length - 1 && y > (rows[ri] + rows[ri + 1]) / 2) ri++;
      const q = x * n + ri * 0.5 + Math.abs(y) * 0.6;
      const f = q - Math.floor(q);
      const seam = 1 - smooth(0, 0.1, Math.min(f, 1 - f));
      const rowSeam = 1 - smooth(0, 0.05, Math.abs(y - (ri > 0 ? (rows[ri - 1] + rows[ri]) / 2 : -2)));
      const odont = smooth(0.72, 0.95, fastNoise(x * 260, Y * 260 + 9));
      out[0] = 0.25 * (1 - f) - 0.4 * seam - 0.3 * rowSeam + 0.35 * odont;
      out[1] = Math.max(seam, rowSeam) * 0.35;
      out[2] = hash2(Math.floor(q), ri, 33);
      return;
    }
    case 'ganoid': {
      // Bichir / gar: rhombic interlocking scales in diagonal rows.
      const s = 1 / (40 - 20 * body.scaleSize);
      const u = (x + Y) / s, v = (x - Y) / s;
      const fu = u - Math.floor(u), fv = v - Math.floor(v);
      const groove = 1 - smooth(0, 0.08, Math.min(fu, 1 - fu, fv, 1 - fv));
      out[0] = 0.3 - 0.9 * groove;
      out[1] = groove;
      out[2] = hash2(Math.floor(u), Math.floor(v), 5);
      return;
    }
    case 'hex': {
      // Boxfish carapace: ~7 hexagonal bony plates along the box, each gently domed with a
      // granular centre, separated by narrow sutures.
      if (x < prof.head.snoutLen + 0.02 || x > 0.8) {
        out[0] = 0.08 * (fastNoise(x * 60, Y * 60) - 0.5);
        return;
      }
      const s = 0.082;
      const qx = x / s, qy = Y / (s * 0.866);
      const r = Math.round(qy);
      let best = 1e9, second = 1e9, id = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        const off = (rr & 1) * 0.5;
        const ci = Math.round(qx - off);
        for (let dc = -1; dc <= 1; dc++) {
          const cxx = ci + dc + off;
          const dx = qx - cxx, dy = (qy - rr) * 0.866;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < best) {
            second = best;
            best = d;
            id = hash2(Math.round(cxx * 2), rr, 3);
          } else if (d < second) second = d;
        }
      }
      const gap = second - best; // 0 on a suture
      const edge = 1 - smooth(0.0, 0.07, gap);
      const dome = 1 - smooth(0.05, 0.62, best);
      const gran = smooth(0.6, 0.85, fastNoise(x * 220, Y * 220)) * dome;
      out[0] = 0.2 * dome - 0.4 * edge + 0.15 * gran;
      out[1] = edge;
      out[2] = id;
      return;
    }
    case 'prickly': {
      const sp = smooth(0.78, 0.92, fastNoise(x * 140 + 3, Y * 140));
      out[0] = 0.5 * sp + 0.06 * (fastNoise(x * 30, Y * 30 + 11) - 0.5);
      out[1] = sp * 0.3;
      out[2] = 0.5;
      return;
    }
    case 'rings': {
      const n = 28;
      const q = x * n;
      const f = q - Math.floor(q);
      const ring = 1 - smooth(0, 0.14, Math.min(f, 1 - f));
      const ridge = 1 - smooth(0, 0.12, Math.abs(Math.abs(y) - 0.55));
      out[0] = 0.3 * Math.sin(f * Math.PI) - 0.7 * ring + 0.5 * ridge;
      out[1] = ring * 0.7;
      out[2] = hash2(Math.floor(q), 0, 9);
      return;
    }
    case 'naked':
    default: {
      // Smooth mucus-covered skin; faint myomere chevrons on the flank.
      const q = (x - Math.abs(y) * 0.06 * hd * 10) * 34;
      const f = q - Math.floor(q);
      out[0] = 0.08 * (1 - smooth(0, 0.1, Math.min(f, 1 - f))) * -1 + 0.04 * (fastNoise(x * 70 + 7, Y * 70) - 0.5);
      out[1] = 0;
      out[2] = 0.5;
      return;
    }
  }
}

function paintBody(b: Bufs, ctx: BodyCtx, look: Appearance, night: boolean): void {
  const { body, prof, seed } = ctx;
  const { W, H, col, alpha, height, rough, metal, irid, emis } = b;
  const { s, x0, y0 } = cellSurface(
    ATLAS.body, W, H,
    (lx) => lx,
    (ly) => 1 - 2 * ly,
    (x) => prof.textureHalfHeight(clamp(x, 0, 1)),
    seed, false,
  );
  const head = prof.head;
  s.eyeX = head.eyeX;
  s.eyeY = prof.patternY(head.eyeX, head.eyeY);

  const base = hex(look.base);
  const dorsal = look.dorsal ? hex(look.dorsal) : mix(base, [base[0] * 0.62, base[1] * 0.64, base[2] * 0.6], 1);
  const ventral = look.ventral ? hex(look.ventral) : mix(base, [0.93, 0.92, 0.88], 0.4);
  const metallic = clamp(look.metallic ?? 0, 0, 1);
  const iridAmt = clamp(look.iridescence ?? 0, 0, 1);
  const patterns = look.patterns ?? [];
  const hasIridPattern = patterns.some((p) => p.type === 'stripe' && p.iridescent);

  // 1. Countershading.
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    // Countershading: dorsal color over the top third, ventral over the bottom third.
    const wd = smooth(-0.05, 0.62, y);
    const wv = smooth(-0.05, -0.7, y);
    for (let c = 0; c < s.w; c++) {
      const x = s.px[c];
      const i = (y0 + r) * W + x0 + c;
      let cr = base[0] + (dorsal[0] - base[0]) * wd;
      let cg = base[1] + (dorsal[1] - base[1]) * wd;
      let cb = base[2] + (dorsal[2] - base[2]) * wd;
      cr += (ventral[0] - cr) * wv;
      cg += (ventral[1] - cg) * wv;
      cb += (ventral[2] - cb) * wv;
      // Thin darker dorsal midline and slightly lighter cheeks/throat.
      const ridge = 1 - 0.1 * smooth(0.88, 0.99, y);
      const cheek = x < head.opercleX ? 1 + 0.04 * smooth(0.1, -0.6, y) : 1;
      col[i * 3] = cr * ridge * cheek;
      col[i * 3 + 1] = cg * ridge * cheek;
      col[i * 3 + 2] = cb * ridge * cheek;
      alpha[i] = 1;
      // Guanine: lower flanks and belly reflect most; the back is darker and nearly matte (the
      // silver reflectors sit mostly below the lateral line, where the light comes from above).
      const mw = metallic * (1 - 0.82 * smooth(0.05, 0.85, y)) * (0.85 + 0.15 * smooth(-0.2, -0.9, y));
      metal[i] = mw;
      rough[i] = (body.skin === 'scaled' || body.skin === 'naked' ? 0.34 : 0.42) - 0.12 * mw;
      // A thin, wet mucus film: a soft sheen (specular intensity, ORM alpha).
      b.spec[i] = body.skin === 'scaled' || body.skin === 'naked' ? 0.8 : 0.6;
      // Thin tissue that lets light through: the belly wall, the dorsal ridge and the peduncle.
      b.thin[i] = 0.45 * smooth(-0.35, -0.9, y) + 0.3 * smooth(0.8, 0.98, y) + 0.35 * smooth(0.8, 0.97, x);
      irid[i] = hasIridPattern ? iridAmt * 0.15 * (1 - smooth(0.4, 1, Math.abs(y))) : iridAmt * 0.75 * (1 - smooth(0.25, 1, Math.abs(y - 0.05)));
      emis[i * 3] = emis[i * 3 + 1] = emis[i * 3 + 2] = 0;
    }
  }

  // 2. Patterns, in authored order.
  for (const p of patterns) {
    if (p.type === 'scales') continue; // painted with the skin field below
    let pat: Pattern = p;
    let color = hex(p.color);
    if (night) {
      // Night: structural colors (iridescent / glowing stripes) switch off; pigment pales.
      if (p.type === 'stripe' && (p.iridescent || p.glow)) color = mix(color, mix(base, [0.2, 0.2, 0.22], 0.35), 0.75);
      else color = mix(color, base, 0.25);
      if (p.type === 'stripe' && p.glow) pat = { ...p, glow: 0 };
    }
    if (p.type === 'blotch' && p.ring) {
      clearMask(b, s);
      rasterizeRing(p, s, b.mask);
      composite(b, s, x0, y0, hex(p.ring));
    }
    clearMask(b, s);
    if (!rasterize(pat, s, b.mask)) continue;
    composite(b, s, x0, y0, color);
    // Pigment cells (melanophores, erythrophores) sit over the guanine layer and hide it: dark or
    // saturated patterns are matte, white ones keep the silver.
    {
      const mx = Math.max(color[0], color[1], color[2]), mn = Math.min(color[0], color[1], color[2]);
      const hide = clamp(1.6 * (mx - mn) + 0.9 * (1 - luma(color)) - 0.15, 0, 0.9);
      if (hide > 0 && !(pat.type === 'stripe' && pat.iridescent)) {
        for (let r = 0; r < s.h; r++) {
          for (let c = 0; c < s.w; c++) {
            const m = b.mask[r * s.w + c];
            if (m > 0) metal[(y0 + r) * W + x0 + c] *= 1 - hide * m;
          }
        }
      }
    }
    const glow = pat.type === 'stripe' ? pat.glow ?? 0 : 0;
    const iridP = pat.type === 'stripe' && pat.iridescent;
    if (glow > 0 || iridP) {
      for (let r = 0; r < s.h; r++) {
        for (let c = 0; c < s.w; c++) {
          const m = b.mask[r * s.w + c];
          if (m <= 0) continue;
          const i = (y0 + r) * W + x0 + c;
          if (iridP) {
            irid[i] = Math.max(irid[i], m);
            metal[i] = Math.max(metal[i], 0.8 * m);
            rough[i] += (0.16 - rough[i]) * m;
          }
          if (glow > 0 || iridP) {
            // Structural colour (guanine reflectors) stays vivid even in dim water.
            const g = m * (0.3 * glow + (iridP ? 0.22 : 0));
            emis[i * 3] = Math.max(emis[i * 3], color[0] * g);
            emis[i * 3 + 1] = Math.max(emis[i * 3 + 1], color[1] * g);
            emis[i * 3 + 2] = Math.max(emis[i * 3 + 2], color[2] * g);
          }
        }
      }
    }
  }

  // Rays: the spiracles (water intakes) just behind the eyes on top of the head.
  if (body.kind === 'ray') {
    clearMask(b, s);
    const sx = head.eyeX + head.eyeR * 2.1;
    rasterize({ type: 'blotch', color: '#000000', x: sx, y: s.eyeY ?? 0.3, rx: head.eyeR * 0.75, ry: (head.eyeR * 0.55) / Math.max(0.02, prof.textureHalfHeight(sx)) }, s, b.mask);
    composite(b, s, x0, y0, mix(base, [0.03, 0.03, 0.03], 0.75), 0, 0.9);
    for (let k = 0; k < s.w * s.h; k++) if (b.mask[k] > 0) b.height[(y0 + Math.floor(k / s.w)) * W + x0 + (k % s.w)] -= 0.9 * b.mask[k];
  }

  // 3. Night pattern while resting. Freshwater characins and their kin break up their outline
  //    with diffuse dark saddles; many reef fish (tangs, damsels) instead show a pale lateral
  //    band with brownish patches.
  if (night) {
    const dark = mix(base, [0.08, 0.07, 0.06], 0.65);
    if (ctx.sp.water === 'marine') {
      const brown = mix(base, [0.32, 0.22, 0.14], 0.7);
      clearMask(b, s);
      rasterize({ type: 'blotch', color: '#000000', x: 0.45, y: 0.55, rx: 0.2, ry: 0.4 }, s, b.mask);
      rasterize({ type: 'blotch', color: '#000000', x: 0.62, y: -0.55, rx: 0.18, ry: 0.35 }, s, b.mask);
      composite(b, s, x0, y0, brown, 0, 0.6);
      clearMask(b, s);
      rasterize({ type: 'stripe', color: '#000000', y: 0.02, width: 0.32, x0: 0.25, x1: 0.95 }, s, b.mask);
      composite(b, s, x0, y0, mix(base, [0.95, 0.95, 0.92], 0.65), 0, 0.75);
    } else {
      clearMask(b, s);
      rasterize({ type: 'bars', color: '#000000', count: 3, width: 0.13, x0: 0.32, x1: 0.82, y0: -0.55, y1: 1 }, s, b.mask);
      composite(b, s, x0, y0, dark, 0, 0.55);
      clearMask(b, s);
      rasterize({ type: 'blotch', color: '#000000', x: 0.9, y: 0, rx: 0.06, ry: 0.4 }, s, b.mask);
      composite(b, s, x0, y0, dark, 0, 0.5);
    }
  }

  // 4. Skin relief, scale pigment, per-scale sparkle, anatomy and mottling.
  const scalesP = patterns.find((p) => p.type === 'scales') as Extract<Pattern, { type: 'scales' }> | undefined;
  const scaleCol = scalesP ? hex(scalesP.color) : null;
  const scaleContrast = scalesP ? clamp(scalesP.contrast, 0, 1) * 0.8 : 0.06 * body.scaleSize;
  const sk = new Float64Array(3);
  const eyePY = s.eyeY ?? 0;
  const eyeR = head.eyeR;
  const sL = head.snoutLen;
  const hasGape = body.mouth !== 'inferior' && body.mouth !== 'sucker';
  const opX = head.opercleX, hl = head.headLen;
  const llOn = body.skin === 'scaled' && body.scaleSize > 0.2;
  const translucent = clamp(look.translucency ?? 0, 0, 1);
  // Per-column / per-row precomputation keeps the per-pixel work to plain arithmetic.
  const gapeY = new Float32Array(s.w).fill(NaN);
  const gapeFade = new Float32Array(s.w);
  const llY = new Float32Array(s.w);
  const llPore = new Float32Array(s.w);
  const llFreq = (62 - 40 * body.scaleSize) * Math.PI * 2;
  for (let c = 0; c < s.w; c++) {
    const x = s.px[c];
    if (hasGape && x < head.rictusX + 0.01) {
      const t = clamp((x - sL * 0.85) / Math.max(1e-4, head.rictusX - sL * 0.85), 0, 1);
      gapeY[c] = prof.patternY(x, head.yTip - head.gapeDrop * t);
      gapeFade[c] = 1 - smooth(0.85, 1.0, t);
    }
    llY[c] = 0.05 + 0.42 * (1 - smooth(0.2, 0.92, x));
    llPore[c] = 0.5 + 0.5 * Math.cos(x * llFreq);
  }
  const opRow = new Float32Array(s.h), preRow = new Float32Array(s.h);
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    opRow[r] = opX - hl * 0.22 * (y + 0.1) * (y + 0.1);
    preRow[r] = opX - hl * 0.36 - hl * 0.12 * (y + 0.2) * (y + 0.2);
  }
  const noiseOff = (ctx.seed % 257) * 0.123;
  const transOn = translucent > 0.42;
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    const op = opRow[r], pre = preRow[r];
    const opRowOn = y > -0.9 && y < 0.62, preOn = y > -0.8 && y < 0.35, slitOn = y > -0.8 && y < 0.4;
    for (let c = 0; c < s.w; c++) {
      const x = s.px[c];
      const hd = s.hd[c];
      const i = (y0 + r) * W + x0 + c;
      skinField(ctx, x, y, hd, sk);
      if (!night) height[i] = sk[0];
      let k = 1;
      // Scale margins carry melanophores (or the authored 'scales' color).
      const edge = sk[1] * scaleContrast;
      if (edge > 0 && !scaleCol) k *= 1 - 0.45 * edge;
      if (body.skin === 'hex' && sk[2] !== 0.5) {
        // Bony plates: each plate a slightly different tone, sutures darker, centres paler.
        k *= (1 + 0.07 * (sk[2] - 0.5)) * (1 - 0.16 * sk[1]) * (1 + 0.05 * (1 - sk[1]));
        if (!night) rough[i] = clamp(0.5 + 0.1 * sk[1], 0.08, 0.9);
      }
      if (body.skin === 'scaled' && body.scaleSize > 0.02 && x > opX * 0.92) {
        // Every scale catches the light a little differently and its pigment is densest at the
        // centre, thinning toward the free margin where the silvery reflectors show through.
        const ss = Math.min(1, 0.2 + body.scaleSize);
        const centre = 1 - sk[1];
        k *= 1 + 0.06 * ss * (sk[2] - 0.5) - 0.05 * smooth(0.3, 0.8, body.scaleSize) * centre * (1 - metallic);
      }
      if (!night) {
        // Guanine platelets: each scale reflects a little differently (the glitter of a shoal).
        metal[i] *= 1 + (0.5 * body.scaleSize) * (sk[2] - 0.5) + 0.25 * sk[1];
        rough[i] = clamp(rough[i] + 0.04 * sk[1] - 0.03 * (sk[2] - 0.5), 0.08, 0.9);
      }
      // --- head anatomy ---
      if (x < opX + 0.04) {
        if (opRowOn) {
          // Opercle (gill cover) rear edge: a convex backward arc, slightly raised.
          const dxo = (x - op) / Math.max(0.0025, 0.004 + 0.002 * hd);
          if (dxo > -4 && dxo < 4) {
            k *= 1 - 0.22 * Math.exp(-dxo * dxo);
            if (dxo < 0 && dxo > -3) k *= 1 + 0.04 * (1 + dxo / 3);
            if (!night) height[i] += 0.5 * smooth(1.5, -1.5, dxo) - 0.25;
          } else if (!night && dxo <= -4) height[i] += 0.25;
          else if (!night) height[i] -= 0.25;
        }
        if (preOn) {
          const dxp = (x - pre) / 0.004;
          if (dxp > -4 && dxp < 4) k *= 1 - 0.07 * Math.exp(-dxp * dxp);
        }
        // Eye socket ring and nostrils.
        const ex = (x - head.eyeX) / eyeR, ey = ((y - eyePY) * hd) / eyeR;
        const de2 = ex * ex + ey * ey;
        if (de2 < 6.5) {
          const de = Math.sqrt(de2);
          // A faint shadowed rim where the eye sits in its orbit (no drawn ring).
          k *= 1 - 0.12 * smooth(0.92, 1.02, de) * (1 - smooth(1.05, 1.3, de));
          if (de < 1) k *= 0.75;
          const nx = (ex + 1.55) / 0.16, ny = (ey - 0.45) / 0.16;
          const nn = nx * nx + ny * ny;
          if (nn < 4) k *= 1 - 0.35 * Math.exp(-nn);
        }
        // Gape (mouth line) with lips.
        const gy = gapeY[c];
        if (gy === gy) {
          const d = ((y - gy) * hd) / 0.0045;
          if (d > -5 && d < 5) {
            const fade = gapeFade[c];
            k *= 1 - 0.5 * Math.exp(-d * d) * fade;
            const lip = Math.exp(-((Math.abs(d) - 2.2) ** 2) / 1.5) * fade;
            k *= 1 + 0.1 * lip * body.lips;
          }
        }
      }
      // Gill slit glimpse (red filaments) just behind the opercle.
      if (slitOn && x > opX - 0.01 && x < opX + 0.02) {
        const d = (x - op - 0.004) / 0.003;
        const g = Math.exp(-d * d) * 0.25;
        col[i * 3] += (0.45 - col[i * 3]) * g;
        col[i * 3 + 1] += (0.1 - col[i * 3 + 1]) * g;
        col[i * 3 + 2] += (0.1 - col[i * 3 + 2]) * g;
      }
      // Lateral line: a faint canal with a row of darker pores.
      if (llOn && x > opX && x < 0.97) {
        const dl = ((y - llY[c]) * hd) / 0.0035;
        if (dl > -4 && dl < 4) k *= 1 - (0.035 + 0.11 * llPore[c]) * Math.exp(-dl * dl) * smooth(opX, opX + 0.05, x);
      }
      // Darker dorsal midline (the nape and the base of the dorsal fin).
      if (y > 0.82) k *= 1 - 0.1 * smooth(0.82, 0.98, y) * smooth(head.snoutLen, opX, x);
      // Low-frequency mottling + fine grain so no surface is flat CG color, and a gentle natural
      // countershading on top of the authored colours: the back a little deeper, the belly paler.
      k *= 1 + 0.1 * (fastNoise(x * 9 + noiseOff, y * hd * 9) - 0.5) + 0.05 * (fastNoise(x * 110, y * hd * 110 + noiseOff) - 0.5);
      // Melanophores: fine dark pigment dots, densest over the back and fading toward the belly.
      const mel = smooth(0.7, 0.92, fastNoise(x * 330 + noiseOff, y * hd * 330)) * (0.25 + 0.75 * smooth(-0.4, 0.8, y));
      k *= 1 - 0.14 * mel;
      k *= (1 - 0.14 * smooth(0.25, 1, y)) * (1 + 0.06 * smooth(-0.3, -1, y));
      // Semi-translucent small fish (tetras, rasboras): the flank muscle lets light through
      // rather than scattering it back, so it reads darker and greener against the water, with
      // the shadow of the vertebral column showing along the axis.
      if (translucent > 0.08 && !transOn) {
        const flankT = translucent * smooth(-0.1, 0.55, y) * smooth(opX, opX + 0.08, x);
        k *= 1 - 0.75 * flankT;
        const spineSh = Math.exp(-((((y - 0.14) * hd) / 0.007) ** 2)) * smooth(opX, opX + 0.1, x) * (1 - smooth(0.9, 1, x));
        k *= 1 - 0.35 * translucent * spineSh;
        b.thin[i] = Math.max(b.thin[i], 1.4 * flankT);
      }
      if (scaleCol && edge > 0) {
        col[i * 3] += (scaleCol[0] - col[i * 3]) * edge;
        col[i * 3 + 1] += (scaleCol[1] - col[i * 3 + 1]) * edge;
        col[i * 3 + 2] += (scaleCol[2] - col[i * 3 + 2]) * edge;
      }
      col[i * 3] *= k;
      col[i * 3 + 1] *= k;
      col[i * 3 + 2] *= k;
      // Translucent bodies: flesh lets light through; head, viscera and spine stay opaque.
      if (transOn) {
        const vx = (x - 0.3) / 0.17, vy = (y + 0.35) / 0.5;
        const viscera = 1 - smooth(0.75, 1.05, Math.sqrt(vx * vx + vy * vy));
        const spineL = Math.exp(-((((y - 0.12) * hd) / 0.006) ** 2)) * smooth(0.15, 0.3, x) * (1 - smooth(0.97, 1, x));
        const headO = 1 - smooth(opX * 0.75, opX * 1.05, x);
        // Ribs / pleural bones fan down and back from the spine over the abdomen; fine
        // intermuscular bones hint the myomeres along the tail.
        const ribPhase = (x - 0.12 * (0.12 - y) * hd * 8) * 46;
        const rib = (1 - smooth(0.06, 0.16, Math.abs(ribPhase - Math.round(ribPhase)))) *
          smooth(opX, opX + 0.05, x) * (1 - smooth(0.85, 0.95, x)) * smooth(-0.75, -0.4, y) * (1 - smooth(0.05, 0.12, y));
        const opaque = clamp(Math.max(viscera * 0.95, spineL * 0.55, headO * 0.6, rib * 0.35), 0, 1);
        if (rib > 0) {
          col[i * 3] *= 1 - 0.25 * rib;
          col[i * 3 + 1] *= 1 - 0.25 * rib;
          col[i * 3 + 2] *= 1 - 0.2 * rib;
        }
        alpha[i] = clamp(1 - translucent * (1 - opaque), 0.08, 1);
        b.thin[i] = Math.max(b.thin[i], 1 - opaque);
        if (viscera > 0 && !night) {
          // The silvery peritoneal sac of glassfish / glass catfish.
          metal[i] = Math.max(metal[i], 0.75 * viscera);
          rough[i] = Math.min(rough[i], 0.3);
          col[i * 3] += (0.78 - col[i * 3]) * viscera * 0.6;
          col[i * 3 + 1] += (0.8 - col[i * 3 + 1]) * viscera * 0.6;
          col[i * 3 + 2] += (0.82 - col[i * 3 + 2]) * viscera * 0.6;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Fins & eye
// ---------------------------------------------------------------------------------------------

type FinName = 'caudal' | 'dorsal' | 'dorsal2' | 'anal' | 'pelvic' | 'pectoral';

function paintFin(b: Bufs, ctx: BodyCtx, look: Appearance, name: FinName, def: FinDef | null): void {
  const { body } = ctx;
  const cell = ATLAS[name];
  const lookKey = name === 'dorsal2' ? 'dorsal' : name;
  const fl: FinLook = look.fins?.[lookKey] ?? {};
  const finCol = hex(fl.color ?? look.fin);
  const op = clamp(fl.opacity ?? look.finOpacity, 0, 1);
  const edgeCol = fl.edge ? hex(fl.edge) : null;
  const ew = edgeCol ? clamp(fl.edgeWidth ?? 0.1, 0.01, 0.6) : 0;
  const nRays = Math.max(3, rayCount(name === 'dorsal2' ? 'dorsal' : name, def, body));
  const bodyBase = hex(name === 'dorsal' || name === 'dorsal2' ? look.dorsal ?? look.base : name === 'anal' || name === 'pelvic' ? look.ventral ?? look.base : look.base);
  const shape = name === 'caudal' ? body.caudal.shape : def?.shape ?? 'rounded';
  const len = name === 'caudal' ? Math.max(0.05, body.caudal.size) : Math.max(0.03, def?.height ?? 0.15);
  const across = name === 'caudal' ? len * 1.1 : Math.max(0.02, (def ? def.end - def.start : 0.1) * 0.5 + len * 0.2);
  const { s, x0, y0 } = cellSurface(cell, b.W, b.H, (lx) => lx, (ly) => ly * 2 - 1, () => (across * 0.5) / len, ctx.seed + hashString(name), true);
  const { W, col, alpha, height, rough, metal, irid } = b;
  const spiny = shape === 'spiny';
  // Incised spiny membrane: the spiny part of a compound dorsal, or the whole of a spiny fin.
  const spinyEnd = name === 'dorsal' && compoundDorsal(body) ? 0.56 : name === 'dorsal' || name === 'dorsal2' ? 1 : 0.6;
  const crown = shape === 'crowntail';
  const separated = shape === 'fan' && body.finRays < 0.9; // lionfish-style free rays
  const clear = op < 0.35;
  // Clear membranes scatter little light of their own (they read by what shows through them);
  // the bony rays are only a little denser.
  const clearK = clear ? 0.72 : 1;
  const rayCol: RGB = clear ? mix(finCol, [finCol[0] * 0.85, finCol[1] * 0.85, finCol[2] * 0.82], 0.5) : mix(finCol, [finCol[0] * 0.78, finCol[1] * 0.78, finCol[2] * 0.78], 0.7);
  const iridFin = clamp(look.iridescence ?? 0, 0, 1) * 0.25;
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    const u = (y + 1) / 2;
    for (let c = 0; c < s.w; c++) {
      const x = s.px[c];
      const i = (y0 + r) * W + x0 + c;
      // Rays: dichotomously branching beyond mid-length, finer toward the tip.
      const rp = u * nRays - 0.5;
      const ri = Math.round(rp);
      let d = Math.abs(rp - ri);
      if (x > 0.45) {
        const split = 0.22 * smooth(0.45, 1, x);
        d = Math.min(Math.abs(rp - ri - split), Math.abs(rp - ri + split));
      }
      const rw = 0.1 * (1 - 0.5 * x) + 0.018;
      const ray = 1 - smooth(rw * 0.55, rw * 1.5, d);
      // Each ray is segmented on its own: joints are staggered from ray to ray (aligned joints
      // read as a woven mesh once a fin is in sharp focus at close range).
      const seg = (x * (12 + 4 * x) + 0.43 * hash2(ri, 3, ctx.seed)) % 1;
      const joint = ray * Math.exp(-((seg - 0.5) ** 2) / 0.003);
      // Membrane incisions between spines / reduced webbing.
      const between = Math.abs(rp - ri); // 0 on a ray, 0.5 midway
      let cut = 0;
      // (the membrane between two spine tips is a rounded, concave notch, not a square cut)
      const notch = Math.pow(Math.sin(Math.PI * between), 0.8);
      if (spiny && u < spinyEnd) cut = (spinyEnd < 1 ? 0.2 : 0.3) * notch * smooth(0, 0.04, spinyEnd - u);
      if (crown) cut = 0.45 * smooth(0.06, 0.5, between);
      if (separated) cut = 0.55 * smooth(0.08, 0.5, between);
      const eLocal = 1 - cut;
      const membrane = 1 - smooth(eLocal - 0.025, eLocal + 0.01, x);
      // The membrane is a thin, clear-ish film: thinnest midway between rays and toward the
      // margin; rays are bony and denser; the very edge fades out softly.
      const gap = smooth(0.12, 0.5, between);
      let a = (clear ? op * (0.78 - 0.32 * x) : op * (1 - 0.24 * x)) * (1 - (clear ? 0.25 : 0.12) * gap) * membrane;
      a = Math.max(a, (clear ? Math.min(0.36, op * 0.95 + 0.05) : Math.min(1, op + 0.12)) * ray * (1 - 0.35 * smooth(0.85, 1, x)));
      a = Math.max(a, 0.02);
      let cr = finCol[0], cg = finCol[1], cb = finCol[2];
      cr += (rayCol[0] - cr) * ray * 0.6;
      cg += (rayCol[1] - cg) * ray * 0.6;
      cb += (rayCol[2] - cb) * ray * 0.6;
      // Ray joints: faint pale segment lines (clear fins) or darker nodes (pigmented fins).
      const jk = clear ? 1 + 0.25 * joint : 1 - 0.07 * joint;
      cr *= jk;
      cg *= jk;
      cb *= jk;
      // Membrane: finer streaks along the rays; pigment densest near the base, the thin outer
      // membrane paler and clearer.
      const streak = 1 + 0.06 * (fastNoise(x * 3 + (ctx.seed % 17), y * 60) - 0.5);
      const deep = 1 - 0.14 * (1 - smooth(0.1, 0.7, x)) * (clear ? 0.3 : 1);
      const pale = 0.12 * smooth(0.5, 1, x) * gap * (clear ? 0.5 : 1);
      cr = (cr * deep + (0.9 - cr) * pale) * streak;
      cg = (cg * deep + (0.88 - cg) * pale) * streak;
      cb = (cb * deep + (0.84 - cb) * pale) * streak;
      // Fleshy fin base takes a little of the body color (the fin still reads as a fin).
      const fb = 1 - smooth(0, 0.08, x);
      cr += (bodyBase[0] - cr) * fb * 0.35;
      cg += (bodyBase[1] - cg) * fb * 0.35;
      cb += (bodyBase[2] - cb) * fb * 0.35;
      a = Math.max(a, 0.8 * fb);
      // Edge band.
      if (edgeCol) {
        // The pigmented margin follows the membrane's own edge (also along incisions).
        const eb = smooth(eLocal - ew - 0.03, eLocal - ew + 0.01, x);
        cr += (edgeCol[0] - cr) * eb;
        cg += (edgeCol[1] - cg) * eb;
        cb += (edgeCol[2] - cb) * eb;
        a = Math.max(a, Math.max(op, 0.7) * eb * (1 - 0.3 * gap) * Math.max(membrane, ray > 0.3 ? 1 : 0));
      }
      // Soft, transparent outer margin (a pigmented edge band stays crisp to the very edge).
      a *= 1 - (edgeCol ? 0.25 * smooth(0.96, 1, x) : 0.6 * smooth(0.86, 1, x) * (1 - 0.5 * ray));
      const n = (1 + 0.06 * (fastNoise(x * 18 + (ctx.seed % 31), y * 30) - 0.5)) * (clearK + (1 - clearK) * fb);
      col[i * 3] = cr * n;
      col[i * 3 + 1] = cg * n;
      col[i * 3 + 2] = cb * n;
      alpha[i] = clamp(a, 0, 1);
      height[i] = ray * 0.5 + joint * 0.15 - 0.1 * gap;
      rough[i] = 0.38 - 0.08 * ray;
      metal[i] = 0;
      irid[i] = iridFin;
      b.spec[i] = 0.5;
      b.thin[i] = 1 - 0.5 * fb - 0.3 * ray;
    }
  }
  // Fin patterns (pigment is opaque: raise alpha where painted).
  for (const p of fl.patterns ?? []) {
    if (p.type === 'scales' || p.type === 'mask') continue;
    const color = hex(p.color);
    if (p.type === 'blotch' && p.ring) {
      clearMask(b, s);
      rasterizeRing(p, s, b.mask);
      composite(b, s, x0, y0, hex(p.ring), Math.max(op, 0.8));
    }
    clearMask(b, s);
    if (!rasterize(p, s, b.mask)) continue;
    composite(b, s, x0, y0, color, Math.max(op, 0.8));
  }
}

function paintAdipose(b: Bufs, look: Appearance, seed: number): void {
  const cell = ATLAS.adipose;
  const [x0, y0, w, h] = rect(cell, b.W, b.H);
  const c0 = mix(hex(look.dorsal ?? look.base), hex(look.fin), 0.45);
  const op = clamp(Math.max(0.55, look.fins?.dorsal?.opacity ?? look.finOpacity), 0, 1);
  const tmp: [number, number] = [0, 0];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cellLocal(cell, (x0 + c + 0.5) / b.W, (y0 + r + 0.5) / b.H, tmp);
      const i = (y0 + r) * b.W + x0 + c;
      const n = 1 + 0.08 * (valueNoise(tmp[0] * 10, tmp[1] * 10, seed) - 0.5);
      b.col[i * 3] = c0[0] * n;
      b.col[i * 3 + 1] = c0[1] * n;
      b.col[i * 3 + 2] = c0[2] * n;
      b.alpha[i] = Math.max(op, 0.7) * (1 - 0.5 * smooth(0.85, 1, tmp[0]));
      b.rough[i] = 0.4;
      b.height[i] = 0;
      b.thin[i] = 0.8;
    }
  }
}

function paintEye(b: Bufs, look: Appearance, body: ResolvedBody, seed: number): void {
  // A fish eye shows no white: a large dark pupil, a narrow iris ring (often guanine-silvered
  // or gold/red), all under a clear cornea; the rim sinks into a dark socket.
  const cell = ATLAS.eye;
  const [x0, y0, w, h] = rect(cell, b.W, b.H);
  const irisRaw = hex(look.eye, [0.62, 0.58, 0.46]);
  // Iris pigment reads deeper than the authored swatch; very light irises are silvery.
  // A near-black authored iris still shows a dim ring (olive-brown, tinted by the head colour)
  // around the black pupil — real eyes are never a solid black bead.
  const headC = hex(look.base);
  const rawLift: RGB = luma(irisRaw) < 0.22 ? mix(irisRaw, mix([0.5, 0.42, 0.24], headC, 0.3), 0.62) : irisRaw;
  const lumI = luma(rawLift);
  const iris: RGB = mix([rawLift[0] * 0.72, rawLift[1] * 0.72, rawLift[2] * 0.72], [lumI * 0.7, lumI * 0.7, lumI * 0.72], 0.15);
  const irisDark: RGB = [iris[0] * 0.3, iris[1] * 0.3, iris[2] * 0.3];
  const maskP = (look.patterns ?? []).find((p) => p.type === 'mask') as Extract<Pattern, { type: 'mask' }> | undefined;
  const maskCol = maskP ? hex(maskP.color) : null;
  const tmp: [number, number] = [0, 0];
  const pupilR = body.kind === 'fish' ? 0.56 : 0.6;
  const irisOut = 0.83;
  const silvered = Math.min(1, lumI * 1.8);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cellLocal(cell, (x0 + c + 0.5) / b.W, (y0 + r + 0.5) / b.H, tmp);
      const ex = tmp[0] * 2 - 1, ey = tmp[1] * 2 - 1;
      // Teleost pupils are round, often with a small aphakic notch toward the snout.
      const notch = 0.05 * Math.exp(-((Math.atan2(ey, -ex) / 0.35) ** 2));
      const rad = Math.sqrt((ex / 1.04) * (ex / 1.04) + ey * ey);
      const ang = Math.atan2(ey, ex);
      const i = (y0 + r) * b.W + x0 + c;
      let cr: number, cg: number, cb: number, rough: number, metal: number;
      if (rad < pupilR + notch) {
        // Pupil: deep blue-black; the lens behind it gives a faint depth gradient.
        const g = 0.012 + 0.018 * (rad / pupilR);
        cr = g * 0.75;
        cg = g * 0.85;
        cb = g;
        rough = 0.03;
        metal = 0;
      } else if (rad < irisOut + 0.04) {
        const t = Math.min(1, (rad - pupilR) / (irisOut - pupilR));
        const stri = 0.85 + 0.3 * valueNoise(ang * 14 + 50, t * 4, seed);
        // Thin bright pupillary margin, the iris body, darkening into the limbus.
        let cc = mix(iris, irisDark, smooth(0.45, 1, t) * 0.75);
        cc = mix(cc, mix(iris, [0.85, 0.82, 0.72], 0.25), Math.exp(-(((t - 0.05) / 0.06) ** 2)) * 0.4);
        // The upper iris is usually darker (pigment shading the eye from above).
        cc = mix(cc, irisDark, smooth(0.0, 0.9, ey) * 0.4);
        if (maskCol && Math.abs(ex) < 0.45) cc = mix(cc, maskCol, 0.8 * (1 - smooth(0.3, 0.45, Math.abs(ex))));
        cr = cc[0] * stri;
        cg = cc[1] * stri;
        cb = cc[2] * stri;
        rough = 0.22;
        // Iridophores silver or gild the iris (reflecting in the iris's own colour).
        metal = (0.15 + 0.3 * silvered) * (1 - smooth(0.4, 1, t));
      } else {
        // Outside the iris: a narrow dark limbus, then the transparent skin that covers the rim of
        // the eyeball takes the head colour — the eye sits *in* the head, not on it.
        const t = smooth(0.87, 0.95, rad);
        const bodyC = hex(look.base);
        const cc = mix(mix(irisDark, [0.03, 0.03, 0.035], 0.5), [bodyC[0] * 0.8, bodyC[1] * 0.8, bodyC[2] * 0.8], t);
        cr = cc[0];
        cg = cc[1];
        cb = cc[2];
        rough = 0.25;
        metal = 0;
      }
      b.col[i * 3] = cr;
      b.col[i * 3 + 1] = cg;
      b.col[i * 3 + 2] = cb;
      b.alpha[i] = 1;
      b.rough[i] = rough;
      b.metal[i] = metal;
      b.irid[i] = 0;
      // The cornea is a clear, smooth lens over everything inside the rim.
      b.spec[i] = rad < 0.95 ? 1 : 0.4;
      b.height[i] = 0;
      b.thin[i] = 0;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------------------------

function tex(data: Uint8Array, W: number, H: number, cs: ColorSpace): DataTexture {
  const t = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  t.colorSpace = cs;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  // Small fish are seen at grazing angles and a few dozen pixels: keep stripes and eyes crisp.
  t.anisotropy = 8;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

const to8 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);
/** Biological whites reflect ≤ ~85%: soft-compress albedo above 0.7 so whites don't overexpose. */
const albedo8 = (v: number) => to8(v < 0.7 ? v : 0.7 + (v - 0.7) * 0.55);

function packColor(b: Bufs, withAlpha = true): Uint8Array {
  const n = b.W * b.H;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = albedo8(b.col[i * 3]);
    out[i * 4 + 1] = albedo8(b.col[i * 3 + 1]);
    out[i * 4 + 2] = albedo8(b.col[i * 3 + 2]);
    out[i * 4 + 3] = withAlpha ? to8(b.alpha[i]) : 255;
  }
  return out;
}

function packNormal(b: Bufs, strength: number): Uint8Array {
  const { W, H, height } = b;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const hl = height[y * W + Math.max(0, x - 1)], hr = height[y * W + Math.min(W - 1, x + 1)];
      const hu = height[Math.max(0, y - 1) * W + x], hd = height[Math.min(H - 1, y + 1) * W + x];
      const dx = (hr - hl) * 0.5 * strength, dy = (hd - hu) * 0.5 * strength;
      const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      out[i * 4] = to8(-dx * il * 0.5 + 0.5);
      out[i * 4 + 1] = to8(-dy * il * 0.5 + 0.5);
      out[i * 4 + 2] = to8(il * 0.5 + 0.5);
      out[i * 4 + 3] = to8(b.thin[i]);
    }
  }
  return out;
}

function packOrm(b: Bufs): Uint8Array {
  const n = b.W * b.H;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = to8(b.irid[i]);
    out[i * 4 + 1] = to8(b.rough[i]);
    out[i * 4 + 2] = to8(b.metal[i]);
    out[i * 4 + 3] = to8(b.spec[i]);
  }
  return out;
}

function packEmissive(b: Bufs): { data: Uint8Array; any: boolean } {
  const n = b.W * b.H;
  const out = new Uint8Array(n * 4);
  let any = false;
  for (let i = 0; i < n; i++) {
    const r = to8(b.emis[i * 3]), g = to8(b.emis[i * 3 + 1]), bl = to8(b.emis[i * 3 + 2]);
    if (r | g | bl) any = true;
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = bl;
    out[i * 4 + 3] = 255;
  }
  return { data: out, any };
}

let blackTex: DataTexture | null = null;
/** Shared 1×1 black texture (no glow / no night map). */
export function blackTexture(): DataTexture {
  if (!blackTex) {
    blackTex = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    blackTex.needsUpdate = true;
  }
  return blackTex;
}

/** Atlas resolution: tiny fish never fill many pixels; big ones get a sharper atlas. */
export function atlasSizeFor(adultLengthCm: number, forThumb = false): number {
  if (forThumb) return 128;
  if (adultLengthCm >= 14) return 512;
  return 256;
}

/** Pack the painted buffers into textures (no night map). */
export function packAtlas(b: Bufs, N: number, normalStrength: number): FishTextures {
  const map = tex(packColor(b), b.W, b.H, SRGBColorSpace);
  const normal = tex(packNormal(b, normalStrength * (N / 256)), b.W, b.H, NoColorSpace);
  const orm = tex(packOrm(b), b.W, b.H, NoColorSpace);
  const em = packEmissive(b);
  const emissive = em.any ? tex(em.data, b.W, b.H, SRGBColorSpace) : blackTexture();
  const all = [map, normal, orm, em.any ? emissive : null];
  return {
    N, map, normal, orm, emissive, night: null, hasGlow: em.any,
    dispose() {
      for (const t of all) t?.dispose();
    },
  };
}

export function paintFishAtlas(sp: Species, body: ResolvedBody, look: Appearance, prof: BodyProfile, N: number, opts: { night?: boolean } = {}): FishTextures {
  const ctx: BodyCtx = { sp, body, look, prof, seed: hashString(sp.id) & 0xffff };
  const b = bufs(N);
  paintBody(b, ctx, look, false);
  paintFin(b, ctx, look, 'caudal', null);
  paintFin(b, ctx, look, 'dorsal', body.dorsal);
  paintFin(b, ctx, look, 'anal', body.anal);
  paintFin(b, ctx, look, 'dorsal2', body.dorsal2 ?? body.dorsal);
  paintFin(b, ctx, look, 'pelvic', body.pelvic);
  paintFin(b, ctx, look, 'pectoral', body.pectoral);
  paintAdipose(b, look, ctx.seed);
  paintEye(b, look, body, ctx.seed);

  // Small scales are barely visible in life: relief grows with scale size.
  // Bony scutes / plates / carapaces are real relief, but seen through a mucus film and at
  // aquarium distances it is a soft one (not a caterpillar or a honeycomb).
  const normalStrength = body.skin === 'scaled' ? 0.22 + 1.7 * body.scaleSize * body.scaleSize
    : body.skin === 'naked' ? 1.3 : body.skin === 'hex' ? 0.95 : body.skin === 'scutes' || body.skin === 'plates' ? 1.35 : 1.8;
  const map = tex(packColor(b), b.W, b.H, SRGBColorSpace);
  const normal = tex(packNormal(b, normalStrength * (N / 256)), b.W, b.H, NoColorSpace);
  const orm = tex(packOrm(b), b.W, b.H, NoColorSpace);
  const em = packEmissive(b);
  const emissive = em.any ? tex(em.data, b.W, b.H, SRGBColorSpace) : blackTexture();

  let night: DataTexture | null = null;
  if (opts.night) {
    // Repaint the body with the night look; fins/eye keep their day colors.
    const dayCopy = new Float32Array(b.col);
    const dayAlpha = new Float32Array(b.alpha);
    paintBody(b, ctx, look, true);
    const [bx, by, bw, bh] = rect(ATLAS.body, b.W, b.H);
    for (let y = 0; y < b.H; y++) {
      for (let x = 0; x < b.W; x++) {
        if (x >= bx && x < bx + bw && y >= by && y < by + bh) continue;
        const i = y * b.W + x;
        b.col[i * 3] = dayCopy[i * 3] * 0.8;
        b.col[i * 3 + 1] = dayCopy[i * 3 + 1] * 0.8;
        b.col[i * 3 + 2] = dayCopy[i * 3 + 2] * 0.8;
        b.alpha[i] = dayAlpha[i];
      }
    }
    night = tex(packColor(b), b.W, b.H, SRGBColorSpace);
  }
  const all = [map, normal, orm, em.any ? emissive : null, night];
  return {
    N,
    map,
    normal,
    orm,
    emissive,
    night,
    hasGlow: em.any,
    dispose() {
      for (const t of all) t?.dispose();
    },
  };
}
