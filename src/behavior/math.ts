/**
 * Tiny allocation-free scalar helpers shared by the behavior & food systems.
 * Everything here works on plain numbers so hot loops never create vectors.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Frame-rate independent exponential approach: move `v` toward `target` with time constant `tau` (s). */
export function approach(v: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target;
  return target + (v - target) * Math.exp(-dt / tau);
}

/** Move `v` toward `target` by at most `maxStep`. */
export function stepToward(v: number, target: number, maxStep: number): number {
  const d = target - v;
  return d > maxStep ? v + maxStep : d < -maxStep ? v - maxStep : target;
}

/**
 * Per-entity PRNG (mulberry32) whose whole state is one uint32 stored on the entity, so brains
 * can be plain objects without allocating closures. Usage: `b.seed = rngNext(b)`… we keep it simple
 * with a small class whose only field is the state.
 */
export class FastRng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Signed uniform in (−1, 1). */
  signed(): number {
    return this.next() * 2 - 1;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Approximately normal (sum of 3 uniforms), mean 0, sd ≈ 1. Cheap, no logs. */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }
  /** Exponentially distributed interval with the given mean (Poisson process waiting time). */
  exp(mean: number): number {
    return -Math.log(1 - this.next() * 0.999999) * mean;
  }
}

/**
 * Smooth 1-D value noise in [−1, 1] (cubic-interpolated hash lattice). Used for gentle,
 * aperiodic wandering of headings, depths and fin flutter.
 */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i, seed);
  const b = hash1(i + 1, seed);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

function hash1(i: number, seed: number): number {
  let h = Math.imul(i ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
