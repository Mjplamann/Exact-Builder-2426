/**
 * Tiny numeric helpers shared by the life-sim files. All are allocation-free.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite smoothstep; works for edge0 > edge1 too (descending ramp). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Fraction of an exponential relaxation completed after `dt` with time constant `tau` (same units). */
export function relax(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

/** Combine independent 0..1 stress/probability factors: 1 − Π(1 − sᵢ). */
export function combine2(a: number, b: number): number {
  return 1 - (1 - a) * (1 - b);
}

/** Distance of v outside [lo, hi] (0 inside). */
export function outside(v: number, lo: number, hi: number): number {
  return v < lo ? lo - v : v > hi ? v - hi : 0;
}

/** Poisson sample (Knuth for small means, normal approximation for large) from a uniform source. */
export function poisson(mean: number, next: () => number): number {
  if (mean <= 0) return 0;
  if (mean > 30) {
    // Normal approximation, clamped at 0.
    const u = Math.max(1e-12, next());
    const v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * z));
  }
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= next();
  } while (p > l);
  return k - 1;
}
