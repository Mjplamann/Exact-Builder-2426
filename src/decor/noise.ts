/**
 * Deterministic, allocation-free 3D gradient noise (Ken Perlin's "improved noise") seeded per
 * item, plus fBm / ridged helpers. Pure TypeScript (no three.js) so it can be shared by the mesh
 * builders and any pure geometry code.
 */
import { Rng } from '../core/rng';

/** Gradient directions: the 12 cube-edge midpoints (Perlin 2002). */
const GRAD = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class Noise3 {
  private readonly perm = new Uint8Array(512);

  constructor(seed: number) {
    const rng = new Rng(seed ^ 0x2545f491);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(h: number, x: number, y: number, z: number): number {
    const g = (h % 12) * 3;
    return GRAD[g] * x + GRAD[g + 1] * y + GRAD[g + 2] * z;
  }

  /** Gradient noise in roughly [-1, 1]. */
  noise(x: number, y: number, z: number): number {
    const P = this.perm;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const X = fx & 255, Y = fy & 255, Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
    const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    const x1 = x - 1, y1 = y - 1, z1 = z - 1;
    const l1 = this.grad(P[AA], x, y, z) + u * (this.grad(P[BA], x1, y, z) - this.grad(P[AA], x, y, z));
    const l2 = this.grad(P[AB], x, y1, z) + u * (this.grad(P[BB], x1, y1, z) - this.grad(P[AB], x, y1, z));
    const l3 = this.grad(P[AA + 1], x, y, z1) + u * (this.grad(P[BA + 1], x1, y, z1) - this.grad(P[AA + 1], x, y, z1));
    const l4 = this.grad(P[AB + 1], x, y1, z1) + u * (this.grad(P[BB + 1], x1, y1, z1) - this.grad(P[AB + 1], x, y1, z1));
    const m1 = l1 + v * (l2 - l1);
    const m2 = l3 + v * (l4 - l3);
    return m1 + w * (m2 - m1);
  }

  /** Fractional Brownian motion, normalized to roughly [-1, 1]. */
  fbm(x: number, y: number, z: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x, y, z);
      norm += amp;
      amp *= gain;
      x *= lacunarity;
      y *= lacunarity;
      z *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal-ish noise in [0, 1]: sharp crests (weathered limestone, wrinkles). */
  ridged(x: number, y: number, z: number, octaves = 3, lacunarity = 2.1, gain = 0.55): number {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x, y, z));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      x *= lacunarity;
      y *= lacunarity;
      z *= lacunarity;
    }
    return sum / norm;
  }
}

/** Smooth minimum (polynomial) — blends two distance fields with radius k. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum (for smooth subtraction/intersection). */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
