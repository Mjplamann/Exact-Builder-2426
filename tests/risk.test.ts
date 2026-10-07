import { describe, expect, it } from 'vitest'
import { computeTrend, levelFromCuts, levelFromNamedCuts, levelFromPercentile, rankAgainstHistory } from '../shared/risk'
import { addDays } from '../shared/mmwr'
import type { Point } from '../shared/types'

const weekly = (start: string, values: number[]): Point[] => values.map((v, i) => [addDays(start, 7 * i), v])

describe('risk levels', () => {
  it('maps percentiles to bands', () => {
    expect(levelFromPercentile(40)).toBe('minimal')
    expect(levelFromPercentile(60)).toBe('low')
    expect(levelFromPercentile(80)).toBe('moderate')
    expect(levelFromPercentile(95)).toBe('high')
    expect(levelFromPercentile(99)).toBe('very-high')
    expect(levelFromPercentile(NaN)).toBe('unknown')
  })
  it('maps explicit cut-points', () => {
    expect(levelFromCuts(0.5, [1, 2, 3, 4])).toBe('minimal')
    expect(levelFromCuts(2.5, [1, 2, 3, 4])).toBe('moderate')
    expect(levelFromCuts(9, [1, 2, 3, 4])).toBe('very-high')
    // MDH RESP-NET style 3-level thresholds
    expect(levelFromNamedCuts(3, { moderate: 4.5, high: 8.1 })).toBe('low')
    expect(levelFromNamedCuts(5, { moderate: 4.5, high: 8.1 })).toBe('moderate')
    expect(levelFromNamedCuts(9, { moderate: 4.5, high: 8.1 })).toBe('high')
  })
  it('ranks against history excluding pandemic seasons', () => {
    const pts = weekly('2022-10-08', Array.from({ length: 156 }, (_, i) => i % 52))
    const r = rankAgainstHistory(pts, '2026-01-03', 50)!
    expect(r.percentile).toBeGreaterThan(90)
    expect(rankAgainstHistory(pts.slice(0, 10), '2026-01-03', 50)).toBeNull()
  })
})

describe('trend', () => {
  it('detects rising, falling and steady', () => {
    expect(computeTrend(weekly('2026-01-03', [10, 10, 10, 12, 15, 19, 25])).trend).toBe('rising-fast')
    expect(computeTrend(weekly('2026-01-03', [30, 28, 25, 22, 18, 14, 11])).trend).toBe('falling-fast')
    expect(computeTrend(weekly('2026-01-03', [10, 10.2, 9.9, 10.1, 10, 10.05, 9.95])).trend).toBe('steady')
    expect(computeTrend(weekly('2026-01-03', [5])).trend).toBe('unknown')
  })
  it('ignores tiny absolute changes at low levels', () => {
    const pts = weekly('2025-01-04', [40, 35, 30, 20, 10, 5, 1, 0.1, 0.1, 0.1, 0.12, 0.15, 0.2])
    expect(computeTrend(pts).trend).toBe('steady')
  })
})
