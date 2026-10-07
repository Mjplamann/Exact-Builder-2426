import { describe, expect, it } from 'vitest'
import { CAP_SOFTNESS, isSparse, project, roundOrdered, softCap, softMax } from '../shared/projection'
import { addDays } from '../shared/mmwr'
import type { Point, QuantileForecastPoint } from '../shared/types'

// Synthetic series (test fixtures only — never shipped as data).
function seasonal(weeks: number, start = '2021-10-02'): Point[] {
  return Array.from({ length: weeks }, (_, i) => {
    const wos = i % 52
    const v = 2 + 40 * Math.exp(-(((wos - 14) / 5) ** 2))
    return [addDays(start, 7 * i), Math.round(v * 10) / 10] as Point
  })
}

/** Deterministic pseudo-random numbers in [0, 1). */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32
}

/** Flat (with small noise) for years, then steady growth of `g` per week (log scale) over the last `growWeeks`. */
function growth(weeks: number, growWeeks: number, g = 0.06): Point[] {
  const r = lcg(7)
  return Array.from({ length: weeks }, (_, i) => {
    const k = Math.max(0, i - (weeks - growWeeks))
    return [addDays('2021-10-02', 7 * i), Math.round(10 * Math.exp(g * k + 0.05 * (r() - 0.5)) * 1000) / 1000] as Point
  })
}

/** Seasonal baseline whose current season is unusually volatile: every third week of the last 40 jumps ×5. */
function volatile(weeks: number): Point[] {
  const r = lcg(3)
  return Array.from({ length: weeks }, (_, i) => {
    const wos = i % 52
    const base = 2 + 40 * Math.exp(-(((wos - 14) / 5) ** 2))
    const spike = i >= weeks - 40 && i % 3 === 1 ? 5 : 1
    return [addDays('2021-10-02', 7 * i), Math.round(base * spike * Math.exp(0.1 * (r() - 0.5)) * 1000) / 1000] as Point
  })
}

const quantiles = (p: QuantileForecastPoint) => [p.lo95, p.lo80!, p.lo50, p.median, p.hi50, p.hi80!, p.hi95]

function expectStrictlyOrdered(p: QuantileForecastPoint) {
  const q = quantiles(p)
  for (let i = 1; i < q.length; i++) expect(q[i], `${p.date} h${p.horizon}: ${q.join(' < ')}`).toBeGreaterThan(q[i - 1])
}

describe('projection', () => {
  it('returns null for short series', () => {
    expect(project(seasonal(5))).toBeNull()
  })

  it('produces strictly ordered quantiles and follows the seasonal analog', () => {
    const pts = seasonal(52 * 4 + 10)
    const r = project(pts, { horizon: 4 })!
    expect(r.points).toHaveLength(4)
    for (const p of r.points) expectStrictlyOrdered(p)
    // Origin is week-of-season 9 of a rising season: projection should rise.
    expect(r.points[3].median).toBeGreaterThan(pts[pts.length - 1][1]!)
    expect(r.skill.length).toBe(4)
  })

  it('keeps all seven quantiles strictly ordered across origins and series shapes', () => {
    const fixtures = [seasonal(52 * 4 + 10), growth(52 * 4, 60), volatile(52 * 4 + 30)]
    let checked = 0
    for (const pts of fixtures) {
      for (let back = 0; back < 12; back += 3) {
        const r = project(pts, { origin: pts[pts.length - 1 - back][0] })
        if (!r) continue
        for (const p of r.points) {
          expectStrictlyOrdered(p)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(40)
  })

  it('centres the projection on the median of similar past errors', () => {
    // During steady growth every component lags (persistence and the analog predict no change, the trend
    // is damped), so similar past errors are positive and the median must move up to meet them.
    const g = 0.06
    const pts = growth(52 * 4, 60, g)
    const last = pts[pts.length - 1][1]!
    const centred = project(pts)!
    const raw = project(pts, { center: false })!
    for (const [i, p] of centred.points.entries()) {
      const truth = last * Math.exp(g * p.horizon)
      const q = raw.points[i]
      expect(centred.centering[i]).toBeGreaterThan(0)
      expect(p.median).toBeGreaterThan(q.median)
      expect(Math.abs(p.median - truth)).toBeLessThan(Math.abs(q.median - truth))
      expect(Math.abs(p.median / truth - 1)).toBeLessThan(0.05)
      // The raw ensemble forecast sits at the bottom of its own band (lo50 = median: the reported bug);
      // the centred one sits inside it.
      expect(q.lo50).toBe(q.median)
      expect(p.lo50).toBeLessThan(p.median)
      expect(p.hi50).toBeGreaterThan(p.median)
    }
    // Centring is part of the procedure the backtest replays, so out-of-sample error falls too.
    for (const k of centred.skill) {
      const r = raw.skill.find((s) => s.horizon === k.horizon)!
      expect(k.mae).toBeLessThan(r.mae)
    }
  })

  it('compresses rather than clamps above the seasonal cap', () => {
    // A volatile current season gives upper error quantiles beyond anything the same weeks of earlier
    // seasons reached: a hard clamp would set hi80 = hi95 = cap.
    let above = 0
    for (const extra of [30, 31, 32, 33, 40]) {
      const r = project(volatile(52 * 4 + extra))!
      expect(r.caps).toHaveLength(4)
      for (const [i, p] of r.points.entries()) {
        const cap = r.caps[i]
        expectStrictlyOrdered(p)
        expect(p.median).toBeLessThanOrEqual(cap)
        // Log compression: even 1000× the cap would land below 2× it.
        expect(p.hi95).toBeLessThan(softCap(1000 * cap, cap) + 1e-6)
        expect(softCap(1000 * cap, cap)).toBeLessThan(2 * cap)
        if (p.hi80! > cap) above++
      }
    }
    expect(above).toBeGreaterThan(0)
  })

  it('softCap is the identity below the cap and strictly increasing, slowly growing above it', () => {
    const cap = 10
    expect(softCap(3, cap)).toBe(3)
    expect(softCap(cap, cap)).toBe(cap)
    // Continuous with slope ≤ 1 at the cap.
    expect(softCap(cap + 1e-6, cap) - cap).toBeLessThanOrEqual(1e-6)
    expect(softCap(cap + 1e-6, cap) - cap).toBeGreaterThan(0.99e-6)
    let prev = cap
    for (const m of [1.01, 1.1, 1.5, 2, 5, 10, 100, 1e4, 1e8]) {
      const v = softCap(m * cap, cap)
      expect(v).toBeGreaterThan(prev)
      expect(v).toBeLessThan(m * cap)
      prev = v
    }
    expect(softCap(2 * cap, cap) / cap).toBeCloseTo(1 + CAP_SOFTNESS * Math.log(1 + 1 / CAP_SOFTNESS), 9)
    expect(softCap(2 * cap, cap)).toBeLessThan(1.25 * cap)
    expect(softCap(100 * cap, cap)).toBeLessThan(1.7 * cap)
    // No cap → no change.
    expect(softCap(50, Infinity)).toBe(50)
  })

  it('approaches a physical maximum smoothly and never reaches it', () => {
    expect(softMax(50, 100)).toBe(50)
    expect(softMax(95, 100)).toBe(95)
    expect(softMax(500, undefined)).toBe(500)
    let prev = 95
    for (const v of [96, 99, 100, 101, 110, 150]) {
      const s = softMax(v, 100)
      expect(s).toBeGreaterThan(prev)
      expect(s).toBeLessThan(100)
      prev = s
    }
  })

  it('rounds for publication without merging distinct quantiles', () => {
    expect(roundOrdered([25.12345, 30.98765])).toEqual([25.123, 30.988])
    expect(roundOrdered([0.0123456, 0.0234567])).toEqual([0.01235, 0.02346])
    const close = [1.00001, 1.00002, 1.00003]
    const r = roundOrdered(close)
    expect(r[0]).toBeLessThan(r[1])
    expect(r[1]).toBeLessThan(r[2])
    // Ties that were already there stay ties.
    expect(roundOrdered([1, 1, 2])).toEqual([1, 1, 2])
  })

  it('scores skill out of sample: nothing after the origin changes the forecast or its skill', () => {
    const pts = seasonal(52 * 4 + 10)
    const k = pts.length - 6
    const asOf = project(pts.slice(0, k))!
    const withFuture = project(
      pts.map(([d, v], i) => [d, i >= k ? 999 : v] as Point),
      { origin: pts[k - 1][0] },
    )!
    expect(withFuture.points).toEqual(asOf.points)
    expect(withFuture.skill).toEqual(asOf.skill)
    for (const s of asOf.skill) {
      expect(s.n).toBeGreaterThanOrEqual(10)
      expect(s.coverage95).toBeGreaterThanOrEqual(0)
      expect(s.coverage95).toBeLessThanOrEqual(1)
      expect(Number.isFinite(s.relMae)).toBe(true)
    }
  })

  it('skips sparse and median-zero series', () => {
    const mostlyZero = seasonal(52 * 3).map(([d, v], i) => [d, i % 4 === 0 ? v : 0] as Point)
    expect(isSparse(mostlyZero)).toBe(true)
    expect(project(mostlyZero)).toBeNull()
    const recentZero = seasonal(52 * 3).map(([d, v], i, a) => [d, i >= a.length - 8 ? 0 : v] as Point)
    expect(project(recentZero)).toBeNull()
    expect(isSparse(seasonal(52 * 3))).toBe(false)
  })

  it('respects a physical maximum while keeping quantiles distinct', () => {
    let checked = 0
    for (const extra of [0, 8, 10, 12]) {
      const pts = seasonal(52 * 3 + extra).map(
        ([d, v], i) => [d, Math.min(99, (v ?? 0) * 3 * (1 + 0.3 * Math.sin(i * 1.7)))] as Point,
      )
      const r = project(pts, { max: 100 })!
      for (const p of r.points) {
        expect(p.hi95).toBeLessThan(100)
        expectStrictlyOrdered(p)
        checked++
      }
    }
    expect(checked).toBe(16)
  })

  it('lets lo95 reach zero for low series so zero outcomes can be covered', () => {
    // Low, noisy series near zero: lower quantiles must stay ≥ 0 and ordered.
    const r0 = lcg(11)
    const pts = Array.from({ length: 52 * 3 }, (_, i) => [addDays('2022-10-01', 7 * i), Math.round(r0() * r0() * 30) / 100] as Point)
    const r = project(pts)
    if (!r) return
    for (const p of r.points) {
      expect(p.lo95).toBeGreaterThanOrEqual(0)
      expectStrictlyOrdered(p)
    }
  })
})
