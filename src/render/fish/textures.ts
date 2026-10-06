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
import { rayCount } from './fins';
import { fbm, hash2, rasterize, rasterizeRing, smooth, valueNoise, type Surface } from './patterns';
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

interface Bufs {
  W: number;
  H: number;
  col: Float32Array;
  alpha: Float32Array;
  height: Float32Array;
  rough: Float32Array;
  metal: Float32Array;
  irid: Float32Array;
  emis: Float32Array;
  mask: Float32Array;
}

let scratch: Bufs | null = null;
function bufs(N: number): Bufs {
  const W = 2 * N, H = N, n = W * H;
  if (!scratch || scratch.W !== W) {
    scratch = {
      W, H,
      col: new Float32Array(n * 3),
      alpha: new Float32Array(n),
      height: new Float32Array(n),
      rough: new Float32Array(n),
      metal: new Float32Array(n),
      irid: new Float32Array(n),
      emis: new Float32Array(n * 3),
      mask: new Float32Array(n),
    };
  }
  const b = scratch;
  b.col.fill(0.5);
  b.alpha.fill(1);
  b.height.fill(0);
  b.rough.fill(0.45);
  b.metal.fill(0);
  b.irid.fill(0);
  b.emis.fill(0);
  return b;
}

/** Pixel rect of a cell. */
function rect(c: Cell, W: number, H: number): [number, number, number, number] {
  return [Math.round(c.x * W), Math.round(c.y * H), Math.round(c.w * W), Math.round(c.h * H)];
}

/** Build a Surface over a cell rect: px/py from the cell-local mapping. */
function cellSurface(c: Cell, W: number, H: number, toX: (lx: number) => number, toY: (ly: number) => number, hd: (x: number) => number, seed: number, fin: boolean): { s: Surface; x0: number; y0: number } {
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
function composite(b: Bufs, s: Surface, x0: number, y0: number, color: RGB, alphaBoost = 0, strength = 1): void {
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

function clearMask(b: Bufs, s: Surface): void {
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
        out[0] = 0.05 * (valueNoise(x * 90, Y * 90, 3) - 0.5);
        return;
      }
      const ncol = 62 - 40 * body.scaleSize;
      const sx = 1 / ncol, sy = sx * 0.64, R = sx * 0.74;
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
          const cx = (col + off) * sx;
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
      // Raised free margin, gently sloping scale surface.
      out[0] = 0.75 * smooth(0, 0.16, e) + 0.35 * (1 - e) - 0.2;
      out[1] = 1 - smooth(0.0, 0.14, e);
      out[2] = bestId;
      return;
    }
    case 'scutes': {
      // Corydoras: two rows of overlapping bony plates meeting along the flank midline.
      if (x < head) {
        out[0] = 0.15 * (fbm(x * 40, Y * 40, 7, 2) - 0.5);
        out[2] = 0.5;
        return;
      }
      const n = 22 + 4 * (1 - body.depth);
      const q = (x - head) * n + Math.abs(y) * 1.1;
      const f = q - Math.floor(q);
      const seam = 1 - smooth(0, 0.12, Math.min(f, 1 - f));
      const zig = 0.06 * Math.sin(q * Math.PI * 2);
      const mid = 1 - smooth(0, 0.06, Math.abs(y - 0.02 - zig));
      out[0] = 0.4 * (1 - f) - 0.8 * seam - 0.7 * mid;
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
      const odont = smooth(0.72, 0.95, valueNoise(x * 260, Y * 260, 13));
      out[0] = 0.35 * (1 - f) - 0.7 * seam - 0.5 * rowSeam + 0.25 * odont;
      out[1] = Math.max(seam, rowSeam) * 0.6;
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
      // Boxfish carapace: hexagonal bony plates.
      const s = 0.045;
      const qx = x / s, qy = Y / s;
      // Hex grid via two offset rectangular lattices.
      const ax = qx, ay = qy / 0.866;
      const r = Math.round(ay);
      const cx0 = Math.round(ax - (r & 1) * 0.5) + (r & 1) * 0.5;
      let best = 1e9, second = 1e9, id = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr;
        const off = (rr & 1) * 0.5;
        for (let dc = -1; dc <= 1; dc++) {
          const cxx = Math.round(cx0 - off) + dc + off;
          const dx = ax - cxx, dy = (ay - rr) * 0.866;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < best) {
            second = best;
            best = d;
            id = hash2(Math.round(cxx * 2), rr, 3);
          } else if (d < second) second = d;
        }
      }
      const edge = 1 - smooth(0.0, 0.09, second - best);
      out[0] = 0.25 - 0.9 * edge + 0.1 * (1 - best);
      out[1] = edge;
      out[2] = id;
      return;
    }
    case 'prickly': {
      const sp = smooth(0.78, 0.92, valueNoise(x * 140, Y * 140, 29));
      out[0] = 0.5 * sp + 0.06 * (fbm(x * 30, Y * 30, 2, 2) - 0.5);
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
      out[0] = 0.08 * (1 - smooth(0, 0.1, Math.min(f, 1 - f))) * -1 + 0.04 * (valueNoise(x * 70, Y * 70, 21) - 0.5);
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
    (x) => prof.halfDepth(clamp(x, 0, 1)),
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
    const wd = smooth(0.12, 0.95, y);
    const wv = smooth(-0.12, -0.92, y);
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
      // Guanine: lower flanks and belly reflect most; the back is matte.
      const mw = metallic * (1 - 0.6 * smooth(0.15, 0.95, y)) * (0.85 + 0.15 * smooth(-0.2, -0.9, y));
      metal[i] = mw;
      rough[i] = 0.46 - 0.18 * mw;
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
          if (glow > 0) {
            const g = m * 0.3 * glow;
            emis[i * 3] = Math.max(emis[i * 3], color[0] * g);
            emis[i * 3 + 1] = Math.max(emis[i * 3 + 1], color[1] * g);
            emis[i * 3 + 2] = Math.max(emis[i * 3 + 2], color[2] * g);
          }
        }
      }
    }
  }

  // 3. Night pattern: diffuse dark saddles and blotches break up the outline while resting.
  if (night) {
    const dark = mix(base, [0.08, 0.07, 0.06], 0.65);
    clearMask(b, s);
    rasterize({ type: 'bars', color: '#000000', count: 3, width: 0.13, x0: 0.32, x1: 0.82, y0: -0.55, y1: 1 }, s, b.mask);
    composite(b, s, x0, y0, dark, 0, 0.55);
    clearMask(b, s);
    rasterize({ type: 'blotch', color: '#000000', x: 0.9, y: 0, rx: 0.06, ry: 0.4 }, s, b.mask);
    composite(b, s, x0, y0, dark, 0, 0.5);
  }

  // 4. Skin relief, scale pigment, per-scale sparkle, anatomy and mottling.
  const scalesP = patterns.find((p) => p.type === 'scales') as Extract<Pattern, { type: 'scales' }> | undefined;
  const scaleCol = scalesP ? hex(scalesP.color) : null;
  const scaleContrast = scalesP ? clamp(scalesP.contrast, 0, 1) : 0.1 * body.scaleSize;
  const sk = new Float64Array(3);
  const eyePY = s.eyeY ?? 0;
  const eyeR = head.eyeR;
  const sL = head.snoutLen;
  const hasGape = body.mouth !== 'inferior' && body.mouth !== 'sucker';
  const opX = head.opercleX, hl = head.headLen;
  const llOn = body.skin === 'scaled' && body.scaleSize > 0.2;
  const translucent = clamp(look.translucency ?? 0, 0, 1);
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    for (let c = 0; c < s.w; c++) {
      const x = s.px[c];
      const hd = s.hd[c];
      const i = (y0 + r) * W + x0 + c;
      skinField(ctx, x, y, hd, sk);
      if (!night) height[i] = sk[0];
      let k = 1;
      // Scale margins carry melanophores; scale centers catch a little more light.
      let tint: RGB | null = null;
      const edge = sk[1] * scaleContrast;
      if (edge > 0) {
        if (scaleCol) tint = scaleCol;
        else k *= 1 - 0.55 * edge;
      }
      if (!night) {
        // Guanine platelets: each scale reflects a little differently (the glitter of a shoal).
        const sparkle = 0.75 + 0.5 * sk[2];
        metal[i] *= sparkle;
        rough[i] = clamp(rough[i] + 0.06 * sk[1] - 0.04 * (sk[2] - 0.5), 0.08, 0.9);
      }
      // --- head anatomy ---
      if (x < opX + 0.04) {
        // Opercle (gill cover) rear edge: convex backward arc.
        const op = opX - hl * 0.22 * (y + 0.1) * (y + 0.1);
        const dxo = (x - op) / Math.max(0.0025, 0.004 + 0.002 * hd);
        if (y > -0.9 && y < 0.62) {
          const line = Math.exp(-dxo * dxo);
          k *= 1 - 0.22 * line;
          if (dxo < 0 && dxo > -3) k *= 1 + 0.04 * (1 + dxo / 3);
          if (!night) height[i] += 0.5 * smooth(1.5, -1.5, dxo) - 0.25;
        }
        // Preopercle: a faint inner arc.
        const pre = opX - hl * 0.36 - hl * 0.12 * (y + 0.2) * (y + 0.2);
        const dxp = (x - pre) / 0.004;
        if (y > -0.8 && y < 0.35) k *= 1 - 0.07 * Math.exp(-dxp * dxp);
        // Eye socket ring.
        const ex = (x - head.eyeX) / eyeR, ey = ((y - eyePY) * hd) / eyeR;
        const de = Math.sqrt(ex * ex + ey * ey);
        if (de < 1.6) {
          k *= 1 - 0.25 * smooth(0.95, 1.08, de) * (1 - smooth(1.15, 1.55, de));
          if (de < 1) k *= 0.6;
        }
        // Nostrils.
        const nx = (x - (head.eyeX - eyeR * 1.55)) / (eyeR * 0.16), ny = ((y - eyePY) * hd - eyeR * 0.45) / (eyeR * 0.16);
        if (nx * nx + ny * ny < 1.5) k *= 1 - 0.35 * Math.exp(-(nx * nx + ny * ny));
        // Gape (mouth line) with lips.
        if (hasGape && x < head.rictusX + 0.01) {
          const t = clamp((x - sL * 0.85) / Math.max(1e-4, head.rictusX - sL * 0.85), 0, 1);
          const gy = prof.patternY(x, head.yTip - head.gapeDrop * t);
          const d = ((y - gy) * hd) / 0.0045;
          const fade = 1 - smooth(0.85, 1.0, t);
          k *= 1 - 0.5 * Math.exp(-d * d) * fade;
          const lip = Math.exp(-((Math.abs(d) - 2.2) ** 2) / 1.5) * fade;
          k *= 1 + 0.05 * lip * body.lips * 2;
        }
      }
      // Gill slit glimpse (red filaments) just behind the opercle.
      if (x > opX - 0.01 && x < opX + 0.02 && y > -0.8 && y < 0.4) {
        const op = opX - hl * 0.22 * (y + 0.1) * (y + 0.1);
        const d = (x - op - 0.004) / 0.003;
        const g = Math.exp(-d * d) * 0.25;
        tint = tint ?? null;
        col[i * 3] += (0.45 - col[i * 3]) * g;
        col[i * 3 + 1] += (0.1 - col[i * 3 + 1]) * g;
        col[i * 3 + 2] += (0.1 - col[i * 3 + 2]) * g;
      }
      // Lateral line pores.
      if (llOn && x > opX && x < 0.97) {
        const yl = 0.05 + 0.42 * (1 - smooth(0.2, 0.92, x));
        const dl = ((y - yl) * hd) / 0.0035;
        const pore = Math.exp(-dl * dl) * (0.5 + 0.5 * Math.cos(x * (62 - 40 * body.scaleSize) * Math.PI * 2));
        k *= 1 - 0.1 * pore;
      }
      // Low-frequency mottling so no surface is flat CG color.
      const mott = 1 + 0.07 * (fbm(x * 14, y * hd * 14, ctx.seed + 3, 3) - 0.5) + 0.03 * (valueNoise(x * 120, y * hd * 120, ctx.seed) - 0.5);
      k *= mott;
      if (tint && edge > 0) {
        col[i * 3] += (tint[0] - col[i * 3]) * edge;
        col[i * 3 + 1] += (tint[1] - col[i * 3 + 1]) * edge;
        col[i * 3 + 2] += (tint[2] - col[i * 3 + 2]) * edge;
      }
      col[i * 3] *= k;
      col[i * 3 + 1] *= k;
      col[i * 3 + 2] *= k;
      // Translucent bodies: flesh lets light through; head, viscera and spine stay opaque.
      if (translucent > 0.42) {
        const vx = (x - 0.3) / 0.17, vy = (y + 0.35) / 0.5;
        const viscera = 1 - smooth(0.75, 1.05, Math.sqrt(vx * vx + vy * vy));
        const spineL = Math.exp(-(((y - 0.12) * hd) / 0.006) ** 2) * smooth(0.15, 0.3, x) * (1 - smooth(0.97, 1, x));
        const headO = 1 - smooth(opX * 0.75, opX * 1.05, x);
        const opaque = clamp(Math.max(viscera * 0.95, spineL * 0.55, headO * 0.6), 0, 1);
        alpha[i] = clamp(1 - translucent * (1 - opaque), 0.08, 1);
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
  const crown = shape === 'crowntail';
  const separated = shape === 'fan' && body.finRays < 0.9; // lionfish-style free rays
  const clear = op < 0.35;
  const rayCol: RGB = clear ? mix(finCol, [0.92, 0.9, 0.85], 0.25) : mix(finCol, [finCol[0] * 0.62, finCol[1] * 0.62, finCol[2] * 0.62], 0.75);
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
      const rw = 0.11 * (1 - 0.45 * x) + 0.02;
      const ray = 1 - smooth(rw * 0.6, rw * 1.6, d);
      const seg = (x * 14) % 1;
      const joint = ray * Math.exp(-((seg - 0.5) ** 2) / 0.004) * 0.35;
      // Membrane incisions between spines / reduced webbing.
      const between = Math.abs(rp - ri); // 0 on a ray, 0.5 midway
      let cut = 0;
      if (spiny && u < 0.6) cut = 0.34 * smooth(0.08, 0.5, between);
      if (crown) cut = 0.45 * smooth(0.06, 0.5, between);
      if (separated) cut = 0.55 * smooth(0.08, 0.5, between);
      const membrane = x < 1 - cut ? 1 : 0.0;
      let a = op * (0.95 - 0.18 * x) * membrane;
      a = Math.max(a, (clear ? op + 0.25 : Math.min(1, op + 0.15)) * ray);
      a = Math.max(a, 0.04);
      let cr = finCol[0], cg = finCol[1], cb = finCol[2];
      cr += (rayCol[0] - cr) * ray * 0.8;
      cg += (rayCol[1] - cg) * ray * 0.8;
      cb += (rayCol[2] - cb) * ray * 0.8;
      cr *= 1 + joint * 0.3;
      cg *= 1 + joint * 0.3;
      cb *= 1 + joint * 0.3;
      // Fleshy fin base takes the body color.
      const fb = 1 - smooth(0, 0.12, x);
      cr += (bodyBase[0] - cr) * fb * 0.55;
      cg += (bodyBase[1] - cg) * fb * 0.55;
      cb += (bodyBase[2] - cb) * fb * 0.55;
      a = Math.max(a, 0.8 * fb);
      // Edge band.
      if (edgeCol) {
        const eb = smooth(1 - ew - 0.03, 1 - ew + 0.01, x);
        cr += (edgeCol[0] - cr) * eb;
        cg += (edgeCol[1] - cg) * eb;
        cb += (edgeCol[2] - cb) * eb;
        if (membrane > 0 || ray > 0.3) a = Math.max(a, Math.max(op, 0.75) * eb);
      }
      // Soft outer margin.
      a *= 1 - 0.45 * smooth(0.94, 1, x);
      const n = 1 + 0.06 * (valueNoise(x * 18, y * 30, ctx.seed + 9) - 0.5);
      col[i * 3] = cr * n;
      col[i * 3 + 1] = cg * n;
      col[i * 3 + 2] = cb * n;
      alpha[i] = clamp(a, 0, 1);
      height[i] = ray * 0.8 + joint * 0.4;
      rough[i] = 0.44 - 0.1 * ray;
      metal[i] = 0;
      irid[i] = iridFin;
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
    }
  }
}

function paintEye(b: Bufs, look: Appearance, body: ResolvedBody, seed: number): void {
  const cell = ATLAS.eye;
  const [x0, y0, w, h] = rect(cell, b.W, b.H);
  const iris = hex(look.eye, [0.72, 0.67, 0.52]);
  const irisLight = mix(iris, [1, 0.95, 0.8], 0.35);
  const irisDark = [iris[0] * 0.4, iris[1] * 0.4, iris[2] * 0.4] as RGB;
  const maskP = (look.patterns ?? []).find((p) => p.type === 'mask') as Extract<Pattern, { type: 'mask' }> | undefined;
  const maskCol = maskP ? hex(maskP.color) : null;
  const tmp: [number, number] = [0, 0];
  const pupilR = body.kind === 'fish' ? 0.43 : 0.5;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      cellLocal(cell, (x0 + c + 0.5) / b.W, (y0 + r + 0.5) / b.H, tmp);
      const ex = tmp[0] * 2 - 1, ey = tmp[1] * 2 - 1;
      const rad = Math.hypot(ex / 1.06, ey);
      const ang = Math.atan2(ey, ex);
      const i = (y0 + r) * b.W + x0 + c;
      let cr: number, cg: number, cb: number, rough: number, metal: number;
      if (rad < pupilR) {
        // Pupil: deep blue-black; the lens behind it gives a faint depth.
        const g = 0.02 + 0.02 * (1 - rad / pupilR);
        cr = g * 0.7;
        cg = g * 0.8;
        cb = g;
        rough = 0.04;
        metal = 0;
      } else if (rad < 0.88) {
        const t = (rad - pupilR) / (0.88 - pupilR);
        const stri = 0.82 + 0.36 * valueNoise(ang * 9 + 50, t * 5, seed);
        let cc = mix(irisLight, iris, smooth(0, 0.35, t));
        cc = mix(cc, irisDark, smooth(0.65, 1, t) * 0.7);
        // Upper iris is usually darker (countershading through the eye).
        cc = mix(cc, irisDark, smooth(0.2, 0.9, ey) * 0.35);
        if (maskCol && Math.abs(ex) < 0.45) cc = mix(cc, maskCol, 0.75 * (1 - smooth(0.3, 0.45, Math.abs(ex))));
        cr = cc[0] * stri;
        cg = cc[1] * stri;
        cb = cc[2] * stri;
        // Pupillary ring.
        const ring = Math.exp(-(((rad - pupilR - 0.03) / 0.025) ** 2));
        cr += (0.95 - cr) * ring * 0.25;
        cg += (0.85 - cg) * ring * 0.25;
        cb += (0.6 - cb) * ring * 0.25;
        rough = 0.16;
        metal = 0.45;
      } else {
        const t = smooth(0.88, 1, rad);
        const bodyC = hex(look.base);
        const cc = mix([0.06, 0.06, 0.07], bodyC, t * 0.6);
        cr = cc[0];
        cg = cc[1];
        cb = cc[2];
        rough = 0.3;
        metal = 0.1;
      }
      b.col[i * 3] = cr;
      b.col[i * 3 + 1] = cg;
      b.col[i * 3 + 2] = cb;
      b.alpha[i] = 1;
      b.rough[i] = rough;
      b.metal[i] = metal;
      b.irid[i] = 0;
      b.height[i] = 0;
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
  t.anisotropy = 4;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

const to8 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

function packColor(b: Bufs, withAlpha = true): Uint8Array {
  const n = b.W * b.H;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = to8(b.col[i * 3]);
    out[i * 4 + 1] = to8(b.col[i * 3 + 1]);
    out[i * 4 + 2] = to8(b.col[i * 3 + 2]);
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
      const l = Math.hypot(dx, dy, 1);
      out[i * 4] = to8((-dx / l) * 0.5 + 0.5);
      out[i * 4 + 1] = to8((-dy / l) * 0.5 + 0.5);
      out[i * 4 + 2] = to8((1 / l) * 0.5 + 0.5);
      out[i * 4 + 3] = 255;
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
    out[i * 4 + 3] = 255;
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

  const normalStrength = body.skin === 'scaled' ? 3.2 + 1.5 * body.scaleSize : body.skin === 'naked' ? 2 : 4.5;
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

/** Average body color (for LOD fallbacks / UI). */
export function bodyTone(look: Appearance): RGB {
  const b = hex(look.base);
  return luma(b) > 0 ? b : [0.5, 0.5, 0.5];
}
