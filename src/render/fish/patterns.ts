import type { Pattern } from '../../core/types';
import { Rng } from '../../core/rng';

/**
 * Rasterizes the pattern DSL (src/core/types.ts `Pattern`) into a coverage mask over a painted
 * surface region. Body surfaces use pattern coords x 0 (snout) → 1 (tail base), y −1 (belly) →
 * +1 (back); fins use x 0 (base) → 1 (tip), y −1 … 1 across.
 *
 * Circles must look circular on the animal, so every surface carries the physical half-height
 * per column (`hd`, in x units): a radius r in x units spans r / hd in y units.
 */

export interface Surface {
  w: number;
  h: number;
  /** Pattern x at each column / pattern y at each row (pixel centers). */
  px: Float32Array;
  py: Float32Array;
  /** Physical half-height (in pattern-x units) at each column. */
  hd: Float32Array;
  /** Body only: eye center in pattern coords (for 'mask'). */
  eyeX?: number;
  eyeY?: number;
  /** Body only: x of the gill-cover (opercle) rear edge — bars just behind it follow its arc. */
  opX?: number;
  /** Seed for jitter. */
  seed: number;
  /** True when painting a fin (patterns default to the whole fin). */
  fin?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------------------------------
// Noise
// ------------------------------------------------------------------------------------------

export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function fbm(x: number, y: number, seed: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * valueNoise(x * f, y * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// Periodic fbm lookup table: fast organic noise for per-pixel painting.
const NT = 256; // table size
const NP = 32; // period in noise units (8 samples per unit)
let noiseTable: Float32Array | null = null;
function periodicValue(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period, y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
function buildNoiseTable(): Float32Array {
  const t = new Float32Array(NT * NT);
  for (let j = 0; j < NT; j++) {
    for (let i = 0; i < NT; i++) {
      const x = (i / NT) * NP, y = (j / NT) * NP;
      let s = 0, a = 0.5, n = 0;
      for (let o = 0; o < 4; o++) {
        const f = 1 << o;
        s += a * periodicValue(x * f, y * f, NP * f, 1009 + o * 17);
        n += a;
        a *= 0.5;
      }
      t[j * NT + i] = s / n;
    }
  }
  return t;
}
/** Smooth fbm-like noise in [0,1] (feature size ≈ 1 unit), periodic every 32 units. */
export function fastNoise(x: number, y: number): number {
  const t = noiseTable ?? (noiseTable = buildNoiseTable());
  const u = x * 8, v = y * 8;
  const iu = Math.floor(u), iv = Math.floor(v);
  const fu = u - iu, fv = v - iv;
  const x0 = iu & (NT - 1), y0 = iv & (NT - 1);
  const x1 = (x0 + 1) & (NT - 1), y1 = (y0 + 1) & (NT - 1);
  const a = t[y0 * NT + x0], b = t[y0 * NT + x1], c = t[y1 * NT + x0], d = t[y1 * NT + x1];
  return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
}

/** F1 / F2 Voronoi distances (jittered grid) at (x, y); writes [f1, f2, cellHash]. */
export function voronoi(x: number, y: number, seed: number, out: Float64Array): void {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j;
      const px = cx + 0.15 + 0.7 * hash2(cx, cy, seed);
      const py = cy + 0.15 + 0.7 * hash2(cx, cy, seed + 31);
      const d = (px - x) * (px - x) + (py - y) * (py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(cx, cy, seed + 77);
      } else if (d < f2) f2 = d;
    }
  }
  out[0] = Math.sqrt(f1);
  out[1] = Math.sqrt(f2);
  out[2] = id;
}

const vor = new Float64Array(3);

// ------------------------------------------------------------------------------------------
// Rasterization
// ------------------------------------------------------------------------------------------

function colRange(s: Surface, x0: number, x1: number): [number, number] {
  // px is monotonic increasing.
  let a = 0, b = s.w - 1;
  while (a < s.w && s.px[a] < x0) a++;
  while (b >= 0 && s.px[b] > x1) b--;
  return [a, b];
}

function rowRange(s: Surface, y0: number, y1: number): [number, number] {
  // py may be decreasing (body: +1 at the top row) or increasing (fins).
  let a = s.h, b = -1;
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    if (y >= y0 && y <= y1) {
      if (r < a) a = r;
      if (r > b) b = r;
    }
  }
  return [a, b];
}

function maxv(m: Float32Array, i: number, v: number): void {
  if (v > m[i]) m[i] = v;
}

/**
 * Curvature of a vertical band (bars / full-height regions): the explicit `curve`, or — for a band
 * spanning the full height on the body — an automatic one: bands just behind the head follow the
 * convex arc of the gill cover; bands further back bow gently with the body's roundness.
 */
export function bandCurve(s: Surface, explicit: number | undefined, xCenter: number, fullHeight: boolean): number {
  if (explicit !== undefined) return clamp(explicit, -1, 1);
  if (s.fin || !fullHeight) return 0;
  const op = s.opX;
  if (op === undefined) return 0;
  // Head zone: from mid-cheek to a little behind the opercle.
  const head = smooth(op + 0.16, op + 0.05, xCenter) * smooth(op - 0.2, op - 0.08, xCenter);
  return 0.12 + 0.6 * head;
}

/** Sideways offset (pattern-x units) of a curved band at height y (hd = physical half-height). */
export function bandOffset(curve: number, y: number, hd: number): number {
  if (curve === 0) return 0;
  // Peak slightly below the lateral line, like the opercle's rear margin.
  const t = (y + 0.08) / 1.08;
  return curve * 0.32 * hd * (1 - t * t);
}

/** Soft disc / ellipse splat (rx in x units, ry in y units). */
function splatEllipse(s: Surface, m: Float32Array, cx: number, cy: number, rx: number, ry: number, soft: number, strength = 1): void {
  if (rx <= 0 || ry <= 0) return;
  const [c0, c1] = colRange(s, cx - rx * 1.2, cx + rx * 1.2);
  const [r0, r1] = rowRange(s, cy - ry * 1.2, cy + ry * 1.2);
  for (let r = r0; r <= r1; r++) {
    const dy = (s.py[r] - cy) / ry;
    for (let c = c0; c <= c1; c++) {
      const dx = (s.px[c] - cx) / rx;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.15) maxv(m, r * s.w + c, strength * (1 - smooth(1 - soft, 1 + soft * 0.3, d)));
    }
  }
}

/**
 * Fill `m` (cleared by the caller, w×h) with the coverage of pattern `p`. Returns false if the
 * pattern drew nothing.
 */
export function rasterize(p: Pattern, s: Surface, m: Float32Array): boolean {
  const W = s.w, Hh = s.h;
  // Pixel footprint for anti-aliasing.
  const ax = Math.abs(s.px[Math.min(1, W - 1)] - s.px[0]) || 0.002;
  const ay = Math.abs(s.py[Math.min(1, Hh - 1)] - s.py[0]) || 0.01;
  const rng = new Rng(s.seed);
  switch (p.type) {
    case 'stripe': {
      const half = Math.max(p.width / 2, ay);
      const x0 = p.x0 ?? 0, x1 = p.x1 ?? 1;
      const glow = clamp(p.glow ?? 0, 0, 2);
      const reach = half * (1.3 + glow * 1.6);
      const [c0, c1] = colRange(s, x0 - 0.06, x1 + 0.06);
      const [r0, r1] = rowRange(s, p.y - reach, p.y + reach);
      const edge = Math.max(0.1, ay / half);
      for (let r = r0; r <= r1; r++) {
        const d = Math.abs(s.py[r] - p.y) / half;
        const core = 1 - smooth(1 - edge, 1 + edge, d);
        const halo = glow > 0 ? glow * 0.42 * Math.exp(-((d - 0.85) * (d - 0.85)) * 1.1) * (d > 0.85 ? 1 : 0) : 0;
        const v = Math.max(core, halo);
        if (v <= 0.001) continue;
        for (let c = c0; c <= c1; c++) {
          const x = s.px[c];
          // Rounded, slightly tapered ends.
          const ex = smooth(x0 - 0.01, x0 + 0.04, x) * (1 - smooth(x1 - 0.04, x1 + 0.01, x));
          maxv(m, r * W + c, v * ex);
        }
      }
      return true;
    }
    case 'bars': {
      const n = Math.max(1, Math.round(p.count));
      const x0 = p.x0 ?? 0.12, x1 = p.x1 ?? 0.92;
      const y0 = p.y0 ?? -1, y1 = p.y1 ?? 1;
      const half = Math.max(p.width / 2, ax);
      const slant = p.slant ?? 0;
      const spacing = n > 1 ? (x1 - x0) / (n - 1) : 1;
      const [r0, r1] = rowRange(s, y0 - 0.1, y1 + 0.1);
      const wob = (s.seed % 997) * 0.37;
      const full = y0 <= -0.85 && y1 >= 0.85;
      const curves = new Float32Array(n);
      for (let i = 0; i < n; i++) curves[i] = bandCurve(s, p.curve, n > 1 ? x0 + i * spacing : (x0 + x1) / 2, full);
      for (let r = r0; r <= r1; r++) {
        const y = s.py[r];
        const ey = smooth(y0 - 0.06, y0 + 0.06, y) * (1 - smooth(y1 - 0.06, y1 + 0.06, y));
        if (ey <= 0) continue;
        for (let c = 0; c < W; c++) {
          // Slant is a physical angle: shift x by slant × height above the lateral line.
          let xs = s.px[c] - slant * y * s.hd[c];
          let i = n > 1 ? Math.round((xs - x0) / spacing) : 0;
          i = clamp(i, 0, n - 1);
          if (curves[i] !== 0) {
            xs -= bandOffset(curves[i], y, s.hd[c]);
            i = clamp(n > 1 ? Math.round((xs - x0) / spacing) : 0, 0, n - 1);
          }
          const cx = n > 1 ? x0 + i * spacing : (x0 + x1) / 2;
          // Natural bars have slightly irregular edges.
          const wobble = 1 + 0.12 * (fastNoise(y * 3 + i * 7.3, wob) - 0.5);
          const d = Math.abs(xs - cx) / (half * wobble);
          const e = Math.max(0.12, ax / half);
          const v = (1 - smooth(1 - e, 1 + e, d)) * ey;
          if (v > 0) maxv(m, r * W + c, v);
        }
      }
      return true;
    }
    case 'spots': {
      const x0 = p.x0 ?? (s.fin ? 0.08 : 0.04), x1 = p.x1 ?? (s.fin ? 0.98 : 1);
      const y0 = p.y0 ?? -0.92, y1 = p.y1 ?? 0.92;
      const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      const count = Math.round(clamp(p.density * (area / 2), 0, 1500));
      if (count <= 0) return false;
      const jitter = clamp(p.jitter ?? 0.5, 0, 1);
      // Stratified placement on a grid with the physical aspect of the region.
      let hdAvg = 0;
      for (let c = 0; c < W; c++) hdAvg += s.hd[c];
      hdAvg = hdAvg / W || 0.1;
      const physW = x1 - x0, physH = ((y1 - y0) / 2) * hdAvg * 2;
      const aspect = physW / Math.max(1e-4, physH);
      const nx = Math.max(1, Math.round(Math.sqrt(count * aspect)));
      const ny = Math.max(1, Math.round(count / nx));
      const rBase = Math.max(p.size / 2, ax * 0.8);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const jx = (rng.next() - 0.5) * jitter, jy = (rng.next() - 0.5) * jitter;
          const offs = j % 2 ? 0.5 * (1 - jitter) : 0;
          const cx = x0 + ((i + 0.5 + offs + jx) / nx) * physW;
          const cy = y0 + ((j + 0.5 + jy) / ny) * (y1 - y0);
          if (cx < x0 - 0.01 || cx > x1 + 0.01) continue;
          const rr = rBase * (0.75 + 0.5 * rng.next());
          const col = clamp(Math.round(((cx - s.px[0]) / (s.px[W - 1] - s.px[0])) * (W - 1)), 0, W - 1);
          const hd = Math.max(1e-3, s.hd[col]);
          // Spots fade toward the belly/back edges where the body curves away.
          const fade = s.fin ? 1 : 1 - smooth(0.85, 1.0, Math.abs(cy));
          splatEllipse(s, m, cx, cy, rr, rr / hd, 0.35, fade);
        }
      }
      return true;
    }
    case 'blotch': {
      // (An ocellus ring, if any, is painted first by the caller via rasterizeRing.)
      splatEllipse(s, m, p.x, p.y, Math.max(p.rx, ax), Math.max(p.ry, ay), 0.22);
      return true;
    }
    case 'region': {
      const x0 = p.x0 ?? 0, x1 = p.x1 ?? 1, y0 = p.y0 ?? -1, y1 = p.y1 ?? 1;
      const sf = Math.max(p.softness ?? 0.02, 0);
      const sx = Math.max(sf, ax * 0.75), sy = Math.max(sf * 2, ay * 0.75);
      const openL = x0 <= 0.001, openR = x1 >= 0.999, openB = y0 <= -0.999, openT = y1 >= 0.999;
      // A full-height band (both x edges inside the body) may curve with the body.
      const band = !openL && !openR && x1 - x0 < 0.3;
      const curve = band ? bandCurve(s, p.curve, (x0 + x1) / 2, y0 <= -0.85 && y1 >= 0.85) : clamp(p.curve ?? 0, -1, 1);
      for (let r = 0; r < Hh; r++) {
        const y = s.py[r];
        const ey = (openB ? 1 : smooth(y0 - sy / 2, y0 + sy / 2, y)) * (openT ? 1 : 1 - smooth(y1 - sy / 2, y1 + sy / 2, y));
        if (ey <= 0) continue;
        for (let c = 0; c < W; c++) {
          const x = curve !== 0 ? s.px[c] - bandOffset(curve, y, s.hd[c]) : s.px[c];
          const ex = (openL ? 1 : smooth(x0 - sx / 2, x0 + sx / 2, x)) * (openR ? 1 : 1 - smooth(x1 - sx / 2, x1 + sx / 2, x));
          if (ex > 0) maxv(m, r * W + c, ex * ey);
        }
      }
      return true;
    }
    case 'reticulate': {
      const sc = clamp(p.scale, 1, 60);
      const th = clamp(p.thickness ?? 0.3, 0.02, 0.95);
      for (let r = 0; r < Hh; r++) {
        for (let c = 0; c < W; c++) {
          const X = s.px[c] * sc, Y = s.py[r] * s.hd[c] * sc;
          voronoi(X, Y, s.seed, vor);
          const e = vor[1] - vor[0]; // distance to the cell border (×2)
          const line = 1 - smooth(th * 0.45, th * 0.45 + 0.08 + ax * sc, e);
          if (line > 0) maxv(m, r * W + c, line);
        }
      }
      return true;
    }
    case 'marble': {
      const sc = clamp(p.scale, 0.5, 60);
      const amt = clamp(p.amount, 0, 1);
      for (let r = 0; r < Hh; r++) {
        for (let c = 0; c < W; c++) {
          const X = s.px[c] * sc, Y = s.py[r] * s.hd[c] * sc;
          // Domain-warped fbm gives organic, flowing marbling.
          const so = (s.seed % 101) * 0.71;
          const wx = fastNoise(X * 0.7 + 3.1 + so, Y * 0.7) - 0.5;
          const wy = fastNoise(X * 0.7 + so, Y * 0.7 + 7.7) - 0.5;
          const n = fastNoise(X + wx * 1.6 + so * 1.3, Y + wy * 1.6);
          const t = 1 - amt;
          const v = smooth(t - 0.06, t + 0.06, n * 1.0 + 0.1 * (amt - 0.5));
          if (v > 0) maxv(m, r * W + c, v);
        }
      }
      return true;
    }
    case 'chevrons': {
      const n = Math.max(1, Math.round(p.count));
      const x0 = p.x0 ?? 0.2, x1 = p.x1 ?? 0.95;
      const half = Math.max(p.width / 2, ax);
      const spacing = n > 1 ? (x1 - x0) / (n - 1) : 1;
      for (let r = 0; r < Hh; r++) {
        const ay2 = Math.abs(s.py[r]);
        for (let c = 0; c < W; c++) {
          // V pointing forward: arms sweep back above and below the lateral line.
          const xs = s.px[c] - 0.55 * ay2 * s.hd[c];
          let i = n > 1 ? Math.round((xs - x0) / spacing) : 0;
          i = clamp(i, 0, n - 1);
          const cx = n > 1 ? x0 + i * spacing : (x0 + x1) / 2;
          const d = Math.abs(xs - cx) / half;
          const v = (1 - smooth(0.8, 1.15, d)) * (1 - smooth(0.85, 1, ay2));
          if (v > 0) maxv(m, r * W + c, v);
        }
      }
      return true;
    }
    case 'lines': {
      const n = Math.max(1, Math.round(p.count));
      const y0 = p.y0 ?? -0.8, y1 = p.y1 ?? 0.8;
      const spacing = n > 1 ? (y1 - y0) / (n - 1) : 1;
      const half = Math.max(p.width / 2, ay * 0.6);
      const wavy = clamp(p.wavy ?? 0, 0, 2);
      for (let r = 0; r < Hh; r++) {
        for (let c = 0; c < W; c++) {
          const x = s.px[c];
          let y = s.py[r];
          if (wavy > 0) {
            // Vermiculation: sinusoidal + noisy displacement that grows with `wavy`.
            const k = 2 * Math.PI * (4 + 6 * wavy);
            y += wavy * spacing * (0.55 * Math.sin(k * x + y * 5.1) + 1.4 * (fastNoise(x * 11 + (s.seed % 89), y * 5) - 0.5));
          }
          let i = n > 1 ? Math.round((y - y0) / spacing) : 0;
          i = clamp(i, 0, n - 1);
          const cy = n > 1 ? y0 + i * spacing : (y0 + y1) / 2;
          const d = Math.abs(y - cy) / half;
          const ex = s.fin ? 1 : smooth(0.02, 0.07, x) * (1 - smooth(0.97, 1.01, x));
          const v = (1 - smooth(0.75, 1.2, d)) * ex;
          if (v > 0) maxv(m, r * W + c, v);
        }
      }
      return true;
    }
    case 'mask': {
      if (s.fin) return false;
      const ex = s.eyeX ?? 0.12, ey = s.eyeY ?? 0.2;
      const half = Math.max(p.width / 2, ax);
      const [c0, c1] = colRange(s, ex - half * 3 - 0.08, ex + half * 3 + 0.08);
      for (let r = 0; r < Hh; r++) {
        const y = s.py[r];
        for (let c = c0; c <= c1; c++) {
          // Eye bar runs from the nape through the eye to the throat, bottom slightly back.
          const cx = ex - 0.18 * (y - ey) * s.hd[c];
          const d = Math.abs(s.px[c] - cx) / half;
          const v = (1 - smooth(0.8, 1.15, d)) * (1 - smooth(0.9, 1.0, Math.abs(y)) * 0.5);
          if (v > 0) maxv(m, r * W + c, v);
        }
      }
      return true;
    }
    case 'speckle': {
      const count = Math.round(clamp(p.density, 0, 400) * 22);
      const x0 = s.fin ? 0 : 0.03;
      const span = s.px[W - 1] - s.px[0];
      for (let i = 0; i < count; i++) {
        const cx = x0 + rng.next() * (1 - x0);
        const cy = -0.95 + rng.next() * 1.9;
        const col = clamp(Math.round(((cx - s.px[0]) / span) * (W - 1)), 0, W - 1);
        const rr = Math.max(ax * 0.6, 0.0035 + 0.004 * rng.next());
        splatEllipse(s, m, cx, cy, rr, rr / Math.max(1e-3, s.hd[col]), 0.6, 0.45 + 0.5 * rng.next());
      }
      return true;
    }
    case 'scales':
      // Painted by the texture builder from its scale field (shares the normal map's geometry).
      return false;
    default:
      return false;
  }
}

/** Ring (ocellus) around a blotch: annulus coverage. */
export function rasterizeRing(p: Extract<Pattern, { type: 'blotch' }>, s: Surface, m: Float32Array): void {
  const rx = p.rx * 1.38, ry = p.ry * 1.38;
  const [c0, c1] = colRange(s, p.x - rx * 1.2, p.x + rx * 1.2);
  const [r0, r1] = rowRange(s, p.y - ry * 1.2, p.y + ry * 1.2);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = (s.px[c] - p.x) / rx, dy = (s.py[r] - p.y) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const v = smooth(0.55, 0.68, d) * (1 - smooth(0.92, 1.05, d));
      if (v > 0) maxv(m, r * s.w + c, v);
    }
  }
}
