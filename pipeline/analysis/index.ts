// Analysis step: turns normalized series into the dashboard's "pulse":
//   * our own short-term projection for every state/regional series with enough history,
//   * a SignalSummary (latest value, change, historical percentile, level, trend) per series,
//   * a per-pathogen pulse (level, trend, outlook, plain-language headline),
//   * county/site map layers.
import type {
  ActivityLevel, CountyPulse, Forecast, MapLayer, MetricKind, PathogenId, PathogenPulse, PulseFile, Series,
  SeriesFile, SignalSummary, SitePulse, TrendDirection,
} from '../../shared/types.ts'
import { addDays } from '../../shared/mmwr.ts'
import { project } from '../../shared/projection.ts'
import { median, quantile } from '../../shared/stats.ts'
import { pathogenShort } from '../../shared/pathogens.ts'
import {
  LEVEL_LABEL, LEVELS, TREND_LABEL, compositeScore, computeTrend, levelFromPercentile, rankAgainstHistory,
} from '../../shared/risk.ts'
import type { Logger } from '../lib/log.ts'
import { officialLevel } from './thresholds.ts'

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

/**
 * Which signal drives a pathogen's headline level, best first. Minnesota-wide, timely measures
 * outrank regional or lagging ones.
 */
const PRIMARY_PRIORITY: { metric: MetricKind; geo: string[] }[] = [
  { metric: 'ed_visit_pct', geo: ['state'] },
  { metric: 'test_positivity', geo: ['state'] },
  { metric: 'hosp_rate', geo: ['state'] },
  { metric: 'hosp_admissions', geo: ['state'] },
  { metric: 'wastewater_level', geo: ['state'] },
  { metric: 'ili_pct', geo: ['state'] },
  { metric: 'detection_rate', geo: ['census-region'] },
  { metric: 'test_positivity', geo: ['hhs-region'] },
  { metric: 'cases', geo: ['state'] },
]

/** Pathogens whose sub-type series roll up into a parent card. */
const PARENT: Partial<Record<PathogenId, PathogenId>> = { 'influenza-a': 'influenza', 'influenza-b': 'influenza' }

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

export function summarize(s: Series, now: string): SignalSummary | null {
  const last = lastObs(s)
  if (!last) return null
  const [date, value] = last
  const official = officialLevel(s, value)
  const rank = rankAgainstHistory(s.points, date, value)
  let level: ActivityLevel = 'unknown'
  let levelBasis = 'Not enough history to compare'
  const pub = s.official && (!s.official.asOf || s.official.asOf === date) ? s.official : undefined
  if (pub?.level) {
    level = pub.level
    levelBasis = `${pub.by ?? 'Publisher'} category${pub.label ? ` “${pub.label}”` : ''}`
  } else if (official) {
    level = official.level
    levelBasis = official.basis
  } else if (s.metric === 'ww_detections') {
    // Any detection of a rare target is notable; none means not detected that week.
    const tested = s.attrs?.plantsTestedLatestWeek ?? s.attrs?.sitesTested
    level = value > 0 ? 'moderate' : 'minimal'
    levelBasis =
      value > 0
        ? `Detected at ${value} wastewater site${value === 1 ? '' : 's'} in the latest week`
        : `Not detected in the latest week${tested ? ` (${tested} sites tested)` : ''}`
  } else if (rank) {
    level = levelFromPercentile(rank.percentile)
    const years = rank.n / 52
    levelBasis = `Compared with the past ${years >= 1.5 ? `${Math.round(years)} years` : `${rank.n} weeks`} of this measure (${ordinal(Math.round(rank.percentile))} percentile)`
  }
  const computed = computeTrend(s.points, { minFloor: s.unit === 'count' ? 5 : 0 })
  const trend = pub?.trend ?? computed.trend
  const change2w = computed.change2w
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
    change2w,
    percentile: rank ? Math.round(rank.percentile) : undefined,
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

/**
 * Measurement system a dataset belongs to. Series from the same system that describe the same
 * pathogen/metric/place are duplicates (e.g. NSSP ED % from the forecast hub and from data.cdc.gov);
 * series from different systems are distinct measures (e.g. NHSN admissions per 100k vs RESP-NET rates).
 */
export function measureFamily(dataset: string): string {
  if (/^nssp/.test(dataset)) return 'nssp'
  if (/^nhsn/.test(dataset)) return 'nhsn'
  return dataset
}

/** Series identity independent of source, used to de-duplicate and to match forecasts. */
export const seriesKey = (x: {
  pathogen: string
  metric: string
  geo: { type: string; code: string }
  age?: string
  dataset?: string
}) => [x.pathogen, x.metric, x.geo.type, x.geo.code, x.age ?? '', measureFamily(x.dataset ?? '')].join('|')

/** Forecasts carry no dataset; map their metric to the system the hubs forecast. */
const forecastKey = (f: Forecast) =>
  seriesKey({ ...f, dataset: f.metric === 'ed_visit_pct' ? 'nssp' : f.metric.startsWith('hosp') ? 'nhsn' : '' })

/** When two sources publish the same measure for the same place, prefer the one listed first. */
const SOURCE_PRIORITY = ['cdc-nssp', 'cdc-hubs', 'mdh', 'cdc-respnet', 'cdc-fluview', 'cdc-nwss', 'wastewaterscan']
const sourceRank = (src: string) => {
  const i = SOURCE_PRIORITY.indexOf(src)
  return i === -1 ? SOURCE_PRIORITY.length : i
}

function dedupe(series: Series[]): Series[] {
  const best = new Map<string, Series>()
  for (const s of series) {
    const k = seriesKey(s)
    const prev = best.get(k)
    if (!prev) best.set(k, s)
    else {
      const a = lastObs(prev)?.[0] ?? ''
      const b = lastObs(s)?.[0] ?? ''
      // Fresher data wins; on ties live data beats archived copies, then source priority decides.
      const archived = (x: Series) => (/archive/.test(x.dataset) ? 1 : 0)
      const better =
        b > a ||
        (b === a &&
          (archived(s) < archived(prev) ||
            (archived(s) === archived(prev) && sourceRank(s.source) < sourceRank(prev.source))))
      if (better) best.set(k, s)
    }
  }
  return [...best.values()]
}

function priorityOf(sig: SignalSummary): number {
  const i = PRIMARY_PRIORITY.findIndex((p) => p.metric === sig.metric && p.geo.includes(sig.geo.type))
  return i === -1 ? PRIMARY_PRIORITY.length : i
}

function outlookFrom(
  forecast: Forecast | undefined,
  latest: number,
  series: Series | undefined,
  pathogen: PathogenId,
): PathogenPulse['outlook'] {
  if (!forecast) return undefined
  const ahead = forecast.points.filter((p) => p.horizon >= 1)
  const target = ahead.find((p) => p.horizon === 3) ?? ahead[ahead.length - 1]
  if (!target) return undefined
  // Same "meaningful change" floor as the trend classifier.
  const vals = (series?.points ?? []).map((p) => p[1]).filter((v): v is number => v != null)
  const minFloor = series?.unit === 'count' ? 5 : 1e-9
  const floor = vals.length ? Math.max(minFloor, 0.015 * quantile(vals, 0.9)) : 1e-6
  const lr = Math.abs(target.median - latest) < floor ? 0 : Math.log((target.median + floor) / (latest + floor))
  let direction: TrendDirection = 'steady'
  if (lr >= Math.log(1.4)) direction = 'rising-fast'
  else if (lr >= Math.log(1.1)) direction = 'rising'
  else if (lr <= -Math.log(1.4)) direction = 'falling-fast'
  else if (lr <= -Math.log(1.1)) direction = 'falling'
  const who = forecast.source === 'mn-pulse' ? 'MN Pulse projection' : `CDC ${forecast.model}`
  const words: Record<TrendDirection, string> = {
    'rising-fast': 'is projected to rise sharply',
    rising: 'is projected to rise',
    steady: 'is projected to stay about the same',
    falling: 'is projected to decline',
    'falling-fast': 'is projected to decline sharply',
    unknown: 'has an uncertain outlook',
  }
  return {
    direction,
    text: `${nameOf(pathogen)} ${METRIC_SUBJECT[forecast.metric] ?? 'activity'} ${words[direction]} over the next ${target.horizon} week${target.horizon === 1 ? '' : 's'} (${who}).`,
    forecastId: forecast.id,
  }
}

const nameOf = (p: PathogenId) => pathogenShort(p)

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

function formatValue(sig: SignalSummary): string {
  if (sig.unit === '%') return `${sig.latestValue < 1 ? sig.latestValue.toFixed(2) : sig.latestValue.toFixed(1)}%`
  if (sig.unit === 'per100k') return `${sig.latestValue.toFixed(1)} per 100k`
  return Math.round(sig.latestValue).toLocaleString('en-US')
}

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
  outbreaks: 'reported outbreaks',
  deaths: 'reported deaths',
  ww_detections: 'wastewater detections',
  rt: 'estimated Rt',
}

function headlineFor(p: PathogenId, sig: SignalSummary | undefined, level: ActivityLevel, trend: TrendDirection) {
  if (!sig) return `${nameOf(p)}: no current data.`
  if (sig.metric === 'ww_detections') {
    return sig.latestValue > 0
      ? `${nameOf(p)} was detected in Minnesota wastewater at ${sig.latestValue} site${sig.latestValue === 1 ? '' : 's'} in the week ending ${sig.latestDate}.`
      : `${nameOf(p)} was not detected in Minnesota wastewater in the week ending ${sig.latestDate}.`
  }
  if (sig.metric === 'wastewater_conc' || sig.metric === 'wastewater_level') {
    const what = sig.label.split(' — ')[0]
    const lvl = level === 'unknown' ? 'reported' : LEVEL_LABEL[level].toLowerCase()
    const tr = trend === 'unknown' || level === 'unknown' ? '' : ` and ${TREND_LABEL[trend].toLowerCase()}`
    const scope = sig.attrs?.plants ? ` (${sig.attrs.plants} WastewaterSCAN plants)` : ''
    return `${what} levels in Minnesota wastewater are ${lvl}${tr}${scope}, week ending ${sig.latestDate}.`
  }
  if (level === 'unknown') {
    return `${nameOf(p)}: ${formatValue(sig)} ${METRIC_PHRASE[sig.metric]} in the week ending ${sig.latestDate} (not enough history to rate the level).`
  }
  const lvl = LEVEL_LABEL[level].toLowerCase()
  const tr = trend === 'unknown' ? '' : ` and ${TREND_LABEL[trend].toLowerCase()}`
  const where =
    sig.geo.type === 'census-region'
      ? ` (${sig.geo.name} region)`
      : sig.geo.type === 'hhs-region' || sig.geo.type === 'national'
        ? ` (${sig.geo.name})`
        : ''
  return `${nameOf(p)} activity is ${lvl}${tr}: ${formatValue(sig)} ${METRIC_PHRASE[sig.metric]}${where}, week ending ${sig.latestDate}.`
}

/**
 * Statewide rollups for measures published only per wastewater plant (e.g. WastewaterSCAN norovirus):
 * weekly median across plants (≥ 2 reporting), so the pathogen gets a Minnesota-level signal.
 * Plants with several series for the same measure (assay variants) are not rolled up.
 */
export function rollupSites(all: Series[]): Series[] {
  const groups = new Map<string, Series[]>()
  for (const s of all) {
    if (s.geo.type !== 'sewershed') continue
    const k = [s.source, s.dataset, s.pathogen, s.metric].join('|')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(s)
  }
  const out: Series[] = []
  for (const sites of groups.values()) {
    const first = sites[0]
    const codes = new Set(sites.map((x) => x.geo.code))
    if (codes.size !== sites.length || codes.size < 2) continue
    const exists = all.some(
      (x) => x.geo.type === 'state' && x.pathogen === first.pathogen && x.metric === first.metric && measureFamily(x.dataset) === measureFamily(first.dataset),
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
    const levels = reporting
      .map((x) => (x.official?.asOf === undefined || x.official.asOf === lastDate ? x.official?.level : undefined))
      .filter((l): l is ActivityLevel => !!l && l !== 'unknown')
      .map((l) => LEVELS.indexOf(l))
      .sort((a, b) => a - b)
    const derived: Series = {
      id: `${first.source}:${first.dataset}-mn:${first.pathogen}:${first.metric}:state:27`,
      source: first.source,
      dataset: `${first.dataset}-mn`,
      pathogen: first.pathogen,
      metric: first.metric,
      unit: first.unit,
      geo: { type: 'state', code: '27', name: 'Minnesota' },
      label: `${first.label.split(' — ')[0]} — wastewater, median of ${codes.size} Minnesota ${sourceNameOf(first)} plants`,
      points,
      note: `Weekly median across ${codes.size} wastewater plants (${sites.map((x) => x.geo.name.replace(/ \(.*\)$/, '')).join(', ')}). Covers only the communities these plants serve. ${first.note ?? ''}`.trim(),
      attrs: { derived: `median of ${reporting.length} reporting plants`, plants: String(codes.size) },
    }
    if (levels.length >= 2) {
      derived.official = {
        level: LEVELS[levels[Math.ceil((levels.length - 1) / 2)]],
        label: `median of ${levels.length} plant categories`,
        asOf: lastDate,
        by: sourceNameOf(first),
      }
    }
    out.push(derived)
  }
  return out
}

export function runAnalysis(
  files: SeriesFile[],
  sourceForecasts: Forecast[],
  ctx: AnalysisContext,
): { pulse: PulseFile; forecasts: Forecast[] } {
  const raw = dedupe(files.flatMap((f) => f.series))
  const all = [...raw, ...rollupSites(raw)]

  // 1) Our projections for state/regional series.
  const ours: Forecast[] = []
  for (const s of all) {
    if (!PROJECTABLE_GEOS.has(s.geo.type) || !PROJECTABLE_METRICS.has(s.metric)) continue
    const last = lastObs(s)
    if (!last || last[0] < addDays(ctx.now.slice(0, 10), -STALE_DAYS)) continue
    const r = project(s.points, {
      horizon: 4,
      max: PERCENT_METRICS.has(s.metric) ? 100 : undefined,
      origin: s.provisionalFrom ? addDays(s.provisionalFrom, -7) : undefined,
    })
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
  const byKey = new Map(all.map((s) => [seriesKey(s), s]))
  const matched = sourceForecasts
    .map((f) => {
      const s = byKey.get(forecastKey(f))
      return s ? { ...f, seriesId: s.id } : null
    })
    .filter((f): f is Forecast => !!f)
  const forecasts = [...matched, ...ours]
  ctx.log.info(`projections: ${ours.length} MN Pulse + ${matched.length}/${sourceForecasts.length} source forecasts matched`)

  // 2) Signals for non-county series.
  const signals = all
    .filter((s) => s.geo.type !== 'county' && s.geo.type !== 'sewershed' && !s.age)
    .map((s) => summarize(s, ctx.now))
    .filter((x): x is SignalSummary => !!x)

  // 3) Pathogen pulses.
  const byPathogen = new Map<PathogenId, SignalSummary[]>()
  for (const sig of signals) {
    const series = all.find((s) => s.id === sig.seriesId)!
    const key = PARENT[series.pathogen] ?? series.pathogen
    if (!byPathogen.has(key)) byPathogen.set(key, [])
    byPathogen.get(key)!.push(sig)
  }
  const pathogens: PathogenPulse[] = []
  for (const [pathogen, sigs] of byPathogen) {
    const ranked = [...sigs].sort((a, b) => {
      // Fresh MN signals first, then by priority, then by own-pathogen over sub-types.
      if (a.stale !== b.stale) return a.stale ? 1 : -1
      const pa = priorityOf(a)
      const pb = priorityOf(b)
      if (pa !== pb) return pa - pb
      const sa = all.find((s) => s.id === a.seriesId)!.pathogen === pathogen ? 0 : 1
      const sb = all.find((s) => s.id === b.seriesId)!.pathogen === pathogen ? 0 : 1
      return sa - sb
    })
    const primary = ranked.find((s) => !s.stale && s.geo.code !== 'US') ?? ranked[0]
    const level = primary && !primary.stale ? primary.level : 'unknown'
    const trend = primary && !primary.stale ? primary.trend : 'unknown'
    const fc =
      primary &&
      (forecasts.find((f) => f.seriesId === primary.seriesId && f.source !== 'mn-pulse') ??
        forecasts.find((f) => f.seriesId === primary.seriesId))
    pathogens.push({
      pathogen,
      level,
      trend,
      score: compositeScore(level, trend),
      headline: headlineFor(pathogen, primary, level, trend),
      primary,
      signals: ranked,
      outlook:
        primary && !primary.stale
          ? outlookFrom(fc, primary.latestValue, all.find((s) => s.id === primary.seriesId), pathogen)
          : undefined,
      asOf: primary?.latestDate,
    })
  }
  pathogens.sort((a, b) => b.score - a.score)

  // 4) Statewide summary from the respiratory big three.
  const resp = pathogens.filter((p) => ['influenza', 'covid', 'rsv', 'respiratory-combined'].includes(p.pathogen))
  const known = resp.filter((p) => p.level !== 'unknown')
  const stateLevel = known.reduce<ActivityLevel>(
    (best, p) => (LEVELS.indexOf(p.level) > LEVELS.indexOf(best) ? p.level : best),
    known.length ? 'minimal' : 'unknown',
  )
  const leader = [...known].sort((a, b) => b.score - a.score)[0]
  const watchList = pathogens.filter((p) => p.level !== 'unknown' && p.score >= 40).map((p) => p.pathogen)
  const BIG3: PathogenId[] = ['influenza', 'covid', 'rsv']
  const big3 = BIG3.map((id) => pathogens.find((p) => p.pathogen === id)).filter((p): p is PathogenPulse => !!p)
  const displayName = (p: PathogenPulse) =>
    p.primary && p.primary.metric.startsWith('wastewater') ? `${p.primary.label.split(' — ')[0]} (wastewater)` : nameOf(p.pathogen)
  const describe = (p: PathogenPulse) =>
    `${displayName(p)} ${LEVEL_LABEL[p.level].toLowerCase()}${p.trend === 'rising' || p.trend === 'rising-fast' ? ` and ${TREND_LABEL[p.trend].toLowerCase()}` : ''}`
  const others = pathogens.filter((p) => !BIG3.includes(p.pathogen) && p.pathogen !== 'respiratory-combined' && p.pathogen !== 'ili' && p.score >= 40)
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

function buildMap(all: Series[], now: string) {
  const layers = new Map<string, MapLayer>()
  const counties = new Map<string, CountyPulse>()
  const sites = new Map<string, SitePulse>()
  for (const s of all) {
    if (s.geo.type !== 'county' && s.geo.type !== 'sewershed') continue
    const sig = summarize(s, now)
    // Inactive sites/counties (no data in the last 4 weeks) are left off the map.
    if (!sig || sig.stale) continue
    const kind = s.geo.type === 'county' ? 'county' : 'site'
    const layerId = `${kind === 'site' ? 'site-' : ''}${METRIC_SHORT[s.metric] ?? s.metric}:${s.pathogen}`
    const layer = layers.get(layerId)
    if (!layer || (sig.latestDate > (layer.latestDate ?? ''))) {
      layers.set(layerId, {
        id: layerId,
        kind,
        label: `${nameOf(s.pathogen)} — ${METRIC_PHRASE[s.metric]}`,
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
