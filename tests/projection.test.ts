import { describe, expect, it } from 'vitest'
import { SEASONAL_CAP_MULTIPLE, isSparse, project } from '../shared/projection'
import { addDays, weekOfSeason } from '../shared/mmwr'
import type { Point } from '../shared/types'

// Synthetic seasonal series (test fixture only — never shipped as data).
function seasonal(weeks: number, start = '2021-10-02'): Point[] {
  return Array.from({ length: weeks }, (_, i) => {
    const wos = i % 52
    const v = 2 + 40 * Math.exp(-(((wos - 14) / 5) ** 2))
    return [addDays(start, 7 * i), Math.round(v * 10) / 10] as Point
  })
}

describe('projection', () => {
  it('returns null for short series', () => {
    expect(project(seasonal(5))).toBeNull()
  })
  it('produces ordered quantiles and follows the seasonal analog', () => {
    const pts = seasonal(52 * 4 + 10)
    const r = project(pts, { horizon: 4 })!
    expect(r.points).toHaveLength(4)
    for (const p of r.points) {
      expect(p.lo95).toBeLessThanOrEqual(p.lo50)
      expect(p.lo50).toBeLessThanOrEqual(p.median)
      expect(p.median).toBeLessThanOrEqual(p.hi50)
      expect(p.hi50).toBeLessThanOrEqual(p.hi95)
    }
    // Origin is week-of-season 9 of a rising season: projection should rise.
    expect(r.points[3].median).toBeGreaterThan(pts[pts.length - 1][1]!)
    expect(r.skill.length).toBe(4)
  })
  it('never lets hi95 exceed the seasonal cap', () => {
    // A surge in one earlier season must not blow the band up everywhere else.
    const pts = seasonal(52 * 4 + 2).map(([d, v], i) => [d, i >= 52 && i < 104 ? (v ?? 0) * 6 : v] as Point)
    const r = project(pts, { horizon: 4 })!
    expect(r.caps).toHaveLength(4)
    for (const [i, p] of r.points.entries()) {
      expect(p.hi95).toBeLessThanOrEqual(r.caps[i] + 1e-9)
      // The cap is the larger of the same-weeks historical maximum and k × median.
      const wos = weekOfSeason(p.date)
      const sameWeeks = pts
        .filter(([d]) => d <= r.origin)
        .filter(([d]) => {
          const dist = Math.abs(weekOfSeason(d) - wos) % 52
          return Math.min(dist, 52 - dist) <= 1
        })
        .map(([, v]) => v ?? 0)
      const bound = Math.max(Math.max(...sameWeeks), SEASONAL_CAP_MULTIPLE * p.median)
      expect(p.hi95).toBeLessThanOrEqual(bound + 1e-6)
    }
  })
  it('scores coverage out of sample and reports it per horizon', () => {
    const r = project(seasonal(52 * 4 + 10), { horizon: 4 })!
    for (const k of r.skill) {
      expect(k.n).toBeGreaterThanOrEqual(10)
      expect(k.coverage95).toBeGreaterThanOrEqual(0)
      expect(k.coverage95).toBeLessThanOrEqual(1)
      expect(Number.isFinite(k.relMae)).toBe(true)
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
  it('respects a max cap', () => {
    const pts = seasonal(52 * 3).map(([d, v]) => [d, Math.min(99, (v ?? 0) * 3)] as Point)
    const r = project(pts, { max: 100 })!
    for (const p of r.points) expect(p.hi95).toBeLessThanOrEqual(100)
  })
})
