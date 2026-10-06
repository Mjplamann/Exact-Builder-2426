/**
 * Building kit for plant generators: instance records for instanced parts, oriented frames,
 * color helpers. Generators run when a plant is (re)built — never per frame.
 */
import { Color, type Mesh } from 'three';
import type { PlantInstance, PlantSpecies, Quality, TankState } from '../../../core/types';
import type { PlantMetrics } from '../../../decor/plantMetrics';
import type { V3 } from '../../../decor/shapes';
import type { Rng } from '../../../core/rng';
import type { PartDef } from './parts';

export type RGB = [number, number, number];

/** One instance of an instanced part. */
export interface Inst {
  /** Column-major 4×4 world matrix. */
  m: number[];
  c: RGB;
  /** baseY, height, flex, phase. */
  s: [number, number, number, number];
  /** curvature, twist, glow, extension. */
  l: [number, number, number, number];
}

export interface PartUse {
  def: PartDef;
  inst: Inst[];
}

export interface PlantBuild {
  parts: Map<string, PartUse>;
  /** Unique meshes (coral skeletons, marimo, gorgonian fans…). Each owns its material. */
  meshes: Mesh[];
  /** Selection uniforms of the unique meshes. */
  selUniforms: { value: number }[];
  /** Picking proxy: capsule a→b with radius r (world). */
  proxy: { a: V3; b: V3; r: number };
}

export interface PlantCtx {
  tank: TankState;
  quality: Quality;
  /** Instance density multiplier from quality. */
  density: number;
  surfaceY: number;
  ground: (x: number, z: number) => number;
}

export interface GenArgs {
  sp: PlantSpecies;
  p: PlantInstance;
  m: PlantMetrics;
  ctx: PlantCtx;
  rng: Rng;
  out: PlantBuild;
}

export function newBuild(m: PlantMetrics): PlantBuild {
  return {
    parts: new Map(),
    meshes: [],
    selUniforms: [],
    proxy: { a: [...m.anchor], b: [m.anchor[0], m.anchor[1] + Math.max(0.02, m.height), m.anchor[2]], r: Math.max(0.02, m.spread * 0.4) },
  };
}

export function use(out: PlantBuild, def: PartDef): Inst[] {
  let u = out.parts.get(def.key);
  if (!u) out.parts.set(def.key, (u = { def, inst: [] }));
  return u.inst;
}

export function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function add(a: V3, b: V3, s = 1): V3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}
export function scl(a: V3, s: number): V3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/** Orthonormal basis (t1, t2) perpendicular to n. */
export function basis(n: V3): [V3, V3] {
  const t1 = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [t1, cross(n, t1)];
}

/** Direction at `pitch` from axis `up`, rotated `yaw` around it. */
export function dirAround(up: V3, yaw: number, pitch: number): { dir: V3; out: V3; bend: V3 } {
  const [t1, t2] = basis(up);
  const out = norm(add(scl(t1, Math.cos(yaw)), t2, Math.sin(yaw)));
  const dir = norm(add(scl(up, Math.cos(pitch)), out, Math.sin(pitch)));
  // Perpendicular to dir in the (up, out) plane, pointing outward/down: leaves arch this way.
  const bend = norm(add(scl(out, Math.cos(pitch)), up, -Math.sin(pitch)));
  return { dir, out, bend };
}

/**
 * Push an oriented instance: local +y → `dir` scaled by `len`, local +z → (bend hint ⟂ dir)
 * scaled by `depth`, local +x scaled by `width`.
 */
export function pushInst(list: Inst[], base: V3, dir: V3, bendHint: V3, width: number, len: number, depth: number, c: RGB, s: Inst['s'], l: Inst['l'] = [0, 0, 0, 0]): void {
  const y = norm(dir);
  let z = add(bendHint, y, -dot(bendHint, y));
  if (Math.hypot(z[0], z[1], z[2]) < 1e-5) z = basis(y)[0];
  z = norm(z);
  const x = cross(y, z);
  list.push({
    m: [x[0] * width, x[1] * width, x[2] * width, 0, y[0] * len, y[1] * len, y[2] * len, 0, z[0] * depth, z[1] * depth, z[2] * depth, 0, base[0], base[1], base[2], 1],
    c,
    s,
    l,
  });
}

/** Cylinder segment from a to b (shared stem part, radius r). */
export function pushSegment(list: Inst[], a: V3, b: V3, r: number, c: RGB, s: Inst['s']): void {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-5) return;
  pushInst(list, a, d, basis(norm(d))[0], r, len, r, c, s);
}

const _c = new Color();
/** Linear RGB from sRGB hex. */
export function lin(hex: string): RGB {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}

/** Per-instance tint around 1 with small hue/lightness variation; health yellows and dulls. */
export function tint(rng: Rng, amount: number, health = 1, bright = 1): RGB {
  const l = bright * (1 + (rng.next() - 0.5) * amount);
  const h = (rng.next() - 0.5) * amount * 0.5;
  const sick = 1 - Math.max(0, Math.min(1, health));
  return [l * (1 + h * 0.6) * (1 + sick * 0.15), l * (1 - sick * 0.1), l * (1 - h * 0.6) * (1 - sick * 0.55)];
}

export function mulRGB(a: RGB, b: RGB): RGB {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}
export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Ratio color2/color (linear) — multiplies a base-colored texture toward color2. */
export function ratio(sp: PlantSpecies): RGB {
  if (!sp.color2) return [1, 1, 1];
  const a = lin(sp.color), b = lin(sp.color2);
  const f = (x: number, y: number) => Math.max(0.25, Math.min(4, y / Math.max(0.01, x)));
  return [f(a[0], b[0]), f(a[1], b[1]), f(a[2], b[2])];
}

export function densityOf(q: Quality): number {
  return q === 'low' ? 0.45 : q === 'medium' ? 0.7 : q === 'ultra' ? 1.3 : 1;
}
