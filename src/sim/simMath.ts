/**
 * Tiny numeric helpers shared by the life-sim files. All are allocation-free.
 */

/**
 * Clamp to [lo, hi]. NaN maps to `lo`: a single bad input (a hand-edited save, a slider glitch)
 * must never poison the tank's persisted state with NaN, which JSON would then save as null.
 */
export function clamp(v: number, lo: number, hi: number): number {
  return v > lo ? (v < hi ? v : hi) : lo;
}

/** Clamp to [0, 1]; NaN → 0. */
export function clamp01(v: number): number {
  return v > 0 ? (v < 1 ? v : 1) : 0;
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

/**
 * Fast 1 − e^(−x) for x ≥ 0 via a cubic Taylor denominator: 1 − 1/(1 + x + x²/2 + x³/6).
 * Within 0.3% for x ≤ 1, monotonic and → 1 for large x — ideal for slow relaxations.
 */
export function relaxFast(dt: number, tau: number): number {
  if (tau <= 0) return 1;
  const x = dt / tau;
  return 1 - 1 / (1 + x * (1 + x * (0.5 + x * (1 / 6))));
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
