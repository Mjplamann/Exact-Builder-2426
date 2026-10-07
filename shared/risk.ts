// Activity level + trend classification for surveillance signals.
//
// Level answers "how much is going around compared with normal for this measure?"
//   * When a publisher defines official thresholds (e.g. MDH RESP-NET cut-points, CDC wastewater
//     viral activity levels) those are used directly.
//   * Otherwise the latest value is ranked against this series' own weekly history (excluding
//     pandemic-disrupted seasons), using fixed percentile bands — so "high" means "higher than
//     ~4 out of 5 weeks in recent years" for this exact measure and place.
// Trend answers "is it growing or shrinking?" from smoothed values two weeks apart, ignoring
// changes too small to matter relative to the series' typical seasonal range.

import type { ActivityLevel, Point, TrendDirection } from './types.ts'
import { addDays, seasonOf } from './mmwr.ts'
import { mean, percentileRank, quantile } from './stats.ts'
import { PANDEMIC_SEASONS } from './projection.ts'

export const LEVELS: ActivityLevel[] = ['minimal', 'low', 'moderate', 'high', 'very-high']

/** Percentile band upper bounds: <25 minimal, <50 low, <75 moderate, <90 high, ≥90 very high. */
export const PERCENTILE_BANDS = [25, 50, 75, 90] as const

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

/** Historical weekly values strictly before `before`, excluding disrupted seasons. */
export function historicalValues(points: Point[], before: string, opts: HistoryOptions = {}): number[] {
  const exclude = new Set(opts.excludeSeasons ?? PANDEMIC_SEASONS)
  const out: number[] = []
  for (const [d, v] of points) {
    if (d >= before || v == null || !Number.isFinite(v)) continue
    if (exclude.has(seasonOf(d))) continue
    out.push(v)
  }
  return out
}

export function rankAgainstHistory(points: Point[], date: string, value: number, opts: HistoryOptions = {}) {
  const hist = historicalValues(points, date, opts)
  if (hist.length < (opts.minWeeks ?? 52)) return null
  return { percentile: percentileRank(hist, value), p90: quantile(hist, 0.9), n: hist.length }
}

export interface TrendResult {
  trend: TrendDirection
  /** Relative change of the smoothed value vs. two weeks earlier. */
  change2w?: number
}

/**
 * Trend from 3-week trailing means two weeks apart, using symmetric log-ratio thresholds.
 * `floor` is the smallest absolute change considered meaningful (default: 5% of the series'
 * 90th percentile), which keeps tiny off-season wiggles from reading as "rising fast".
 */
export function computeTrend(points: Point[], opts: { floor?: number; asOf?: string } = {}): TrendResult {
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
  const all = [...vals.values()]
  const floor = opts.floor ?? Math.max(1e-9, 0.05 * quantile(all, 0.9))
  const diff = now - before
  const change2w = before > 0 ? diff / before : diff > 0 ? Infinity : 0
  if (Math.abs(diff) < floor) return { trend: 'steady', change2w: finite(change2w) }
  // Symmetric log-ratio thresholds: ±10% → rising/falling, ×1.4 or ÷1.4 → fast.
  const lr = Math.log((now + floor) / (before + floor))
  let trend: TrendDirection = 'steady'
  if (lr >= Math.log(1.4)) trend = 'rising-fast'
  else if (lr >= Math.log(1.1)) trend = 'rising'
  else if (lr <= -Math.log(1.4)) trend = 'falling-fast'
  else if (lr <= -Math.log(1.1)) trend = 'falling'
  return { trend, change2w: finite(change2w) }
}

const finite = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : undefined)

const LEVEL_SCORE: Record<ActivityLevel, number> = {
  unknown: 10,
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

export const LEVEL_LABEL: Record<ActivityLevel, string> = {
  minimal: 'Minimal',
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
