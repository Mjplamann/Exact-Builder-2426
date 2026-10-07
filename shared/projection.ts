// Short-term projections for weekly surveillance series.
//
// Method ("analog–trend ensemble"), computed on z = log(value + c):
//   1. Persistence     — next weeks look like this week.
//   2. Damped trend    — the last 4 weeks' log-linear slope, damped (φ = DEFAULT_DAMPING) so growth fades.
//   3. Seasonal analog — how this series moved over the same weeks of prior seasons
//                        (median log-change), skipping the 2019-20 to 2021-22 pandemic-disrupted seasons.
//
// Everything is fitted and scored out of sample, walking forward through the last ~3 years:
//   * Component weights (per horizon, inverse squared error) at each past origin use only errors
//     whose outcome was already known at that origin; the live forecast uses all of them.
//   * The projection is the conditional median outcome: the ensemble point forecast plus the median of
//     the ensemble's own past errors in the past situations most like the current one (level, recent
//     slope and week of the season). Prediction intervals are the other empirical quantiles of that
//     same error set, so the median always sits inside its own band and a low summer baseline is not
//     given mid-surge uncertainty (and vice versa). A tiny normal-shaped term (TIE_BREAK × spread)
//     breaks ties between error quantiles so lo95 < lo80 < lo50 < median < hi50 < hi80 < hi95.
//   * The upper end is softly capped near the larger of the highest value this series reached in the
//     same weeks of earlier seasons and SEASONAL_CAP_MULTIPLE × the median (and 1.5× its all-time
//     record): above that cap values are log-compressed (softCap) rather than clamped, so a 4-week band
//     cannot run far beyond anything plausible for the time of year but its quantiles stay distinct.
//     A physical maximum (100 for percentages) is approached smoothly for the same reason, as is zero
//     for every quantile but lo95, which may be exactly 0 so that zero outcomes count as covered.
//   * Reported skill (MAE vs. a "no change" forecast, 95% coverage) replays exactly this procedure —
//     centering, quantiles, soft cap — at each past origin with only the information available then:
//     coverage is never computed from the same errors the interval was built from.
// Sparse series (mostly zeros, zero in recent weeks, or a projected median of zero) are not projected:
// their log-scale errors are dominated by the zero offset and the bands are meaningless.
//
// These are statistical extrapolations, not mechanistic forecasts; they assume reporting and
// testing practices stay similar and cannot anticipate new variants or policy changes.

import type { Point, QuantileForecastPoint } from './types.ts'
import { addDays, seasonOf, weekOfSeason } from './mmwr.ts'
import { median, olsSlope, quantile, stdev } from './stats.ts'

export const PANDEMIC_SEASONS = ['2019-20', '2020-21', '2021-22']

export interface ProjectionOptions {
  /** Weeks ahead (default 4). */
  horizon?: number
  /** Seasons ignored by the analog component and the seasonal cap (default: pandemic-disrupted seasons). */
  excludeSeasons?: string[]
  /** Upper bound for the values (100 for percentages). */
  max?: number
  /** Walk-forward backtest window in weeks (default 156). */
  backtestWeeks?: number
  /** Use this date as the forecast origin (e.g. the last non-provisional week). */
  origin?: string
  /** Trend damping factor φ (default 0.6, chosen by backtest on MN flu and COVID admissions). */
  damping?: number
  /**
   * Center the projection on the conditional median outcome (default true). false keeps the raw
   * ensemble point forecast as the median — only for backtest comparisons, as its band can then be
   * one-sided around it.
   */
  center?: boolean
}

export interface ProjectionSkill {
  horizon: number
  /** Past origins scored (each with ≥ MIN_INTERVAL_ERRORS earlier errors to build its interval). */
  n: number
  /** Mean absolute error of the median on the original scale. */
  mae: number
  /** MAE relative to a naive "no change" forecast (< 1 means better than naive). */
  relMae: number
  /** Share of past outcomes inside the 95% interval built only from information available at the time. */
  coverage95: number
}

export interface ProjectionResult {
  origin: string
  points: QuantileForecastPoint[]
  skill: ProjectionSkill[]
  weights: Record<ComponentName, number>[]
  /** Soft upper cap applied to each horizon's quantiles (same order as `points`); see softCap. */
  caps: number[]
  /** Log-scale shift from the ensemble point forecast to the median, per horizon (median of similar past errors). */
  centering: number[]
  method: string
}

type ComponentName = 'persistence' | 'trend' | 'analog'
const COMPONENTS: ComponentName[] = ['persistence', 'trend', 'analog']
const DEFAULT_DAMPING = 0.6
const TREND_WINDOW = 4
const MIN_POINTS = 12
/** Component errors needed before a component gets weight. */
const MIN_WEIGHT_ERRORS = 8
/** Earlier ensemble errors needed to build an empirical interval. */
export const MIN_INTERVAL_ERRORS = 20
/** Past origins needed before skill is reported for a horizon. */
const MIN_SKILL_ORIGINS = 10
/** Weeks of season either side of the target used for the seasonal cap. */
const CAP_WINDOW_WEEKS = 1
/** Upper quantiles are compressed above this multiple of the median unless the same weeks of past seasons went higher. */
export const SEASONAL_CAP_MULTIPLE = 3
/** Phase distance (weeks of season) that counts as much as one standard deviation of level. */
const PHASE_SCALE_WEEKS = 8
/** Scale of the log-compression above the seasonal cap, as a fraction of the cap (see softCap). */
export const CAP_SOFTNESS = 0.1
/** Quantiles (except lo95) below this fraction of the log offset c are compressed smoothly towards, never onto, zero. */
const FLOOR_SOFTNESS = 0.1
/** Width of the smooth approach to a physical maximum, as a fraction of it (95–100 for percentages). */
const MAX_SOFT_BAND = 0.05
/** Weight of the normal-shaped term that keeps tied empirical error quantiles strictly ordered. */
const TIE_BREAK = 0.002
/** Quantile levels of a forecast point, lowest first; index 3 is the median. */
const LEVELS = [0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975] as const
const NORMAL_Z: Record<number, number> = { 0.025: -1.96, 0.1: -1.2816, 0.25: -0.6745, 0.5: 0, 0.75: 0.6745, 0.9: 1.2816, 0.975: 1.96 }

/**
 * Soft upper cap: the identity up to `cap`, then a log-compression with slope 1 at the cap,
 *   softCap(v) = cap + s·ln(1 + (v − cap)/s),  s = k·cap,
 * so values above the cap keep their order (strictly increasing) but grow only logarithmically:
 * 2× the cap maps to ≈ 1.24× it, 100× the cap to ≈ 1.69× it (k = 0.1).
 */
export function softCap(v: number, cap: number, k = CAP_SOFTNESS): number {
  if (!(cap > 0) || !Number.isFinite(cap) || v <= cap) return v
  const s = k * cap
  return cap + s * Math.log1p((v - cap) / s)
}

/** Smooth approach to a physical maximum: the identity below max·(1 − MAX_SOFT_BAND), strictly increasing and < max above. */
export function softMax(v: number, max: number | undefined): number {
  if (max == null || !Number.isFinite(max)) return v
  const w = MAX_SOFT_BAND * max
  const t = max - w
  return v <= t ? v : max - w * Math.exp(-(v - t) / w)
}

/** Smooth floor at zero: the identity above `a`, and a·e^(x/a − 1) (> 0, slope 1 at a) below it. */
function softFloor(x: number, a: number): number {
  return x >= a ? x : a * Math.exp(x / a - 1)
}

/** Round to at least 3 decimals and `sig` significant digits. */
function roundSig(v: number, sig: number): number {
  if (v === 0 || !Number.isFinite(v)) return v
  const d = Math.max(3, sig - 1 - Math.floor(Math.log10(Math.abs(v))))
  return Number(v.toFixed(Math.min(d, 100)))
}

/**
 * Round an ascending set of quantiles for publication (≥ 3 decimals, ≥ 4 significant digits), adding
 * digits when needed so values that were strictly increasing stay strictly increasing.
 */
export function roundOrdered(xs: number[]): number[] {
  const strict = (a: number[]) => a.every((v, i) => i === 0 || v > a[i - 1])
  const wanted = strict(xs)
  for (let sig = 4; sig <= 17; sig++) {
    const r = xs.map((v) => roundSig(v, sig))
    if (!wanted || strict(r)) return r
  }
  return xs
}

interface Prepared {
  dates: string[]
  values: number[]
  z: number[]
  index: Map<string, number>
  /** season → weekOfSeason → index */
  bySeason: Map<string, Map<number, number>>
  wos: number[]
  c: number
}

function prepare(points: Point[], upTo?: string): Prepared | null {
  const clean = points.filter((p): p is [string, number] => p[1] != null && Number.isFinite(p[1]) && p[1] >= 0)
  if (clean.length < MIN_POINTS) return null
  const positives = clean.filter((p) => !upTo || p[0] <= upTo).map((p) => p[1]).filter((v) => v > 0)
  // Offset keeps log() finite at zero while staying small relative to the series' scale; computed from
  // data up to the forecast origin only, so a forecast from an earlier origin ignores later weeks.
  const c = Math.max(1e-3, 0.1 * (positives.length ? median(positives) : 1))
  const dates = clean.map((p) => p[0])
  const values = clean.map((p) => p[1])
  const z = values.map((v) => Math.log(v + c))
  const index = new Map(dates.map((d, i) => [d, i]))
  const bySeason = new Map<string, Map<number, number>>()
  const wos = dates.map((d) => weekOfSeason(d))
  dates.forEach((d, i) => {
    const s = seasonOf(d)
    if (!bySeason.has(s)) bySeason.set(s, new Map())
    bySeason.get(s)!.set(wos[i], i)
  })
  return { dates, values, z, index, bySeason, wos, c }
}

/**
 * True when a series is too sparse to project: more than half of the last two years' weeks are zero,
 * or the median of the last 8 weeks is zero.
 */
export function isSparse(points: Point[], upTo?: string): boolean {
  const vals = points
    .filter((p): p is [string, number] => p[1] != null && Number.isFinite(p[1]) && (!upTo || p[0] <= upTo))
    .map((p) => p[1])
  if (!vals.length) return true
  const recent = vals.slice(-104)
  const zeros = recent.filter((v) => v <= 0).length
  return zeros / recent.length > 0.5 || median(vals.slice(-8)) <= 0
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

  // Analog: log-changes over the same weeks-of-season in earlier seasons (outcomes known before t).
  const originSeason = seasonOf(p.dates[t])
  const originWos = p.wos[t]
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

/** Errors sorted by the index at which their outcome became known, with running sums of squares. */
interface ErrLog {
  known: number[]
  cumSq: number[]
}

function errLog(rows: { known: number; e: number }[]): ErrLog {
  const sorted = [...rows].sort((a, b) => a.known - b.known)
  const known: number[] = []
  const cumSq: number[] = []
  let acc = 0
  for (const r of sorted) {
    acc += r.e * r.e
    known.push(r.known)
    cumSq.push(acc)
  }
  return { known, cumSq }
}

/** Number of entries with known ≤ tau (binary search). */
function countKnown(log: ErrLog, tau: number): number {
  let lo = 0
  let hi = log.known.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (log.known[mid] <= tau) lo = mid + 1
    else hi = mid
  }
  return lo
}

interface Situation {
  level: number
  slope: number
  phase: number
}

interface EnsErr extends Situation {
  /** Index whose observation revealed this error (origin + h). */
  known: number
  e: number
}

const phaseDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 52
  return Math.min(d, 52 - d)
}

export function project(points: Point[], opts: ProjectionOptions = {}): ProjectionResult | null {
  const H = opts.horizon ?? 4
  const exclude = new Set(opts.excludeSeasons ?? PANDEMIC_SEASONS)
  const damping = opts.damping ?? DEFAULT_DAMPING
  const centered = opts.center ?? true
  const p = prepare(points, opts.origin)
  if (!p) return null
  let T = p.dates.length - 1
  if (opts.origin) {
    const i = p.dates.findLastIndex((d) => d <= opts.origin!)
    if (i < MIN_POINTS - 1) return null
    T = i
  }
  if (isSparse(points, p.dates[T])) return null

  const targetOf = (t: number, h: number): number | null => {
    const i = p.index.get(addDays(p.dates[t], 7 * h))
    return i == null || i > T ? null : i
  }

  // 1) Walk-forward component forecasts and their errors.
  const backtestWeeks = opts.backtestWeeks ?? 156
  const origins: number[] = []
  for (let t = Math.max(TREND_WINDOW, T - backtestWeeks); t < T; t++) origins.push(t)
  const cache = new Map<number, Record<ComponentName, (number | null)[]>>()
  const compRows: Record<ComponentName, { known: number; e: number }[][]> = {
    persistence: Array.from({ length: H }, () => []),
    trend: Array.from({ length: H }, () => []),
    analog: Array.from({ length: H }, () => []),
  }
  for (const t of origins) {
    const f = componentForecasts(p, t, H, exclude, damping)
    cache.set(t, f)
    for (let h = 1; h <= H; h++) {
      const target = targetOf(t, h)
      if (target == null) continue
      for (const k of COMPONENTS) {
        const v = f[k][h - 1]
        if (v != null) compRows[k][h - 1].push({ known: target, e: p.z[target] - v })
      }
    }
  }
  const logs: Record<ComponentName, ErrLog[]> = {
    persistence: compRows.persistence.map(errLog),
    trend: compRows.trend.map(errLog),
    analog: compRows.analog.map(errLog),
  }

  /** Inverse-MSE weights per horizon from errors known by index tau. */
  const weightsAt = (tau: number): Record<ComponentName, number>[] => {
    const out: Record<ComponentName, number>[] = []
    for (let h = 1; h <= H; h++) {
      const w: Record<ComponentName, number> = { persistence: 0, trend: 0, analog: 0 }
      let total = 0
      for (const k of COMPONENTS) {
        const log = logs[k][h - 1]
        const n = countKnown(log, tau)
        if (n < MIN_WEIGHT_ERRORS) continue
        const mse = log.cumSq[n - 1] / n
        w[k] = 1 / Math.max(mse, 1e-6)
        total += w[k]
      }
      if (total === 0) {
        w.persistence = 1
        total = 1
      }
      for (const k of COMPONENTS) w[k] /= total
      out.push(w)
    }
    return out
  }

  const combine = (f: Record<ComponentName, (number | null)[]>, w: Record<ComponentName, number>, h: number): number => {
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

  // 2) Out-of-sample ensemble forecasts at every past origin (weights from errors known by then).
  const recentSlope = (t: number) => (t >= 2 ? olsSlope(p.z.slice(t - 2, t + 1)) : 0)
  const situation = (t: number): Situation => ({ level: p.z[t], slope: recentSlope(t), phase: p.wos[t] })
  interface Replay { t: number; h: number; target: number; zh: number }
  const replays: Replay[] = []
  const ens: EnsErr[][] = Array.from({ length: H }, () => [])
  for (const t of origins) {
    const w = weightsAt(t)
    const f = cache.get(t)!
    const sit = situation(t)
    for (let h = 1; h <= H; h++) {
      const target = targetOf(t, h)
      if (target == null) continue
      const zh = combine(f, w[h - 1], h)
      replays.push({ t, h, target, zh })
      ens[h - 1].push({ ...sit, known: target, e: p.z[target] - zh })
    }
  }

  // Scales for the situation distance, from the data known by tau (running sums → O(1) per lookup).
  const prefix = (xs: number[]) => {
    const s1 = [0]
    const s2 = [0]
    for (const x of xs) {
      s1.push(s1[s1.length - 1] + x)
      s2.push(s2[s2.length - 1] + x * x)
    }
    return (n: number) => (n < 2 ? NaN : Math.sqrt(Math.max(0, (s2[n] - (s1[n] * s1[n]) / n) / (n - 1))))
  }
  const zSdOf = prefix(p.z)
  const originSlopes = origins.map(recentSlope)
  const slopeSdOf = prefix(originSlopes)
  const scalesAt = (tau: number) => ({
    zSd: zSdOf(tau + 1) || 1,
    slopeSd: slopeSdOf(origins.length ? Math.max(0, Math.min(origins.length, tau - origins[0] + 1)) : 0) || 1,
  })

  /** Errors (known by tau) from the past situations most similar to `at`. */
  const similarErrors = (h: number, tau: number, at: Situation): number[] => {
    const rows = ens[h - 1].filter((r) => r.known <= tau)
    if (rows.length < 30) return rows.map((r) => r.e)
    const { zSd, slopeSd } = scalesAt(tau)
    const k = Math.max(30, Math.round(rows.length * 0.4))
    return rows
      .map((r) => ({
        e: r.e,
        d:
          Math.abs(r.level - at.level) / zSd +
          Math.abs(r.slope - at.slope) / slopeSd +
          phaseDist(r.phase, at.phase) / PHASE_SCALE_WEEKS,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
      .map((r) => r.e)
  }

  /**
   * Error quantiles in z space as a function of the level, from similar past errors: the empirical
   * quantile plus a tiny normal-shaped tie-break (strictly increasing whenever the errors' 95% spread
   * is non-zero). With too few errors, or none spread at all, a normal approximation widening with √h
   * around their median (0 with no errors).
   */
  const errorQuantiles = (errs: number[], h: number, tau: number): ((level: number) => number) => {
    let mid = 0
    if (errs.length >= MIN_INTERVAL_ERRORS) {
      const qe = (l: number) => quantile(errs, l)
      const spread = qe(0.975) - qe(0.025)
      if (spread > 0) return (l) => qe(l) + TIE_BREAK * NORMAL_Z[l] * spread
      mid = qe(0.5)
    }
    const diffs = p.z.slice(1, tau + 1).map((v, i) => v - p.z[i])
    const sd = stdev(diffs)
    const s1 = Number.isFinite(sd) ? sd : 0.25
    return (l) => mid + NORMAL_Z[l] * s1 * Math.sqrt(h)
  }

  /** Original scale from z, with a smooth floor so values stay positive and strictly increasing. */
  const floorAt = FLOOR_SOFTNESS * p.c
  const valueOf = (zv: number) => softFloor(Math.exp(zv) - p.c, floorAt)

  /** Upper cap for a forecast made at tau for targetDate with the given median (original scale). */
  const capAt = (tau: number, targetDate: string, med: number): number => {
    let record = 0
    let sameWeeks = -Infinity
    const wosT = weekOfSeason(targetDate)
    for (let i = 0; i <= tau; i++) {
      const v = p.values[i]
      if (v > record) record = v
      if (exclude.has(seasonOf(p.dates[i]))) continue
      if (phaseDist(p.wos[i], wosT) <= CAP_WINDOW_WEEKS && v > sameWeeks) sameWeeks = v
    }
    const global = Math.max(record * 1.5, p.values[tau] * 2)
    const seasonal = Math.max(Number.isFinite(sameWeeks) ? sameWeeks : record, SEASONAL_CAP_MULTIPLE * med)
    return Math.min(opts.max ?? Infinity, Math.max(med, Math.min(global, seasonal)))
  }

  interface Band {
    /** Quantiles at LEVELS on the original scale (unrounded); values[3] is the median. */
    values: number[]
    cap: number
    /** z-scale shift from the ensemble point forecast to the median. */
    shift: number
    /** Median before the smooth floor (≤ 0 means the series is projected to be off). */
    rawMedian: number
  }
  /**
   * The forecast procedure for one origin and horizon, shared by the live forecast and the backtest:
   * centre the ensemble forecast zh on the median of similar past errors, take the other quantiles
   * from the same errors, and softly cap the upper end.
   */
  const bandOf = (tau: number, h: number, zh: number, errs: number[], targetDate: string): Band => {
    const q = errorQuantiles(errs, h, tau)
    const zs = LEVELS.map((l) => zh + q(l))
    // Uncentred (comparison only): the raw ensemble forecast is the median, whatever its band says.
    if (!centered) zs[3] = zh
    const med = valueOf(zs[3])
    const cap = capAt(tau, targetDate, med)
    const values = zs.map((z) => softMax(softCap(valueOf(z), cap), opts.max))
    // The lowest bound may reach the physical minimum itself, so outcomes of exactly zero can fall inside
    // the 95% interval; it stays below lo80 because softFloor(x) > max(0, x) for x < floorAt.
    values[0] = softMax(softCap(Math.max(0, Math.exp(zs[0]) - p.c), cap), opts.max)
    if (!centered) {
      for (let i = 0; i < 3; i++) values[i] = Math.min(values[i], values[3])
      for (let i = 4; i < 7; i++) values[i] = Math.max(values[i], values[3])
    }
    return { values, cap, shift: zs[3] - zh, rawMedian: Math.exp(zs[3]) - p.c }
  }

  // 3) Skill: replay the live procedure at every past origin with only what was known then.
  const skill: ProjectionSkill[] = []
  for (let h = 1; h <= H; h++) {
    let n = 0
    let inside = 0
    let absErr = 0
    let absNaive = 0
    for (const r of replays) {
      if (r.h !== h) continue
      const errs = similarErrors(h, r.t, situation(r.t))
      if (errs.length < MIN_INTERVAL_ERRORS) continue
      const { values } = bandOf(r.t, h, r.zh, errs, p.dates[r.target])
      const actual = p.values[r.target]
      n++
      if (actual >= values[0] - 1e-9 && actual <= values[6] + 1e-9) inside++
      absErr += Math.abs(values[3] - actual)
      absNaive += Math.abs(p.values[r.t] - actual)
    }
    if (n < MIN_SKILL_ORIGINS) continue
    skill.push({
      horizon: h,
      n,
      mae: round(absErr / n),
      relMae: round(absNaive > 0 ? absErr / absNaive : 1),
      coverage95: round(inside / n),
    })
  }

  // 4) Live forecast from origin T with weights and intervals from everything known.
  const weights = weightsAt(T)
  const fT = componentForecasts(p, T, H, exclude, damping)
  const sitT = situation(T)
  const out: QuantileForecastPoint[] = []
  const caps: number[] = []
  const centering: number[] = []
  for (let h = 1; h <= H; h++) {
    const zh = combine(fT, weights[h - 1], h)
    const date = addDays(p.dates[T], 7 * h)
    const band = bandOf(T, h, zh, similarErrors(h, T, sitT), date)
    // A projected median of zero means the series is effectively off: its band would be all offset noise.
    if (band.rawMedian <= 0) return null
    const [lo95, lo80, lo50, med, hi50, hi80, hi95] = roundOrdered(band.values)
    out.push({ date, horizon: h, median: med, lo50, hi50, lo80, hi80, lo95, hi95 })
    caps.push(round(band.cap))
    centering.push(round(band.shift))
  }
  return {
    origin: p.dates[T],
    points: out,
    skill,
    weights,
    caps,
    centering,
    method:
      'Analog–trend ensemble on log scale: persistence, damped 4-week trend, and same-weeks-of-prior-seasons analogs, ' +
      'weighted by past error using only outcomes known at each point in time. The projection is centred on the median ' +
      'outcome in similar past situations (level, recent trend, week of season), and its intervals come from the same ' +
      'past errors; values above the highest seen in the same weeks of past seasons ' +
      `(or ${SEASONAL_CAP_MULTIPLE}× the median) are compressed. Skill and coverage are scored out of sample.`,
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000
