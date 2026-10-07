// Short-term projections for weekly surveillance series.
//
// Method ("analog–trend ensemble"), computed on z = log(value + c):
//   1. Persistence     — next weeks look like this week.
//   2. Damped trend    — the last 4 weeks' log-linear slope, damped (φ = DEFAULT_DAMPING) so growth fades.
//   3. Seasonal analog — how this series moved over the same weeks of prior seasons
//                        (median log-change), skipping the 2020-21/2021-22 pandemic seasons.
// Components are weighted per horizon by inverse squared backtest error (rolling-origin over the
// last ~2 years of the series itself). Prediction intervals are the empirical quantiles of the
// ensemble's own backtest errors at each horizon, so band width reflects how wrong this method
// has actually been on this series — not an assumed distribution.
//
// These are statistical extrapolations, not mechanistic forecasts; they assume reporting and
// testing practices stay similar and cannot anticipate new variants or policy changes.

import type { Point, QuantileForecastPoint } from './types.ts'
import { addDays, seasonOf, weekOfSeason } from './mmwr.ts'
import { mean, median, olsSlope, quantile, stdev } from './stats.ts'

export const PANDEMIC_SEASONS = ['2019-20', '2020-21', '2021-22']

export interface ProjectionOptions {
  /** Weeks ahead (default 4). */
  horizon?: number
  /** Seasons ignored by the analog component (default: pandemic-disrupted seasons). */
  excludeSeasons?: string[]
  /** Upper bound for the values (100 for percentages). */
  max?: number
  /** Rolling-origin backtest window in weeks (default 104). */
  backtestWeeks?: number
  /** Use this date as the forecast origin (e.g. the last non-provisional week). */
  origin?: string
  /** Trend damping factor φ (default 0.6, chosen by backtest on MN flu and COVID admissions). */
  damping?: number
}

export interface ProjectionSkill {
  horizon: number
  n: number
  /** Mean absolute error of the median on the original scale. */
  mae: number
  /** MAE relative to a naive "no change" forecast (< 1 means better than naive). */
  relMae: number
  /** Share of backtest outcomes inside the 95% interval. */
  coverage95: number
}

export interface ProjectionResult {
  origin: string
  points: QuantileForecastPoint[]
  skill: ProjectionSkill[]
  weights: Record<ComponentName, number>[]
  method: string
}

type ComponentName = 'persistence' | 'trend' | 'analog'
const COMPONENTS: ComponentName[] = ['persistence', 'trend', 'analog']
const DEFAULT_DAMPING = 0.6
const TREND_WINDOW = 4
const MIN_POINTS = 12

interface Prepared {
  dates: string[]
  z: number[]
  index: Map<string, number>
  /** season → weekOfSeason → index */
  bySeason: Map<string, Map<number, number>>
  c: number
}

function prepare(points: Point[]): Prepared | null {
  const clean = points.filter((p): p is [string, number] => p[1] != null && Number.isFinite(p[1]) && p[1] >= 0)
  if (clean.length < MIN_POINTS) return null
  const positives = clean.map((p) => p[1]).filter((v) => v > 0)
  // Offset keeps log() finite at zero while staying small relative to the series' scale.
  const c = Math.max(1e-3, 0.1 * (positives.length ? median(positives) : 1))
  const dates = clean.map((p) => p[0])
  const z = clean.map((p) => Math.log(p[1] + c))
  const index = new Map(dates.map((d, i) => [d, i]))
  const bySeason = new Map<string, Map<number, number>>()
  dates.forEach((d, i) => {
    const s = seasonOf(d)
    if (!bySeason.has(s)) bySeason.set(s, new Map())
    bySeason.get(s)!.set(weekOfSeason(d), i)
  })
  return { dates, z, index, bySeason, c }
}

/** Component forecasts (in z space) from origin index t for horizons 1..H. null = unavailable. */
function componentForecasts(
  p: Prepared,
  t: number,
  H: number,
  exclude: Set<string>,
  damping: number,
): Record<ComponentName, (number | null)[]> {
  const zt = p.z[t]
  const out: Record<ComponentName, (number | null)[]> = { persistence: [], trend: [], analog: [] }

  // Trend requires TREND_WINDOW consecutive weekly points ending at t.
  let slope: number | null = null
  if (t >= TREND_WINDOW - 1) {
    const startDate = addDays(p.dates[t], -7 * (TREND_WINDOW - 1))
    if (p.dates[t - (TREND_WINDOW - 1)] === startDate) slope = olsSlope(p.z.slice(t - TREND_WINDOW + 1, t + 1))
  }

  // Analog: log-changes over the same weeks-of-season in earlier seasons.
  const originSeason = seasonOf(p.dates[t])
  const originWos = weekOfSeason(p.dates[t])
  const analogDeltas: number[][] = Array.from({ length: H }, () => [])
  for (const [season, weeks] of p.bySeason) {
    if (season >= originSeason || exclude.has(season)) continue
    const i0 = weeks.get(originWos)
    if (i0 == null) continue
    for (let h = 1; h <= H; h++) {
      const target = p.index.get(addDays(p.dates[i0], 7 * h))
      if (target != null && target < t) analogDeltas[h - 1].push(p.z[target] - p.z[i0])
    }
  }

  let damp = 0
  for (let h = 1; h <= H; h++) {
    damp += damping ** h
    out.persistence.push(zt)
    out.trend.push(slope == null ? null : zt + slope * damp)
    const d = analogDeltas[h - 1]
    out.analog.push(d.length >= 2 ? zt + median(d) : null)
  }
  return out
}

export function project(points: Point[], opts: ProjectionOptions = {}): ProjectionResult | null {
  const H = opts.horizon ?? 4
  const exclude = new Set(opts.excludeSeasons ?? PANDEMIC_SEASONS)
  const damping = opts.damping ?? DEFAULT_DAMPING
  const p = prepare(points)
  if (!p) return null
  let T = p.dates.length - 1
  if (opts.origin) {
    const i = p.dates.findLastIndex((d) => d <= opts.origin!)
    if (i < MIN_POINTS - 1) return null
    T = i
  }

  // Rolling-origin backtest: errors per component and horizon.
  const backtestWeeks = opts.backtestWeeks ?? 104
  const errs: Record<ComponentName, number[][]> = {
    persistence: Array.from({ length: H }, () => []),
    trend: Array.from({ length: H }, () => []),
    analog: Array.from({ length: H }, () => []),
  }
  const origins: number[] = []
  for (let t = Math.max(TREND_WINDOW, T - backtestWeeks); t < T; t++) origins.push(t)
  const cache = new Map<number, Record<ComponentName, (number | null)[]>>()
  for (const t of origins) {
    const f = componentForecasts(p, t, H, exclude, damping)
    cache.set(t, f)
    for (let h = 1; h <= H; h++) {
      const target = p.index.get(addDays(p.dates[t], 7 * h))
      if (target == null || target > T) continue
      for (const k of COMPONENTS) {
        const v = f[k][h - 1]
        if (v != null) errs[k][h - 1].push(p.z[target] - v)
      }
    }
  }

  // Inverse-MSE weights per horizon (components with < 8 backtest errors get no weight unless nothing else exists).
  const weights: Record<ComponentName, number>[] = []
  for (let h = 1; h <= H; h++) {
    const w: Record<ComponentName, number> = { persistence: 0, trend: 0, analog: 0 }
    let total = 0
    for (const k of COMPONENTS) {
      const e = errs[k][h - 1]
      if (e.length < 8) continue
      const mse = mean(e.map((x) => x * x))
      w[k] = 1 / Math.max(mse, 1e-6)
      total += w[k]
    }
    if (total === 0) {
      w.persistence = 1
      total = 1
    }
    for (const k of COMPONENTS) w[k] /= total
    weights.push(w)
  }

  const combine = (f: Record<ComponentName, (number | null)[]>, h: number): number => {
    const w = weights[h - 1]
    let acc = 0
    let wsum = 0
    for (const k of COMPONENTS) {
      const v = f[k][h - 1]
      if (v != null && w[k] > 0) {
        acc += w[k] * v
        wsum += w[k]
      }
    }
    return wsum > 0 ? acc / wsum : (f.persistence[h - 1] as number)
  }

  // Ensemble backtest errors → empirical interval quantiles and skill.
  // Each error is tagged with its origin's level and recent slope so intervals can be conditioned on
  // similar situations (errors at a low summer baseline differ from errors mid-surge).
  interface BtErr { e: number; zh: number; zt: number; persist: number; level: number; slope: number }
  const recentSlope = (t: number) => (t >= 2 ? olsSlope(p.z.slice(t - 2, t + 1)) : 0)
  const bt: BtErr[][] = Array.from({ length: H }, () => [])
  for (const t of origins) {
    const f = cache.get(t)!
    for (let h = 1; h <= H; h++) {
      const target = p.index.get(addDays(p.dates[t], 7 * h))
      if (target == null || target > T) continue
      const zh = combine(f, h)
      bt[h - 1].push({ e: p.z[target] - zh, zh, zt: p.z[target], persist: p.z[t], level: p.z[t], slope: recentSlope(t) })
    }
  }
  const diffs = p.z.slice(1, T + 1).map((v, i) => v - p.z[i])
  const sigma1 = Number.isFinite(stdev(diffs)) ? stdev(diffs) : 0.25
  const zSd = stdev(p.z.slice(0, T + 1)) || 1
  const slopeSd = stdev(origins.map(recentSlope)) || 1
  const levelT = p.z[T]
  const slopeT = recentSlope(T)

  /** Errors from the backtest origins most similar to the current origin (level + slope). */
  const ensErr: number[][] = bt.map((rows) => {
    if (rows.length < 30) return rows.map((r) => r.e)
    const k = Math.max(30, Math.round(rows.length * 0.4))
    return rows
      .map((r) => ({ e: r.e, d: Math.abs(r.level - levelT) / zSd + Math.abs(r.slope - slopeT) / slopeSd }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((r) => r.e)
  })

  const errQ = (h: number, q: number): number => {
    const e = ensErr[h - 1]
    if (e.length >= 20) return quantile(e, q)
    // Fallback: normal approximation widening with sqrt(h).
    const z = { 0.025: -1.96, 0.1: -1.2816, 0.25: -0.6745, 0.5: 0, 0.75: 0.6745, 0.9: 1.2816, 0.975: 1.96 }[q] ?? 0
    return z * sigma1 * Math.sqrt(h)
  }

  // Cap at 1.5× the series' record (and any physical max) — a 4-week extrapolation should not
  // project far beyond anything this series has ever recorded.
  const record = Math.max(...p.z.slice(0, T + 1).map((zv) => Math.exp(zv) - p.c))
  const cap = Math.min(opts.max ?? Infinity, Math.max(record * 1.5, (Math.exp(levelT) - p.c) * 2))
  const back = (zv: number) => Math.min(cap, Math.max(0, Math.exp(zv) - p.c))
  const round = (v: number) => Math.round(v * 1000) / 1000

  const fT = componentForecasts(p, T, H, exclude, damping)
  const out: QuantileForecastPoint[] = []
  const skill: ProjectionSkill[] = []
  for (let h = 1; h <= H; h++) {
    const zh = combine(fT, h)
    out.push({
      date: addDays(p.dates[T], 7 * h),
      horizon: h,
      median: round(back(zh)),
      lo50: round(back(zh + errQ(h, 0.25))),
      hi50: round(back(zh + errQ(h, 0.75))),
      lo80: round(back(zh + errQ(h, 0.1))),
      hi80: round(back(zh + errQ(h, 0.9))),
      lo95: round(back(zh + errQ(h, 0.025))),
      hi95: round(back(zh + errQ(h, 0.975))),
    })
    const rows = bt[h - 1]
    if (rows.length) {
      const all = rows.map((r) => r.e)
      const lo = all.length >= 20 ? quantile(all, 0.025) : errQ(h, 0.025)
      const hi = all.length >= 20 ? quantile(all, 0.975) : errQ(h, 0.975)
      const val = (zv: number) => Math.max(0, Math.exp(zv) - p.c)
      const mae = mean(rows.map((r) => Math.abs(val(r.zh) - val(r.zt))))
      const maeNaive = mean(rows.map((r) => Math.abs(val(r.persist) - val(r.zt))))
      skill.push({
        horizon: h,
        n: rows.length,
        mae: round(mae),
        relMae: round(maeNaive > 0 ? mae / maeNaive : 1),
        coverage95: round(rows.filter((r) => r.e >= lo && r.e <= hi).length / rows.length),
      })
    }
  }
  return {
    origin: p.dates[T],
    points: out,
    skill,
    weights,
    method:
      'Analog–trend ensemble on log scale: persistence, damped 4-week trend, and same-weeks-of-prior-seasons analogs, weighted by backtest error; intervals from empirical backtest errors.',
  }
}
