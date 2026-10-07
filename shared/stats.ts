// Small, dependency-free statistics helpers.

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

/** Linear-interpolated quantile (type 7, as in R/NumPy default). q in [0, 1]. */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export const median = (xs: number[]) => quantile(xs, 0.5)

/** Percentile rank (0–100) of x within xs: share of values strictly below plus half of ties. */
export function percentileRank(xs: number[], x: number): number {
  if (!xs.length) return NaN
  let below = 0
  let equal = 0
  for (const v of xs) {
    if (v < x) below++
    else if (v === x) equal++
  }
  return (100 * (below + 0.5 * equal)) / xs.length
}

/** Ordinary least squares slope of y against x = 0..n-1. */
export function olsSlope(ys: number[]): number {
  const n = ys.length
  if (n < 2) return 0
  const xm = (n - 1) / 2
  const ym = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (ys[i] - ym)
    den += (i - xm) ** 2
  }
  return den === 0 ? 0 : num / den
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
