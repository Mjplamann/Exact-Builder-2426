import { describe, expect, it } from 'vitest'
import { project } from '../shared/projection'
import { addDays } from '../shared/mmwr'
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
  it('respects a max cap', () => {
    const pts = seasonal(52 * 3).map(([d, v]) => [d, Math.min(99, (v ?? 0) * 3)] as Point)
    const r = project(pts, { max: 100 })!
    for (const p of r.points) expect(p.hi95).toBeLessThanOrEqual(100)
  })
})
