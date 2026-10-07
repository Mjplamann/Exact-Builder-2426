// Analysis step: turns normalized series into the dashboard's "pulse":
//   * statewide rollups for measures published only per wastewater plant (published as their own file),
//   * our own short-term projection for every state/regional series with enough history,
//   * a SignalSummary (latest value, change, historical percentile, level, trend) per series,
//   * a per-pathogen pulse (level, trend, outlook, plain-language headline),
//   * county/site map layers.
import type {
  ActivityLevel, ActivityThresholds, CountyPulse, Forecast, MapLayer, MetricKind, PathogenId, PathogenPulse, PulseFile,
  QuantileForecastPoint, Series, SeriesFile, SignalSummary, SitePulse, TrendDirection, Unit,
} from '../../shared/types.ts'
import { addDays, daysBetween } from '../../shared/mmwr.ts'
import { isSparse, project } from '../../shared/projection.ts'
import { median, quantile } from '../../shared/stats.ts'
import { pathogenShort } from '../../shared/pathogens.ts'
import { dedupeSeries, keyOfSeries, measureFamily, seriesKey, seriesVariant } from '../../shared/dedupe.ts'
import { MN_COUNTY_BY_FIPS } from '../../shared/geo/mnCounties.ts'
import {
  LEVEL_LABEL, LEVELS, TREND_LABEL, compositeScore, computeTrend, historicalValues, levelFromCuts, levelFromPercentile,
  rankAgainstHistory,
} from '../../shared/risk.ts'
import type { Logger } from '../lib/log.ts'
import { officialLevel } from './thresholds.ts'

export { measureFamily, seriesKey }

export interface AnalysisContext {
  now: string
  log: Logger
}

/** Signals older than this are flagged stale and never drive a pathogen's level. */
const STALE_DAYS = 28
const PROJECTABLE_GEOS = new Set(['state', 'census-region', 'national', 'mdh-region', 'hhs-region'])
const PROJECTABLE_METRICS = new Set<MetricKind>([
  'detection_rate', 'test_positivity', 'ed_visit_pct', 'ili_pct', 'hosp_admissions', 'hosp_rate', 'wastewater_conc',
  'wastewater_level',
])
const PERCENT_METRICS = new Set<MetricKind>(['detection_rate', 'test_positivity', 'ed_visit_pct', 'ili_pct'])
/** Geographies that are not Minnesota alone. */
const REGIONAL_GEOS = new Set(['hhs-region', 'census-region', 'national'])

type Priority = { metric: MetricKind; geo: string[] }[]

/**
 * Which signal drives a pathogen's headline level, best first. Minnesota-wide, timely measures
 * outrank regional or lagging ones.
 */
const PRIMARY_PRIORITY: Priority = [
  { metric: 'ed_visit_pct', geo: ['state'] },
  { metric: 'test_positivity', geo: ['state'] },
  { metric: 'hosp_rate', geo: ['state'] },
  { metric: 'hosp_admissions', geo: ['state'] },
  { metric: 'wastewater_level', geo: ['state'] },
  { metric: 'ili_pct', geo: ['state'] },
  { metric: 'test_positivity', geo: ['hhs-region'] },
  { metric: 'detection_rate', geo: ['census-region'] },
  { metric: 'wastewater_conc', geo: ['state'] },
  { metric: 'ww_detections', geo: ['state'] },
  { metric: 'cases', geo: ['state'] },
  { metric: 'cases_ytd', geo: ['state'] },
]

/**
 * Rare and outbreak-prone targets. For these, how many cases have been reported and whether wastewater
 * detects the target at all say more than a concentration ranked against a mostly-zero history.
 */
export const RARE_TARGETS = new Set<PathogenId>(['measles', 'mpox', 'hepatitis-a', 'h5n1', 'west-nile', 'pertussis'])
const RARE_FIRST: MetricKind[] = ['cases_ytd', 'cases', 'ww_detections', 'wastewater_conc']
const RARE_PRIORITY: Priority = [
  ...RARE_FIRST.map((metric) => ({ metric, geo: ['state'] })),
  ...PRIMARY_PRIORITY.filter((p) => !RARE_FIRST.includes(p.metric)),
]

/** Pathogens whose sub-type series roll up into a parent card. */
const PARENT: Partial<Record<PathogenId, PathogenId>> = { 'influenza-a': 'influenza', 'influenza-b': 'influenza' }

/** Publishers whose category scale has three steps (Low / Moderate / High), so "Low" is their floor. */
const THREE_STEP_PUBLISHERS = [/^MDH RESP-NET/]

const COUNTY_ED_BASIS = "CDC Minnesota cut-points applied to this county's health service area"

const lastObs = (s: Series): [string, number] | null => {
  for (let i = s.points.length - 1; i >= 0; i--) {
    const v = s.points[i][1]
    if (v != null) return [s.points[i][0], v]
  }
  return null
}

function valueAt(s: Series, date: string): number | undefined {
  const p = s.points.find(([d]) => d === date)
  return p?.[1] ?? undefined
}

/** DI-03 guard: cumulative year-to-date counts must never be read as weekly values. */
export function isCumulative(s: Pick<Series, 'id' | 'metric' | 'attrs'>): boolean {
  return s.metric === 'cases_ytd' || s.attrs?.cumulative === 'year-to-date' || /:ytd$/.test(s.id)
}

function normalize(s: Series): Series {
  return s.metric !== 'cases_ytd' && isCumulative(s) ? { ...s, metric: 'cases_ytd', unit: 'count' } : s
}

/** A single observation (e.g. a year-to-date table read once): never described as "the week ending". */
const isSnapshot = (s: Series | undefined) => !!s && s.points.filter((p) => p[1] != null).length <= 1

/** Display names for datasets (what system the number comes from). */
const DATASET_NAMES: [RegExp, string][] = [
  [/^nssp/, 'CDC NSSP (ER visits)'],
  [/^nhsn/, 'CDC NHSN (hospital reports)'],
  [/^nwss/, 'CDC NWSS wastewater'],
  [/^wwscan/, 'WastewaterSCAN'],
  [/^nrevss/, 'CDC NREVSS (lab network)'],
  [/^respnet|^covidnet|^rsvnet|^flusurv/, 'CDC RESP-NET'],
  [/^nndss/, 'CDC NNDSS (case reports)'],
  [/^fluview|^ilinet/, 'CDC FluView'],
  [/^cfa/, 'CDC CFA (Rt)'],
  [/^mdh/, 'Minnesota Dept. of Health'],
  [/^biofire/, 'BioFire Syndromic Trends'],
]

export function sourceNameOf(s: Pick<Series, 'dataset' | 'source'>): string {
  for (const [re, name] of DATASET_NAMES) if (re.test(s.dataset)) return name
  return s.source
}

export interface SummarizeOptions {
  /** Activity cut-points borrowed from a related series (e.g. Minnesota's for a county), with their basis. */
  borrowedThresholds?: { thresholds: ActivityThresholds; basis: string }
  /** Summary of the per-100,000 rate of the same measure, used to rate its count series. */
  rateSibling?: SignalSummary
}

export function summarize(s: Series, now: string, opts: SummarizeOptions = {}): SignalSummary | null {
  const last = lastObs(s)
  if (!last) return null
  const [date, value] = last
  const official = officialLevel(s, value)
  const rank = rankAgainstHistory(s.points, date, value)
  let level: ActivityLevel = 'unknown'
  let levelBasis = 'Not enough history to compare'
  const pub = s.official && (!s.official.asOf || s.official.asOf === date) ? s.official : undefined
  const isRt = s.metric === 'rt'
  if (isRt) {
    // Rt is the direction of spread, not the amount of illness: it gets a trend but no activity level.
    levelBasis = 'Rt shows direction of spread, not amount'
  } else if (pub?.level && pub.level !== 'unknown') {
    const by = pub.by ?? 'Publisher'
    if (value === 0 && pub.level === 'low' && THREE_STEP_PUBLISHERS.some((re) => re.test(by))) {
      // "Low" is the floor of a three-step scale; zero reported is the very bottom of it.
      level = 'minimal'
      levelBasis = `${by} category “${pub.label ?? 'Low'}” (none reported this week)`
    } else {
      level = pub.level
      levelBasis = `${by} category${pub.label ? ` “${pub.label}”` : ''}`
    }
  } else if (official) {
    level = official.level
    levelBasis = official.basis
  } else if (opts.borrowedThresholds) {
    const t = opts.borrowedThresholds.thresholds
    level = levelFromCuts(value, [t.low, t.moderate, t.high, t.veryHigh])
    levelBasis = opts.borrowedThresholds.basis
  } else if (
    s.metric === 'hosp_admissions' &&
    opts.rateSibling &&
    opts.rateSibling.level !== 'unknown' &&
    opts.rateSibling.latestDate === date
  ) {
    const sib = opts.rateSibling
    level = sib.level
    levelBasis = `Rated by the same admissions per 100,000 residents (${formatNumber(sib.latestValue, sib.unit)}): ${sib.levelBasis}`
  } else if (s.metric === 'cases_ytd') {
    levelBasis = 'Year-to-date count (no activity level)'
  } else if (s.metric === 'cases' && !rank) {
    levelBasis = 'Weekly reported cases (too few weeks with counts to rate a level)'
  } else if (s.metric === 'ww_detections') {
    // A detection in one week can be a single traveler; repeated detections are a signal.
    const tested = s.attrs?.plantsTestedLatestWeek ?? s.attrs?.sitesTested
    const hits = [0, 1, 2].map((k) => valueAt(s, addDays(date, -7 * k))).filter((v) => v != null && v > 0).length
    const sites = (n: number) => `${n} site${n === 1 ? '' : 's'}`
    if (value <= 0) {
      level = 'minimal'
      levelBasis = `Not detected in the latest week${tested ? ` (${tested} sites tested)` : ''}`
    } else if (hits >= 2) {
      level = 'moderate'
      levelBasis = `Detected in ${hits} of the last 3 weeks (${sites(value)} this week)`
    } else {
      level = 'low'
      levelBasis = `Detected at ${sites(value)} this week`
    }
  } else if (rank) {
    level = levelFromPercentile(rank.percentile)
    const years = rank.n / 52
    levelBasis = `Compared with the past ${years >= 1.5 ? `${Math.round(years)} years` : `${rank.n} weeks`} of this measure (${ordinal(Math.round(rank.percentile))} percentile)`
  }
  const computed = computeTrend(s.points, { minFloor: s.unit === 'count' ? 5 : 0 })
  const hist = historicalValues(s.points, date)
  const typical = hist.length >= 26 ? median(hist) : NaN
  const vsTypical = !isRt && typical > 0 ? Math.round((value / typical) * 10) / 10 : undefined
  const trend: TrendDirection =
    s.metric === 'cases_ytd' ? 'unknown' : isRt ? (pub?.trend ?? 'unknown') : (pub?.trend ?? computed.trend)
  const prev = valueAt(s, addDays(date, -7))
  const stale = date < addDays(now.slice(0, 10), -STALE_DAYS)
  return {
    seriesId: s.id,
    source: s.source,
    sourceName: sourceNameOf(s),
    label: s.label,
    metric: s.metric,
    unit: s.unit,
    geo: s.geo,
    latestDate: date,
    latestValue: value,
    previousValue: prev,
    change2w: s.metric === 'cases_ytd' ? undefined : computed.change2w,
    percentile: rank && !isRt && s.metric !== 'cases_ytd' ? Math.round(rank.percentile) : undefined,
    vsTypical,
    level,
    trend,
    levelBasis,
    spark: s.points.slice(-16),
    stale,
    attrs: s.attrs,
    note: s.note,
  }
}

function ordinal(n: number): string {
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** Forecasts carry no dataset; map their metric to the system the hubs forecast. */
const forecastKey = (f: Forecast) =>
  seriesKey({ ...f, dataset: f.metric === 'ed_visit_pct' ? 'nssp' : f.metric.startsWith('hosp') ? 'nhsn' : '' })

function priorityOf(sig: SignalSummary, list: Priority): number {
  const i = list.findIndex((p) => p.metric === sig.metric && p.geo.includes(sig.geo.type))
  return i === -1 ? list.length : i
}

const nameOf = (p: PathogenId) => pathogenShort(p)
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const METRIC_SUBJECT: Partial<Record<MetricKind, string>> = {
  ed_visit_pct: 'ER visits',
  hosp_admissions: 'hospital admissions',
  hosp_rate: 'hospitalizations',
  test_positivity: 'test positivity',
  detection_rate: 'detections',
  wastewater_level: 'wastewater levels',
  wastewater_conc: 'wastewater levels',
  ili_pct: 'flu-like illness visits',
}

/** "Flu ER visits", "Norovirus GII wastewater levels"; the name is dropped when the subject already says it. */
export function outlookSubject(pathogen: PathogenId, metric: MetricKind, series?: Pick<Series, 'label' | 'metric'>): string {
  const subject = METRIC_SUBJECT[metric] ?? 'activity'
  const name = series?.metric.startsWith('wastewater') ? series.label.split(' — ')[0] : nameOf(pathogen)
  return subject.toLowerCase().includes(name.toLowerCase()) ? cap1(subject) : `${name} ${subject}`
}

const directionOf = (lr: number): TrendDirection =>
  lr >= Math.log(1.4)
    ? 'rising-fast'
    : lr >= Math.log(1.1)
      ? 'rising'
      : lr <= -Math.log(1.4)
        ? 'falling-fast'
        : lr <= -Math.log(1.1)
          ? 'falling'
          : 'steady'

/** Level a value would have for this series (publisher cut-points first, else its own history). */
function levelOfValue(series: Series, date: string, value: number): ActivityLevel {
  const t = series.thresholds
  if (t) return levelFromCuts(value, [t.low, t.moderate, t.high, t.veryHigh])
  const r = rankAgainstHistory(series.points, date, value)
  return r ? levelFromPercentile(r.percentile) : 'unknown'
}

/**
 * Projected direction over roughly the next 3 weeks after the latest observation.
 * The comparison is anchored on the forecast's own value for the latest observed week (or its origin),
 * so a forecast issued from an older origin cannot report a change the data have already made, and a
 * forecast the data have already left (latest value outside its 50% interval) gives no outlook.
 */
export function outlookFrom(
  forecast: Forecast | undefined,
  latestDate: string,
  latest: number,
  series: Series | undefined,
  pathogen: PathogenId,
): PathogenPulse['outlook'] {
  if (!forecast || !series) return undefined
  // Nothing to project from a series that has been zero throughout its comparison window.
  const window = historicalValues(series.points, addDays(latestDate, 1))
  if (!window.length || window.every((v) => v === 0)) return undefined
  const ahead = forecast.points.filter((p) => p.date > latestDate).sort((a, b) => (a.date < b.date ? -1 : 1))
  if (!ahead.length) return undefined
  const want = addDays(latestDate, 21)
  const target: QuantileForecastPoint =
    ahead.find((p) => p.date === want) ?? ahead.filter((p) => p.date <= want).pop() ?? ahead[0]
  const weeks = Math.max(1, Math.round(daysBetween(latestDate, target.date) / 7))
  if (forecast.source === 'mn-pulse') {
    const sk = forecast.skill?.find((k) => k.horizon === target.horizon)
    // No better than "no change" in backtests at this horizon (or never scored): no outlook.
    if (!sk || sk.relMae >= 1) return undefined
  }
  const atLatest = forecast.points.find((p) => p.date === latestDate)
  if (atLatest && (latest < atLatest.lo50 || latest > atLatest.hi50)) return undefined
  const base = atLatest?.median ?? valueAt(series, forecast.referenceDate) ?? latest
  // Same "meaningful change" floor as the trend classifier.
  const vals = series.points.map((p) => p[1]).filter((v): v is number => v != null)
  const minFloor = series.unit === 'count' ? 5 : 1e-9
  const floor = vals.length ? Math.max(minFloor, 0.015 * quantile(vals, 0.9)) : 1e-6
  const lrOf = (v: number) => (Math.abs(v - base) < floor ? 0 : Math.log((v + floor) / (base + floor)))
  let direction = directionOf(lrOf(target.median))
  // A 50% range that reaches both a clear rise and a clear fall is no outlook at all.
  if (lrOf(target.lo50) <= -Math.log(1.1) && lrOf(target.hi50) >= Math.log(1.1)) direction = 'unknown'
  const who = forecast.source === 'mn-pulse' ? 'MN Pulse projection' : `CDC ${forecast.model}`
  const subject = outlookSubject(pathogen, forecast.metric, series)
  const plural = /s$/.test(subject)
  const be = plural ? 'are' : 'is'
  const span = `over the next ${weeks} week${weeks === 1 ? '' : 's'}`
  // Rising but staying in the lowest band: say so instead of "sharply".
  if ((direction === 'rising' || direction === 'rising-fast') && levelOfValue(series, target.date, target.median) === 'minimal') {
    return {
      direction: 'rising',
      text: `${subject} may rise but stay very low, about ${formatNumber(target.median, series.unit)}, ${span} (${who}).`,
      forecastId: forecast.id,
    }
  }
  const words: Record<TrendDirection, string> = {
    'rising-fast': `${be} projected to rise sharply`,
    rising: `${be} projected to rise`,
    steady: `${be} projected to stay about the same`,
    falling: `${be} projected to decline`,
    'falling-fast': `${be} projected to decline sharply`,
    unknown: `${plural ? 'have' : 'has'} an uncertain outlook`,
  }
  return { direction, text: `${subject} ${words[direction]} ${span} (${who}).`, forecastId: forecast.id }
}

function formatNumber(v: number, unit: Unit): string {
  if (unit === '%') return `${v < 1 ? v.toFixed(2) : v.toFixed(1)}%`
  if (unit === 'per100k') return `${v < 1 ? v.toFixed(2) : v.toFixed(1)} per 100k`
  if (unit === 'count') return Math.round(v).toLocaleString('en-US')
  return v < 10 ? v.toPrecision(2) : Math.round(v).toLocaleString('en-US')
}

const formatValue = (sig: SignalSummary) => formatNumber(sig.latestValue, sig.unit)

const METRIC_PHRASE: Record<MetricKind, string> = {
  detection_rate: 'of BioFire panel tests',
  test_positivity: 'of lab tests positive',
  ed_visit_pct: 'of ER visits',
  ili_pct: 'of clinic visits for flu-like illness',
  hosp_admissions: 'new hospital admissions last week',
  hosp_rate: 'hospitalizations',
  wastewater_level: 'wastewater activity index',
  wastewater_conc: 'wastewater concentration',
  cases: 'reported cases',
  cases_ytd: 'cases reported so far this year',
  outbreaks: 'reported outbreaks',
  deaths: 'reported deaths',
  ww_detections: 'wastewater detections',
  rt: 'estimated Rt',
}

/** A year-to-date case count for a pathogen, from MDH's tables or CDC NNDSS's weekly table. */
export interface YtdFact {
  pathogen: PathogenId
  count: number
  year: number
  /** Count for the same point of the previous year, when the source gives one. */
  prev?: number
  asOf: string
  source: string
  seriesId: string
}

const intAttr = (v: string | undefined) => (v != null && /^\d+$/.test(v.trim()) ? Number(v) : undefined)

export function ytdFacts(all: Series[]): YtdFact[] {
  const out: YtdFact[] = []
  for (const s of all) {
    if (s.geo.type !== 'state' || s.age) continue
    if (s.metric === 'cases_ytd') {
      const last = lastObs(s)
      if (!last) continue
      out.push({
        pathogen: s.pathogen,
        count: last[1],
        year: Number(s.attrs?.year ?? last[0].slice(0, 4)),
        prev: intAttr(s.attrs?.ytdPrevYear),
        asOf: last[0],
        source: s.source,
        seriesId: s.id,
      })
    } else if (s.metric === 'cases' && intAttr(s.attrs?.ytd) != null) {
      const asOf = s.official?.asOf ?? s.points[s.points.length - 1]?.[0]
      if (!asOf) continue
      out.push({
        pathogen: s.pathogen,
        count: intAttr(s.attrs!.ytd)!,
        year: Number(s.attrs?.mmwrWeek?.slice(0, 4) ?? asOf.slice(0, 4)),
        prev: intAttr(s.attrs?.ytdPrevYear),
        asOf,
        source: s.source,
        seriesId: s.id,
      })
    }
  }
  return out
}

/** Plants or sites tested in the latest week, for detection signals (0 when not stated). */
const testedOf = (sig: SignalSummary) => intAttr(sig.attrs?.plantsTestedLatestWeek ?? sig.attrs?.sitesTested) ?? 0

/** Twin Cities seven-county metro (MDH SCHSAC Metro region). */
const isMetroCounty = (fips: string) => MN_COUNTY_BY_FIPS[fips]?.schsacRegion === 'Metro'

interface HeadlineContext {
  series?: Series
  ytd?: YtdFact
  detection?: SignalSummary
  /** Metro-plant counts per wastewater source (plants listed, plants in the Twin Cities). */
  plantsBySource: Map<string, { plants: number; metro: number }>
}

function plantsPhrase(n: number, system: string, metro: number | undefined) {
  const where = metro === 0 ? ' (none in the Twin Cities)' : ''
  return `${n} ${system} plant${n === 1 ? '' : 's'}${where}`
}

function detectionClause(det: SignalSummary, ctx: HeadlineContext): string {
  const tested = intAttr(det.attrs?.plantsTestedLatestWeek ?? det.attrs?.sitesTested)
  const isScan = /^wwscan/.test(det.seriesId.split(':')[1] ?? '') || det.source === 'wastewaterscan'
  const system = isScan ? 'WastewaterSCAN' : 'CDC NWSS'
  const coverage = ctx.plantsBySource.get(det.source)
  const metro = isScan && coverage && tested != null && coverage.plants === tested ? coverage.metro : undefined
  const where = tested != null ? `at ${plantsPhrase(tested, system, metro)}` : 'in Minnesota wastewater'
  const when = `in the week ending ${det.latestDate}`
  if (det.latestValue <= 0) {
    const lastSeen = det.attrs?.lastDetection
    const seen = lastSeen && /^\d{4}-\d{2}-\d{2}/.test(lastSeen) ? `; last detected ${lastSeen.replace(/ — /, ', ')}` : ''
    return `not detected ${where} ${when}${seen}`
  }
  const of = tested != null ? `at ${det.latestValue} of ${plantsPhrase(tested, system, metro)}` : `at ${det.latestValue} site${det.latestValue === 1 ? '' : 's'}`
  return `detected ${of} ${when}`
}

function ytdClause(f: YtdFact): string {
  const n = f.count.toLocaleString('en-US')
  const prev = f.prev != null ? `; ${f.prev.toLocaleString('en-US')} by the same week in ${f.year - 1}` : ''
  return `${n} Minnesota case${f.count === 1 ? '' : 's'} so far in ${f.year} (as of ${f.asOf}${prev})`
}

export function headlineFor(
  p: PathogenId,
  sig: SignalSummary | undefined,
  level: ActivityLevel,
  trend: TrendDirection,
  ctx: HeadlineContext = { plantsBySource: new Map() },
): string {
  if (!sig) return `${nameOf(p)}: no current data.`
  const snapshot = isSnapshot(ctx.series)
  const when = snapshot ? `as of ${sig.latestDate}` : `week ending ${sig.latestDate}`
  // Rare targets lead with the year-to-date count and whether wastewater detects them.
  if (RARE_TARGETS.has(p) && (ctx.ytd || ctx.detection)) {
    const parts = [ctx.ytd ? ytdClause(ctx.ytd) : '', ctx.detection ? detectionClause(ctx.detection, ctx) : ''].filter(Boolean)
    return `${nameOf(p)}: ${parts.join('; ')}.`
  }
  if (sig.metric === 'ww_detections') return `${nameOf(p)}: ${detectionClause(sig, ctx)}.`
  if (sig.metric === 'wastewater_conc' || sig.metric === 'wastewater_level') {
    const what = sig.label.split(' — ')[0]
    const plants = intAttr(sig.attrs?.plants)
    const system = sig.sourceName
    const scope = plants != null ? ` at ${plantsPhrase(plants, system, intAttr(sig.attrs?.metroPlants))}` : ' in Minnesota wastewater'
    if (level === 'unknown') {
      const detected = intAttr(sig.attrs?.detectedPlants)
      if (sig.latestValue <= 0 || detected === 0) return `${what} was not detected${scope} in the ${when}.`
      const at = plants != null && detected != null ? ` at ${detected} of ${plantsPhrase(plants, system, intAttr(sig.attrs?.metroPlants))}` : scope
      return `${what} was detected${at} in the ${when} (not enough history to rate the level).`
    }
    const tr = trend === 'unknown' ? '' : ` and ${TREND_LABEL[trend].toLowerCase()}`
    return `${what} levels${scope} are ${LEVEL_LABEL[level].toLowerCase()}${tr}, ${when}.`
  }
  if (sig.metric === 'cases_ytd') {
    const year = sig.latestDate.slice(0, 4)
    return `${nameOf(p)}: ${formatValue(sig)} case${sig.latestValue === 1 ? '' : 's'} reported in Minnesota so far in ${year} (as of ${sig.latestDate}).`
  }
  if (level === 'unknown') {
    const why = sig.metric === 'rt' ? 'Rt shows the direction of spread, not the amount' : 'not enough history to rate the level'
    return `${nameOf(p)}: ${formatValue(sig)} ${METRIC_PHRASE[sig.metric]} ${snapshot ? when : `in the ${when}`} (${why}).`
  }
  const lvl = LEVEL_LABEL[level].toLowerCase()
  const tr = trend === 'unknown' ? '' : ` and ${TREND_LABEL[trend].toLowerCase()}`
  const where =
    sig.geo.type === 'census-region'
      ? ` (${sig.geo.name} region)`
      : sig.geo.type === 'hhs-region' || sig.geo.type === 'national'
        ? ` (${sig.geo.name})`
        : ''
  return `${nameOf(p)} activity is ${lvl}${tr}: ${formatValue(sig)} ${METRIC_PHRASE[sig.metric]}${where}, ${when}.`
}

/**
 * Statewide rollups for measures published only per wastewater plant (e.g. WastewaterSCAN norovirus):
 * weekly median across plants (≥ 2 reporting), so the pathogen gets a Minnesota-level signal.
 * Assay variants (e.g. mpox clade II vs clade Ib) are rolled up separately.
 */
export function rollupSites(all: Series[]): Series[] {
  const groups = new Map<string, Series[]>()
  for (const s of all) {
    if (s.geo.type !== 'sewershed') continue
    const k = [s.source, s.dataset, s.pathogen, s.metric, seriesVariant(s)].join('|')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(s)
  }
  const out: Series[] = []
  for (const sites of groups.values()) {
    const first = sites[0]
    const variant = seriesVariant(first)
    const codes = new Set(sites.map((x) => x.geo.code))
    if (codes.size !== sites.length || codes.size < 2) continue
    const exists = all.some(
      (x) =>
        x.geo.type === 'state' &&
        x.pathogen === first.pathogen &&
        x.metric === first.metric &&
        measureFamily(x.dataset) === measureFamily(first.dataset) &&
        seriesVariant(x) === variant,
    )
    if (exists) continue
    const byWeek = new Map<string, number[]>()
    for (const site of sites) for (const [d, v] of site.points) if (v != null) (byWeek.get(d) ?? byWeek.set(d, []).get(d)!).push(v)
    const points = [...byWeek.entries()]
      .filter(([, vs]) => vs.length >= 2)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([d, vs]) => [d, Math.round(median(vs) * 1000) / 1000] as [string, number])
    if (points.length < 4) continue
    const lastDate = points[points.length - 1][0]
    const reporting = sites.filter((x) => x.points.some(([d, v]) => d === lastDate && v != null))
    const detected = reporting.filter((x) => (valueAt(x, lastDate) ?? 0) > 0)
    const metro = sites.filter((x) => (x.geo.counties ?? []).some(isMetroCounty))
    const levels = reporting
      .map((x) => (x.official?.asOf === undefined || x.official.asOf === lastDate ? x.official?.level : undefined))
      .filter((l): l is ActivityLevel => !!l && l !== 'unknown')
      .map((l) => LEVELS.indexOf(l))
      .sort((a, b) => a - b)
    const dataset = `${first.dataset}-mn`
    const derived: Series = {
      id: [first.source, dataset, first.pathogen, first.metric, 'state', '27', variant].filter(Boolean).join(':'),
      source: first.source,
      dataset,
      pathogen: first.pathogen,
      metric: first.metric,
      unit: first.unit,
      geo: { type: 'state', code: '27', name: 'Minnesota' },
      label: `${first.label.split(' — ')[0]} — wastewater, median of ${codes.size} Minnesota ${sourceNameOf(first)} plants`,
      points,
      note: `Weekly median across ${codes.size} wastewater plants (${sites.map((x) => x.geo.name.replace(/ \(.*\)$/, '')).join(', ')}${metro.length === 0 ? '; none in the Twin Cities metro' : ''}). Covers only the communities these plants serve. ${first.note ?? ''}`.trim(),
      attrs: {
        derived: `median of ${reporting.length} reporting plants`,
        plants: String(codes.size),
        reportingPlants: String(reporting.length),
        detectedPlants: String(detected.length),
        metroPlants: String(metro.length),
        ...(first.attrs?.assay ? { assay: first.attrs.assay.replace(/ \(since .*\)$/, '') } : {}),
      },
    }
    // Publisher plant categories compare against national levels; the statewide rollup is rated
    // against Minnesota's own history like every other measure, so we only note them.
    if (levels.length >= 2) {
      derived.attrs = {
        ...derived.attrs,
        plantCategories: `${sourceNameOf(first)} plant categories (vs. national levels): median ${LEVEL_LABEL[LEVELS[levels[Math.ceil((levels.length - 1) / 2)]]].toLowerCase()}`,
      }
    }
    out.push(derived)
  }
  return out
}

export interface AnalysisDiagnostics {
  warnings: string[]
  /** MDH vs CDC NNDSS year-to-date totals for the same pathogen and year. */
  ytdComparisons: { pathogen: PathogenId; year: number; mdh: number; mdhAsOf: string; nndss: number; nndssAsOf: string; diff: number }[]
  /** Series not projected because they are sparse (mostly zero or zero in recent weeks). */
  sparseNotProjected: string[]
}

export interface AnalysisResult {
  pulse: PulseFile
  forecasts: Forecast[]
  /** Series derived here (statewide wastewater rollups); run.ts publishes them as series files. */
  derived: Series[]
  diagnostics: AnalysisDiagnostics
}

/** Group derived series into publishable files (one per source + dataset). */
export function derivedFiles(derived: Series[], generatedAt: string): SeriesFile[] {
  const files = new Map<string, SeriesFile>()
  for (const s of derived) {
    const k = `${s.source}__${s.dataset}`
    if (!files.has(k)) files.set(k, { source: s.source, dataset: s.dataset, generatedAt, derived: true, series: [] })
    files.get(k)!.series.push(s)
  }
  return [...files.values()]
}

/** Series ids referenced by the pulse or forecasts that are not in `published`. */
export function unpublishedSeriesIds(pulse: PulseFile, forecasts: Forecast[], published: Set<string>): string[] {
  const ids = new Set<string>()
  for (const p of pulse.pathogens) {
    if (p.primary) ids.add(p.primary.seriesId)
    for (const s of p.signals) ids.add(s.seriesId)
  }
  for (const f of forecasts) ids.add(f.seriesId)
  for (const c of pulse.counties) for (const m of Object.values(c.metrics)) ids.add(m.seriesId)
  for (const s of pulse.sites) for (const m of Object.values(s.metrics)) ids.add(m.seriesId)
  return [...ids].filter((id) => !published.has(id)).sort()
}

/** A single-week detection is not a trend: it never reaches the watch list. */
const singleDetection = (p: PathogenPulse) => p.primary?.metric === 'ww_detections' && p.level === 'low'

export function runAnalysis(files: SeriesFile[], sourceForecasts: Forecast[], ctx: AnalysisContext): AnalysisResult {
  const warnings: string[] = []
  const raw = dedupeSeries(files.flatMap((f) => f.series).map(normalize))
  const derived = rollupSites(raw)
  const all = [...raw, ...derived]
  const byId = new Map(all.map((s) => [s.id, s]))
  const today = ctx.now.slice(0, 10)

  // 1) Our projections for state/regional series.
  const ours: Forecast[] = []
  const sparseNotProjected: string[] = []
  for (const s of all) {
    if (!PROJECTABLE_GEOS.has(s.geo.type) || !PROJECTABLE_METRICS.has(s.metric)) continue
    const last = lastObs(s)
    if (!last || last[0] < addDays(today, -STALE_DAYS)) continue
    const origin = s.provisionalFrom ? addDays(s.provisionalFrom, -7) : undefined
    if (isSparse(s.points, origin)) {
      sparseNotProjected.push(s.id)
      continue
    }
    const r = project(s.points, { horizon: 4, max: PERCENT_METRICS.has(s.metric) ? 100 : undefined, origin })
    if (!r) continue
    ours.push({
      id: `mn-pulse:${s.id}`,
      source: 'mn-pulse',
      model: 'MN Pulse analog–trend ensemble',
      seriesId: s.id,
      pathogen: s.pathogen,
      metric: s.metric,
      geo: s.geo,
      referenceDate: r.origin,
      issuedAt: ctx.now,
      points: r.points,
      skill: r.skill,
      method: r.method,
    })
  }
  const byKey = new Map(all.map((s) => [keyOfSeries(s), s]))
  const matched = sourceForecasts
    .map((f) => {
      const s = byKey.get(forecastKey(f))
      return s ? { ...f, seriesId: s.id } : null
    })
    .filter((f): f is Forecast => !!f)
  const forecasts = [...matched, ...ours]
  ctx.log.info(
    `projections: ${ours.length} MN Pulse (${sparseNotProjected.length} sparse series skipped) + ${matched.length}/${sourceForecasts.length} source forecasts matched`,
  )

  // 2) Signals for non-county series. Count series are rated by their per-100k sibling when one exists.
  const statewideSeries = all.filter((s) => s.geo.type !== 'county' && s.geo.type !== 'sewershed' && !s.age)
  const rateKey = (s: Series) => [s.source, measureFamily(s.dataset), s.pathogen, s.geo.type, s.geo.code].join('|')
  const rateSignals = new Map<string, SignalSummary>()
  for (const s of statewideSeries) {
    if (s.metric !== 'hosp_rate') continue
    const sig = summarize(s, ctx.now)
    if (sig) rateSignals.set(rateKey(s), sig)
  }
  const signals = statewideSeries
    .map((s) => summarize(s, ctx.now, s.metric === 'hosp_admissions' ? { rateSibling: rateSignals.get(rateKey(s)) } : {}))
    .filter((x): x is SignalSummary => !!x)

  // Year-to-date counts and the MDH vs CDC consistency check.
  const facts = ytdFacts(all)
  const ytdComparisons: AnalysisDiagnostics['ytdComparisons'] = []
  for (const m of facts.filter((f) => f.source === 'mdh')) {
    const n = facts.find((f) => f.source === 'cdc-nndss' && f.pathogen === m.pathogen && f.year === m.year)
    if (!n) continue
    const diff = Math.abs(m.count - n.count) / Math.max(m.count, n.count, 1)
    ytdComparisons.push({ pathogen: m.pathogen, year: m.year, mdh: m.count, mdhAsOf: m.asOf, nndss: n.count, nndssAsOf: n.asOf, diff: Math.round(diff * 1000) / 1000 })
    if (diff > 0.2) {
      warnings.push(
        `${m.pathogen} ${m.year} year-to-date totals disagree by ${Math.round(diff * 100)}%: MDH ${m.count} (as of ${m.asOf}) vs CDC NNDSS ${n.count} (through ${n.asOf})`,
      )
    }
  }

  // Wastewater plant coverage per source (how many plants, how many in the Twin Cities).
  const plantsBySource = new Map<string, { plants: number; metro: number }>()
  {
    const seen = new Map<string, Map<string, boolean>>()
    for (const s of all) {
      if (s.geo.type !== 'sewershed') continue
      const m = seen.get(s.source) ?? seen.set(s.source, new Map()).get(s.source)!
      m.set(s.geo.code, (s.geo.counties ?? []).some(isMetroCounty))
    }
    for (const [src, m] of seen) plantsBySource.set(src, { plants: m.size, metro: [...m.values()].filter(Boolean).length })
  }

  // 3) Pathogen pulses.
  const byPathogen = new Map<PathogenId, SignalSummary[]>()
  for (const sig of signals) {
    const series = byId.get(sig.seriesId)!
    const key = PARENT[series.pathogen] ?? series.pathogen
    if (!byPathogen.has(key)) byPathogen.set(key, [])
    byPathogen.get(key)!.push(sig)
  }
  const pathogens: PathogenPulse[] = []
  for (const [pathogen, sigs] of byPathogen) {
    const rare = RARE_TARGETS.has(pathogen)
    const prio = rare ? RARE_PRIORITY : PRIMARY_PRIORITY
    const ranked = [...sigs].sort((a, b) => {
      // Fresh signals first, Rt last, then by priority, own-pathogen over sub-types, fresher first.
      if (a.stale !== b.stale) return a.stale ? 1 : -1
      const ra = a.metric === 'rt' ? 1 : 0
      const rb = b.metric === 'rt' ? 1 : 0
      if (ra !== rb) return ra - rb
      const pa = priorityOf(a, prio)
      const pb = priorityOf(b, prio)
      if (pa !== pb) return pa - pb
      const sa = byId.get(a.seriesId)!.pathogen === pathogen ? 0 : 1
      const sb = byId.get(b.seriesId)!.pathogen === pathogen ? 0 : 1
      if (sa !== sb) return sa - sb
      if (a.latestDate !== b.latestDate) return a.latestDate > b.latestDate ? -1 : 1
      // Detection counts: the system testing more plants speaks for more of Minnesota.
      return testedOf(b) - testedOf(a) || (a.source === 'wastewaterscan' ? -1 : b.source === 'wastewaterscan' ? 1 : 0)
    })
    // Rt never sets a level: it is the primary only when nothing else exists (and then rates "unknown").
    const primary =
      ranked.find((s) => !s.stale && s.geo.code !== 'US' && s.metric !== 'rt') ?? ranked.find((s) => s.metric !== 'rt') ?? ranked[0]
    const current = primary && !primary.stale
    const level = current ? primary.level : 'unknown'
    const trend = current ? primary.trend : 'unknown'
    const primarySeries = primary ? byId.get(primary.seriesId) : undefined
    // Rare-target headline facts: the primary's own year-to-date count, else the freshest available.
    const pFacts = facts.filter((f) => (PARENT[f.pathogen] ?? f.pathogen) === pathogen)
    const ytd =
      pFacts.find((f) => f.seriesId === primary?.seriesId) ??
      [...pFacts].sort((a, b) => (a.asOf === b.asOf ? 0 : a.asOf > b.asOf ? -1 : 1))[0]
    const detection = ranked.find((s) => s.metric === 'ww_detections' && !s.stale)
    let outlook: PathogenPulse['outlook']
    if (current) {
      const candidates = [
        ...forecasts.filter((f) => f.seriesId === primary.seriesId && f.source !== 'mn-pulse'),
        ...forecasts.filter((f) => f.seriesId === primary.seriesId && f.source === 'mn-pulse'),
      ]
      for (const f of candidates) {
        outlook = outlookFrom(f, primary.latestDate, primary.latestValue, primarySeries, pathogen)
        if (outlook) break
      }
    }
    pathogens.push({
      pathogen,
      level,
      trend,
      score: compositeScore(level, trend),
      headline: headlineFor(pathogen, primary, level, trend, {
        series: primarySeries,
        ytd: rare ? ytd : undefined,
        detection: rare ? detection : undefined,
        plantsBySource,
      }),
      primary,
      signals: ranked,
      outlook,
      asOf: primary?.latestDate,
    })
  }
  // Highest score first; pathogens without a current level go last.
  pathogens.sort(
    (a, b) =>
      (a.level === 'unknown' ? 1 : 0) - (b.level === 'unknown' ? 1 : 0) || b.score - a.score || a.pathogen.localeCompare(b.pathogen),
  )

  // 4) Statewide summary from the respiratory big three.
  const resp = pathogens.filter((p) => ['influenza', 'covid', 'rsv', 'respiratory-combined'].includes(p.pathogen))
  const known = resp.filter((p) => p.level !== 'unknown')
  const stateLevel = known.reduce<ActivityLevel>(
    (best, p) => (LEVELS.indexOf(p.level) > LEVELS.indexOf(best) ? p.level : best),
    known.length ? 'minimal' : 'unknown',
  )
  const leader = [...known].sort((a, b) => b.score - a.score)[0]
  const watchable = (p: PathogenPulse) => p.level !== 'unknown' && p.score >= 40 && !singleDetection(p)
  const watchList = pathogens.filter(watchable).map((p) => p.pathogen)
  const BIG3: PathogenId[] = ['influenza', 'covid', 'rsv']
  const big3 = BIG3.map((id) => pathogens.find((p) => p.pathogen === id)).filter((p): p is PathogenPulse => !!p)
  const displayName = (p: PathogenPulse) =>
    p.primary && p.primary.metric.startsWith('wastewater') ? `${p.primary.label.split(' — ')[0]} (wastewater)` : nameOf(p.pathogen)
  const describe = (p: PathogenPulse) =>
    `${displayName(p)} ${LEVEL_LABEL[p.level].toLowerCase()}${p.trend === 'rising' || p.trend === 'rising-fast' ? ` and ${TREND_LABEL[p.trend].toLowerCase()}` : ''}${
      p.primary && REGIONAL_GEOS.has(p.primary.geo.type) ? ' (regional lab data)' : ''
    }`
  const others = pathogens.filter(
    (p) => !BIG3.includes(p.pathogen) && p.pathogen !== 'respiratory-combined' && p.pathogen !== 'ili' && watchable(p),
  )
  const headline = known.length
    ? `Respiratory virus activity in Minnesota is ${LEVEL_LABEL[stateLevel].toLowerCase()} overall (${big3.map(describe).join('; ')}).${
        others.length ? ` Also watch: ${others.slice(0, 3).map(describe).join('; ')}.` : ''
      }`
    : 'Waiting for the first data refresh.'

  // 5) Map layers (counties and sites).
  const { mapLayers, counties, sites } = buildMap(all, ctx.now)

  return {
    pulse: {
      generatedAt: ctx.now,
      statewide: { level: stateLevel, trend: leader?.trend ?? 'unknown', headline, watchList },
      pathogens,
      mapLayers,
      counties,
      sites,
    },
    forecasts,
    derived,
    diagnostics: { warnings, ytdComparisons, sparseNotProjected },
  }
}

const METRIC_SHORT: Partial<Record<MetricKind, string>> = {
  ed_visit_pct: 'ed',
  hosp_rate: 'hosp',
  hosp_admissions: 'hospn',
  wastewater_level: 'ww',
  wastewater_conc: 'wwc',
  test_positivity: 'pos',
  cases: 'cases',
}

const LAYER_PHRASE: Partial<Record<MetricKind, string>> = {
  ed_visit_pct: '% of ER visits',
  wastewater_level: 'wastewater activity level',
  wastewater_conc: 'wastewater concentration',
  hosp_rate: 'hospitalizations per 100,000',
  cases: 'reported cases',
  test_positivity: '% of lab tests positive',
}

function buildMap(all: Series[], now: string) {
  const layers = new Map<string, MapLayer>()
  const counties = new Map<string, CountyPulse>()
  const sites = new Map<string, SitePulse>()
  // County ER-visit percentages are rated with Minnesota's own CDC cut-points for the same pathogen,
  // so a county and the state are on one scale.
  const stateEd = new Map<PathogenId, ActivityThresholds>()
  for (const s of all) {
    if (s.geo.type === 'state' && s.metric === 'ed_visit_pct' && !s.age && s.thresholds) stateEd.set(s.pathogen, s.thresholds)
  }
  for (const s of all) {
    if (s.geo.type !== 'county' && s.geo.type !== 'sewershed') continue
    // Raw counts (and cumulative counts) mostly reflect population size, not activity.
    if (s.unit === 'count' || isCumulative(s)) continue
    const t = s.geo.type === 'county' && s.metric === 'ed_visit_pct' ? stateEd.get(s.pathogen) : undefined
    const sig = summarize(s, now, t ? { borrowedThresholds: { thresholds: t, basis: COUNTY_ED_BASIS } } : {})
    // Inactive sites/counties (no data in the last 4 weeks) are left off the map.
    if (!sig || sig.stale) continue
    const kind = s.geo.type === 'county' ? 'county' : 'site'
    const layerId = `${kind === 'site' ? 'site-' : ''}${METRIC_SHORT[s.metric] ?? s.metric}:${s.pathogen}`
    const layer = layers.get(layerId)
    if (!layer || (sig.latestDate > (layer.latestDate ?? ''))) {
      layers.set(layerId, {
        id: layerId,
        kind,
        label: `${nameOf(s.pathogen)} — ${LAYER_PHRASE[s.metric] ?? METRIC_PHRASE[s.metric]}`,
        pathogen: s.pathogen,
        metric: s.metric,
        unit: s.unit,
        source: s.source,
        description: s.note ?? s.label,
        latestDate: sig.latestDate > (layer?.latestDate ?? '') ? sig.latestDate : layer?.latestDate,
      })
    }
    const metric = { seriesId: s.id, value: sig.latestValue, date: sig.latestDate, level: sig.level, trend: sig.trend }
    if (kind === 'county') {
      const c = counties.get(s.geo.code) ?? { fips: s.geo.code, metrics: {} }
      c.metrics[layerId] = metric
      counties.set(s.geo.code, c)
    } else {
      const site = sites.get(s.geo.code) ?? {
        id: s.geo.code,
        name: s.geo.name,
        coord: s.geo.coord,
        counties: s.geo.counties,
        population: s.geo.population,
        metrics: {},
      }
      site.metrics[layerId] = metric
      sites.set(s.geo.code, site)
    }
  }
  return { mapLayers: [...layers.values()], counties: [...counties.values()], sites: [...sites.values()] }
}
