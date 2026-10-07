// Activity level + trend classification for surveillance signals.
//
// Level answers "how much is going around compared with normal for this measure?"
//   * When a publisher defines official thresholds (e.g. MDH RESP-NET cut-points, CDC wastewater
//     viral activity levels) those are used directly.
//   * Otherwise the latest value is ranked against this series' own trailing ~3 years of weekly
//     values (excluding pandemic-disrupted seasons) with fixed percentile cut-points at the 50th,
//     75th, 90th and 97.5th percentiles (the empirical-percentile scheme recommended for
//     non-seasonal or short series). "Very high" therefore means "higher than all but ~1 in 40
//     weeks in recent years" for this exact measure and place.
// Trend answers "is it growing or shrinking?" from smoothed values two weeks apart, ignoring
// changes too small to matter relative to the series' typical seasonal range.

import type { ActivityLevel, Point, TrendDirection } from './types.ts'
import { addDays, seasonOf } from './mmwr.ts'
import { mean, percentileRank, quantile } from './stats.ts'
import { PANDEMIC_SEASONS } from './projection.ts'

export const LEVELS: ActivityLevel[] = ['minimal', 'low', 'moderate', 'high', 'very-high']

/** Percentile cut-points: <50 very low, <75 low, <90 moderate, <97.5 high, ≥97.5 very high. */
export const PERCENTILE_BANDS = [50, 75, 90, 97.5] as const

/** Trailing window used for percentile ranking (~3 years of weekly values). */
export const HISTORY_WEEKS = 156

export function levelFromPercentile(p: number): ActivityLevel {
  if (!Number.isFinite(p)) return 'unknown'
  const i = PERCENTILE_BANDS.findIndex((b) => p < b)
  return LEVELS[i === -1 ? 4 : i]
}

/**
 * Level from explicit cut-points: `cuts` are ascending lower bounds of
 * [low, moderate, high, very-high] (pass fewer to cap the scale, e.g. MDH's 3-level scheme maps
 * to cuts for [moderate, high] via levelFromNamedCuts).
 */
export function levelFromCuts(value: number, cuts: [number, number, number, number]): ActivityLevel {
  let i = 0
  while (i < 4 && value >= cuts[i]) i++
  return LEVELS[i]
}

/** Level from a partial set of named lower bounds, e.g. { moderate: 4.5, high: 8.1 }. */
export function levelFromNamedCuts(value: number, cuts: Partial<Record<ActivityLevel, number>>): ActivityLevel {
  let level: ActivityLevel = cuts.minimal != null || cuts.low == null ? 'low' : 'minimal'
  for (const l of LEVELS) {
    const c = cuts[l]
    if (c != null && value >= c) level = l
  }
  return level
}

export interface HistoryOptions {
  excludeSeasons?: string[]
  /** Minimum historical weeks required to rank (default 52). */
  minWeeks?: number
}

/** Trailing weekly values strictly before `before` (≤ HISTORY_WEEKS), excluding disrupted seasons. */
export function historicalValues(points: Point[], before: string, opts: HistoryOptions = {}): number[] {
  const exclude = new Set(opts.excludeSeasons ?? PANDEMIC_SEASONS)
  const start = addDays(before, -7 * HISTORY_WEEKS)
  const out: number[] = []
  for (const [d, v] of points) {
    if (d >= before || d < start || v == null || !Number.isFinite(v)) continue
    if (exclude.has(seasonOf(d))) continue
    out.push(v)
  }
  return out
}

/**
 * Percentile of `value` among this series' trailing weekly values (null with too little history).
 * A value at or below every past week ranks 0, so a zero against a mostly-zero (or all-zero) history
 * reads as "very low" rather than the mid-rank of its ties (which would be ~50, i.e. "low").
 */
export function rankAgainstHistory(points: Point[], date: string, value: number, opts: HistoryOptions = {}) {
  const hist = historicalValues(points, date, opts)
  if (hist.length < (opts.minWeeks ?? 52)) return null
  const min = Math.min(...hist)
  const percentile = value <= min ? 0 : percentileRank(hist, value)
  return { percentile, p90: quantile(hist, 0.9), n: hist.length }
}

export interface TrendResult {
  trend: TrendDirection
  /** Relative change of the smoothed value vs. two weeks earlier. */
  change2w?: number
}

/**
 * Trend from 3-week trailing means two weeks apart, using symmetric log-ratio thresholds.
 * `floor` is the smallest absolute change considered meaningful (default: 1.5% of the series'
 * 90th percentile, at least `minFloor`), which keeps tiny off-season wiggles from reading as
 * "rising fast" while still catching early-season growth from a low base.
 */
export function computeTrend(
  points: Point[],
  opts: { floor?: number; minFloor?: number; asOf?: string } = {},
): TrendResult {
  const vals = new Map<string, number>()
  for (const [d, v] of points) if (v != null && Number.isFinite(v) && (!opts.asOf || d <= opts.asOf)) vals.set(d, v)
  const dates = [...vals.keys()].sort()
  if (dates.length < 3) return { trend: 'unknown' }
  const last = dates[dates.length - 1]
  const smooth = (end: string) => {
    const xs = [0, 1, 2].map((k) => vals.get(addDays(end, -7 * k))).filter((x): x is number => x != null)
    return xs.length >= 2 ? mean(xs) : null
  }
  const now = smooth(last)
  const before = smooth(addDays(last, -14))
  if (now == null || before == null) return { trend: 'unknown' }
  // Nothing reported in the latest week: never call that growth (earlier weeks can still lift the mean).
  const latestZero = vals.get(last) === 0
  const all = [...vals.values()]
  const floor = opts.floor ?? Math.max(opts.minFloor ?? 1e-9, 0.015 * quantile(all, 0.9))
  const diff = now - before
  const change2w = before > 0 ? diff / before : diff > 0 ? Infinity : 0
  if (Math.abs(diff) < floor) return { trend: 'steady', change2w: finite(change2w) }
  // Symmetric log-ratio thresholds: ±10% → rising/falling, ×1.4 or ÷1.4 → fast.
  const lr = Math.log((now + floor) / (before + floor))
  let trend: TrendDirection = 'steady'
  if (lr >= Math.log(1.1)) trend = latestZero ? 'steady' : lr >= Math.log(1.4) ? 'rising-fast' : 'rising'
  else if (lr <= -Math.log(1.4)) trend = 'falling-fast'
  else if (lr <= -Math.log(1.1)) trend = 'falling'
  return { trend, change2w: finite(change2w) }
}

const finite = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : undefined)

// Unknown scores 0 so stale or unrated pathogens rank below current "very low" ones.
const LEVEL_SCORE: Record<ActivityLevel, number> = {
  unknown: 0,
  minimal: 5,
  low: 22,
  moderate: 45,
  high: 70,
  'very-high': 88,
}
const TREND_SCORE: Record<TrendDirection, number> = {
  unknown: 0,
  'falling-fast': -8,
  falling: -4,
  steady: 0,
  rising: 7,
  'rising-fast': 12,
}

/** 0–100 composite for ranking the watch list: level dominates, trend nudges. */
export function compositeScore(level: ActivityLevel, trend: TrendDirection): number {
  return Math.max(0, Math.min(100, LEVEL_SCORE[level] + TREND_SCORE[trend]))
}

export function maxLevel(levels: ActivityLevel[]): ActivityLevel {
  let best: ActivityLevel = 'unknown'
  for (const l of levels) if (LEVELS.indexOf(l) > LEVELS.indexOf(best as ActivityLevel)) best = l
  return best
}

// CDC renamed its lowest respiratory activity level from "Minimal" to "Very low" in 2025.
export const LEVEL_LABEL: Record<ActivityLevel, string> = {
  minimal: 'Very low',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  'very-high': 'Very high',
  unknown: 'Not enough data',
}

export const TREND_LABEL: Record<TrendDirection, string> = {
  'rising-fast': 'Rising fast',
  rising: 'Rising',
  steady: 'Steady',
  falling: 'Falling',
  'falling-fast': 'Falling fast',
  unknown: 'Trend unclear',
}
