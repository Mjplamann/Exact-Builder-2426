import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  IcosahedronGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FoodType } from '../../core/types';

/**
 * Procedural unit-size geometries for every food shape. "Unit" means the longest dimension is
 * 1, so an instance is scaled by the particle's sizeM. All geometries carry an `aw` vertex
 * attribute (0..1 position along the body) the wriggle shader uses.
 */
export type FoodShape = FoodType['shape'];

/** Deterministic tiny PRNG for repeatable shapes. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withAlong(g: BufferGeometry, axis: 0 | 1 | 2 = 0): BufferGeometry {
  const pos = g.getAttribute('position');
  const aw = new Float32Array(pos.count);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getComponent(i, axis);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  for (let i = 0; i < pos.count; i++) aw[i] = (pos.getComponent(i, axis) - lo) / Math.max(1e-6, hi - lo);
  g.setAttribute('aw', new BufferAttribute(aw, 1));
  return g;
}

/** Irregular thin flake: a jagged polygon, slightly curled, in the xz plane (normal +y). */
function flake(): BufferGeometry {
  const r = rand(7);
  const n = 11;
  const verts: number[] = [0, 0.012, 0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = 0.5 * (0.55 + 0.45 * r());
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad * 0.85;
    // Curl: edges lift (dried flakes are cupped).
    verts.push(x, 0.12 * (x * x + z * z) + 0.02 * (r() - 0.5), z);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return withAlong(g);
}

function pellet(): BufferGeometry {
  const g = new IcosahedronGeometry(0.5, 1);
  // Slightly irregular, a touch flattened.
  const p = g.getAttribute('position');
  const r = rand(3);
  for (let i = 0; i < p.count; i++) {
    const k = 0.93 + 0.1 * r();
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.88, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return withAlong(g);
}

function stick(): BufferGeometry {
  // Extruded floating stick ~6 mm long, ~2.4 mm thick, along x.
  const g = new CapsuleGeometry(0.2, 0.6, 4, 10);
  g.rotateZ(Math.PI / 2);
  return withAlong(g);
}

function wafer(): BufferGeometry {
  // Disc 1 wide, ~0.2 thick, gently domed with a rounded edge (lathe profile).
  const pts: [number, number][] = [
    [0, 0.11], [0.2, 0.105], [0.36, 0.095], [0.45, 0.07], [0.5, 0.02], [0.5, -0.03], [0.46, -0.07], [0.3, -0.085], [0, -0.09],
  ];
  return withAlong(lathe(pts, 28));
}

function lathe(profile: [number, number][], seg: number, color?: (ring: number, r: number) => [number, number, number]): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rings = profile.length;
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    const c = Math.cos(a), si = Math.sin(a);
    for (let i = 0; i < rings; i++) {
      const [r, y] = profile[i];
      pos.push(r * c, y, r * si);
      if (color) col.push(...color(i, r));
    }
  }
  for (let s = 0; s < seg; s++) {
    for (let i = 0; i < rings - 1; i++) {
      const a = s * rings + i, b = (s + 1) * rings + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  if (color) g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Bloodworm: a thin curved, faintly segmented tube along x. */
function worm(): BufferGeometry {
  const pts = [
    new Vector3(-0.5, 0, 0),
    new Vector3(-0.25, 0.08, 0.05),
    new Vector3(0, 0.02, -0.02),
    new Vector3(0.25, -0.07, 0.04),
    new Vector3(0.5, -0.02, 0),
  ];
  const curve = new CatmullRomCurve3(pts);
  const g = new TubeGeometry(curve, 24, 0.035, 5, false);
  // Segment rings: modulate the radius slightly.
  const p = g.getAttribute('position');
  const v = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = Math.min(1, Math.max(0, (v.x + 0.5)));
    curve.getPointAt(t, c);
    const k = 1 + 0.12 * Math.cos(t * Math.PI * 2 * 11) - 0.35 * Math.pow(Math.abs(t - 0.5) * 2, 6);
    v.sub(c).multiplyScalar(k).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return withAlong(g);
}

/** A tiny crustacean: tapered body with a forked tail and a head (along +x). */
function shrimp(): BufferGeometry {
  const body = new SphereGeometry(0.5, 12, 8);
  body.scale(0.62, 0.15, 0.16);
  body.translate(0.1, 0, 0);
  const tail = new SphereGeometry(0.5, 8, 6);
  tail.scale(0.36, 0.07, 0.09);
  tail.translate(-0.3, 0.01, 0);
  const fan = new SphereGeometry(0.5, 8, 4);
  fan.scale(0.1, 0.03, 0.2);
  fan.translate(-0.47, 0.01, 0);
  const eyeL = new SphereGeometry(0.035, 6, 4);
  eyeL.translate(0.42, 0.03, 0.06);
  const eyeR = eyeL.clone();
  eyeR.translate(0, 0, -0.12);
  const merged = mergeGeometries([body, tail, fan, eyeL, eyeR].map((g) => g.toNonIndexed()));
  merged.computeVertexNormals();
  return withAlong(merged);
}

/** Daphnia: a bean-shaped translucent carapace. */
function flea(): BufferGeometry {
  const g = new SphereGeometry(0.5, 10, 8);
  g.scale(0.85, 1, 0.55);
  // Pointed tail spine.
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.3) p.setX(i, p.getX(i) - (y + 0.3) * 0.5);
  }
  g.computeVertexNormals();
  return withAlong(g, 1);
}

/** Nori: a thin sheet hanging from the clip (top edge at y=0), slightly rippled. */
function sheet(): BufferGeometry {
  const w = 1, hgt = 0.85, nx = 10, ny = 8;
  const pos: number[] = [];
  const idx: number[] = [];
  const r = rand(11);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * w;
      const y = -(j / ny) * hgt;
      const z = 0.02 * Math.sin(x * 9 + y * 4) + 0.006 * (r() - 0.5);
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return withAlong(g, 1);
}

/** Zucchini slice: pale flesh with a ring of seeds and a dark green skin rim. */
function slice(flesh: [number, number, number], skin: [number, number, number]): BufferGeometry {
  const seed: [number, number, number] = [flesh[0] * 1.05, flesh[1] * 1.02, flesh[2] * 0.8];
  const prof: [number, number][] = [[0, 0.065], [0.18, 0.065], [0.28, 0.064], [0.42, 0.06], [0.48, 0.055], [0.5, 0.03], [0.5, -0.03], [0.48, -0.055], [0.42, -0.06], [0.28, -0.064], [0, -0.065]];
  const g = lathe(prof, 32, (ring, rr) => (rr >= 0.47 ? skin : ring === 2 || ring === 9 ? seed : flesh));
  return withAlong(g);
}

/** Fruit fly: body, head and two folded wings. */
function insect(): BufferGeometry {
  const body = new SphereGeometry(0.5, 10, 6);
  body.scale(0.55, 0.22, 0.24);
  const head = new SphereGeometry(0.14, 8, 6);
  head.translate(0.33, 0.02, 0);
  const wing = new SphereGeometry(0.5, 8, 4);
  wing.scale(0.5, 0.02, 0.16);
  const wl = wing.clone();
  wl.rotateY(0.35);
  wl.translate(-0.12, 0.12, 0.08);
  const wr = wing.clone();
  wr.rotateY(-0.35);
  wr.translate(-0.12, 0.12, -0.08);
  const g = mergeGeometries([body, head, wl, wr].map((q) => q.toNonIndexed()));
  g.computeVertexNormals();
  return withAlong(g);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function buildFoodGeometry(shape: FoodShape, type?: FoodType): BufferGeometry {
  switch (shape) {
    case 'flake': return flake();
    case 'pellet': return pellet();
    case 'stick': return stick();
    case 'wafer': return wafer();
    case 'worm': return worm();
    case 'shrimp': return shrimp();
    case 'flea': return flea();
    case 'sheet': return sheet();
    case 'slice': {
      // sRGB → linear for vertex colors.
      const lin = (c: [number, number, number]) => c.map((v) => Math.pow(v, 2.2)) as [number, number, number];
      return slice(lin(hexToRgb(type?.color ?? '#d9e6a3')), lin(hexToRgb(type?.color2 ?? '#3d6b2a')));
    }
    case 'insect': return insect();
    default: return pellet();
  }
}
