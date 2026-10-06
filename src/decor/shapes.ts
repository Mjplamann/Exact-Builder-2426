/**
 * Deterministic shape parameters for every decor variant — the single source of truth shared by
 * the mesh builders (`src/render/decor/*`) and the collider/cover builder (`colliders.ts`).
 *
 * Pure TypeScript (no three.js). A shape is generated in the item's LOCAL space at natural size
 * (scale 1): x right, y up, z toward the viewer, origin = the item's base on the substrate.
 * Parts may extend below y = 0 — that is the buried portion (real hardscape is always bedded in).
 *
 * World transform (identical to three.js Object3D with Euler 'XYZ'):
 *   world = item.position + R(item.rotation) · (item.scale · local)
 */
import type { DecorItem, DecorKind } from '../core/types';
import { Rng } from '../core/rng';
import { catalogEntry } from './catalog';
import { smax, smin } from './noise';

export type V3 = [number, number, number];
/** Row-major 3×3 rotation matrix. */
export type M3 = [number, number, number, number, number, number, number, number, number];

// ---------------------------------------------------------------------------------------------
// Shape description
// ---------------------------------------------------------------------------------------------

export type SdfPrim =
  /** Ellipsoid: center, radii, rotation (prim → local). */
  | { t: 'ell'; c: V3; r: V3; m: M3 }
  /** Rounded box: center, half extents, rotation, edge rounding. */
  | { t: 'box'; c: V3; h: V3; m: M3; round: number }
  /** Capsule from a to b. */
  | { t: 'cap'; a: V3; b: V3; r: number };

export interface SdfSpec {
  prims: SdfPrim[];
  /** Smooth-union radius between prims (m). */
  blend: number;
  /** Half-spaces to intersect with (keeps dot(n,p) ≤ d) — angular facets, broken ends. */
  cuts: { n: V3; d: number }[];
  cutBlend: number;
  /** Capsules subtracted from the solid (tunnels, holes, cave interiors). */
  holes: { a: V3; b: V3; r: number }[];
  holeBlend: number;
  /** Turn the solid into a hollow shell of this wall thickness (coconut). */
  shell?: number;
  /** Discard everything below this local y (open-bottomed shells). */
  clipBelow?: number;
  /**
   * Low-frequency domain warp (sum of sines): breaks the ellipsoid symmetry so stones look
   * weathered and irregular instead of egg-shaped. Part of the shared SDF so colliders,
   * anchors and meshes agree.
   */
  warp?: { k: V3; d: V3; a: number; ph: number }[];
}

export interface Branch {
  /** Polyline (local, m) and radius at each point. */
  pts: V3[];
  r: number[];
  /** Index of the parent branch (−1 for trunks). */
  parent: number;
  depth: number;
}

export interface Pebble {
  c: V3;
  r: V3;
  rotY: number;
  /** 0..1 color variation key. */
  tone: number;
  seed: number;
}

export interface LitterLeaf {
  c: V3;
  rotY: number;
  /** Leaf length (m). */
  len: number;
  /** 0 flat .. 1 strongly curled. */
  curl: number;
  tone: number;
  /** Small tilt from lying on neighbours (radians around x/z). */
  tilt: [number, number];
  seed: number;
}

export interface ShellPart {
  c: V3;
  /** Euler XYZ of the shell (its local +y = coil axis, aperture toward +z). */
  rot: V3;
  size: number;
  seed: number;
}

export interface LocalCollider {
  type: 'sphere' | 'capsule' | 'box';
  a: V3; // sphere/box center or capsule start
  b?: V3; // capsule end
  radius?: number;
  half?: V3; // box half extents
  rotY?: number; // box yaw (local)
  cover?: boolean;
}

export interface LocalCover {
  p: V3;
  radius: number;
  kind: 'cave' | 'overhang' | 'crevice' | 'burrow' | 'plants';
}

export interface DecorShape {
  kind: DecorKind;
  /** Resolved generator style (variant, aliases resolved). */
  style: string;
  sdf?: SdfSpec;
  branches?: Branch[];
  pebbles?: Pebble[];
  leaves?: LitterLeaf[];
  shells?: ShellPart[];
  /** Clay tube / airstone dimensions (explicit meshes). */
  tube?: { len: number; rOut: number; rIn: number; axisY: number };
  airstone?: { type: 'cylinder' | 'disc' | 'bar'; r: number; h: number; len: number };
  /** Petrified wood: log axis (rings are drawn around it). */
  axis?: { a: V3; b: V3 };
  /** Hollow branches (cholla lattice). */
  hollow?: boolean;
  colliders: LocalCollider[];
  cover: LocalCover[];
  bounds: { min: V3; max: V3 };
}

// ---------------------------------------------------------------------------------------------
// Small vector / matrix helpers (allocation is fine here — shapes are built rarely and cached)
// ---------------------------------------------------------------------------------------------

export const IDENT: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rotation matrix for Euler XYZ — identical to three.js `Matrix4.makeRotationFromEuler`. */
export function eulerXYZ(x: number, y: number, z: number): M3 {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

export function mulM3V(m: M3, x: number, y: number, z: number, out: V3): V3 {
  out[0] = m[0] * x + m[1] * y + m[2] * z;
  out[1] = m[3] * x + m[4] * y + m[5] * z;
  out[2] = m[6] * x + m[7] * y + m[8] * z;
  return out;
}

/** Transpose-multiply (inverse rotation). */
export function mulM3tV(m: M3, x: number, y: number, z: number, out: V3): V3 {
  out[0] = m[0] * x + m[3] * y + m[6] * z;
  out[1] = m[1] * x + m[4] * y + m[7] * z;
  out[2] = m[2] * x + m[5] * y + m[8] * z;
  return out;
}

const vlen = (v: V3) => Math.hypot(v[0], v[1], v[2]);
function vnorm(v: V3): V3 {
  const l = vlen(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function vcross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function randomUnit(rng: Rng): V3 {
  const z = rng.range(-1, 1);
  const t = rng.range(0, Math.PI * 2);
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(t), z, s * Math.sin(t)];
}

/** Unit vector from yaw (around y, 0 = +x) and elevation above the horizontal plane. */
function dirFrom(yaw: number, elev: number): V3 {
  const c = Math.cos(elev);
  return [c * Math.cos(yaw), Math.sin(elev), c * Math.sin(yaw)];
}

// ---------------------------------------------------------------------------------------------
// Item transform
// ---------------------------------------------------------------------------------------------

export interface ItemXf {
  pos: V3;
  m: M3;
  s: number;
}

export function itemTransform(item: Pick<DecorItem, 'position' | 'rotation' | 'scale'>): ItemXf {
  return {
    pos: [item.position[0], item.position[1], item.position[2]],
    m: eulerXYZ(item.rotation[0], item.rotation[1], item.rotation[2]),
    s: item.scale > 0 ? item.scale : 1,
  };
}

export function toWorld(xf: ItemXf, p: V3, out: V3 = [0, 0, 0]): V3 {
  mulM3V(xf.m, p[0] * xf.s, p[1] * xf.s, p[2] * xf.s, out);
  out[0] += xf.pos[0];
  out[1] += xf.pos[1];
  out[2] += xf.pos[2];
  return out;
}

export function toLocal(xf: ItemXf, p: V3, out: V3 = [0, 0, 0]): V3 {
  mulM3tV(xf.m, p[0] - xf.pos[0], p[1] - xf.pos[1], p[2] - xf.pos[2], out);
  out[0] /= xf.s;
  out[1] /= xf.s;
  out[2] /= xf.s;
  return out;
}

export function dirToWorld(xf: ItemXf, d: V3, out: V3 = [0, 0, 0]): V3 {
  return mulM3V(xf.m, d[0], d[1], d[2], out);
}

// ---------------------------------------------------------------------------------------------
// Signed distance evaluation (local space). Hot during meshing — no allocations.
// ---------------------------------------------------------------------------------------------

const _q: V3 = [0, 0, 0];

function sdEllipsoid(px: number, py: number, pz: number, c: V3, r: V3, m: M3): number {
  mulM3tV(m, px - c[0], py - c[1], pz - c[2], _q);
  const x0 = _q[0] / r[0], y0 = _q[1] / r[1], z0 = _q[2] / r[2];
  const k0 = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
  const x1 = x0 / r[0], y1 = y0 / r[1], z1 = z0 / r[2];
  const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
  if (k1 < 1e-9) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / k1;
}

function sdRoundBox(px: number, py: number, pz: number, c: V3, h: V3, m: M3, round: number): number {
  mulM3tV(m, px - c[0], py - c[1], pz - c[2], _q);
  const qx = Math.abs(_q[0]) - h[0] + round, qy = Math.abs(_q[1]) - h[1] + round, qz = Math.abs(_q[2]) - h[2] + round;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - round;
}

export function sdCapsule(px: number, py: number, pz: number, a: V3, b: V3, r: number): number {
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const bb = bax * bax + bay * bay + baz * baz;
  const h = bb > 0 ? Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / bb)) : 0;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Bounding spheres of the prims (center xyz, radius) — lets sdfEval skip far prims. */
const primSpheres = new WeakMap<SdfSpec, Float64Array>();
function spheresOf(spec: SdfSpec): Float64Array {
  let b = primSpheres.get(spec);
  if (b && b.length === spec.prims.length * 4) return b;
  b = new Float64Array(spec.prims.length * 4);
  spec.prims.forEach((p, i) => {
    if (p.t === 'ell') b!.set([p.c[0], p.c[1], p.c[2], Math.max(p.r[0], p.r[1], p.r[2])], i * 4);
    else if (p.t === 'box') b!.set([p.c[0], p.c[1], p.c[2], Math.hypot(p.h[0], p.h[1], p.h[2])], i * 4);
    else b!.set([(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2, Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2 + p.r], i * 4);
  });
  primSpheres.set(spec, b);
  return b;
}

/** Signed distance (m, local space, scale 1) to the solid described by `spec` (no surface noise). */
export function sdfEval(spec: SdfSpec, x: number, y: number, z: number): number {
  const warp = spec.warp;
  if (warp) {
    let ox = 0, oy = 0, oz = 0;
    for (let i = 0; i < warp.length; i++) {
      const w = warp[i];
      const s = w.a * Math.sin(w.k[0] * x + w.k[1] * y + w.k[2] * z + w.ph);
      ox += w.d[0] * s;
      oy += w.d[1] * s;
      oz += w.d[2] * s;
    }
    x += ox;
    y += oy;
    z += oz;
  }
  let d = 1e9;
  const prims = spec.prims;
  const sph = spheresOf(spec);
  const k = spec.blend;
  for (let i = 0; i < prims.length; i++) {
    // A prim can only change a smooth union if its lower-bound distance is within the blend.
    if (i > 0) {
      const dx = x - sph[i * 4], dy = y - sph[i * 4 + 1], dz = z - sph[i * 4 + 2];
      const lower = Math.sqrt(dx * dx + dy * dy + dz * dz) - sph[i * 4 + 3];
      if (lower > d + k) continue;
    }
    const p = prims[i];
    let di: number;
    if (p.t === 'ell') di = sdEllipsoid(x, y, z, p.c, p.r, p.m);
    else if (p.t === 'box') di = sdRoundBox(x, y, z, p.c, p.h, p.m, p.round);
    else di = sdCapsule(x, y, z, p.a, p.b, p.r);
    d = i === 0 ? di : smin(d, di, k);
  }
  const cuts = spec.cuts;
  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i];
    d = smax(d, c.n[0] * x + c.n[1] * y + c.n[2] * z - c.d, spec.cutBlend);
  }
  if (spec.shell !== undefined) d = Math.abs(d) - spec.shell;
  const holes = spec.holes;
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    d = smax(d, -sdCapsule(x, y, z, h.a, h.b, h.r), spec.holeBlend);
  }
  if (spec.clipBelow !== undefined) d = Math.max(d, spec.clipBelow - y);
  return d;
}

/** Support distance of a primitive along unit direction n (for placing cuts and holes). */
function primSupport(p: SdfPrim, n: V3): number {
  if (p.t === 'ell') {
    const q = mulM3tV(p.m, n[0], n[1], n[2], [0, 0, 0]);
    return vdot(p.c, n) + Math.hypot(q[0] * p.r[0], q[1] * p.r[1], q[2] * p.r[2]);
  }
  if (p.t === 'box') {
    const q = mulM3tV(p.m, n[0], n[1], n[2], [0, 0, 0]);
    return vdot(p.c, n) + Math.abs(q[0]) * p.h[0] + Math.abs(q[1]) * p.h[1] + Math.abs(q[2]) * p.h[2];
  }
  return Math.max(vdot(p.a, n), vdot(p.b, n)) + p.r;
}

function support(prims: SdfPrim[], n: V3): number {
  let s = -1e9;
  for (const p of prims) s = Math.max(s, primSupport(p, n));
  return s;
}

/** Find the surface along a ray from `o` in direction `d` (bisection on the SDF). */
function surfaceAlong(spec: SdfSpec, o: V3, d: V3, maxT: number): number | null {
  let prevT = 0;
  let prev = sdfEval(spec, o[0], o[1], o[2]);
  if (prev > 0) return null;
  const step = maxT / 48;
  for (let t = step; t <= maxT; t += step) {
    const v = sdfEval(spec, o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t);
    if (v > 0) {
      let lo = prevT, hi = t;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (sdfEval(spec, o[0] + d[0] * mid, o[1] + d[1] * mid, o[2] + d[2] * mid) > 0) hi = mid;
        else lo = mid;
      }
      return (lo + hi) / 2;
    }
    prevT = t;
    prev = v;
  }
  return null;
}

export function sdfGradient(spec: SdfSpec, x: number, y: number, z: number, eps = 0.0015, out: V3 = [0, 0, 0]): V3 {
  out[0] = sdfEval(spec, x + eps, y, z) - sdfEval(spec, x - eps, y, z);
  out[1] = sdfEval(spec, x, y + eps, z) - sdfEval(spec, x, y - eps, z);
  out[2] = sdfEval(spec, x, y, z + eps) - sdfEval(spec, x, y, z - eps);
  const l = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= l;
  out[1] /= l;
  out[2] /= l;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rock generators
// ---------------------------------------------------------------------------------------------

function ell(c: V3, r: V3, rx = 0, ry = 0, rz = 0): SdfPrim {
  return { t: 'ell', c, r, m: eulerXYZ(rx, ry, rz) };
}

/** Random cut planes whose offset is a fraction of the solid's support — angular facets. */
function addCuts(spec: SdfSpec, rng: Rng, count: number, minY: number, frac: [number, number]): void {
  for (let i = 0; i < count; i++) {
    let n: V3 = randomUnit(rng);
    if (n[1] < minY) n = vnorm([n[0], minY + rng.range(0, 0.3), n[2]]);
    const s = support(spec.prims, n);
    // Keep the base: offset relative to the center of mass height.
    spec.cuts.push({ n, d: s * rng.range(frac[0], frac[1]) });
  }
}

/** Holes drilled from the surface inward (dragon stone pockets, live-rock caverns). */
function addPockets(spec: SdfSpec, rng: Rng, count: number, rRange: [number, number], depthFrac: [number, number], center: V3, vertical = 0): void {
  for (let i = 0; i < count; i++) {
    let dir = randomUnit(rng);
    if (dir[1] < -0.2) dir = vnorm([dir[0], Math.abs(dir[1]) * 0.5, dir[2]]);
    const t = surfaceAlong(spec, center, dir, 0.5);
    if (t === null) continue;
    const surf = vadd(center, vscale(dir, t));
    const r = rng.range(rRange[0], rRange[1]);
    // Pocket axis: inward, tilted toward vertical for eroded stones.
    let ax = vnorm(vadd(vscale(dir, -1), [rng.range(-0.4, 0.4), -vertical, rng.range(-0.4, 0.4)]));
    if (vdot(ax, dir) > -0.2) ax = vscale(dir, -1);
    const depth = t * rng.range(depthFrac[0], depthFrac[1]);
    spec.holes.push({ a: vadd(surf, vscale(ax, -r * 0.6)), b: vadd(surf, vscale(ax, depth)), r });
  }
}

/** Straight tunnels right through the rock (Texas holey, live rock). */
function addTunnels(spec: SdfSpec, rng: Rng, count: number, rRange: [number, number], center: V3, extent: number): void {
  for (let i = 0; i < count; i++) {
    const dir = vnorm([rng.range(-1, 1), rng.range(-0.5, 0.6), rng.range(-1, 1)]);
    const off: V3 = [rng.range(-0.4, 0.4) * extent, rng.range(-0.1, 0.35) * extent, rng.range(-0.3, 0.3) * extent];
    const mid = vadd(center, off);
    const half = extent * 1.6;
    spec.holes.push({ a: vadd(mid, vscale(dir, -half)), b: vadd(mid, vscale(dir, half)), r: rng.range(rRange[0], rRange[1]) });
  }
}

/** Add a 3-term sine domain warp of amplitude `amp` (m) and wavelength ≈ `wl` (m). */
function addWarp(spec: SdfSpec, rng: Rng, amp: number, wl: number, terms = 3): void {
  spec.warp = [];
  for (let i = 0; i < terms; i++) {
    const kd = randomUnit(rng);
    const k = (Math.PI * 2) / (wl * rng.range(0.7, 1.4));
    // Displace perpendicular to the wave vector so the warp shears rather than compresses.
    const d = vnorm(vcross(kd, randomUnit(rng)));
    spec.warp.push({ k: [kd[0] * k, kd[1] * k, kd[2] * k], d, a: amp * rng.range(0.6, 1.0) / Math.sqrt(terms), ph: rng.range(0, Math.PI * 2) });
  }
}

function newSdf(blend: number): SdfSpec {
  return { prims: [], blend, cuts: [], cutBlend: 0.003, holes: [], holeBlend: 0.004 };
}

function rockSeiryu(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.014);
  const w = S * 0.5 * rng.range(0.8, 1.05);
  const h = S * rng.range(0.6, 1.0);
  const d = w * rng.range(0.6, 0.85);
  const bury = h * 0.14;
  spec.prims.push(ell([0, h * 0.4 - bury, 0], [w, h * 0.62, d], rng.range(-0.1, 0.1), rng.range(0, Math.PI), rng.range(-0.22, 0.22)));
  const lobes = rng.int(1, 2);
  for (let i = 0; i < lobes; i++) {
    const side = rng.chance(0.5) ? 1 : -1;
    spec.prims.push(
      ell([side * w * rng.range(0.45, 0.7), h * rng.range(0.15, 0.3) - bury, rng.range(-0.3, 0.3) * d], [w * rng.range(0.4, 0.6), h * rng.range(0.3, 0.45), d * rng.range(0.6, 0.85)], rng.range(-0.2, 0.2), rng.range(0, Math.PI), rng.range(-0.4, 0.4)),
    );
  }
  addCuts(spec, rng, rng.int(8, 12), -0.25, [0.7, 0.9]);
  spec.cutBlend = 0.0025;
  addWarp(spec, rng, S * 0.035, S * 0.8);
  return spec;
}

function rockDragon(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.022);
  const w = S * 0.5 * rng.range(0.8, 1.0);
  const h = S * rng.range(0.55, 0.9);
  const bury = h * 0.12;
  spec.prims.push(ell([0, h * 0.42 - bury, 0], [w * 0.85, h * 0.6, w * 0.6], rng.range(-0.15, 0.15), rng.range(0, Math.PI), rng.range(-0.3, 0.3)));
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    spec.prims.push(ell([Math.cos(a) * w * 0.55, h * rng.range(0.2, 0.55) - bury, Math.sin(a) * w * 0.35], [w * rng.range(0.35, 0.55), h * rng.range(0.25, 0.45), w * rng.range(0.3, 0.45)], rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.5, 0.5)));
  }
  addCuts(spec, rng, rng.int(5, 8), -0.1, [0.78, 0.94]);
  addPockets(spec, rng, rng.int(6, 11), [S * 0.03, S * 0.075], [0.3, 0.65], [0, h * 0.4 - bury, 0], 0.6);
  spec.holeBlend = 0.006;
  addWarp(spec, rng, S * 0.07, S * 0.55, 4);
  return spec;
}

function rockLava(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.02);
  const w = S * 0.5 * rng.range(0.85, 1.05);
  const h = S * rng.range(0.45, 0.7);
  const bury = h * 0.15;
  spec.prims.push(ell([0, h * 0.42 - bury, 0], [w, h * 0.6, w * rng.range(0.7, 0.9)], rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2)));
  const n = rng.int(1, 3);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    spec.prims.push(ell([Math.cos(a) * w * 0.5, h * rng.range(0.25, 0.45) - bury, Math.sin(a) * w * 0.4], [w * rng.range(0.4, 0.6), h * rng.range(0.3, 0.45), w * rng.range(0.35, 0.55)], rng.range(-0.3, 0.3), rng.range(0, 3), 0));
  }
  addPockets(spec, rng, rng.int(3, 6), [S * 0.025, S * 0.05], [0.15, 0.35], [0, h * 0.4 - bury, 0]);
  addWarp(spec, rng, S * 0.08, S * 0.6, 4);
  return spec;
}

function rockSlate(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.002);
  const plates = rng.int(2, 5);
  let y = -0.006;
  for (let i = 0; i < plates; i++) {
    const t = rng.range(0.005, 0.011);
    const sx = S * 0.5 * rng.range(0.55, 1.0) * (1 - i * 0.12);
    const sz = S * 0.5 * rng.range(0.4, 0.75) * (1 - i * 0.1);
    y += t;
    spec.prims.push({
      t: 'box',
      c: [rng.range(-0.25, 0.25) * sx, y, rng.range(-0.25, 0.2) * sz],
      h: [sx, t, sz],
      m: eulerXYZ(rng.range(-0.05, 0.05), rng.range(-0.5, 0.5), rng.range(-0.06, 0.06)),
      round: Math.min(t * 0.6, 0.004),
    });
    y += t + rng.range(0, 0.002);
  }
  // Break the rectangular outline with near-vertical cuts.
  for (let i = 0; i < rng.int(4, 7); i++) {
    const a = rng.range(0, Math.PI * 2);
    const n = vnorm([Math.cos(a), rng.range(-0.15, 0.3), Math.sin(a)]);
    spec.cuts.push({ n, d: support(spec.prims, n) * rng.range(0.6, 0.85) });
  }
  spec.cutBlend = 0.0015;
  return spec;
}

function rockRiver(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.02);
  const w = S * 0.5 * rng.range(0.85, 1.05);
  const h = w * rng.range(0.42, 0.65);
  const d = w * rng.range(0.6, 0.85);
  spec.prims.push(ell([0, h * 0.62, 0], [w, h, d], rng.range(-0.08, 0.08), rng.range(0, 3), rng.range(-0.1, 0.1)));
  if (rng.chance(0.25)) {
    spec.prims.push(ell([w * 0.55, h * 0.5, d * 0.3], [w * 0.5, h * 0.7, d * 0.6], 0, rng.range(0, 3), 0));
  }
  addWarp(spec, rng, S * 0.03, S * 1.2, 2);
  return spec;
}

function rockTexas(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.03);
  const w = S * 0.5 * rng.range(0.85, 1.05);
  const h = S * rng.range(0.5, 0.75);
  const bury = h * 0.12;
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const rr = i === 0 ? 0 : w * rng.range(0.3, 0.55);
    spec.prims.push(ell([Math.cos(a) * rr, h * rng.range(0.3, 0.5) - bury, Math.sin(a) * rr * 0.6], [w * rng.range(0.45, 0.65), h * rng.range(0.35, 0.55), w * rng.range(0.4, 0.55)], rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3)));
  }
  addCuts(spec, rng, rng.int(0, 3), 0, [0.85, 0.95]);
  addTunnels(spec, rng, rng.int(2, 5), [S * 0.04, S * 0.085], [0, h * 0.4 - bury, 0], w);
  addPockets(spec, rng, rng.int(3, 6), [S * 0.03, S * 0.06], [0.2, 0.45], [0, h * 0.4 - bury, 0]);
  spec.holeBlend = 0.008;
  addWarp(spec, rng, S * 0.07, S * 0.6, 4);
  return spec;
}

function rockPetrified(rng: Rng, S: number, shape: DecorShape): SdfSpec {
  const spec = newSdf(0.01);
  const r = S * rng.range(0.22, 0.3);
  if (rng.chance(0.35)) {
    // Upright stump.
    const hgt = S * rng.range(0.55, 0.8);
    const a: V3 = [0, -0.015, 0], b: V3 = [rng.range(-0.01, 0.01), hgt, rng.range(-0.01, 0.01)];
    spec.prims.push({ t: 'cap', a, b, r });
    const n = vnorm([rng.range(-0.35, 0.35), 1, rng.range(-0.35, 0.35)]);
    spec.cuts.push({ n, d: vdot(n, b) - r * 0.4 });
    shape.axis = { a, b };
  } else {
    const L = S * rng.range(0.75, 1.0);
    const a: V3 = [-L / 2, r * 0.75, 0], b: V3 = [L / 2, r * 0.8, rng.range(-0.01, 0.01)];
    spec.prims.push({ t: 'cap', a, b, r });
    for (const [end, sgn] of [[b, 1], [a, -1]] as const) {
      const n = vnorm([sgn, rng.range(-0.35, 0.35), rng.range(-0.3, 0.3)]);
      spec.cuts.push({ n, d: vdot(n, end) - r * rng.range(0.2, 0.6) });
    }
    shape.axis = { a, b };
  }
  addCuts(spec, rng, rng.int(1, 3), 0.1, [0.88, 0.97]);
  spec.cutBlend = 0.003;
  addWarp(spec, rng, S * 0.02, S * 0.7, 2);
  return spec;
}

function rockElephant(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.03);
  const w = S * 0.5 * rng.range(0.85, 1.0);
  const h = S * rng.range(0.6, 0.9);
  const bury = h * 0.12;
  spec.prims.push(ell([0, h * 0.42 - bury, 0], [w, h * 0.6, w * rng.range(0.65, 0.85)], rng.range(-0.1, 0.1), rng.range(0, 3), rng.range(-0.25, 0.25)));
  for (let i = 0; i < rng.int(1, 2); i++) {
    const a = rng.range(0, Math.PI * 2);
    spec.prims.push(ell([Math.cos(a) * w * 0.55, h * 0.3 - bury, Math.sin(a) * w * 0.35], [w * 0.5, h * 0.42, w * 0.45], rng.range(-0.3, 0.3), rng.range(0, 3), 0));
  }
  addCuts(spec, rng, rng.int(2, 4), 0, [0.85, 0.95]);
  spec.cutBlend = 0.012;
  addWarp(spec, rng, S * 0.06, S * 0.7, 3);
  return spec;
}

function rockFrodo(rng: Rng, S: number): SdfSpec {
  const spec = newSdf(0.016);
  const w = S * 0.5 * rng.range(0.85, 1.05);
  const h = S * rng.range(0.55, 0.85);
  const bury = h * 0.13;
  spec.prims.push(ell([0, h * 0.42 - bury, 0], [w, h * 0.58, w * 0.7], rng.range(-0.1, 0.1), rng.range(0, 3), rng.range(-0.3, 0.3)));
  for (let i = 0; i < rng.int(1, 3); i++) {
    const a = rng.range(0, Math.PI * 2);
    spec.prims.push(ell([Math.cos(a) * w * 0.5, h * rng.range(0.2, 0.4) - bury, Math.sin(a) * w * 0.35], [w * rng.range(0.4, 0.6), h * 0.4, w * 0.45], rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.4, 0.4)));
  }
  addCuts(spec, rng, rng.int(6, 9), -0.15, [0.72, 0.9]);
  addWarp(spec, rng, S * 0.05, S * 0.6, 3);
  return spec;
}

/** Live-rock silhouettes. Aquascapes pick seeds to get the form they want. */
export type LiveRockForm = 'mound' | 'shelf' | 'pillar' | 'arch';
export function liveRockForm(seed: number): LiveRockForm {
  return (['mound', 'shelf', 'pillar', 'arch', 'mound', 'shelf'] as const)[(seed >>> 3) % 6];
}

function rockLive(rng: Rng, S: number, seed: number, shape: DecorShape): SdfSpec {
  const spec = newSdf(0.02);
  const form = liveRockForm(seed);
  const w = S * 0.5;
  const bury = 0.012;
  const blob = (c: V3, r: V3) => spec.prims.push(ell(c, r, rng.range(-0.4, 0.4), rng.range(0, 3), rng.range(-0.4, 0.4)));
  /** Knobs and short branch stubs sticking out of the body (reef rock is knobbly, never smooth). */
  const knobs = (n: number, c: V3, ext: V3, upOnly = false) => {
    for (let i = 0; i < n; i++) {
      let d = randomUnit(rng);
      if (upOnly || d[1] < -0.3) d = vnorm([d[0], Math.abs(d[1]) * 0.8 + 0.1, d[2]]);
      const at: V3 = [c[0] + d[0] * ext[0] * 0.8, c[1] + d[1] * ext[1] * 0.8, c[2] + d[2] * ext[2] * 0.8];
      const len = w * rng.range(0.14, 0.32);
      const rad = len * rng.range(0.35, 0.6);
      // Ellipsoid elongated along d: orient its x axis with yaw/pitch of d.
      const yaw = Math.atan2(-d[2], d[0]);
      const pitch = Math.asin(Math.max(-1, Math.min(1, d[1])));
      spec.prims.push({ t: 'ell', c: [at[0] + d[0] * len * 0.4, at[1] + d[1] * len * 0.4, at[2] + d[2] * len * 0.4], r: [len, rad, rad * rng.range(0.8, 1.1)], m: eulerXYZ(0, yaw, pitch) });
    }
  };
  if (form === 'mound') {
    const h = S * rng.range(0.38, 0.55);
    const body: V3 = [w * 0.75, h * 0.5, w * 0.6];
    blob([0, h * 0.42 - bury, 0], body);
    for (let i = 0; i < rng.int(2, 4); i++) {
      const a = rng.range(0, Math.PI * 2);
      blob([Math.cos(a) * w * rng.range(0.3, 0.6), h * rng.range(0.2, 0.6) - bury, Math.sin(a) * w * rng.range(0.2, 0.45)], [w * rng.range(0.25, 0.42), h * rng.range(0.22, 0.38), w * rng.range(0.22, 0.36)]);
    }
    knobs(rng.int(5, 9), [0, h * 0.42 - bury, 0], body);
  } else if (form === 'shelf') {
    // A low base with a flat, knobbly table jutting out — corals on top, shade below.
    const h = S * rng.range(0.35, 0.5);
    blob([-w * 0.3, h * 0.35 - bury, 0], [w * 0.45, h * 0.48, w * 0.45]);
    const table: V3 = [w * 0.72, h * 0.15, w * 0.5];
    spec.prims.push(ell([w * 0.22, h * 0.72, rng.range(-0.03, 0.03)], table, rng.range(-0.08, 0.08), rng.range(-0.3, 0.3), rng.range(-0.1, 0.06)));
    knobs(rng.int(4, 7), [w * 0.22, h * 0.72, 0], table, true);
    knobs(rng.int(2, 4), [-w * 0.3, h * 0.35 - bury, 0], [w * 0.45, h * 0.48, w * 0.45]);
  } else if (form === 'pillar') {
    const h = S * rng.range(0.6, 0.85);
    let y = -bury;
    const segs = rng.int(2, 3);
    let x = 0, z = 0;
    for (let i = 0; i < segs; i++) {
      const rr = w * rng.range(0.38, 0.52) * (1 - i * 0.12);
      const sh = h / segs;
      blob([x, y + sh * 0.6, z], [rr, sh * 0.72, rr * rng.range(0.7, 0.95)]);
      knobs(rng.int(2, 4), [x, y + sh * 0.6, z], [rr, sh * 0.72, rr]);
      y += sh;
      x += rng.range(-0.25, 0.25) * rr;
      z += rng.range(-0.15, 0.15) * rr;
    }
  } else {
    // Arch: two feet joined by a bridge, with a tunnel underneath.
    const h = S * rng.range(0.5, 0.65);
    const span = w * rng.range(0.75, 0.95);
    blob([-span, h * 0.4 - bury, 0], [w * 0.38, h * 0.55, w * 0.42]);
    blob([span, h * 0.35 - bury, rng.range(-0.02, 0.02)], [w * 0.35, h * 0.5, w * 0.4]);
    const bridge: V3 = [span * 1.25, h * 0.22, w * 0.38];
    spec.prims.push(ell([0, h * 0.78, 0], bridge, rng.range(-0.1, 0.1), rng.range(-0.15, 0.15), rng.range(-0.12, 0.12)));
    knobs(rng.int(4, 7), [0, h * 0.8, 0], bridge, true);
    spec.holes.push({ a: [0, h * 0.28, -w * 1.2], b: [0, h * 0.28, w * 1.2], r: Math.min(span * 0.62, h * 0.4) });
    shape.cover.push({ p: [0, h * 0.25, 0], radius: Math.min(span * 0.55, h * 0.3), kind: 'cave' });
  }
  // Broken faces where the rock was quarried/fractured.
  addCuts(spec, rng, rng.int(1, 3), 0.05, [0.86, 0.96]);
  spec.cutBlend = 0.006;
  const center: V3 = [0, S * 0.22, 0];
  addPockets(spec, rng, rng.int(6, 12), [S * 0.02, S * 0.06], [0.15, 0.45], center);
  if (form !== 'arch' && rng.chance(0.6)) addTunnels(spec, rng, rng.int(1, 2), [S * 0.035, S * 0.06], center, w * 0.6);
  spec.holeBlend = 0.008;
  addWarp(spec, rng, S * 0.06, S * 0.5, 4);
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Caves
// ---------------------------------------------------------------------------------------------

function caveSlate(rng: Rng, S: number, shape: DecorShape): SdfSpec {
  const spec = newSdf(0.001);
  const gap = S * rng.range(0.28, 0.36); // tunnel width (m)
  const depth = S * rng.range(0.5, 0.65); // tunnel length front→back (half extent z)
  const wallW = S * rng.range(0.16, 0.22);
  let topY = 0;
  for (const side of [-1, 1]) {
    let y = -0.008;
    const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) {
      const t = rng.range(0.006, 0.01);
      y += t;
      spec.prims.push({
        t: 'box',
        c: [side * (gap / 2 + wallW) + rng.range(-0.006, 0.006), y, rng.range(-0.008, 0.008)],
        h: [wallW * rng.range(0.9, 1.1), t, depth * 0.5 * rng.range(0.85, 1.05)],
        m: eulerXYZ(rng.range(-0.03, 0.03), rng.range(-0.15, 0.15), rng.range(-0.04, 0.04)),
        round: 0.003,
      });
      y += t;
    }
    topY = Math.max(topY, y);
  }
  const roofT = rng.range(0.008, 0.012);
  spec.prims.push({
    t: 'box',
    c: [rng.range(-0.01, 0.01), topY + roofT, 0],
    h: [gap / 2 + wallW * 2.1, roofT, depth * 0.55],
    m: eulerXYZ(rng.range(-0.04, 0.04), rng.range(-0.12, 0.12), rng.range(-0.05, 0.05)),
    round: 0.004,
  });
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    const n = vnorm([Math.cos(a), 0, Math.sin(a)]);
    spec.cuts.push({ n, d: support(spec.prims, n) * rng.range(0.85, 0.95) });
  }
  spec.cutBlend = 0.0015;
  const midY = topY * 0.5;
  for (const side of [-1, 1]) {
    shape.colliders.push({ type: 'box', a: [side * (gap / 2 + wallW), topY / 2, 0], half: [wallW, topY / 2 + 0.004, depth * 0.5], rotY: 0 });
  }
  shape.colliders.push({ type: 'box', a: [0, topY + roofT, 0], half: [gap / 2 + wallW * 2, roofT, depth * 0.55], rotY: 0, cover: true });
  shape.cover.push({ p: [0, midY, 0], radius: Math.min(gap * 0.45, topY * 0.6), kind: 'cave' });
  shape.cover.push({ p: [0, midY, depth * 0.45], radius: gap * 0.35, kind: 'crevice' });
  return spec;
}

function caveRock(rng: Rng, S: number, shape: DecorShape): SdfSpec {
  const spec = newSdf(0.03);
  const w = S * 0.5;
  const h = S * rng.range(0.5, 0.62);
  const tunnelR = h * rng.range(0.3, 0.36);
  const pillarX = tunnelR + w * 0.3;
  const pillars: SdfPrim[] = [
    ell([-pillarX, h * 0.38, rng.range(-0.01, 0.01)], [w * 0.42, h * 0.5, w * 0.48], rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2)),
    ell([pillarX, h * 0.35, rng.range(-0.01, 0.01)], [w * 0.4, h * 0.48, w * 0.46], rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2)),
  ];
  const roof = ell([0, h * 0.78, -w * 0.05], [pillarX * 1.15, h * 0.3, w * 0.5], rng.range(-0.1, 0.1), rng.range(-0.2, 0.2), rng.range(-0.1, 0.1));
  spec.prims.push(...pillars, roof);
  if (rng.chance(0.7)) spec.prims.push(ell([rng.range(-0.3, 0.3) * w, h * 0.5, -w * 0.45], [w * 0.5, h * 0.45, w * 0.3], 0, rng.range(-0.5, 0.5), 0));
  addCuts(spec, rng, rng.int(2, 5), 0, [0.85, 0.95]);
  const ty = tunnelR * 0.85;
  spec.holes.push({ a: [0, ty, -w * 0.35], b: [0, ty, w * 1.4], r: tunnelR });
  spec.holeBlend = 0.012;
  // Colliders: pillars and roof as capsules, leaving the tunnel free.
  for (const p of pillars) {
    if (p.t !== 'ell') continue;
    shape.colliders.push({ type: 'capsule', a: [p.c[0], p.c[1] - p.r[1] * 0.4, p.c[2]], b: [p.c[0], p.c[1] + p.r[1] * 0.4, p.c[2]], radius: Math.min(p.r[0], p.r[2]) * 0.85 });
  }
  shape.colliders.push({ type: 'capsule', a: [-pillarX * 0.9, h * 0.8, -w * 0.05], b: [pillarX * 0.9, h * 0.8, -w * 0.05], radius: h * 0.22, cover: true });
  shape.cover.push({ p: [0, ty, 0], radius: tunnelR * 0.85, kind: 'cave' });
  addWarp(spec, rng, S * 0.04, S * 0.6, 3);
  return spec;
}

function caveCoconut(rng: Rng, S: number, shape: DecorShape): SdfSpec {
  const spec = newSdf(0.01);
  const R = S * 0.5 * rng.range(0.85, 1.0);
  spec.prims.push(ell([0, -R * 0.18, 0], [R, R * 0.92, R * 0.95], 0, 0, 0));
  spec.shell = R * 0.075;
  spec.clipBelow = -0.004;
  const doorR = R * rng.range(0.36, 0.44);
  spec.holes.push({ a: [0, doorR * 0.55, R * 0.2], b: [0, doorR * 0.55, R * 1.6], r: doorR });
  spec.holeBlend = 0.004;
  spec.cutBlend = 0.002;
  // Ring of small spheres approximating the dome wall (interior stays free).
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (Math.abs(Math.sin(a) - 1) < 0.2) continue; // skip the doorway side (+z)
    shape.colliders.push({ type: 'sphere', a: [Math.cos(a) * R * 0.85, R * 0.3, Math.sin(a) * R * 0.85], radius: R * 0.25 });
  }
  shape.colliders.push({ type: 'sphere', a: [0, R * 0.78, 0], radius: R * 0.22, cover: true });
  shape.cover.push({ p: [0, R * 0.32, 0], radius: R * 0.55, kind: 'cave' });
  return spec;
}

// ---------------------------------------------------------------------------------------------
// Driftwood
// ---------------------------------------------------------------------------------------------

interface WoodStyle {
  trunks: [number, number];
  r0: [number, number];
  len: [number, number];
  /** Elevation of trunks (radians above horizontal). */
  elev: [number, number];
  /** Trunks start from a common base (root crown) or along a lying log. */
  wander: number;
  upBias: number;
  /** Downward curvature along the trunk (arching branches). */
  arch: number;
  taper: number;
  tipR: number;
  branchProb: number;
  branchAngle: [number, number];
  childScale: number;
  childLen: number;
  maxDepth: number;
  stepLen: number;
  /** Twist the growth direction around the trunk axis (spiralling roots). */
  spiral: number;
  /** Trunks fan out (spread yaw) — 2π for a radial root crown, small for a log. */
  yawSpread: number;
}

const WOOD: Record<string, WoodStyle> = {
  spiderwood: { trunks: [4, 6], r0: [0.007, 0.012], len: [0.22, 0.36], elev: [0.35, 1.1], wander: 0.36, upBias: 0.05, arch: 0.25, taper: 0.78, tipR: 0.0018, branchProb: 0.11, branchAngle: [0.35, 0.75], childScale: 0.66, childLen: 0.55, maxDepth: 2, stepLen: 0.014, spiral: 0.35, yawSpread: Math.PI * 2 },
  'redmoor-root': { trunks: [4, 7], r0: [0.006, 0.012], len: [0.2, 0.3], elev: [0.6, 1.3], wander: 0.35, upBias: 0.09, arch: 0.1, taper: 0.82, tipR: 0.0012, branchProb: 0.26, branchAngle: [0.3, 0.7], childScale: 0.66, childLen: 0.6, maxDepth: 3, stepLen: 0.012, spiral: 0.3, yawSpread: Math.PI * 1.4 },
  manzanita: { trunks: [1, 2], r0: [0.018, 0.026], len: [0.26, 0.34], elev: [0.9, 1.35], wander: 0.16, upBias: 0.03, arch: 0.05, taper: 0.72, tipR: 0.0025, branchProb: 0.17, branchAngle: [0.35, 0.75], childScale: 0.66, childLen: 0.62, maxDepth: 3, stepLen: 0.016, spiral: 0.1, yawSpread: 1.2 },
  mopani: { trunks: [1, 2], r0: [0.03, 0.045], len: [0.16, 0.26], elev: [0.05, 0.5], wander: 0.28, upBias: 0.0, arch: 0.15, taper: 0.45, tipR: 0.012, branchProb: 0.1, branchAngle: [0.5, 1.0], childScale: 0.62, childLen: 0.5, maxDepth: 2, stepLen: 0.016, spiral: 0.2, yawSpread: 1.6 },
  malaysian: { trunks: [1, 2], r0: [0.024, 0.034], len: [0.26, 0.33], elev: [0.15, 0.6], wander: 0.2, upBias: 0.0, arch: 0.2, taper: 0.55, tipR: 0.006, branchProb: 0.12, branchAngle: [0.4, 0.9], childScale: 0.6, childLen: 0.55, maxDepth: 2, stepLen: 0.016, spiral: 0.15, yawSpread: 1.2 },
  cholla: { trunks: [1, 1], r0: [0.021, 0.026], len: [0.2, 0.25], elev: [0.0, 0.06], wander: 0.03, upBias: 0, arch: 0, taper: 0.06, tipR: 0.018, branchProb: 0, branchAngle: [0, 0], childScale: 0, childLen: 0, maxDepth: 0, stepLen: 0.012, spiral: 0, yawSpread: 0.2 },
  branchwood: { trunks: [1, 1], r0: [0.012, 0.018], len: [0.42, 0.55], elev: [0.45, 0.75], wander: 0.07, upBias: 0, arch: 1.0, taper: 0.6, tipR: 0.003, branchProb: 0.07, branchAngle: [0.3, 0.6], childScale: 0.5, childLen: 0.35, maxDepth: 2, stepLen: 0.02, spiral: 0, yawSpread: 0.3 },
};

function growBranch(rng: Rng, st: WoodStyle, out: Branch[], start: V3, dir0: V3, r0: number, len: number, depth: number, parent: number, sizeK: number): void {
  const step = st.stepLen * sizeK;
  const n = Math.max(3, Math.ceil(len / step));
  const pts: V3[] = [[...start]];
  const rs: number[] = [r0];
  let d = vnorm(dir0);
  let p: V3 = [...start];
  // A perpendicular axis for spiralling.
  let side = vnorm(vcross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const myIndex = out.length;
  out.push({ pts, r: rs, parent, depth });
  const children: { at: number; dir: V3; r: number; len: number }[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const w = randomUnit(rng);
    // Spiral: rotate the side vector a bit and push along it.
    side = vnorm(vadd(side, vscale(vcross(d, side), st.spiral * 0.3)));
    d = vnorm([
      d[0] + w[0] * st.wander * 0.35 + side[0] * st.spiral * 0.06,
      d[1] + w[1] * st.wander * 0.25 + st.upBias - st.arch * 0.06 * t,
      d[2] + w[2] * st.wander * 0.35 + side[2] * st.spiral * 0.06,
    ]);
    // Don't dive into the substrate (allow lying on it).
    const rNow = Math.max(st.tipR * sizeK, r0 * (1 - st.taper * Math.pow(t, 0.9)));
    if (p[1] + d[1] * step < rNow * 0.2 - 0.004) d = vnorm([d[0], Math.max(d[1], 0.05), d[2]]);
    p = vadd(p, vscale(d, step));
    pts.push([...p]);
    rs.push(rNow);
    if (depth < st.maxDepth && i > 1 && i < n - 1 && rng.chance(st.branchProb)) {
      const axis = vnorm(vcross(d, randomUnit(rng)));
      const ang = rng.range(st.branchAngle[0], st.branchAngle[1]);
      // Rodrigues rotation of d around axis.
      const c = Math.cos(ang), s = Math.sin(ang);
      const cd = vcross(axis, d);
      let cdir = vnorm(vadd(vadd(vscale(d, c), vscale(cd, s)), vscale(axis, vdot(axis, d) * (1 - c))));
      if (cdir[1] < -0.2) cdir = vnorm([cdir[0], 0.1, cdir[2]]);
      children.push({ at: i, dir: cdir, r: rNow * st.childScale, len: len * (1 - t) * st.childLen + len * 0.12 });
    }
  }
  for (const ch of children) {
    const base = pts[ch.at];
    const bd = vnorm(vsub(pts[Math.min(pts.length - 1, ch.at + 1)], pts[ch.at - 1]));
    // Start slightly inside the parent so the junction reads as grown, not glued.
    const start = vadd(base, vscale(ch.dir, -rs[ch.at] * 0.4));
    void bd;
    growBranch(rng, st, out, start, ch.dir, Math.max(st.tipR * sizeK * 1.5, ch.r), ch.len, depth + 1, myIndex, sizeK);
  }
}

function driftwood(rng: Rng, style: string, S: number): Branch[] {
  const st = WOOD[style] ?? WOOD.branchwood;
  const sizeK = S / (catalogEntry('driftwood', style).size || S);
  const out: Branch[] = [];
  const trunks = rng.int(st.trunks[0], st.trunks[1]);
  const baseYaw = rng.range(-0.3, 0.3);
  if (style === 'spiderwood' || style === 'redmoor-root') {
    // A gnarled root crown partly buried, with roots radiating up and out.
    for (let i = 0; i < 3; i++) {
      const yaw = rng.range(0, Math.PI * 2);
      growBranch(rng, { ...st, maxDepth: 0, taper: 0.5, wander: 0.2 }, out, [0, -0.004, 0], dirFrom(yaw, rng.range(-0.05, 0.15)), rng.range(0.008, 0.013) * sizeK, rng.range(0.05, 0.09) * sizeK, 0, -1, sizeK);
    }
  }
  for (let i = 0; i < trunks; i++) {
    const yaw = baseYaw + (trunks > 1 ? ((i / trunks) - 0.5) * st.yawSpread + rng.range(-0.3, 0.3) : rng.range(-0.15, 0.15));
    const elev = rng.range(st.elev[0], st.elev[1]);
    let start: V3 = [rng.range(-0.01, 0.01) * sizeK, rng.range(-0.006, 0.004), rng.range(-0.01, 0.01) * sizeK];
    if (style === 'mopani' || style === 'malaysian' || style === 'cholla') {
      // Lying pieces: trunks start low across the footprint.
      start = [(-0.5 + i * 0.4) * S * 0.4, rng.range(0.004, 0.01) * sizeK, rng.range(-0.04, 0.04) * sizeK];
    }
    if (style === 'branchwood') start = [-S * 0.45, -0.01, rng.range(-0.02, 0.02)];
    const r0 = rng.range(st.r0[0], st.r0[1]) * sizeK;
    growBranch(rng, st, out, start, dirFrom(style === 'branchwood' ? 0 : yaw, elev), r0, rng.range(st.len[0], st.len[1]) * sizeK, 0, -1, sizeK);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Small decor
// ---------------------------------------------------------------------------------------------

function pebbles(rng: Rng, style: string, S: number): Pebble[] {
  const out: Pebble[] = [];
  const count = rng.int(8, 15);
  const R = S * 0.5;
  for (let tries = 0; out.length < count && tries < 200; tries++) {
    const big = rng.chance(0.35);
    const rx = (big ? rng.range(0.016, 0.026) : rng.range(0.007, 0.015)) * (style === 'black' ? 0.9 : 1);
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * (R - rx);
    const c: V3 = [Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.75];
    if (out.some((p) => Math.hypot(p.c[0] - c[0], p.c[2] - c[2]) < (p.r[0] + rx) * 0.8)) continue;
    const ry = rx * rng.range(0.42, 0.7);
    c[1] = ry * 0.45;
    out.push({ c, r: [rx, ry, rx * rng.range(0.65, 0.95)], rotY: rng.range(0, Math.PI), tone: rng.next(), seed: Math.floor(rng.next() * 1e9) });
  }
  return out;
}

const LITTER: Record<string, { n: [number, number]; len: [number, number] }> = {
  catappa: { n: [3, 6], len: [0.12, 0.2] },
  oak: { n: [6, 10], len: [0.065, 0.1] },
  guava: { n: [5, 8], len: [0.075, 0.11] },
};

function litter(rng: Rng, style: string, S: number): LitterLeaf[] {
  const p = LITTER[style] ?? LITTER.catappa;
  const n = rng.int(p.n[0], p.n[1]);
  const out: LitterLeaf[] = [];
  const R = S * 0.5;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * R * 0.7;
    const len = rng.range(p.len[0], p.len[1]);
    out.push({
      c: [Math.cos(a) * rr, 0.0015 + i * 0.0012, Math.sin(a) * rr * 0.8],
      rotY: rng.range(0, Math.PI * 2),
      len,
      curl: rng.range(0.15, 0.75),
      tone: rng.next(),
      tilt: [rng.range(-0.08, 0.08), rng.range(-0.08, 0.08)],
      seed: Math.floor(rng.next() * 1e9),
    });
  }
  return out;
}

function shellsFor(rng: Rng, style: string, S: number): ShellPart[] {
  if (style === 'conch') {
    const size = S * rng.range(0.85, 1.0);
    return [{ c: [0, size * 0.18, 0], rot: [rng.range(1.2, 1.5), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3)], size, seed: Math.floor(rng.next() * 1e9) }];
  }
  const out: ShellPart[] = [];
  const n = rng.int(3, 6);
  for (let tries = 0; out.length < n && tries < 80; tries++) {
    const size = rng.range(0.03, 0.042);
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * S * 0.42;
    const c: V3 = [Math.cos(a) * rr, size * 0.3, Math.sin(a) * rr * 0.8];
    if (out.some((s) => Math.hypot(s.c[0] - c[0], s.c[2] - c[2]) < (s.size + size) * 0.55)) continue;
    // Shells lie on their side, aperture sideways or up (as cichlids position them).
    out.push({ c, rot: [rng.range(1.1, 1.9), rng.range(0, Math.PI * 2), rng.range(-0.4, 0.4)], size, seed: Math.floor(rng.next() * 1e9) });
  }
  return out;
}

function rubble(rng: Rng, S: number): Branch[] {
  const out: Branch[] = [];
  const n = rng.int(6, 10);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * S * 0.38;
    const r0 = rng.range(0.004, 0.009);
    const start: V3 = [Math.cos(a) * rr, r0 * 0.5, Math.sin(a) * rr * 0.8];
    const yaw = rng.range(0, Math.PI * 2);
    const st: WoodStyle = { ...WOOD.manzanita, wander: 0.3, upBias: 0, arch: 0.2, taper: 0.3, tipR: 0.003, branchProb: 0.18, branchAngle: [0.5, 0.9], childScale: 0.8, childLen: 0.6, maxDepth: 1, stepLen: 0.01, spiral: 0, yawSpread: 0 };
    growBranch(rng, st, out, start, dirFrom(yaw, rng.range(0.0, 0.25)), r0, rng.range(0.04, 0.09), 0, -1, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Colliders & cover derived from branches / prims
// ---------------------------------------------------------------------------------------------

function primColliders(spec: SdfSpec, shape: DecorShape): void {
  // Knobs and small lobes don't matter for steering; keep the major masses only.
  const size = (p: SdfPrim) => (p.t === 'ell' ? Math.max(p.r[0], p.r[1], p.r[2]) : p.t === 'box' ? Math.max(p.h[0], p.h[1], p.h[2]) : p.r + Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]) / 2);
  const biggest = Math.max(...spec.prims.map(size));
  for (const p of spec.prims) {
    if (p.t !== 'box' && size(p) < biggest * 0.45) continue;
    if (p.t === 'ell') {
      const r = p.r;
      const order = [0, 1, 2].sort((i, j) => r[j] - r[i]);
      const long = order[0], mid = order[1], short = order[2];
      if (r[long] > r[mid] * 1.35) {
        // Elongated: capsule along the long axis with radius ≈ the middle radius (slightly inset).
        const ax: V3 = [p.m[long], p.m[3 + long], p.m[6 + long]];
        const half = Math.max(0, r[long] - r[mid]);
        const rad = Math.sqrt(r[mid] * r[short]) * 0.95;
        shape.colliders.push({ type: 'capsule', a: vsub(p.c, vscale(ax, half)), b: vadd(p.c, vscale(ax, half)), radius: rad });
      } else {
        shape.colliders.push({ type: 'sphere', a: [...p.c], radius: Math.cbrt(r[0] * r[1] * r[2]) * 0.95 });
      }
    } else if (p.t === 'box') {
      // Yaw from the rotation matrix's x axis (tilts are small for plates).
      const yaw = Math.atan2(-p.m[6], p.m[0]);
      shape.colliders.push({ type: 'box', a: [...p.c], half: [...p.h], rotY: yaw });
    } else {
      shape.colliders.push({ type: 'capsule', a: [...p.a], b: [...p.b], radius: p.r * 0.95 });
    }
  }
}

function branchColliders(branches: Branch[], shape: DecorShape, minR: number, maxCount: number): void {
  const segs: LocalCollider[] = [];
  for (const b of branches) {
    let i = 0;
    while (i < b.pts.length - 1) {
      let j = i + 1;
      let L = 0;
      while (j < b.pts.length - 1 && L < 0.05) {
        L += vlen(vsub(b.pts[j], b.pts[j - 1]));
        j++;
      }
      const r = (b.r[i] + b.r[j]) / 2;
      if (r >= minR) segs.push({ type: 'capsule', a: [...b.pts[i]], b: [...b.pts[j]], radius: Math.max(0.003, r * 1.05) });
      i = j;
    }
  }
  segs.sort((a, b) => (b.radius ?? 0) - (a.radius ?? 0));
  shape.colliders.push(...segs.slice(0, maxCount));
}

function overhangCover(branches: Branch[], shape: DecorShape, max: number): void {
  const found: LocalCover[] = [];
  for (const b of branches) {
    for (let i = 1; i < b.pts.length - 1; i++) {
      const p = b.pts[i];
      if (p[1] < 0.035 || p[1] > 0.22) continue;
      const d = vnorm(vsub(b.pts[i + 1], b.pts[i - 1]));
      if (Math.abs(d[1]) > 0.55) continue;
      if (found.some((f) => Math.hypot(f.p[0] - p[0], f.p[2] - p[2]) < 0.07)) continue;
      found.push({ p: [p[0], Math.max(0.015, p[1] * 0.45), p[2]], radius: Math.min(0.06, 0.02 + p[1] * 0.3), kind: 'overhang' });
    }
  }
  found.sort((a, b) => b.radius - a.radius);
  shape.cover.push(...found.slice(0, max));
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

const cache = new Map<string, DecorShape>();
const CACHE_MAX = 256;

/** Resolve aliases (e.g. 'ohko' → 'dragon-stone') and unknown variants to a renderable style. */
export function resolveStyle(kind: DecorKind, variant: string): string {
  if (kind === 'rock' && variant === 'ohko') return 'dragon-stone';
  if (kind === 'driftwood' && variant === 'branch') return 'branchwood';
  if (kind === 'driftwood' && variant === 'redmoor') return 'redmoor-root';
  return catalogEntry(kind, variant).kind === kind ? catalogEntry(kind, variant).variant : variant;
}

/** Deterministic local-space shape for an item (cached by kind+variant+seed). */
export function decorShape(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>): DecorShape {
  const key = `${item.kind}|${item.variant}|${item.seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const shape = buildShape(item);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, shape);
  return shape;
}

function computeBounds(shape: DecorShape): void {
  const min: V3 = [1e9, 1e9, 1e9], max: V3 = [-1e9, -1e9, -1e9];
  const grow = (p: V3, r: number) => {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k] - r);
      max[k] = Math.max(max[k], p[k] + r);
    }
  };
  if (shape.sdf) {
    for (const p of shape.sdf.prims) {
      if (p.t === 'ell') grow(p.c, Math.max(p.r[0], p.r[1], p.r[2]));
      else if (p.t === 'box') grow(p.c, Math.hypot(p.h[0], p.h[1], p.h[2]));
      else {
        grow(p.a, p.r);
        grow(p.b, p.r);
      }
    }
  }
  for (const b of shape.branches ?? []) b.pts.forEach((p, i) => grow(p, b.r[i]));
  for (const s of shape.pebbles ?? []) grow(s.c, Math.max(s.r[0], s.r[2]));
  for (const l of shape.leaves ?? []) grow(l.c, l.len * 0.55);
  for (const s of shape.shells ?? []) grow(s.c, s.size * 0.6);
  if (shape.tube) {
    grow([0, shape.tube.axisY, -shape.tube.len / 2], shape.tube.rOut);
    grow([0, shape.tube.axisY, shape.tube.len / 2], shape.tube.rOut);
  }
  if (shape.airstone) {
    const a = shape.airstone;
    grow([-a.len / 2, 0, 0], a.r);
    grow([a.len / 2, a.h, 0], a.r);
  }
  if (min[0] > max[0]) {
    min[0] = min[1] = min[2] = -0.02;
    max[0] = max[1] = max[2] = 0.02;
  }
  shape.bounds = { min, max };
}

function buildShape(item: Pick<DecorItem, 'kind' | 'variant' | 'seed'>): DecorShape {
  const rng = new Rng(item.seed ^ 0x6a09e667);
  const style = resolveStyle(item.kind, item.variant);
  const S = catalogEntry(item.kind, style).size;
  const shape: DecorShape = { kind: item.kind, style, colliders: [], cover: [], bounds: { min: [0, 0, 0], max: [0, 0, 0] } };

  switch (item.kind) {
    case 'rock': {
      const gen: Record<string, () => SdfSpec> = {
        seiryu: () => rockSeiryu(rng, S),
        'dragon-stone': () => rockDragon(rng, S),
        lava: () => rockLava(rng, S),
        slate: () => rockSlate(rng, S),
        'river-stone': () => rockRiver(rng, S),
        'texas-holey': () => rockTexas(rng, S),
        'petrified-wood': () => rockPetrified(rng, S, shape),
        'elephant-skin': () => rockElephant(rng, S),
        frodo: () => rockFrodo(rng, S),
        'live-rock': () => rockLive(rng, S, item.seed, shape),
      };
      shape.sdf = (gen[style] ?? gen.seiryu)();
      primColliders(shape.sdf, shape);
      // A crevice at the base between the largest lobes (shrimp, gobies and plecos tuck in here).
      const ells = shape.sdf.prims.filter((p): p is Extract<SdfPrim, { t: 'ell' }> => p.t === 'ell');
      if (ells.length >= 2) {
        const [a, b] = ells;
        const mid: V3 = [(a.c[0] + b.c[0]) / 2, Math.max(0.012, Math.min(a.c[1], b.c[1]) * 0.5), (a.c[2] + b.c[2]) / 2 + Math.max(a.r[2], b.r[2]) * 0.6];
        shape.cover.push({ p: mid, radius: Math.min(a.r[0], b.r[0]) * 0.35, kind: 'crevice' });
      }
      // Holes big enough for small fish are cover too (the largest few).
      for (const h of [...shape.sdf.holes].sort((a, b) => b.r - a.r).slice(0, 3)) {
        if (h.r < 0.012) continue;
        shape.cover.push({ p: [(h.a[0] + h.b[0]) / 2, Math.max(0.01, (h.a[1] + h.b[1]) / 2), (h.a[2] + h.b[2]) / 2], radius: h.r * 0.8, kind: 'crevice' });
      }
      break;
    }
    case 'cave': {
      if (style === 'slate-cave') shape.sdf = caveSlate(rng, S, shape);
      else if (style === 'coconut') shape.sdf = caveCoconut(rng, S, shape);
      else if (style === 'clay-tube') {
        const rOut = rng.range(0.024, 0.028), rIn = rOut - 0.0045, len = S * rng.range(0.9, 1.0);
        shape.tube = { len, rOut, rIn, axisY: rOut * 0.82 };
        const y = shape.tube.axisY;
        for (const [x, yy] of [[-rOut * 0.85, y], [rOut * 0.85, y], [0, y + rOut * 0.85]] as const) {
          shape.colliders.push({ type: 'capsule', a: [x, yy, -len / 2], b: [x, yy, len / 2 - 0.01], radius: 0.007 });
        }
        shape.colliders.push({ type: 'sphere', a: [0, y, -len / 2], radius: rOut * 0.8 });
        shape.cover.push({ p: [0, y, -len * 0.15], radius: rIn * 0.9, kind: 'cave' });
      } else shape.sdf = caveRock(rng, S, shape);
      break;
    }
    case 'driftwood': {
      shape.branches = driftwood(rng, style, S);
      shape.hollow = style === 'cholla';
      branchColliders(shape.branches, shape, style === 'spiderwood' || style === 'redmoor-root' ? 0.004 : 0.003, 48);
      overhangCover(shape.branches, shape, 3);
      if (style === 'cholla') {
        const b = shape.branches[0];
        const mid = b.pts[Math.floor(b.pts.length / 2)];
        shape.cover.push({ p: [...mid], radius: b.r[0] * 0.7, kind: 'cave' });
      }
      break;
    }
    case 'pebbles': {
      shape.pebbles = pebbles(rng, style, S);
      for (const p of shape.pebbles) if (p.r[0] > 0.015) shape.colliders.push({ type: 'sphere', a: [p.c[0], p.c[1] * 0.5, p.c[2]], radius: p.r[0] * 0.75 });
      break;
    }
    case 'leaf-litter': {
      shape.leaves = litter(rng, style, S);
      shape.cover.push({ p: [0, 0.008, 0], radius: S * 0.25, kind: 'crevice' });
      break;
    }
    case 'shell': {
      shape.shells = shellsFor(rng, style, S);
      for (const s of shape.shells) {
        shape.colliders.push({ type: 'sphere', a: [s.c[0], s.c[1], s.c[2]], radius: s.size * (style === 'conch' ? 0.32 : 0.38) });
        shape.cover.push({ p: [s.c[0], s.c[1] + s.size * 0.1, s.c[2]], radius: s.size * 0.35, kind: 'cave' });
      }
      break;
    }
    case 'airstone': {
      const type = style === 'disc' ? 'disc' : style === 'bar' ? 'bar' : 'cylinder';
      shape.airstone = type === 'disc' ? { type, r: 0.038, h: 0.013, len: 0 } : type === 'bar' ? { type, r: 0.0085, h: 0.017, len: 0.2 } : { type, r: 0.0125, h: 0.026, len: 0 };
      shape.colliders.push({ type: 'sphere', a: [0, shape.airstone.h * 0.5, 0], radius: Math.max(shape.airstone.r, shape.airstone.len * 0.3) });
      break;
    }
    case 'coral-skeleton': {
      shape.branches = rubble(rng, S);
      shape.cover.push({ p: [0, 0.005, 0], radius: S * 0.2, kind: 'burrow' });
      break;
    }
  }
  computeBounds(shape);
  return shape;
}

// ---------------------------------------------------------------------------------------------
// Host surfaces (epiphytes, moss, corals placed on rock & wood)
// ---------------------------------------------------------------------------------------------

export interface SurfacePoint {
  p: V3;
  n: V3;
}

const _l: V3 = [0, 0, 0];
const _w: V3 = [0, 0, 0];

/** Closest point on a polyline branch set to a local point; returns branch & segment params. */
function closestOnBranches(branches: Branch[], p: V3, horizontalOnly: boolean): { pt: V3; r: number; dir: V3; dist: number } | null {
  let best: { pt: V3; r: number; dir: V3; dist: number } | null = null;
  for (const b of branches) {
    for (let i = 0; i < b.pts.length - 1; i++) {
      const a = b.pts[i], c = b.pts[i + 1];
      const ab = vsub(c, a);
      const ap = vsub(p, a);
      const bb = horizontalOnly ? ab[0] * ab[0] + ab[2] * ab[2] : vdot(ab, ab);
      const t = bb > 0 ? Math.min(1, Math.max(0, (horizontalOnly ? ap[0] * ab[0] + ap[2] * ab[2] : vdot(ap, ab)) / bb)) : 0;
      const q = vadd(a, vscale(ab, t));
      const dist = horizontalOnly ? Math.hypot(p[0] - q[0], p[2] - q[2]) : vlen(vsub(p, q));
      const r = b.r[i] + (b.r[i + 1] - b.r[i]) * t;
      // Prefer thicker wood for anchoring (plants are tied to sturdy parts).
      const score = dist - Math.min(r, 0.02) * 0.8;
      if (!best || score < best.dist) best = { pt: q, r, dir: vnorm(ab), dist: score };
    }
  }
  return best;
}

/**
 * Where an epiphyte planted at world (x, z) sits on its host: the top of the host surface under
 * that point (or the nearest surface if it misses). World space.
 */
export function hostAnchor(item: DecorItem, x: number, z: number): SurfacePoint {
  const shape = decorShape(item);
  const xf = itemTransform(item);
  if (shape.branches && shape.branches.length) {
    toLocal(xf, [x, item.position[1] + 0.1, z], _l);
    const hit = closestOnBranches(shape.branches, _l, true);
    if (hit) {
      // Top of the branch: offset along the branch's local "up" (perpendicular to its axis).
      const up = vnorm(vsub([0, 1, 0], vscale(hit.dir, hit.dir[1])));
      const loc = vadd(hit.pt, vscale(up, hit.r * 0.9));
      const p = toWorld(xf, loc, [0, 0, 0]);
      const n = vnorm(dirToWorld(xf, up, [0, 0, 0]));
      return { p, n };
    }
  }
  if (shape.sdf) {
    const spec = shape.sdf;
    toLocal(xf, [x, item.position[1], z], _l);
    // March down in local space (assumes mostly upright items).
    const top = shape.bounds.max[1] + 0.01;
    const bottom = Math.max(shape.bounds.min[1], -0.01);
    let prev = sdfEval(spec, _l[0], top, _l[2]);
    let prevY = top;
    for (let y = top - 0.002; y >= bottom; y -= 0.002) {
      const d = sdfEval(spec, _l[0], y, _l[2]);
      if (d <= 0 && prev > 0) {
        let lo = y, hi = prevY;
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          if (sdfEval(spec, _l[0], mid, _l[2]) > 0) hi = mid;
          else lo = mid;
        }
        const loc: V3 = [_l[0], hi, _l[2]];
        const g = sdfGradient(spec, loc[0], loc[1], loc[2]);
        return { p: toWorld(xf, loc, [0, 0, 0]), n: vnorm(dirToWorld(xf, g, [0, 0, 0])) };
      }
      prev = d;
      prevY = y;
    }
    // Missed: project the point at mid height onto the surface.
    const loc: V3 = [_l[0], (shape.bounds.max[1] + Math.max(0, shape.bounds.min[1])) * 0.55, _l[2]];
    projectToSurface(spec, loc);
    const g = sdfGradient(spec, loc[0], loc[1], loc[2]);
    return { p: toWorld(xf, loc, [0, 0, 0]), n: vnorm(dirToWorld(xf, g, [0, 0, 0])) };
  }
  // Other kinds: top of the bounds.
  const loc: V3 = [0, shape.bounds.max[1], 0];
  toLocal(xf, [x, 0, z], _l);
  loc[0] = Math.max(shape.bounds.min[0], Math.min(shape.bounds.max[0], _l[0]));
  loc[2] = Math.max(shape.bounds.min[2], Math.min(shape.bounds.max[2], _l[2]));
  return { p: toWorld(xf, loc, [0, 0, 0]), n: [0, 1, 0] };
}

/** Newton-project a local point onto the SDF surface (in place). */
export function projectToSurface(spec: SdfSpec, p: V3): V3 {
  const g: V3 = [0, 0, 0];
  for (let k = 0; k < 10; k++) {
    const d = sdfEval(spec, p[0], p[1], p[2]);
    if (Math.abs(d) < 0.0003) break;
    sdfGradient(spec, p[0], p[1], p[2], 0.001, g);
    p[0] -= g[0] * d;
    p[1] -= g[1] * d;
    p[2] -= g[2] * d;
  }
  return p;
}

/**
 * Random points on a host's surface within `radius` (world m) of a world-space center — used to
 * drape moss over wood, spread polyps over rock, etc. Prefers upward-facing surface.
 */
export function sampleHostSurface(item: DecorItem, center: V3, radius: number, count: number, rng: Rng): SurfacePoint[] {
  const shape = decorShape(item);
  const xf = itemTransform(item);
  const out: SurfacePoint[] = [];
  const cLoc = toLocal(xf, center, [0, 0, 0]);
  const rLoc = radius / xf.s;
  if (shape.branches && shape.branches.length) {
    // Collect branch segments near the center, weighted by length.
    const segs: { a: V3; b: V3; ra: number; rb: number }[] = [];
    for (const b of shape.branches) {
      for (let i = 0; i < b.pts.length - 1; i++) {
        const m = vscale(vadd(b.pts[i], b.pts[i + 1]), 0.5);
        if (vlen(vsub(m, cLoc)) < rLoc) segs.push({ a: b.pts[i], b: b.pts[i + 1], ra: b.r[i], rb: b.r[i + 1] });
      }
    }
    if (!segs.length) {
      const h = closestOnBranches(shape.branches, cLoc, false);
      if (h) segs.push({ a: h.pt, b: vadd(h.pt, vscale(h.dir, 0.01)), ra: h.r, rb: h.r });
    }
    for (let i = 0; i < count && segs.length; i++) {
      const s = segs[Math.floor(rng.next() * segs.length)];
      const t = rng.next();
      const axis = vnorm(vsub(s.b, s.a));
      const up = vnorm(vsub([0, 1, 0], vscale(axis, axis[1])));
      const side = vnorm(vcross(axis, up));
      // Angle around the branch, biased to the top (moss grows where light and detritus land).
      const ang = rng.normal(0, 1.1);
      const nrm = vnorm(vadd(vscale(up, Math.cos(ang)), vscale(side, Math.sin(ang))));
      const r = s.ra + (s.rb - s.ra) * t;
      const loc = vadd(vadd(s.a, vscale(vsub(s.b, s.a), t)), vscale(nrm, r));
      out.push({ p: toWorld(xf, loc, [0, 0, 0]), n: vnorm(dirToWorld(xf, nrm, [0, 0, 0])) });
    }
    return out;
  }
  if (shape.sdf) {
    for (let tries = 0; out.length < count && tries < count * 4; tries++) {
      const u = randomUnit(rng);
      const rr = Math.cbrt(rng.next()) * rLoc;
      const loc: V3 = [cLoc[0] + u[0] * rr, cLoc[1] + Math.abs(u[1]) * rr * 0.6 + rLoc * 0.3, cLoc[2] + u[2] * rr];
      projectToSurface(shape.sdf, loc);
      if (vlen(vsub(loc, cLoc)) > rLoc * 1.3) continue;
      const g = sdfGradient(shape.sdf, loc[0], loc[1], loc[2]);
      if (g[1] < -0.35 && rng.chance(0.8)) continue;
      out.push({ p: toWorld(xf, loc, [0, 0, 0]), n: vnorm(dirToWorld(xf, g, [0, 0, 0])) });
    }
    return out;
  }
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * radius;
    out.push({ p: [center[0] + Math.cos(a) * rr, center[1], center[2] + Math.sin(a) * rr], n: [0, 1, 0] });
  }
  return out;
}

/** Local bounding spheres that tightly cover a shape (prims, branch points, small parts). */
function coverSpheres(shape: DecorShape): { c: V3; r: number }[] {
  const out: { c: V3; r: number }[] = [];
  if (shape.sdf) {
    for (const p of shape.sdf.prims) {
      if (p.t === 'ell') out.push({ c: p.c, r: Math.max(p.r[0], p.r[1], p.r[2]) });
      else if (p.t === 'box') out.push({ c: p.c, r: Math.hypot(p.h[0], p.h[1], p.h[2]) });
      else {
        const n = 4;
        for (let i = 0; i <= n; i++) out.push({ c: [p.a[0] + (p.b[0] - p.a[0]) * (i / n), p.a[1] + (p.b[1] - p.a[1]) * (i / n), p.a[2] + (p.b[2] - p.a[2]) * (i / n)], r: p.r });
      }
    }
  }
  for (const b of shape.branches ?? []) b.pts.forEach((p, i) => out.push({ c: p, r: b.r[i] }));
  for (const s of shape.pebbles ?? []) out.push({ c: s.c, r: Math.max(s.r[0], s.r[2]) });
  for (const l of shape.leaves ?? []) out.push({ c: l.c, r: l.len * 0.5 });
  for (const s of shape.shells ?? []) out.push({ c: s.c, r: s.size * 0.55 });
  if (!out.length) {
    const b = shape.bounds;
    for (let i = 0; i < 8; i++) out.push({ c: [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]], r: 0 });
  }
  return out;
}

/** World-space axis-aligned bounds of an item (for placement & picking proxies). */
export function itemWorldBounds(item: DecorItem): { min: V3; max: V3 } {
  const shape = decorShape(item);
  const xf = itemTransform(item);
  const min: V3 = [1e9, 1e9, 1e9], max: V3 = [-1e9, -1e9, -1e9];
  for (const s of coverSpheres(shape)) {
    toWorld(xf, s.c, _w);
    const r = s.r * xf.s;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], _w[k] - r);
      max[k] = Math.max(max[k], _w[k] + r);
    }
  }
  return { min, max };
}
