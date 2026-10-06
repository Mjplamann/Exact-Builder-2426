import type { BufferGeometry } from 'three';
import type { Appearance, FinLook, Pattern, Species } from '../../core/types';
import { Rng, hashString } from '../../core/rng';
import type { ResolvedBody } from './archetypes';
import { ATLAS, bodyUV, cellLocal, cellUV, type Cell } from './atlas';
import { hex, mix, type RGB } from './color';
import type { FishGeometryInfo } from './fishGeometry';
import { GeoBuilder, PART } from './geometryBuilder';
import { fastNoise, hash2, rasterize, rasterizeRing, smooth, valueNoise, type Surface } from './patterns';
import { bufs, cellSurface, clearMask, composite, packAtlas, rect, type Bufs, type FishTextures } from './textures';

/**
 * Procedural invertebrates: shrimp (incl. cleaner, coral-banded, pistol, harlequin and mantis
 * shrimp variants), crayfish, crabs (incl. arrow crabs), hermit crabs in a borrowed shell,
 * snails (nerite, turban/top, trumpet/cerith, conch, cowrie, abalone, ramshorn, apple snail),
 * starfish (incl. cushion stars), brittle stars and urchins (short to long-spined).
 *
 * Built directly in local render space: +X forward, +Y up, +Z the animal's right. The
 * characteristic size (see docs/SPECIES_AUTHORING.md: shrimp/crayfish body length, crab carapace
 * width, snail shell length, star arm span, urchin test diameter) is 1. The origin sits
 * 0.425 × depth above the contact plane — the same vertical clearance the behavior system keeps
 * for animals resting on a surface — so feet, soles and arm tips touch the ground.
 *
 * Look conventions: `base` carapace/shell/body, `fin` legs/tube feet/spines/snail foot,
 * `fins.pectoral` claws, `fins.caudal` tail fan, `fins.pelvic` leg banding, `fins.dorsal` urchin
 * spine banding, `eye` hermit eyestalks; barbels/barbelLength = shrimp antennae.
 */

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mirrorZ = (p: V3): V3 => [p[0], p[1], -p[2]];

export interface InvertGeometry {
  body: BufferGeometry;
  fins: BufferGeometry;
  info: FishGeometryInfo;
  paint(N: number): FishTextures;
}

// ---------------------------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------------------------

interface PartOpts {
  part: number;
  pivot: V3;
  phase: number;
  amp: number;
  /** UV: a cell (fin-style coords: x along, y around) or a fixed body-pattern point. */
  cell?: Cell;
  bodyXY?: [number, number];
  s?: number;
}

/** Catmull-Rom resample of a polyline into n+1 points. */
function spline(pts: V3[], n: number): V3[] {
  const out: V3[] = [];
  const m = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * m;
    const k = Math.min(m - 1, Math.floor(t));
    const f = t - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(m, k + 2)];
    const f2 = f * f, f3 = f2 * f;
    const c = (a: number, b: number, cc: number, d: number) =>
      0.5 * (2 * b + (-a + cc) * f + (2 * a - 5 * b + 4 * cc - d) * f2 + (-a + 3 * b - 3 * cc + d) * f3);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
  }
  return out;
}

/**
 * Tube along a polyline with parallel-transported frames, explicit normals and outward
 * winding; `squash` flattens the cross-section along the frame's second axis.
 */
function tube(gb: GeoBuilder, pts: V3[], radii: (t: number) => number, sides: number, o: PartOpts, cap = true, squash = 1, upHint: V3 = [0, 1, 0]): void {
  const n = pts.length;
  let t0 = norm(sub(pts[1], pts[0]));
  let u = norm(cross(cross(t0, upHint), t0));
  if (!Number.isFinite(u[0]) || len(cross(t0, upHint)) < 1e-4) u = norm(cross(t0, [0.3, 0.1, 1]));
  const v0 = gb.vertexCount;
  const uv: [number, number] = [0, 0];
  let tPrev = t0;
  let total = 0;
  const acc: number[] = [0];
  for (let i = 1; i < n; i++) {
    total += len(sub(pts[i], pts[i - 1]));
    acc.push(total);
  }
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? t0 : i === n - 1 ? norm(sub(pts[i], pts[i - 1])) : norm(sub(pts[i + 1], pts[i - 1]));
    // Parallel transport of u.
    u = norm(sub(u, mul(t, dot(u, t))));
    tPrev = t;
    const w = cross(t, u);
    const tt = total > 0 ? acc[i] / total : 0;
    const r = radii(tt);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a) * squash;
      const nn = norm(add(mul(u, Math.cos(a) / 1), mul(w, Math.sin(a) / Math.max(0.05, squash))));
      const p = add(pts[i], add(mul(u, ca * r), mul(w, sa * r)));
      if (o.cell) cellUV(o.cell, tt, Math.cos(a), uv);
      else bodyUV(o.bodyXY?.[0] ?? 0.5, o.bodyXY?.[1] ?? 0, uv);
      gb.v(p[0], p[1], p[2], uv[0], uv[1], o.s ?? tt, o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase, nn[0], nn[1], nn[2]);
    }
  }
  void tPrev;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = v0 + i * sides + j, b = v0 + i * sides + ((j + 1) % sides);
      const c = a + sides, d = b + sides;
      gb.quad(a, b, d, c);
    }
  }
  if (cap) {
    const last = pts[n - 1];
    const tl = norm(sub(pts[n - 1], pts[n - 2]));
    const tip = add(last, mul(tl, radii(1) * 0.8));
    if (o.cell) cellUV(o.cell, 1, 0, uv);
    else bodyUV(o.bodyXY?.[0] ?? 0.5, o.bodyXY?.[1] ?? 0, uv);
    const ti = gb.v(tip[0], tip[1], tip[2], uv[0], uv[1], o.s ?? 1, o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase, tl[0], tl[1], tl[2]);
    const base = v0 + (n - 1) * sides;
    for (let j = 0; j < sides; j++) gb.tri(base + j, base + ((j + 1) % sides), ti);
  }
}

/** Ellipsoid with axes ex/ey/ez (right-handed) and radii; UV from a callback (θ from +ey pole). */
function ellipsoid(
  gb: GeoBuilder, c: V3, ex: V3, ey: V3, ez: V3, r: V3, nLat: number, nLon: number, o: PartOpts,
  uvFn: (th: number, ph: number) => [number, number],
  shape?: (th: number, ph: number) => number,
): void {
  const v0 = gb.vertexCount;
  for (let i = 0; i <= nLat; i++) {
    const th = (i / nLat) * Math.PI;
    for (let j = 0; j <= nLon; j++) {
      const ph = (j / nLon) * Math.PI * 2;
      const k = shape ? shape(th, ph) : 1;
      const lx = Math.sin(th) * Math.cos(ph), ly = Math.cos(th), lz = Math.sin(th) * Math.sin(ph);
      const p = add(c, add(add(mul(ex, lx * r[0] * k), mul(ey, ly * r[1] * k)), mul(ez, lz * r[2] * k)));
      const nn = norm(add(add(mul(ex, lx / r[0]), mul(ey, ly / r[1])), mul(ez, lz / r[2])));
      const [u, v] = uvFn(th, ph);
      gb.v(p[0], p[1], p[2], u, v, o.s ?? 0, o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase, nn[0], nn[1], nn[2]);
    }
  }
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const a = v0 + i * (nLon + 1) + j, b = a + nLon + 1;
      gb.quad(a, a + 1, b + 1, b);
    }
  }
}

/** Flat double-sided blade (swimmerets, tail-fan plates, antennal scales, fans). */
function blade(gb: GeoBuilder, base: V3, tip: V3, across: V3, w0: number, w1: number, nu: number, nv: number, o: PartOpts, bulge = 0): void {
  const v0 = gb.vertexCount;
  const dir = sub(tip, base);
  const nrm = norm(cross(dir, across));
  const uv: [number, number] = [0, 0];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu;
    const w = w0 + (w1 - w0) * t;
    const round = Math.sin(Math.PI * (0.15 + 0.85 * t)) * 0.4 + 0.6;
    for (let j = 0; j <= nv; j++) {
      const s = (j / nv) * 2 - 1;
      const p = add(add(base, mul(dir, t)), add(mul(across, s * w * round), mul(nrm, bulge * (1 - s * s) * w)));
      if (o.cell) cellUV(o.cell, t, s, uv);
      else bodyUV(o.bodyXY?.[0] ?? 0.9, o.bodyXY?.[1] ?? 0, uv);
      gb.v(p[0], p[1], p[2], uv[0], uv[1], o.s ?? t, o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase, nrm[0], nrm[1], nrm[2]);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = v0 + i * (nv + 1) + j, b = a + nv + 1;
      gb.quad(a, b, b + 1, a + 1);
    }
  }
}

/**
 * Loft along a centerline lying in the x–y plane (front → back). Cross-sections are
 * superellipses (half-height hy, half-width hz); UV x is `ux[i]` (body pattern x), UV y the
 * projected height. Front and back poles close the body.
 */
function loftBody(
  gb: GeoBuilder, center: V3[], hy: number[], hz: number[], ux: number[], sides: number, nTop: number, nBot: number, o: PartOpts,
): void {
  const idx0 = gb.idx.length, v0 = gb.vertexCount;
  const n = center.length;
  const uv: [number, number] = [0, 0];
  const front = gb.v(center[0][0] + hz[0] * 0.3, center[0][1], 0, ...bodyUV(ux[0], 0, uv), ux[0], o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase);
  const ring0 = gb.vertexCount;
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? norm(sub(center[1], center[0])) : i === n - 1 ? norm(sub(center[i], center[i - 1])) : norm(sub(center[i + 1], center[i - 1]));
    // In-plane "up" (perpendicular to the tangent, pointing to +y).
    let up: V3 = [-t[1], t[0], 0];
    if (up[1] < 0) up = mul(up, -1);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const e = c >= 0 ? 2 / nTop : 2 / nBot;
      const yy = Math.sign(c) * Math.pow(Math.abs(c), e) * hy[i];
      const zz = Math.sign(s) * Math.pow(Math.abs(s), e) * hz[i];
      const p = add(center[i], add(mul(up, yy), [0, 0, zz]));
      bodyUV(ux[i], clamp(yy / Math.max(1e-5, hy[i]), -1, 1), uv);
      gb.v(p[0], p[1], p[2], uv[0], uv[1], ux[i], o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase);
    }
  }
  const last = center[n - 1];
  const tl = norm(sub(center[n - 1], center[n - 2]));
  const back = gb.v(last[0] + tl[0] * hz[n - 1] * 0.4, last[1] + tl[1] * hz[n - 1] * 0.4, 0, ...bodyUV(ux[n - 1], 0, uv), ux[n - 1], o.part, o.amp, 0, o.pivot[0], o.pivot[1], o.pivot[2], o.phase);
  for (let j = 0; j < sides; j++) gb.tri(front, ring0 + ((j + 1) % sides), ring0 + j);
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = ring0 + i * sides + j, b = ring0 + i * sides + ((j + 1) % sides);
      const c = a + sides, d = b + sides;
      gb.quad(a, c, d, b);
    }
  }
  const lr = ring0 + (n - 1) * sides;
  for (let j = 0; j < sides; j++) gb.tri(lr + j, lr + ((j + 1) % sides), back);
  gb.smoothNormals(idx0, v0);
}

/** Jointed leg: hip → knee → (ankle) → foot, as one tapered tube. */
function leg(gb: GeoBuilder, pts: V3[], r0: number, r1: number, o: PartOpts, sides = 5, seg = 10): void {
  tube(gb, spline(pts, seg), (t) => r0 + (r1 - r0) * t, sides, o);
}

const eyeUV = (th: number, ph: number): [number, number] => {
  const r = Math.min(1, th / (Math.PI / 2));
  return cellUV(ATLAS.eye, 0.5 + 0.5 * Math.cos(ph) * r, Math.sin(ph) * r);
};

// ---------------------------------------------------------------------------------------------
// Painter
// ---------------------------------------------------------------------------------------------

interface PaintSpec {
  /** Physical half-height (in pattern-x units) of the body texture at pattern x. */
  hd: (x: number) => number;
  /** Body detailing: out[0] color multiplier, out[1] height, out[2] opacity of internal organs. */
  detail?: (x: number, y: number, out: Float64Array) => void;
  roughness: number;
  /** Eye style: compound (black, shrimp/crabs) or snail (tiny dark eye). */
  eye: 'compound' | 'snail';
  normalStrength: number;
  /** Soft-body color for snails' foot/head. */
  softBody?: RGB;
}

function finLookOf(look: Appearance, k: 'dorsal' | 'caudal' | 'anal' | 'pelvic' | 'pectoral'): FinLook {
  return look.fins?.[k] ?? {};
}

function paintCellSolid(b: Bufs, cell: Cell, color: RGB, alpha: number, rough: number, seed: number, fl: FinLook | null, bands: number, hdConst: number): void {
  const { s, x0, y0 } = cellSurface(cell, b.W, b.H, (lx) => lx, (ly) => ly * 2 - 1, () => hdConst, seed, true);
  for (let r = 0; r < s.h; r++) {
    for (let c = 0; c < s.w; c++) {
      const x = s.px[c], y = s.py[r];
      const i = (y0 + r) * b.W + x0 + c;
      // Joints / segment rings darken slightly; a lighter top, darker underside.
      const seg = bands > 0 ? Math.exp(-((((x * bands) % 1) - 0.5) ** 2) / 0.004) : 0;
      const k = (1 - 0.18 * seg) * (1 + 0.06 * y) * (1 + 0.06 * (fastNoise(x * 30 + (seed % 41), y * 6) - 0.5));
      b.col[i * 3] = color[0] * k;
      b.col[i * 3 + 1] = color[1] * k;
      b.col[i * 3 + 2] = color[2] * k;
      b.alpha[i] = alpha;
      b.height[i] = -0.5 * seg;
      b.rough[i] = rough;
      b.metal[i] = 0;
      b.irid[i] = 0;
    }
  }
  if (fl) {
    const op = Math.max(alpha, 0.85);
    if (fl.edge) {
      clearMask(b, s);
      const ew = clamp(fl.edgeWidth ?? 0.12, 0.02, 0.6);
      rasterize({ type: 'region', color: fl.edge, x0: 1 - ew, x1: 1, softness: 0.02 }, s, b.mask);
      composite(b, s, x0, y0, hex(fl.edge), op);
    }
    for (const p of fl.patterns ?? []) {
      if (p.type === 'scales' || p.type === 'mask') continue;
      if (p.type === 'blotch' && p.ring) {
        clearMask(b, s);
        rasterizeRing(p, s, b.mask);
        composite(b, s, x0, y0, hex(p.ring), op);
      }
      clearMask(b, s);
      if (rasterize(p, s, b.mask)) composite(b, s, x0, y0, hex(p.color), op);
    }
  }
}

function paintInvertAtlas(sp: Species, look: Appearance, spec: PaintSpec, N: number): FishTextures {
  const seed = hashString(sp.id) & 0xffff;
  const b = bufs(N);
  const base = hex(look.base);
  const dorsal = look.dorsal ? hex(look.dorsal) : base;
  const ventral = look.ventral ? hex(look.ventral) : mix(base, [0.9, 0.88, 0.84], 0.35);
  const transl = clamp(look.translucency ?? 0, 0, 1);
  const finC = hex(look.fin);
  // ---- body ----
  const { s, x0, y0 } = cellSurface(ATLAS.body, b.W, b.H, (lx) => lx, (ly) => 1 - 2 * ly, (x) => spec.hd(clamp(x, 0, 1)), seed, false);
  const det = new Float64Array(3);
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    const wd = smooth(0.2, 0.95, y), wv = smooth(-0.2, -0.95, y);
    for (let c = 0; c < s.w; c++) {
      const i = (y0 + r) * b.W + x0 + c;
      let cr = base[0] + (dorsal[0] - base[0]) * wd, cg = base[1] + (dorsal[1] - base[1]) * wd, cb = base[2] + (dorsal[2] - base[2]) * wd;
      cr += (ventral[0] - cr) * wv;
      cg += (ventral[1] - cg) * wv;
      cb += (ventral[2] - cb) * wv;
      b.col[i * 3] = cr;
      b.col[i * 3 + 1] = cg;
      b.col[i * 3 + 2] = cb;
      b.alpha[i] = 1;
      b.rough[i] = spec.roughness;
      b.metal[i] = 0;
      b.irid[i] = 0;
      b.height[i] = 0;
    }
  }
  const patterns: Pattern[] = look.patterns ?? [];
  for (const p of patterns) {
    if (p.type === 'scales' && spec.eye === 'compound') continue;
    if (p.type === 'blotch' && p.ring) {
      clearMask(b, s);
      rasterizeRing(p, s, b.mask);
      composite(b, s, x0, y0, hex(p.ring));
    }
    clearMask(b, s);
    if (p.type === 'scales') {
      // Brittle-star arm plates: a fine scale-like reticulation.
      rasterize({ type: 'reticulate', color: p.color, scale: 30, thickness: 0.25 }, s, b.mask);
      composite(b, s, x0, y0, hex(p.color), 0, clamp(p.contrast, 0, 1));
      continue;
    }
    if (rasterize(p, s, b.mask)) composite(b, s, x0, y0, hex(p.color));
    if (p.type === 'stripe' && p.glow) {
      for (let k = 0; k < s.w * s.h; k++) {
        const m = b.mask[k];
        if (m <= 0) continue;
        const i = (y0 + Math.floor(k / s.w)) * b.W + x0 + (k % s.w);
        const col = hex(p.color);
        b.emis[i * 3] = col[0] * m * 0.3 * p.glow;
        b.emis[i * 3 + 1] = col[1] * m * 0.3 * p.glow;
        b.emis[i * 3 + 2] = col[2] * m * 0.3 * p.glow;
      }
    }
  }
  for (let r = 0; r < s.h; r++) {
    const y = s.py[r];
    for (let c = 0; c < s.w; c++) {
      const x = s.px[c];
      const i = (y0 + r) * b.W + x0 + c;
      det[0] = 1;
      det[1] = 0;
      det[2] = 0;
      spec.detail?.(x, y, det);
      const mott = 1 + 0.06 * (fastNoise(x * 16 + (seed % 37), y * s.hd[c] * 16) - 0.5);
      const k = det[0] * mott;
      b.col[i * 3] *= k;
      b.col[i * 3 + 1] *= k;
      b.col[i * 3 + 2] *= k;
      b.height[i] = det[1];
      if (transl > 0.05) b.alpha[i] = clamp(1 - transl * (1 - det[2]) * 0.92, 0.1, 1);
    }
  }
  // ---- appendage cells ----
  const legA = clamp(1 - transl * 0.75, 0.3, 1);
  const legLook = finLookOf(look, 'pelvic');
  paintCellSolid(b, ATLAS.pelvic, hex(legLook.color ?? look.fin), clamp(legLook.opacity ?? legA, 0.2, 1), spec.roughness, seed + 1, legLook, 6, 0.08);
  const clawLook = finLookOf(look, 'pectoral');
  paintCellSolid(b, ATLAS.pectoral, hex(clawLook.color ?? look.fin ?? look.base), clamp(clawLook.opacity ?? Math.max(legA, 0.6), 0.25, 1), spec.roughness * 0.85, seed + 2, clawLook, 2, 0.2);
  const tailLook = finLookOf(look, 'caudal');
  paintCellSolid(b, ATLAS.caudal, hex(tailLook.color ?? look.base), clamp(tailLook.opacity ?? Math.max(0.45, 1 - transl * 0.8), 0.2, 1), spec.roughness, seed + 3, tailLook, 0, 0.5);
  paintCellSolid(b, ATLAS.anal, mix(finC, base, 0.35), Math.max(0.75, legA), spec.roughness, seed + 4, null, 12, 0.02);
  const spineLook = finLookOf(look, 'dorsal');
  paintCellSolid(b, ATLAS.dorsal, hex(spineLook.color ?? look.fin), 1, 0.35, seed + 5, spineLook, 0, 0.06);
  paintCellSolid(b, ATLAS.dorsal2, spec.softBody ?? finC, 1, 0.5, seed + 6, null, 0, 0.3);
  paintCellSolid(b, ATLAS.adipose, hex(look.eye ?? look.fin), 1, 0.35, seed + 7, null, 0, 0.1);
  // Snail soft body: fine pale speckles.
  {
    const [sx0, sy0, sw, sh] = rect(ATLAS.dorsal2, b.W, b.H);
    for (let r = 0; r < sh; r++) for (let c = 0; c < sw; c++) {
      const i = (sy0 + r) * b.W + sx0 + c;
      const sp2 = smooth(0.82, 0.9, hash2(c >> 1, r >> 1, seed));
      b.col[i * 3] += (0.85 - b.col[i * 3]) * sp2 * 0.5;
      b.col[i * 3 + 1] += (0.82 - b.col[i * 3 + 1]) * sp2 * 0.5;
      b.col[i * 3 + 2] += (0.7 - b.col[i * 3 + 2]) * sp2 * 0.5;
    }
  }
  // ---- eye ----
  {
    const cell = ATLAS.eye;
    const [ex0, ey0, w, h] = rect(cell, b.W, b.H);
    const tmp: [number, number] = [0, 0];
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        cellLocal(cell, (ex0 + c + 0.5) / b.W, (ey0 + r + 0.5) / b.H, tmp);
        const ex = tmp[0] * 2 - 1, ey = tmp[1] * 2 - 1;
        const rad = Math.hypot(ex, ey);
        const i = (ey0 + r) * b.W + ex0 + c;
        let g: number;
        if (spec.eye === 'compound') {
          // Ommatidia: very dark with a faint hexagonal sheen.
          const facet = 0.5 + 0.5 * Math.sin(ex * 60) * Math.sin(ey * 60);
          g = 0.03 + 0.03 * facet;
        } else {
          g = rad < 0.5 ? 0.02 : 0.05;
        }
        b.col[i * 3] = g;
        b.col[i * 3 + 1] = g;
        b.col[i * 3 + 2] = g * 1.1;
        b.alpha[i] = 1;
        b.rough[i] = 0.08;
        b.metal[i] = 0;
        b.irid[i] = 0;
        b.height[i] = 0;
      }
    }
  }
  return packAtlas(b, N, spec.normalStrength);
}

// ---------------------------------------------------------------------------------------------
// Shrimp & crayfish
// ---------------------------------------------------------------------------------------------

function keyOf(sp: Species): string {
  return `${sp.id} ${sp.commonName} ${sp.scientificName} ${sp.description}`.toLowerCase();
}

type ClawKind = 'small' | 'long' | 'big-one' | 'leaf' | 'fan' | 'raptorial' | 'crayfish';

function shrimpLike(sp: Species, body: ResolvedBody, look: Appearance, detail: number, crayfish: boolean): InvertGeometry {
  const key = keyOf(sp);
  const gb = new GeoBuilder();
  const fb = new GeoBuilder();
  const rng = new Rng(hashString(sp.id));
  const D = body.depth;
  const yc = -0.425 * D;
  const mantis = /odontodactylus|lysiosquill|squilla|mantis/.test(key);
  let claws: ClawKind = 'small';
  if (crayfish) claws = 'crayfish';
  else if (mantis) claws = 'raptorial';
  else if (/stenopus|macrobrachium|saron/.test(key)) claws = 'long';
  else if (/alpheus|pistol/.test(key)) claws = 'big-one';
  else if (/hymenocera|harlequin/.test(key)) claws = 'leaf';
  else if (/atya|atyopsis|fan shrimp|bamboo shrimp|wood shrimp/.test(key)) claws = 'fan';

  // Proportions (body length 1: rostrum tip at x=+0.5, telson end at x=−0.5).
  const depth = clamp(D, 0.12, 0.4);
  const width = clamp(body.width, 0.1, 0.35);
  const hScale = depth / 0.2;
  const wScale = width / 0.16;
  const arch = clamp(body.backArch, -1, 1);
  const rostrum = body.snout === 'elongate' ? 0.26 : body.snout === 'blunt' ? 0.04 : body.snout === 'upturned' ? 0.2 : 0.13;
  const carStart = 0.5 - rostrum;
  // Stations: x, y, half-height, half-width (before scaling).
  const st = crayfish
    ? [
        [carStart, 0.0, 0.035, 0.035], [carStart - 0.05, 0.005, 0.06, 0.06], [0.22, 0.012, 0.075, 0.075], [0.08, 0.015, 0.08, 0.08],
        [0.0, 0.015, 0.07, 0.078], [-0.08, 0.012, 0.062, 0.074], [-0.16, 0.008, 0.057, 0.07], [-0.24, 0.0, 0.052, 0.064],
        [-0.31, -0.008, 0.045, 0.058], [-0.37, -0.015, 0.035, 0.048], [-0.4, -0.018, 0.026, 0.038],
      ]
    : [
        [carStart, 0.035, 0.03, 0.028], [carStart - 0.05, 0.03, 0.055, 0.045], [0.22, 0.026, 0.074, 0.062], [0.13, 0.025, 0.08, 0.064],
        [0.05, 0.026, 0.075, 0.06], [0.0, 0.03, 0.072, 0.056], [-0.07, 0.035 + 0.02 * arch, 0.07, 0.052],
        [-0.14, 0.03 + 0.045 * arch, 0.064, 0.047], [-0.21, 0.01 + 0.03 * arch, 0.055, 0.041], [-0.27, -0.012 + 0.005 * arch, 0.046, 0.035],
        [-0.34, -0.03 - 0.01 * arch, 0.036, 0.029], [-0.385, -0.04 - 0.02 * arch, 0.026, 0.022],
      ];
  if (mantis) {
    // Mantis shrimp: long, straight, dorsoventrally flattened.
    for (const s of st) {
      s[1] = s[1] * 0.3;
      s[2] *= 0.8;
      s[3] *= 1.35;
    }
  }
  const nRing = Math.round((crayfish ? 34 : 30) * detail);
  const ctrl: V3[] = st.map((s) => [s[0], s[1] * hScale, 0]);
  const centers = spline(ctrl, nRing);
  const hyC = spline(st.map((s) => [s[2] * hScale, 0, 0] as V3), nRing).map((p) => p[0]);
  const hzC = spline(st.map((s) => [s[3] * wScale, 0, 0] as V3), nRing).map((p) => p[0]);
  const ux = centers.map((p) => clamp(0.5 - p[0], 0, 1));
  const bodyOpts: PartOpts = { part: PART.invBody, pivot: [0, 0, 0], phase: 0, amp: 0 };
  loftBody(gb, centers, hyC, hzC, ux, Math.round(16 * detail), 2.2, crayfish ? 2.6 : 2.4, bodyOpts);
  const sampleAt = (x: number) => {
    let best = 0;
    for (let i = 0; i < centers.length; i++) if (Math.abs(centers[i][0] - x) < Math.abs(centers[best][0] - x)) best = i;
    return { c: centers[best], hy: hyC[best], hz: hzC[best] };
  };

  // Rostrum: a thin upturned blade with teeth (texture), body colored.
  {
    const r0 = sampleAt(carStart + 0.01);
    const up = body.snout === 'upturned' ? 0.05 : body.snout === 'elongate' ? 0.025 : 0.015;
    const pts = spline([[carStart + 0.01, r0.c[1] + r0.hy * 0.55, 0], [carStart + rostrum * 0.5, r0.c[1] + r0.hy * 0.5 + up * 0.4, 0], [0.5, r0.c[1] + r0.hy * 0.35 + up, 0]], 6);
    tube(gb, pts, (t) => (0.012 + 0.006 * hScale) * (1 - 0.85 * t), 4, { ...bodyOpts, bodyXY: [0.05, 0.9] }, true, 0.35, [0, 0, 1]);
  }

  // Eyes on short stalks.
  {
    const e = sampleAt(carStart - 0.01);
    const eyeR = (mantis ? 0.04 : 0.024) * clamp(body.eyeSize / 0.33, 0.6, 1.6);
    for (const side of [1, -1]) {
      const a: V3 = [carStart - 0.015, e.c[1] + e.hy * 0.45, side * e.hz * 0.5];
      const bpt: V3 = [carStart + 0.01, e.c[1] + e.hy * (mantis ? 1.2 : 0.65), side * (e.hz * 0.95 + eyeR * 0.6)];
      tube(gb, spline([a, bpt], 3), () => eyeR * 0.45, 5, { part: PART.stalk, pivot: a, phase: side, amp: 0.5, cell: ATLAS.adipose }, false);
      const out = norm([0.5, 0.3, side]);
      const ez = norm(cross(out, [0, 1, 0]));
      const ey2 = cross(ez, out);
      ellipsoid(gb, add(bpt, mul(out, eyeR * 0.5)), ez, out, ey2, [eyeR, eyeR, eyeR], 6, 10,
        { part: PART.stalk, pivot: a, phase: side, amp: 0.5 }, (th, ph) => eyeUV(th, ph));
    }
  }

  // Antennae (barbels = count/length) and antennules.
  {
    const nAnt = Math.max(2, Math.min(4, Math.round(body.barbels || 2)));
    const antLen = body.barbels > 0 ? clamp(body.barbelLength, 0.15, 2.5) : crayfish ? 0.9 : 1.1;
    const e = sampleAt(carStart - 0.005);
    for (let k = 0; k < nAnt; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const long = k < 2;
      const L = long ? antLen : antLen * 0.35;
      const base: V3 = [carStart - 0.01, e.c[1] + e.hy * (long ? -0.1 : 0.2), side * e.hz * (long ? 0.55 : 0.3)];
      const pts: V3[] = [base];
      let dir = norm([1, long ? 0.15 : 0.45, side * (long ? 0.35 : 0.2)]);
      let p = base;
      const segs = long ? 16 : 6;
      for (let i = 0; i < segs; i++) {
        p = add(p, mul(dir, L / segs));
        pts.push(p);
        // Long antennae sweep outward and back over the body; slight droop.
        if (long) dir = norm(add(dir, [-0.07, -0.035, side * 0.04]));
        else dir = norm(add(dir, [0, 0.03, side * 0.05]));
      }
      tube(fb, pts, (t) => (long ? 0.005 : 0.004) * (1 - 0.8 * t) + 0.0006, 4, { part: PART.antenna, pivot: base, phase: rng.next() * 6.28, amp: long ? 1 : 0.6, cell: ATLAS.anal }, false);
    }
    // Antennal scales (scaphocerites) of carideans.
    if (!crayfish && !mantis) {
      for (const side of [1, -1]) {
        const b0: V3 = [carStart - 0.02, e.c[1], side * e.hz * 0.8];
        blade(fb, b0, add(b0, [0.11, 0.01, side * 0.02]), [0, 0, side], 0.012, 0.008, 4, 2, { part: PART.invBody, pivot: b0, phase: 0, amp: 0, cell: ATLAS.caudal });
      }
    }
  }

  // Walking legs (pereiopods) and claws.
  const legOpts = (pivot: V3, phase: number, part: number = PART.leg): PartOpts => ({ part, pivot, phase, amp: 1, cell: ATLAS.pelvic });
  {
    const hips = crayfish ? [0.2, 0.15, 0.1, 0.05, 0.0] : [0.27 - (0.5 - carStart - 0.13) * 0.3, 0.2, 0.15, 0.1, 0.05];
    const legR = (crayfish ? 0.011 : 0.008) * Math.sqrt(hScale);
    for (let i = 0; i < 5; i++) {
      const hx = hips[i];
      const h = sampleAt(hx);
      const hipY = h.c[1] - h.hy * 0.75;
      for (const side of [1, -1]) {
        const hip: V3 = [hx, hipY, side * h.hz * 0.45];
        const ph = i * 1.9 + (side > 0 ? 0 : Math.PI);
        const isClaw = i === 0 || (i === 1 && (claws === 'long' || claws === 'fan' || claws === 'small'));
        if (claws === 'crayfish' && i === 0) {
          // Big chelae on long arms, held forward.
          const sz = 1;
          const elbow: V3 = [hx + 0.1, hipY + 0.02, side * (h.hz + 0.09)];
          const wrist: V3 = [hx + 0.2, hipY + 0.0, side * (h.hz + 0.11)];
          leg(gb, [hip, lerp3(hip, elbow, 0.5), elbow, wrist], legR * 1.6, legR * 1.4, { ...legOpts(hip, ph, PART.claw), cell: ATLAS.pectoral });
          clawMesh(gb, wrist, norm([1, -0.05, side * -0.1]), side, 0.2 * sz, 0.055 * sz, hip);
          continue;
        }
        if (claws === 'raptorial' && i === 0) {
          // Mantis-shrimp raptorial appendage folded under the head like a jackknife.
          const elbow: V3 = [carStart + 0.02, hipY - 0.01, side * h.hz * 0.8];
          const tip: V3 = [carStart - 0.12, hipY - 0.02, side * h.hz * 0.9];
          leg(gb, [hip, elbow, tip], legR * 2.6, legR * 2, { ...legOpts(hip, ph, PART.claw), cell: ATLAS.pectoral }, 6, 8);
          continue;
        }
        if (isClaw && claws !== 'small') {
          const big = claws === 'big-one' ? (side > 0 ? 1.6 : 0.6) : claws === 'leaf' ? 1.1 : 1;
          if (claws === 'fan') {
            // Atyid filter fans: a tuft of fine setae at the end of a short arm.
            const tip: V3 = [hx + 0.07, hipY - 0.02, side * (h.hz * 0.6)];
            leg(gb, [hip, tip], legR, legR * 0.8, legOpts(hip, ph, PART.maxilliped), 4, 4);
            for (let f = 0; f < 5; f++) {
              const a = (f / 4 - 0.5) * 1.2;
              blade(fb, tip, add(tip, [0.05 * Math.cos(a), -0.01, side * 0.05 * Math.sin(a) + side * 0.01]), [0, 1, 0], 0.003, 0.006, 3, 1, { part: PART.maxilliped, pivot: hip, phase: ph, amp: 1, cell: ATLAS.pectoral });
            }
            continue;
          }
          const reach = claws === 'long' ? (i === 1 || /stenopus/.test(key) ? 0.55 : 0.4) : 0.22 * big;
          const elbow: V3 = [hx + reach * 0.35, hipY + 0.04, side * (h.hz + reach * 0.25)];
          const wrist: V3 = [hx + reach * 0.75, hipY + 0.02, side * (h.hz + reach * 0.2)];
          leg(gb, [hip, elbow, wrist], legR * 1.2, legR, { ...legOpts(hip, ph, PART.claw), cell: ATLAS.pectoral }, 5, 10);
          if (claws === 'leaf') {
            blade(gb, wrist, add(wrist, [0.14, 0.02, side * 0.03]), norm([0, 1, side * 0.3]), 0.05, 0.03, 4, 2, { part: PART.claw, pivot: hip, phase: ph, amp: 0.3, cell: ATLAS.pectoral }, 0.2);
          } else clawMesh(gb, wrist, norm([1, 0.05, side * 0.15]), side, (claws === 'long' ? 0.12 : 0.13) * big, (claws === 'long' ? 0.022 : 0.04) * big, hip);
          continue;
        }
        if (isClaw) {
          // Small picking chelipeds of caridean shrimp: constantly busy at the substrate.
          const knee: V3 = [hx + 0.05, hipY - 0.01, side * (h.hz * 0.6 + 0.02)];
          const tip: V3 = [hx + 0.1, yc + 0.012, side * (h.hz * 0.45 + 0.015)];
          leg(gb, [hip, knee, tip], legR * 0.85, legR * 0.5, legOpts(hip, ph, PART.maxilliped), 4, 6);
          continue;
        }
        // Walking legs: knee raised and splayed, foot planted on the contact plane.
        const spread = (crayfish ? 0.15 : 0.12) + 0.02 * (i - 2);
        const knee: V3 = [hx + 0.03 - 0.025 * (i - 2), hipY + 0.035 * hScale, side * (h.hz + spread * 0.75)];
        const foot: V3 = [hx + 0.06 - 0.06 * (i - 2), yc, side * (h.hz + spread)];
        leg(gb, [hip, knee, lerp3(knee, foot, 0.6), foot], legR, legR * 0.45, legOpts(hip, ph), 4, 8);
      }
    }
  }

  // Pleopods (swimmerets) under abdominal segments 1–5.
  {
    const xs = crayfish ? [-0.04, -0.12, -0.2, -0.27, -0.33] : [-0.02, -0.09, -0.16, -0.23, -0.29];
    for (let i = 0; i < 5; i++) {
      const s0 = sampleAt(xs[i]);
      for (const side of [1, -1]) {
        const a: V3 = [xs[i], s0.c[1] - s0.hy * 0.8, side * s0.hz * 0.35];
        blade(fb, a, add(a, [-0.03, -0.05 * hScale, side * 0.008]), [1, 0, 0], 0.008, 0.012, 3, 1, { part: PART.pleopod, pivot: a, phase: i * 0.9, amp: 1, cell: ATLAS.caudal });
      }
    }
  }

  // Tail fan: telson + two pairs of uropods.
  {
    const end = centers[centers.length - 1];
    const piv: V3 = [end[0] + 0.01, end[1], 0];
    const k = crayfish ? 1.4 : 1;
    const tO: PartOpts = { part: PART.tailFan, pivot: piv, phase: 0, amp: 1, cell: ATLAS.caudal };
    blade(fb, piv, add(piv, [-0.12 * k, -0.01, 0]), [0, 0, 1], 0.018 * k, 0.012 * k, 4, 2, tO);
    for (const side of [1, -1]) {
      blade(fb, add(piv, [0, 0, side * 0.01]), add(piv, [-0.11 * k, -0.008, side * 0.045 * k]), norm([0.2, 0, side]), 0.018 * k, 0.02 * k, 4, 2, tO);
      blade(fb, add(piv, [0, 0, side * 0.016]), add(piv, [-0.1 * k, -0.006, side * 0.085 * k]), norm([0.4, 0, side]), 0.018 * k, 0.022 * k, 4, 2, tO);
    }
  }

  // Texture detail: segment grooves, cervical groove, gut and organs (seen in clear shrimp).
  const segX = (crayfish ? [0.04, -0.04, -0.12, -0.2, -0.27, -0.33, -0.38] : [0.03, -0.035, -0.105, -0.175, -0.245, -0.31, -0.365]).map((x) => 0.5 - x);
  const cervical = 0.5 - (crayfish ? 0.2 : 0.21);
  const spec: PaintSpec = {
    hd: (x) => sampleAt(0.5 - x).hy,
    roughness: crayfish ? 0.42 : 0.3,
    eye: 'compound',
    normalStrength: 5,
    detail: (x, y, out) => {
      let g = 0;
      for (const sx of segX) g = Math.max(g, Math.exp(-(((x - sx) / 0.005) ** 2)));
      const cg = Math.exp(-(((x - cervical - 0.03 * y) / 0.006) ** 2)) * smooth(-0.5, 0.2, y);
      out[0] = 1 - 0.22 * g - 0.12 * cg;
      out[1] = -0.8 * g - 0.5 * cg + 0.15 * (valueNoise(x * 200, y * 20, 3) - 0.5);
      // Gut line along the back of the abdomen; hepatopancreas and gonads in the carapace.
      const gut = Math.exp(-(((y - 0.45) / 0.08) ** 2)) * smooth(0.35, 0.45, x) * (1 - smooth(0.85, 0.9, x));
      const liver = 1 - smooth(0.7, 1.0, Math.hypot((x - 0.32) / 0.1, (y - 0.1) / 0.5));
      out[2] = clamp(Math.max(gut * 0.6, liver * 0.7), 0, 1);
      out[0] *= 1 - 0.25 * gut * clamp(look.translucency ?? 0, 0, 1);
    },
  };
  const half: [number, number, number] = [0.5, depth * 0.6, width * 0.6];
  return finish(gb, fb, sp, look, spec, half);
}

/** A pincer: palm (propodus) + fixed finger + movable finger (dactyl, part claw). */
function clawMesh(gb: GeoBuilder, wrist: V3, dir: V3, side: number, L: number, R: number, pivot: V3): void {
  const o: PartOpts = { part: PART.claw, pivot, phase: side, amp: 1, cell: ATLAS.pectoral };
  const palmEnd = add(wrist, mul(dir, L * 0.55));
  tube(gb, spline([wrist, lerp3(wrist, palmEnd, 0.5), palmEnd], 5), (t) => R * (0.75 + 0.35 * Math.sin(Math.PI * (0.2 + 0.7 * t))), 7, o, false, 0.7, [0, 0, 1]);
  const up: V3 = [0, 1, 0];
  const fixedTip = add(add(palmEnd, mul(dir, L * 0.45)), mul(up, -R * 0.2));
  tube(gb, spline([add(palmEnd, mul(up, -R * 0.3)), fixedTip], 4), (t) => R * 0.45 * (1 - 0.8 * t), 5, o, true, 0.8);
  const dPiv = add(palmEnd, mul(up, R * 0.35));
  const dTip = add(add(palmEnd, mul(dir, L * 0.45)), mul(up, R * 0.25));
  tube(gb, spline([dPiv, lerp3(dPiv, dTip, 0.5), dTip], 4), (t) => R * 0.4 * (1 - 0.8 * t), 5, { ...o, pivot: dPiv, amp: 1.2 }, true, 0.8);
}

// ---------------------------------------------------------------------------------------------
// Crabs & hermit crabs
// ---------------------------------------------------------------------------------------------

function crab(sp: Species, body: ResolvedBody, look: Appearance, detail: number): InvertGeometry {
  const key = keyOf(sp);
  const gb = new GeoBuilder();
  const fb = new GeoBuilder();
  const D = clamp(body.depth, 0.15, 0.7);
  const yc = -0.425 * D;
  const arrow = /stenorhynchus|arrow crab/.test(key) || body.snout === 'elongate';
  const flat = D < 0.25;
  // Crab design frame: head toward +x', width along z'. Carapace width = 1.
  const cw = arrow ? clamp(body.width, 0.2, 0.5) : 1;
  const cl = arrow ? cw * 1.6 : 0.78 * clamp(body.width, 0.6, 1.2);
  const ch = clamp(D * 0.75, 0.1, 0.42);
  const bodyBottom = yc + (flat ? 0.04 : 0.09) * (arrow ? 2.2 : 1);
  const cy = bodyBottom + ch * 0.35;
  const o: PartOpts = { part: PART.invBody, pivot: [0, 0, 0], phase: 0, amp: 0 };
  // Carapace: a domed, slightly squared superellipsoid; UV maps x front→back, y over the dome.
  ellipsoid(gb, [0, cy, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [cl / 2, ch * 0.75, cw / 2], Math.round(12 * detail), Math.round(24 * detail), o,
    (th, ph) => bodyUV(0.5 - 0.5 * Math.sin(th) * Math.cos(ph), clamp(Math.cos(th) * 1.6, -1, 1)),
    // Squarer outline in plan view (crabs are broad-fronted).
    (_th, ph) => Math.pow(Math.abs(Math.cos(ph)) ** 3 + Math.abs(Math.sin(ph)) ** 3, -1 / 3) * 0.9);
  if (arrow) {
    // Long rostrum spike.
    tube(gb, spline([[cl * 0.45, cy + ch * 0.2, 0], [cl * 0.9, cy + ch * 0.45, 0], [cl * 1.3, cy + ch * 0.6, 0]], 6), (t) => 0.025 * cw * (1 - t), 4, { ...o, bodyXY: [0.02, 0.8] });
  }
  // Eyes on stalks at the front corners.
  for (const side of [1, -1]) {
    const a: V3 = [cl * 0.42, cy + ch * 0.25, side * cw * (arrow ? 0.18 : 0.2)];
    const b: V3 = add(a, [0.03, 0.05, side * 0.02]);
    tube(gb, [a, lerp3(a, b, 0.5), b], () => 0.016, 5, { part: PART.stalk, pivot: a, phase: side, amp: 0.4, cell: ATLAS.adipose }, false);
    ellipsoid(gb, b, [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.024, 0.024, 0.024], 5, 8, { part: PART.stalk, pivot: a, phase: side, amp: 0.4 }, eyeUV);
  }
  // Walking legs (4 pairs) radiating from the sides; chelipeds in front.
  const legLen = arrow ? 1.9 : flat ? 0.85 : 0.62;
  const legR = (arrow ? 0.012 : 0.03) * (flat ? 0.8 : 1);
  for (let i = 0; i < 4; i++) {
    const ang = 0.55 - i * 0.42; // fore/aft angle of each leg pair
    for (const side of [1, -1]) {
      const hip: V3 = [Math.sin(ang) * cl * 0.38, bodyBottom + 0.02, side * cw * 0.4];
      const out: V3 = norm([Math.sin(ang) * 0.9, 0, side * Math.cos(ang)]);
      const knee = add(add(hip, mul(out, legLen * 0.42)), [0, (arrow ? 0.25 : 0.14) + 0.02 * i, 0]);
      const ankle = add(add(hip, mul(out, legLen * 0.78)), [0, 0.04, 0]);
      const foot = add(add(hip, mul(out, legLen * 0.95)), [0, 0, 0]);
      foot[1] = yc;
      leg(gb, [hip, knee, ankle, foot], legR, legR * 0.35, { part: PART.leg, pivot: hip, phase: i * 1.6 + (side > 0 ? 0 : Math.PI), amp: 1, cell: ATLAS.pelvic }, 5, 10);
    }
  }
  for (const side of [1, -1]) {
    const hip: V3 = [cl * 0.35, bodyBottom + 0.03, side * cw * 0.28];
    const elbow: V3 = [cl * 0.5 + 0.08, bodyBottom + 0.06, side * cw * (arrow ? 0.4 : 0.45)];
    const wrist: V3 = [cl * 0.55 + 0.12, bodyBottom + 0.05, side * cw * 0.22];
    const s = arrow ? 0.5 : 1;
    leg(gb, [hip, elbow, wrist], 0.04 * s, 0.035 * s, { part: PART.claw, pivot: hip, phase: side, amp: 0.6, cell: ATLAS.pectoral }, 6, 8);
    clawMesh(gb, wrist, norm([0.6, -0.1, -side * 0.75]), side, 0.26 * s, 0.075 * s, hip);
  }
  // Rotate the crab 90° so it walks sideways along the instance's forward axis (+X = its right).
  const rot = (g: GeoBuilder) => {
    g.transform(0, (x, y, z, out) => {
      out[0] = -z;
      out[1] = y;
      out[2] = x;
    }, (x, y, z, out) => {
      out[0] = -z;
      out[1] = y;
      out[2] = x;
    });
    // Pivots too (aFin xyz).
    const f = g.fin;
    for (let i = 0; i < f.length; i += 4) {
      const x = f[i], z = f[i + 2];
      f[i] = -z;
      f[i + 2] = x;
    }
  };
  rot(gb);
  rot(fb);
  const spec: PaintSpec = {
    hd: () => 0.5,
    roughness: 0.38,
    eye: 'compound',
    normalStrength: 4,
    detail: (x, y, out) => {
      // Granular carapace with regions (gastric / branchial grooves).
      const gran = smooth(0.7, 0.9, valueNoise(x * 90, y * 40, 5));
      const groove = Math.exp(-(((Math.abs(x - 0.5) - 0.12 - 0.08 * y) / 0.015) ** 2)) * smooth(0.2, 0.6, y);
      out[0] = 1 - 0.12 * groove + 0.05 * gran;
      out[1] = 0.4 * gran - 0.6 * groove;
      out[2] = 1;
    },
  };
  const half: [number, number, number] = [0.6 * legLen + 0.3, D * 0.6, 0.6 * legLen + 0.3];
  return finish(gb, fb, sp, look, spec, half);
}

function hermitCrab(sp: Species, body: ResolvedBody, look: Appearance, detail: number): InvertGeometry {
  const gb = new GeoBuilder();
  const fb = new GeoBuilder();
  const D = clamp(body.depth, 0.4, 0.9);
  const yc = -0.425 * D;
  // The borrowed shell (base color): a turban-like coil over the back half, aperture forward.
  const shellLen = 0.68;
  // Aperture faces forward (the crab emerges from it); the spire points up and back.
  orientedShell(gb, { W: 3.2, T: 1.5, ka: 0.85, kb: 0.95, whorls: 4.2, apertureFlare: 0.1 }, shellLen, clamp(body.width, 0.4, 0.8) * 0.9, detail,
    [-0.85, 0.5, 0.12], [0.6, -1, 0], yc + 0.02, -0.12);
  // Crab front emerging from the aperture.
  const o: PartOpts = { part: PART.invBody, pivot: [0, 0, 0], phase: 0, amp: 0 };
  const hc: V3 = [0.2, yc + 0.17, 0];
  ellipsoid(gb, hc, [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.11, 0.06, 0.08], 8, 12, o, (th, ph) => cellUV(ATLAS.pelvic, 0.2 + 0.3 * Math.sin(th) * Math.cos(ph), Math.cos(th)));
  for (const side of [1, -1]) {
    // Long eyestalks (eye color) with dark eyes.
    const a: V3 = [0.3, yc + 0.2, side * 0.025];
    const b: V3 = [0.38, yc + 0.32, side * 0.05];
    tube(gb, [a, lerp3(a, b, 0.5), b], () => 0.012, 5, { part: PART.stalk, pivot: a, phase: side, amp: 0.5, cell: ATLAS.adipose }, false);
    ellipsoid(gb, b, [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.018, 0.022, 0.018], 5, 8, { part: PART.stalk, pivot: a, phase: side, amp: 0.5 }, eyeUV);
    // Antennae.
    const ab: V3 = [0.3, yc + 0.17, side * 0.04];
    tube(fb, spline([ab, [0.45, yc + 0.25, side * 0.12], [0.55, yc + 0.22, side * 0.3], [0.5, yc + 0.18, side * 0.45]], 10), (t) => 0.004 * (1 - 0.7 * t), 4, { part: PART.antenna, pivot: ab, phase: side * 2, amp: 1, cell: ATLAS.anal }, false);
    // Walking legs (2 visible pairs), banded via fins.pelvic.
    for (let i = 0; i < 2; i++) {
      const hip: V3 = [0.18 - i * 0.07, yc + 0.12, side * 0.06];
      const knee: V3 = [0.3 - i * 0.05, yc + 0.22, side * (0.2 + 0.03 * i)];
      const foot: V3 = [0.42 - i * 0.1, yc, side * (0.24 + 0.04 * i)];
      leg(gb, [hip, knee, lerp3(knee, foot, 0.6), foot], 0.026, 0.01, { part: PART.leg, pivot: hip, phase: i * 2.2 + (side > 0 ? 0 : Math.PI), amp: 1, cell: ATLAS.pelvic }, 5, 9);
    }
    // Chelipeds (left one bigger in most hermit crabs).
    const big = side < 0 ? 1.25 : 0.85;
    const hip: V3 = [0.25, yc + 0.12, side * 0.05];
    const wrist: V3 = [0.36, yc + 0.1, side * 0.06];
    leg(gb, [hip, lerp3(hip, wrist, 0.5), wrist], 0.03 * big, 0.026 * big, { part: PART.claw, pivot: hip, phase: side, amp: 0.6, cell: ATLAS.pectoral }, 6, 6);
    clawMesh(gb, wrist, norm([1, -0.15, side * 0.05]), side, 0.13 * big, 0.05 * big, hip);
  }
  const spec = shellPaintSpec(look, 3.2, 1.5);
  const half: [number, number, number] = [0.5, D * 0.6, 0.35];
  return finish(gb, fb, sp, look, spec, half);
}

// ---------------------------------------------------------------------------------------------
// Snails
// ---------------------------------------------------------------------------------------------

interface ShellParams {
  /** Whorl expansion rate per revolution (Raup's W). */
  W: number;
  /** Translation along the axis per unit radius (spire height). */
  T: number;
  /** Generating-curve half sizes relative to the radius (radial, axial). */
  ka: number;
  kb: number;
  whorls: number;
  apertureFlare: number;
}

/**
 * Raup coiled shell. The tube cross-section (an ellipse of size ∝ r(θ)) is swept along a
 * helico-spiral r(θ) = r_ap · W^((θ−θmax)/2π), y(θ) = −T·r(θ). Texture x is linear in r, so most
 * of the pattern range falls on the visible body whorl; y runs across the whorl.
 */
function shellMesh(gb: GeoBuilder, P: ShellParams, length: number, width: number, detail: number, place: (p: V3) => V3, part: number = PART.invBody): { rMax: number } {
  const idx0 = gb.idx.length, v0 = gb.vertexCount;
  const thMax = P.whorls * Math.PI * 2;
  const nTh = Math.round(P.whorls * 34 * detail);
  const nPh = Math.round(20 * detail);
  const refs: number[] = [];
  const lnW = Math.log(P.W);
  const r = (th: number) => Math.exp(((th - thMax) / (2 * Math.PI)) * lnW);
  // Raw extents to normalise: axial length → `length`, diameter → `width`.
  let yMin = 1e9, yMax = -1e9, rMaxRaw = 0;
  for (let i = 0; i <= nTh; i++) {
    const th = (i / nTh) * thMax;
    const rr = r(th);
    const y = -P.T * rr;
    yMin = Math.min(yMin, y - rr * P.kb);
    yMax = Math.max(yMax, y + rr * P.kb);
    rMaxRaw = Math.max(rMaxRaw, rr * (1 + P.ka));
  }
  const ySpan = Math.max(1e-4, yMax - yMin);
  const diam = 2 * rMaxRaw;
  // Uniform scale so the longest dimension equals the shell length; the authored width ratio
  // then nudges the diameter (±25%) without distorting the coil.
  const sU = length / Math.max(ySpan, diam);
  const natW = (diam * sU) / length;
  const sAx = sU;
  const sRad = sU * clamp(width / Math.max(0.05, natW), 0.8, 1.25);
  const r0 = r(0), rap = r(thMax);
  const uv: [number, number] = [0, 0];
  for (let i = 0; i <= nTh; i++) {
    const th = (i / nTh) * thMax;
    const rr = r(th);
    const flare = 1 + P.apertureFlare * smooth(thMax - 0.8, thMax, th);
    const ux = (rr - r0) / Math.max(1e-6, rap - r0);
    for (let j = 0; j <= nPh; j++) {
      const ph = (j / nPh) * Math.PI * 2;
      const cr = rr * (1 + P.ka * flare * Math.cos(ph));
      const yy = -P.T * rr + rr * P.kb * flare * Math.sin(ph);
      const p: V3 = [Math.cos(th) * cr * sRad, (yy - (yMin + yMax) / 2) * sAx, Math.sin(th) * cr * sRad];
      const q = place(p);
      // Outward reference: from the whorl tube's own center line to this vertex.
      const cRaw: V3 = [Math.cos(th) * rr * sRad, (-P.T * rr - (yMin + yMax) / 2) * sAx, Math.sin(th) * rr * sRad];
      const qc = place(cRaw);
      refs.push(q[0] - qc[0], q[1] - qc[1], q[2] - qc[2]);
      // Across-whorl coordinate: outer face (cos φ = 1) is the middle of the band.
      bodyUV(clamp(ux, 0, 1), Math.sin(ph) * 0.95, uv);
      gb.v(q[0], q[1], q[2], uv[0], uv[1], ux, part, 0, 0, 0, 0, 0, 0);
    }
  }
  for (let i = 0; i < nTh; i++) {
    for (let j = 0; j < nPh; j++) {
      const a = v0 + i * (nPh + 1) + j, b = a + nPh + 1;
      gb.quad(a, a + 1, b + 1, b);
    }
  }
  gb.smoothNormals(idx0, v0);
  // Coiling handedness can flip the winding after `place`; make normals face out of the tube.
  let score = 0;
  for (let i = v0, k = 0; i < gb.vertexCount; i++, k += 3) {
    score += gb.nor[i * 3] * refs[k] + gb.nor[i * 3 + 1] * refs[k + 1] + gb.nor[i * 3 + 2] * refs[k + 2];
  }
  if (score < 0) {
    for (let i = idx0; i < gb.idx.length; i += 3) {
      const t = gb.idx[i + 1];
      gb.idx[i + 1] = gb.idx[i + 2];
      gb.idx[i + 2] = t;
    }
    for (let i = v0 * 3; i < gb.nor.length; i++) gb.nor[i] = -gb.nor[i];
  }
  return { rMax: rMaxRaw * sRad };
}

/**
 * Coiled shell carried by an animal: the coil axis (apex) points along `apexDir`, the aperture
 * opening (growth direction at the lip) along `apertureDir`; the shell is then moved so its
 * lowest point sits at `baseY` and its centre over `centerX`.
 */
function orientedShell(
  gb: GeoBuilder, P: ShellParams, length: number, width: number, detail: number,
  apexDir: V3, apertureDir: V3, baseY: number, centerX: number,
): void {
  const v0 = gb.vertexCount;
  const thMax = P.whorls * Math.PI * 2;
  // Raw frame: apex +y, aperture tangent t, third axis b = t × y.
  const t: V3 = [-Math.sin(thMax), 0, Math.cos(thMax)];
  const yv: V3 = [0, 1, 0];
  const b = cross(t, yv);
  // Target frame (orthonormalised).
  const A = norm(apexDir);
  const T = norm(sub(apertureDir, mul(A, dot(apertureDir, A))));
  const B = cross(T, A);
  const rot = (p: V3): V3 => {
    const ct = dot(p, t), cy = dot(p, yv), cb = dot(p, b);
    return add(add(mul(T, ct), mul(A, cy)), mul(B, cb));
  };
  shellMesh(gb, P, length, width, detail, rot);
  let minY = 1e9, minX = 1e9, maxX = -1e9;
  for (let i = v0; i < gb.vertexCount; i++) {
    minY = Math.min(minY, gb.pos[i * 3 + 1]);
    minX = Math.min(minX, gb.pos[i * 3]);
    maxX = Math.max(maxX, gb.pos[i * 3]);
  }
  const dx = centerX - (minX + maxX) / 2, dy = baseY - minY;
  for (let i = v0; i < gb.vertexCount; i++) {
    gb.pos[i * 3] += dx;
    gb.pos[i * 3 + 1] += dy;
  }
}

function shellPaintSpec(look: Appearance, W: number, T: number): PaintSpec {
  void look;
  return {
    hd: () => 0.25 + 0.1 * T / W,
    roughness: 0.3,
    eye: 'snail',
    normalStrength: 3,
    detail: (x, y, out) => {
      // Growth lines (axial), a darker suture line, and a slightly worn apex.
      const g = 0.5 + 0.5 * Math.sin(x * 260 + 3 * valueNoise(x * 30, y * 3, 1));
      const suture = Math.exp(-(((Math.abs(y) - 0.93) / 0.04) ** 2));
      const apex = 1 - smooth(0, 0.08, x);
      out[0] = (1 - 0.05 * g) * (1 - 0.25 * suture) * (1 + 0.15 * apex);
      out[1] = 0.3 * g - 0.6 * suture;
      out[2] = 1;
    },
  };
}

type ShellKind = 'nerite' | 'turban' | 'trochus' | 'trumpet' | 'cone' | 'conch' | 'cowrie' | 'abalone' | 'ramshorn' | 'apple';

function shellKind(sp: Species): ShellKind {
  const k = keyOf(sp);
  if (/ramshorn|planorb|marisa/.test(k)) return 'ramshorn';
  if (/cypraea|cowrie|monetaria|mauritia|macrocypraea|ovula/.test(k)) return 'cowrie';
  if (/haliotis|abalone|stomatella|limpet/.test(k)) return 'abalone';
  if (/strombus|conch|aliger|lambis|conomurex/.test(k)) return 'conch';
  if (/melanoides|tylomelania|faunus|brotia|cerith|trumpet|sulcospira|rabbit snail|turritella/.test(k)) return 'trumpet';
  if (/trochus|tectus|margarites|tegula|top shell/.test(k)) return 'trochus';
  if (/turbo|lithopoma|astraea|astralium|turban/.test(k)) return 'turban';
  if (/nassarius|anentome|assassin|clea|whelk|buccin/.test(k)) return 'cone';
  if (/pomacea|apple snail|mystery|pila |ampullar|filopaludina|viviparus|bellamya/.test(k)) return 'apple';
  return 'nerite';
}

const SHELLS: Record<Exclude<ShellKind, 'cowrie' | 'abalone'>, ShellParams> = {
  nerite: { W: 11, T: 0.28, ka: 0.95, kb: 1.05, whorls: 2.4, apertureFlare: 0.12 },
  apple: { W: 4.2, T: 1.1, ka: 0.95, kb: 1.05, whorls: 4.2, apertureFlare: 0.1 },
  turban: { W: 3.4, T: 1.5, ka: 0.9, kb: 0.95, whorls: 5, apertureFlare: 0.05 },
  trochus: { W: 2.2, T: 2.0, ka: 0.95, kb: 0.55, whorls: 6.5, apertureFlare: 0.02 },
  trumpet: { W: 1.35, T: 3.3, ka: 0.65, kb: 0.95, whorls: 10, apertureFlare: 0.04 },
  cone: { W: 2.0, T: 2.4, ka: 0.75, kb: 0.95, whorls: 6, apertureFlare: 0.06 },
  conch: { W: 3.0, T: 2.4, ka: 0.8, kb: 1.0, whorls: 6.5, apertureFlare: 0.6 },
  ramshorn: { W: 2.1, T: 0, ka: 0.6, kb: 0.75, whorls: 4, apertureFlare: 0.08 },
};

function snail(sp: Species, body: ResolvedBody, look: Appearance, detail: number): InvertGeometry {
  const gb = new GeoBuilder();
  const fb = new GeoBuilder();
  const kind = shellKind(sp);
  const D = clamp(body.depth, 0.2, 1);
  const yc = -0.425 * D;
  const width = clamp(body.width, 0.25, 1);
  // Soft body: foot sole on the contact plane, head with tentacles at the front.
  const footLen = kind === 'cowrie' || kind === 'abalone' ? 1.0 : kind === 'trumpet' ? 0.55 : 0.72;
  const footW = Math.min(0.45, width * 0.55) * (kind === 'abalone' ? 1.4 : 1);
  const footH = 0.08;
  const footO: PartOpts = { part: PART.foot, pivot: [0, 0, 0], phase: 0, amp: 1 };
  ellipsoid(gb, [0.04, yc + footH * 0.5, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [footLen / 2, footH * 0.5, footW / 2], 6, 18, footO,
    (th, ph) => cellUV(ATLAS.dorsal2, 0.5 + 0.45 * Math.sin(th) * Math.cos(ph), Math.cos(th)),
    (th) => (th > Math.PI * 0.55 ? 0.95 : 1));
  // Head and tentacles.
  const head: V3 = [footLen * 0.42 + 0.04, yc + footH * 0.9, 0];
  ellipsoid(gb, head, [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.07, 0.045, 0.07], 5, 10, { ...footO, part: PART.invBody, amp: 0 },
    (th, ph) => cellUV(ATLAS.dorsal2, 0.8 + 0.1 * Math.cos(ph), Math.cos(th)));
  for (const side of [1, -1]) {
    const a: V3 = add(head, [0.03, 0.02, side * 0.035]);
    const tl = kind === 'apple' ? 0.32 : kind === 'trumpet' ? 0.16 : 0.2;
    tube(gb, spline([a, add(a, [tl * 0.5, tl * 0.15, side * tl * 0.35]), add(a, [tl * 0.9, tl * 0.1, side * tl * 0.7])], 5), (t) => 0.014 * (1 - 0.75 * t), 4,
      { part: PART.tentacle, pivot: a, phase: side * 1.7, amp: 1, cell: ATLAS.dorsal2 });
    // Eyes at the tentacle bases (nerites, most freshwater snails).
    ellipsoid(gb, add(a, [0.005, 0.012, side * 0.02]), [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.008, 0.008, 0.008], 3, 6, { part: PART.invBody, pivot: a, phase: 0, amp: 0 }, eyeUV);
  }
  // Shell.
  let spec: PaintSpec;
  const shellTop = yc + footH * 0.9;
  if (kind === 'cowrie') {
    const o: PartOpts = { part: PART.invBody, pivot: [0, 0, 0], phase: 0, amp: 0 };
    const h = clamp(D * 0.85, 0.3, 0.7), w = clamp(width, 0.4, 0.8);
    ellipsoid(gb, [0, shellTop + h * 0.42, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, h * 0.5, w * 0.5], Math.round(14 * detail), Math.round(24 * detail), o,
      (th, ph) => bodyUV(0.5 - 0.5 * Math.sin(th) * Math.cos(ph), clamp(Math.cos(th) * 1.15, -1, 1)),
      (th) => (th > Math.PI * 0.62 ? 0.8 + 0.2 * Math.cos((th - Math.PI * 0.62) * 2) : 1));
    spec = { hd: () => 0.35, roughness: 0.12, eye: 'snail', normalStrength: 1.2, detail: (_x, _y, out) => { out[0] = 1; out[1] = 0; out[2] = 1; } };
  } else if (kind === 'abalone') {
    const P: ShellParams = { W: 600, T: 0.12, ka: 1.4, kb: 0.45, whorls: 1.15, apertureFlare: 0.3 };
    shellMesh(gb, P, 1, clamp(width, 0.4, 0.9), detail, (p) => [p[2], p[1] * 0.5 + shellTop + D * 0.25, -p[0]]);
    spec = shellPaintSpec(look, P.W, P.T);
  } else {
    const P = SHELLS[kind];
    const wid = clamp(width, 0.25, 1);
    const base = shellTop - 0.02;
    if (kind === 'ramshorn') {
      // Planispiral disc carried upright, aperture down-forward over the head.
      orientedShell(gb, P, clamp(D, 0.5, 0.9), 0.5, detail, [0, 0, 1], [0.35, -1, 0], base, -0.04);
    } else if (kind === 'trumpet' || kind === 'cone' || kind === 'trochus') {
      // Tall spires are dragged behind, nearly horizontal; the aperture faces the ground.
      const lift = kind === 'trumpet' ? 0.38 : 0.62;
      orientedShell(gb, P, 1, wid, detail, [-1, lift, 0.1], [0.1, -1, 0], base, kind === 'trumpet' ? -0.12 : -0.06);
    } else {
      // Globose shells sit over the foot: apex up and back, aperture down.
      // The aperture plane contains the coil axis, so the axis is carried low (apex at the back,
      // leaning to the right in dextral shells) for the aperture to face the substrate.
      const apex: V3 = kind === 'nerite' ? [-0.95, 0.28, 0.12] : [-0.82, 0.5, 0.15];
      orientedShell(gb, P, 1, wid, detail, apex, [0.1, -1, 0], base, -0.03);
    }
    spec = shellPaintSpec(look, P.W, P.T);
  }
  spec.softBody = mix(hex(look.fin), [0.35, 0.33, 0.3], 0.25);
  const half: [number, number, number] = [0.55, D * 0.55, width * 0.55];
  return finish(gb, fb, sp, look, spec, half);
}

// ---------------------------------------------------------------------------------------------
// Echinoderms
// ---------------------------------------------------------------------------------------------

function starfish(sp: Species, body: ResolvedBody, look: Appearance, detail: number, brittle: boolean): InvertGeometry {
  const gb = new GeoBuilder();
  const fb = new GeoBuilder();
  const D = clamp(body.depth, 0.03, 0.5);
  const yc = -0.425 * D;
  const W = clamp(body.width, brittle ? 0.03 : 0.06, 1);
  const rng = new Rng(hashString(sp.id));
  const nArms = 5;
  const R = 0.5;
  if (brittle) {
    // Disc + five long, thin, snaking arms.
    const disc = clamp(0.08 + W * 0.5, 0.07, 0.14);
    const o: PartOpts = { part: PART.invBody, pivot: [0, 0, 0], phase: 0, amp: 0 };
    ellipsoid(gb, [0, yc + D * 0.5, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [disc, D * 0.5, disc], 8, 20, o,
      (th, ph) => bodyUV(Math.sin(th) * 0.25, Math.cos(th)), (th, ph) => 1 + 0.08 * Math.cos(5 * ph) * Math.sin(th));
    for (let a = 0; a < nArms; a++) {
      const ang = (a / nArms) * Math.PI * 2 + 0.3;
      const dir: V3 = [Math.cos(ang), 0, Math.sin(ang)];
      const side: V3 = [-Math.sin(ang), 0, Math.cos(ang)];
      const pts: V3[] = [];
      const curl = (rng.next() - 0.5) * 0.8;
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        const rr = disc * 0.8 + (R - disc * 0.8) * t;
        const sway = Math.sin(t * Math.PI * 1.3 + a) * 0.08 * t + curl * t * t * 0.3;
        pts.push(add(add(mul(dir, rr), mul(side, sway)), [0, yc + D * 0.35 * (1 - t) + 0.006 + 0.03 * Math.sin(t * Math.PI) * 0.3, 0]));
      }
      const r0 = clamp(W * 0.3, 0.008, 0.03);
      const pivot: V3 = mul(dir, disc * 0.8);
      tube(gb, pts, (t) => r0 * (1 - 0.8 * t) + 0.002, 5, { part: PART.brittleArm, pivot: [pivot[0], yc + D * 0.4, pivot[2]], phase: a * 1.26, amp: 1, bodyXY: [0.6, 0.5] }, true);
      // Per-vertex UV along the arm (pattern x from the disc to the tip).
      const n = pts.length * 5 + 1;
      const v0 = gb.vertexCount - n;
      for (let k = 0; k < n; k++) {
        const vi = v0 + k;
        const px = gb.pos[vi * 3], pz = gb.pos[vi * 3 + 2];
        const rr = Math.hypot(px, pz);
        const [u, v] = bodyUV(clamp(rr / R, 0, 1), clamp((gb.pos[vi * 3 + 1] - (yc + D * 0.2)) / Math.max(0.01, r0) , -1, 1));
        gb.uv[vi * 2] = u;
        gb.uv[vi * 2 + 1] = v;
      }
    }
  } else {
    // Sea star: arms lofted from the center; wide arms (cushion stars) merge into a pentagon.
    const armW = clamp(W * 0.55, 0.04, 0.42);
    const discR = clamp(0.1 + W * 0.25, 0.1, 0.35);
    const thick = clamp(D, 0.04, 0.5);
    const sides = Math.round(12 * detail);
    for (let a = 0; a < nArms; a++) {
      const ang = (a / nArms) * Math.PI * 2 + Math.PI / 2;
      const dir: V3 = [Math.cos(ang), 0, Math.sin(ang)];
      const n = Math.round(14 * detail);
      const centers: V3[] = [], hy: number[] = [], hz: number[] = [], ux: number[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const rr = t * R * 0.96;
        // Gentle arch: arms rise from the tips toward the disc.
        const h = thick * (1 - 0.6 * t) * (rr < discR ? 1 : 0.85);
        const w = Math.max(0.01, armW * (1 - 0.82 * Math.pow(t, 1.1)) + (rr < discR ? (discR - rr) * 0.6 : 0));
        centers.push(add(mul(dir, rr), [0, yc + h * 0.5 + 0.004 * Math.sin(t * Math.PI), 0]));
        hy.push(h * 0.5);
        hz.push(w * 0.5);
        ux.push(t);
      }
      // loftBody builds along −x; a proper rotation (no mirroring) turns each arm into place.
      const v0 = gb.vertexCount;
      const local = centers.map((c) => [-Math.hypot(c[0], c[2]), c[1], 0] as V3);
      loftBody(gb, local, hy, hz, ux, sides, 2.2, 6, { part: PART.arm, pivot: [0, 0, 0], phase: a * 1.3, amp: 1 });
      const beta = ang + Math.PI;
      const c = Math.cos(beta), s = Math.sin(beta);
      for (let vi = v0; vi < gb.vertexCount; vi++) {
        const x = gb.pos[vi * 3], z = gb.pos[vi * 3 + 2];
        gb.pos[vi * 3] = x * c - z * s;
        gb.pos[vi * 3 + 2] = x * s + z * c;
        const nx = gb.nor[vi * 3], nz = gb.nor[vi * 3 + 2];
        gb.nor[vi * 3] = nx * c - nz * s;
        gb.nor[vi * 3 + 2] = nx * s + nz * c;
        // Pivot at the arm root for the curling animation.
        gb.fin[vi * 4] = Math.cos(ang) * discR * 0.8;
        gb.fin[vi * 4 + 1] = yc + thick * 0.4;
        gb.fin[vi * 4 + 2] = Math.sin(ang) * discR * 0.8;
      }
    }
  }
  const spec: PaintSpec = {
    hd: () => (brittle ? 0.05 : 0.12),
    roughness: 0.55,
    eye: 'snail',
    normalStrength: 6,
    detail: (x, y, out) => {
      // Granules / ossicles; tube-feet groove on the underside.
      const gran = smooth(0.62, 0.85, valueNoise(x * 120, y * 14, 11));
      const groove = y < -0.6 ? 0.3 : 0;
      out[0] = (1 + 0.08 * gran) * (1 - groove);
      out[1] = 0.6 * gran;
      out[2] = 1;
    },
  };
  const half: [number, number, number] = [0.5, D * 0.6 + 0.02, 0.5];
  return finish(gb, fb, sp, look, spec, half);
}

function urchin(sp: Species, body: ResolvedBody, look: Appearance, detail: number): InvertGeometry {
  const key = keyOf(sp);
  const gb = new GeoBuilder();
  const fb = new GeoBuilder();
  const D = clamp(body.depth, 0.3, 0.95);
  const yc = -0.425 * D;
  const rng = new Rng(hashString(sp.id));
  // Spine length (relative to the test diameter) and thickness by type.
  let spineL = 0.3, spineR = 0.012, count = 110;
  if (/diadema|echinothrix|astropyga|long-spine/.test(key)) [spineL, spineR, count] = [1.15, 0.01, 90];
  else if (/mespilia|tuxedo/.test(key)) [spineL, spineR, count] = [0.12, 0.008, 70];
  else if (/salmacis|tripneustes|collector|pincushion/.test(key)) [spineL, spineR, count] = [0.14, 0.01, 160];
  else if (/heterocentrotus|slate pencil/.test(key)) [spineL, spineR, count] = [0.6, 0.04, 26];
  else if (/eucidaris|pencil/.test(key)) [spineL, spineR, count] = [0.45, 0.028, 30];
  else if (/lytechinus/.test(key)) [spineL, spineR, count] = [0.2, 0.01, 130];
  count = Math.round(count * Math.min(1, detail));
  const rT = 0.5, hT = 0.5 * D;
  const cy = yc + hT + 0.012;
  const o: PartOpts = { part: PART.invBody, pivot: [0, 0, 0], phase: 0, amp: 0 };
  ellipsoid(gb, [0, cy, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [rT, hT, rT], Math.round(14 * detail), Math.round(24 * detail), o,
    (th, ph) => bodyUV(ph / (Math.PI * 2), clamp(Math.cos(th) * 1.05, -1, 1)),
    (th) => (th > Math.PI * 0.7 ? 0.85 + 0.15 * Math.cos((th - Math.PI * 0.7) * 3) : 1));
  // Primary spines on a Fibonacci sphere (upper ~85%), each a tapered cone.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const yN = 1 - (i / (count - 1)) * 1.7;
    const rad = Math.sqrt(Math.max(0, 1 - yN * yN));
    const th = i * golden;
    const nUnit = norm([Math.cos(th) * rad / rT, yN / hT, Math.sin(th) * rad / rT]);
    const base: V3 = [Math.cos(th) * rad * rT, cy + yN * hT, Math.sin(th) * rad * rT];
    const L = spineL * (0.7 + 0.5 * rng.next()) * (yN < -0.4 ? 0.5 : 1);
    const dir = norm(add(nUnit, [(rng.next() - 0.5) * 0.3, 0.05, (rng.next() - 0.5) * 0.3]));
    const tip = add(base, mul(dir, L));
    tube(gb, [base, lerp3(base, tip, 0.5), tip], (t) => spineR * (1 - 0.9 * t) + 0.0015, 4, { part: PART.spine, pivot: base, phase: rng.next(), amp: 1, cell: ATLAS.dorsal }, true);
  }
  const spec: PaintSpec = {
    hd: () => 0.3,
    roughness: 0.5,
    eye: 'snail',
    normalStrength: 5,
    detail: (x, y, out) => {
      // Tubercle rows on the test and the ambulacral pore bands.
      const amb = Math.exp(-((((((x * 5) % 1) - 0.5) / 0.05) ** 2)));
      const tub = smooth(0.7, 0.9, valueNoise(x * 140, y * 30, 4));
      out[0] = 1 - 0.1 * amb + 0.05 * tub;
      out[1] = 0.6 * tub - 0.3 * amb;
      out[2] = 1;
    },
  };
  const half: [number, number, number] = [0.5 + spineL * 0.6, D * 0.6 + spineL * 0.4, 0.5 + spineL * 0.6];
  return finish(gb, fb, sp, look, spec, half);
}

// ---------------------------------------------------------------------------------------------

function finish(gb: GeoBuilder, fb: GeoBuilder, sp: Species, look: Appearance, spec: PaintSpec, half: [number, number, number]): InvertGeometry {
  if (fb.vertexCount === 0) {
    // Keep an (empty-looking) fin geometry so the variant structure stays uniform.
    const uv = cellUV(ATLAS.caudal, 0, 0);
    fb.v(0, 0, 0, uv[0], uv[1], 0, PART.invBody);
    fb.v(0, 0, 0, uv[0], uv[1], 0, PART.invBody);
    fb.v(0, 0, 0, uv[0], uv[1], 0, PART.invBody);
    fb.tri(0, 1, 2);
  }
  return {
    body: gb.build(),
    fins: fb.build(),
    info: { slLocal: 1, xSnout: 0.5, caudalLen: 0, half },
    paint: (N: number) => paintInvertAtlas(sp, look, spec, N),
  };
}

export function buildInvertebrate(sp: Species, body: ResolvedBody, look: Appearance, detail: number): InvertGeometry {
  switch (body.kind) {
    case 'shrimp':
      return shrimpLike(sp, body, look, detail, false);
    case 'crayfish':
      return shrimpLike(sp, body, look, detail, true);
    case 'crab':
      return crab(sp, body, look, detail);
    case 'hermit-crab':
      return hermitCrab(sp, body, look, detail);
    case 'snail':
      return snail(sp, body, look, detail);
    case 'starfish':
      return starfish(sp, body, look, detail, false);
    case 'brittle-star':
      return starfish(sp, body, look, detail, true);
    case 'urchin':
    default:
      return urchin(sp, body, look, detail);
  }
}

/** Exposed for tests. */
export const _internal = { spline, shellKind };
export type { Surface };
