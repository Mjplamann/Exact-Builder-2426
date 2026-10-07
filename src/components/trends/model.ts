// Pure selection + summary logic for the Trends explorer. No React here so it stays easy to test.
//
// Nothing in this file invents numbers: every value shown comes from a published series or forecast,
// and the only derived figures (2-week change, level) use the same shared functions the pipeline uses.
import type {
  ActivityLevel, GeoRef, GeoType, Manifest, MetricKind, PathogenCategory, PathogenId, PulseFile, Series,
  SourceStatus, TrendDirection, Unit,
} from '../../../shared/types'
import { addDays, daysBetween } from '../../../shared/mmwr'
import { computeTrend, levelFromCuts, levelFromPercentile, rankAgainstHistory } from '../../../shared/risk'
import { getProfile, pathogenName } from '../../content'
import { aboutOneIn, formatChange, formatValue, METRIC_LABEL, TREND_LABEL } from '../../lib/format'
import type { GeoSelection } from '../../lib/state'
import { CONTEXT_PLACE_COLOR, SELECTED_PLACE_COLOR } from '../charts/chartTheme'
import { forecastSourceName, geoLabel } from './labels'

export { forecastSourceName, geoLabel }

// ───────────────────────── Metrics ─────────────────────────

export interface MetricTab {
  metric: MetricKind
  /** Tab label. */
  label: string
  /** Chart title fragment, e.g. "emergency department visits". */
  title: string
  /** What one value means, e.g. "% of all ED visits". */
  unitText: string
}

/** Tab order (only tabs with data are shown). */
export const METRIC_TABS: MetricTab[] = [
  { metric: 'ed_visit_pct', label: 'ED visits %', title: 'emergency department visits', unitText: '% of all emergency department visits' },
  { metric: 'hosp_admissions', label: 'Hospital admissions', title: 'hospital admissions', unitText: 'new hospital admissions per week' },
  { metric: 'hosp_rate', label: 'Hospitalization rate', title: 'hospitalization rate', unitText: 'admissions per 100,000 residents per week' },
  { metric: 'test_positivity', label: 'Lab positivity', title: 'lab test positivity', unitText: '% of lab tests positive' },
  { metric: 'detection_rate', label: 'BioFire detection rate', title: 'BioFire detection rate', unitText: '% of multi-germ panel tests detecting it' },
  { metric: 'wastewater_level', label: 'Wastewater', title: 'wastewater viral activity', unitText: 'wastewater viral activity level' },
  { metric: 'wastewater_conc', label: 'Wastewater concentration', title: 'wastewater concentration', unitText: 'normalized concentration in sewage' },
  { metric: 'ww_detections', label: 'Wastewater detections', title: 'wastewater detections', unitText: 'wastewater sites with a detection' },
  { metric: 'ili_pct', label: 'Flu-like illness visits', title: 'flu-like illness visits', unitText: '% of clinic visits for flu-like illness' },
  { metric: 'cases', label: 'Cases', title: 'reported cases', unitText: 'reported cases per week' },
  { metric: 'cases_ytd', label: 'Cases this year', title: 'cases so far this year', unitText: 'cases reported so far this calendar year' },
  { metric: 'outbreaks', label: 'Outbreaks', title: 'reported outbreaks', unitText: 'reported outbreaks per week' },
  { metric: 'deaths', label: 'Deaths', title: 'reported deaths', unitText: 'reported deaths per week' },
  { metric: 'rt', label: 'Rt', title: 'reproduction number (Rt)', unitText: 'new infections caused by each infection' },
]

export const METRIC_TAB: Record<MetricKind, MetricTab> = Object.fromEntries(METRIC_TABS.map((t) => [t.metric, t])) as Record<
  MetricKind,
  MetricTab
>

const metricRank = (m: MetricKind) => METRIC_TABS.findIndex((t) => t.metric === m)

/** Plain-language explanation of each measure for "About this measure". */
export const MEASURE_INFO: Record<MetricKind, { what: string; why: string }> = {
  ed_visit_pct: {
    what: 'The share of all emergency department (ER) visits where the patient was diagnosed with this illness.',
    why: 'ER visits react quickly when an illness starts spreading, so this is one of the earliest signs of a rise. Compare the line with its own past seasons rather than with other illnesses.',
  },
  hosp_admissions: {
    what: 'The number of people newly admitted to the hospital with a lab-confirmed infection each week, as reported by hospitals.',
    why: 'Shows how much severe illness there is and how busy hospitals are. It usually rises a week or two after ER visits.',
  },
  hosp_rate: {
    what: 'New hospital admissions per 100,000 residents per week. Dividing by population makes places of different sizes comparable.',
    why: 'Shows how much severe illness there is. Official activity levels for hospitalizations use this rate.',
  },
  test_positivity: {
    what: 'The share of laboratory tests for this germ that came back positive.',
    why: 'When a growing share of tests are positive, more of the people getting tested are actually infected — a sign of wider spread that depends less on how many tests are done.',
  },
  detection_rate: {
    what: 'The share of multi-germ panel tests (BioFire) on sick patients that found this germ, from anonymized results at participating hospitals and clinics.',
    why: 'Panels test for many germs at once, including ones that are not otherwise tracked, so they help show what is causing illness right now.',
  },
  wastewater_level: {
    what: 'How much of the virus is in sewage compared with that site’s usual levels. People shed virus whether or not they feel sick or get tested.',
    why: 'Wastewater can show a rise days before people visit a doctor, and it is not affected by who chooses to get tested.',
  },
  wastewater_conc: {
    what: 'The amount of the germ’s genetic material in sewage, adjusted for how much human waste is in the sample.',
    why: 'Can show a rise before people visit a doctor. Units differ between labs, so compare a site with its own past rather than with other sites.',
  },
  ww_detections: {
    what: 'The number of wastewater sites (or samples) where the germ was detected that week.',
    why: 'Shows whether the germ is present in communities at all — useful for uncommon germs where any detection matters.',
  },
  ili_pct: {
    what: 'The share of outpatient clinic visits for fever with cough or sore throat (influenza-like illness).',
    why: 'A long-running, consistent measure of flu-like illness that lets this season be compared with many past seasons.',
  },
  cases_ytd: {
    what: 'The running total of cases reported to public health so far this calendar year.',
    why: 'Shows how much disease has been reported this year. Because it only increases, use weekly measures to judge whether activity is rising or falling.',
  },
  cases: {
    what: 'The number of confirmed or probable cases reported to public health that week.',
    why: 'Shows where and when infections are being diagnosed. Many mild cases are never tested, so the true number of infections is higher.',
  },
  outbreaks: {
    what: 'The number of outbreaks (groups of linked cases, for example in a school or care facility) reported that week.',
    why: 'Outbreak reports show where the illness is spreading in group settings.',
  },
  deaths: {
    what: 'Deaths reported with this illness that week.',
    why: 'Shows the most severe outcomes. Reports often lag by several weeks, so recent weeks will rise as reports arrive.',
  },
  rt: {
    what: 'The effective reproduction number: about how many people each infected person goes on to infect.',
    why: 'Above 1 means the illness is spreading more; below 1 means it is shrinking. It is a modeled estimate with real uncertainty.',
  },
}

// ───────────────────────── Pathogens ─────────────────────────

export const CATEGORY_LABEL: Record<PathogenCategory, string> = {
  'respiratory-viral': 'Respiratory viruses',
  'respiratory-bacterial': 'Respiratory bacteria',
  gastrointestinal: 'Stomach and gut (GI)',
  'vaccine-preventable': 'Vaccine-preventable',
  'vector-borne': 'Tick- and mosquito-borne',
  zoonotic: 'From animals',
  syndrome: 'Combined illness measures',
}
const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as PathogenCategory[]

export const DEFAULT_PATHOGEN: PathogenId = 'influenza'

export function categoryOf(id: PathogenId): PathogenCategory {
  return getProfile(id)?.category ?? 'syndrome'
}

export interface PathogenGroup {
  category: PathogenCategory
  label: string
  options: { id: PathogenId; name: string }[]
}

/** Pathogens that have at least one series, grouped by category. */
export function pathogenGroups(all: Series[]): PathogenGroup[] {
  const ids = [...new Set(all.map((s) => s.pathogen))]
  const groups = new Map<PathogenCategory, PathogenGroup>()
  for (const id of ids) {
    const category = categoryOf(id)
    if (!groups.has(category)) groups.set(category, { category, label: CATEGORY_LABEL[category], options: [] })
    groups.get(category)!.options.push({ id, name: pathogenName(id) })
  }
  for (const g of groups.values()) g.options.sort((a, b) => a.name.localeCompare(b.name))
  return [...groups.values()].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
}

/** Metrics that have data for this pathogen, in tab order. */
export function metricsFor(all: Series[], pathogen: PathogenId): MetricKind[] {
  const set = new Set(all.filter((s) => s.pathogen === pathogen).map((s) => s.metric))
  return METRIC_TABS.map((t) => t.metric).filter((m) => set.has(m))
}

/** Age bands available for this pathogen + metric (age-specific series only). */
export function agesFor(all: Series[], pathogen: PathogenId, metric: MetricKind): string[] {
  const ages = new Set(all.filter((s) => s.pathogen === pathogen && s.metric === metric && s.age).map((s) => s.age as string))
  return [...ages].sort(compareAgeLabels)
}

function compareAgeLabels(a: string, b: string): number {
  const n = (x: string) => {
    const m = /(\d+)/.exec(x)
    return m ? Number(m[1]) : 999
  }
  return n(a) - n(b) || a.localeCompare(b)
}

// ───────────────────────── Geography ─────────────────────────

export const GEO_ORDER: GeoType[] = ['county', 'sewershed', 'mdh-district', 'mdh-region', 'state', 'hhs-region', 'census-region', 'national']

/** One-line explanation for regional geographies that include Minnesota. */
export function geoExplainer(g: GeoRef): string | undefined {
  if (g.type === 'hhs-region') return `${g.name} is the federal health region that includes Minnesota, Wisconsin, Michigan, Illinois, Indiana and Ohio.`
  if (g.type === 'census-region') return `The ${g.name} census region covers 12 states, including Minnesota.`
  if (g.type === 'national') return 'Numbers for the whole United States.'
  return undefined
}

/**
 * Line color for a place in a place comparison. The selected place is always the accent-blue line;
 * Minnesota, when another place is selected, is the gray context line; U.S. and regional comparisons
 * keep fixed level-safe slots (aqua, violet, magenta) so they never look like an activity level.
 */
export function geoColor(g: GeoRef, selected = false): string {
  if (selected) return SELECTED_PLACE_COLOR
  switch (g.type) {
    case 'state':
      return CONTEXT_PLACE_COLOR
    case 'national':
      return 'var(--series-3)'
    case 'hhs-region':
      return 'var(--series-7)'
    case 'census-region':
      return 'var(--series-5)'
    default:
      return CONTEXT_PLACE_COLOR
  }
}

// ───────────────────────── Series selection ─────────────────────────

/** When two sources publish the same measure for the same place, prefer fresher data, then this order. */
const SOURCE_PRIORITY = ['cdc-nssp', 'cdc-hubs', 'mdh', 'cdc-respnet', 'cdc-fluview', 'cdc-nwss', 'wastewaterscan']
const sourceRank = (src: string) => {
  const i = SOURCE_PRIORITY.indexOf(src)
  return i === -1 ? SOURCE_PRIORITY.length : i
}

export function lastObs(s: Series): [string, number] | null {
  for (let i = s.points.length - 1; i >= 0; i--) {
    const v = s.points[i][1]
    if (v != null && Number.isFinite(v)) return [s.points[i][0], v]
  }
  return null
}

export function bestOf(list: Series[]): Series | undefined {
  return [...list].sort((a, b) => {
    const da = lastObs(a)?.[0] ?? ''
    const db = lastObs(b)?.[0] ?? ''
    if (da !== db) return da < db ? 1 : -1
    const r = sourceRank(a.source) - sourceRank(b.source)
    if (r) return r
    return b.points.length - a.points.length
  })[0]
}

export interface Selection {
  /** The series drawn as the main line (undefined when nothing matches the current place). */
  primary?: Series
  /** Other series for the same measure and place (different publishers) the reader can switch to. */
  alternatives: Series[]
  /** Minnesota line shown alongside a county/region primary. */
  state?: Series
  /** National/regional series with the same unit, in a fixed order. */
  regional: Series[]
  /** Plain-language note about geography fallbacks. */
  geoNote?: string
  /**
   * Why places can't share an axis for this measure: weekly counts scale with population, and
   * wastewater concentrations use lab-specific units. Comparisons are left out in those cases.
   */
  comparisonBlocked?: 'count' | 'ratio'
  /** A county/region was asked for but has no data for this measure. */
  localMissing: boolean
  /** Only county-level series exist for this measure. */
  countyOnly: boolean
  /** Only per-plant (sewershed) series exist for this measure. */
  siteOnly: boolean
}

export function resolveSelection(
  all: Series[],
  opts: { pathogen: PathogenId; metric: MetricKind; age?: string; geo: GeoSelection; sourceId?: string },
): Selection {
  const pool = all.filter(
    (s) => s.pathogen === opts.pathogen && s.metric === opts.metric && (opts.age ? s.age === opts.age : !s.age),
  )
  const at = (type: GeoType, code?: string) => pool.filter((s) => s.geo.type === type && (!code || s.geo.code === code))
  const out: Selection = { alternatives: [], regional: [], localMissing: false, countyOnly: false, siteOnly: false }

  let group: Series[] = []
  const wantsLocal = opts.geo.type === 'county' || opts.geo.type === 'mdh-region'
  if (wantsLocal) {
    group = at(opts.geo.type, opts.geo.code)
    if (!group.length && opts.geo.type === 'county') {
      // Wastewater is measured per treatment plant: use the plants that serve this county.
      const fips = opts.geo.code
      group = at('sewershed').filter((s) => s.geo.counties?.includes(fips))
      if (group.length) {
        out.geoNote = `Wastewater is measured at treatment plants. ${group.length > 1 ? `${group.length} plants serve` : 'This plant serves'} part or all of ${geoLabel({ type: 'county', code: fips, name: fips })}.`
      }
    }
    if (!group.length) out.localMissing = true
  }
  if (!group.length) group = at('state', '27')
  if (!group.length) {
    for (const t of ['hhs-region', 'census-region', 'national'] as GeoType[]) {
      const cands = at(t)
      if (!cands.length) continue
      // Prefer the region that contains Minnesota.
      const mn = cands.filter((s) => (t === 'hhs-region' ? /(^|\D)5$/.test(s.geo.code.trim()) : t === 'census-region' ? /midwest/i.test(s.geo.code + s.geo.name) : true))
      group = mn.length ? mn : cands
      const g = group[0].geo
      out.geoNote =
        t === 'national'
          ? 'Minnesota-only numbers are not published for this measure, so the chart shows the United States.'
          : `Minnesota-only numbers are not published for this measure, so the chart shows ${g.name}, which includes Minnesota.`
      break
    }
  }
  if (!group.length) {
    out.countyOnly = pool.some((s) => s.geo.type === 'county')
    out.siteOnly = !out.countyOnly && pool.some((s) => s.geo.type === 'sewershed')
    return out
  }

  out.primary = group.find((s) => s.id === opts.sourceId) ?? bestOf(group)
  out.alternatives = group.length > 1 ? group : []
  const primary = out.primary!
  const sameUnit = (s: Series) => s.unit === primary.unit
  if (primary.unit === 'count' || primary.unit === 'ratio') {
    const others = pool.some((s) => s !== primary && s.geo.type !== primary.geo.type && s.geo.type !== 'county' && sameUnit(s))
    if (others) out.comparisonBlocked = primary.unit
    return out
  }

  if (primary.geo.type !== 'state' && primary.geo.type !== 'national' && primary.geo.type !== 'hhs-region' && primary.geo.type !== 'census-region') {
    out.state = bestOf(at('state', '27').filter(sameUnit))
  }
  for (const t of ['hhs-region', 'census-region', 'national'] as GeoType[]) {
    if (t === primary.geo.type) continue
    const s = bestOf(at(t).filter(sameUnit))
    if (s) out.regional.push(s)
  }
  return out
}

// ───────────────────────── Signal summaries ─────────────────────────

export interface SignalRow {
  series: Series
  label: string
  sourceName: string
  geo: string
  latestDate?: string
  latestValue?: number
  /** Relative change of the 3-week average vs. the 3-week average two weeks earlier (0.25 = +25%). */
  change2w?: number
  /** The same comparison as an absolute difference on the series' own scale. */
  change2wAbs?: number
  level: ActivityLevel
  trend: TrendDirection
  /** Publisher whose own trend call is shown (e.g. "CDC NSSP"), when the trend is theirs. */
  trendBy?: string
  /** The publisher's trend wording, verbatim (e.g. "No change", "Increasing"). */
  trendLabel?: string
  levelBasis: string
  stale: boolean
}

const STALE_DAYS = 28
const PARENT: Partial<Record<PathogenId, PathogenId>> = { 'influenza-a': 'influenza', 'influenza-b': 'influenza' }

export function sourceInfo(manifest: Manifest | undefined, id: string): SourceStatus | undefined {
  return manifest?.sources.find((s) => s.id === id)
}

/**
 * The two 3-week trailing means that `computeTrend` (shared/risk) compares: the latest three weeks and
 * the three weeks ending two weeks earlier. Mirrors its rules exactly so the absolute change shown
 * matches the percentage and the trend.
 */
export function trailingMeans(points: Series['points']): { now: number; before: number } | undefined {
  const vals = new Map<string, number>()
  for (const [d, v] of points) if (v != null && Number.isFinite(v)) vals.set(d, v)
  const dates = [...vals.keys()].sort()
  if (dates.length < 3) return undefined
  const last = dates[dates.length - 1]
  const smooth = (end: string) => {
    const xs = [0, 1, 2].map((k) => vals.get(addDays(end, -7 * k))).filter((x): x is number => x != null)
    return xs.length >= 2 ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined
  }
  const now = smooth(last)
  const before = smooth(addDays(last, -14))
  return now == null || before == null ? undefined : { now, before }
}

/** The publisher's own trend call for the latest week, when the series carries one. */
function publisherTrend(s: Series, latestDate: string | undefined): { trend: TrendDirection; by: string; label: string } | undefined {
  const o = s.official
  if (!o?.trend || (o.asOf && latestDate && o.asOf !== latestDate)) return undefined
  return { trend: o.trend, by: o.by ?? 'Publisher', label: o.label ?? TREND_LABEL[o.trend] }
}

/**
 * Latest value, 2-week change and level for one series. Uses the pipeline's own summary from
 * pulse.json when present; otherwise applies the same shared rules (official thresholds, then
 * the series' own history) in the browser.
 */
export function summarizeSeries(s: Series, pulse: PulseFile | undefined, manifest: Manifest | undefined, now: string): SignalRow {
  const sourceName = sourceInfo(manifest, s.source)?.name ?? s.source
  const base = { series: s, label: s.label, sourceName, geo: geoLabel(s.geo) }
  const means = s.metric === 'cases_ytd' ? undefined : trailingMeans(s.points)
  const change2wAbs = means ? Math.round((means.now - means.before) * 1e6) / 1e6 : undefined
  const sig = pulse?.pathogens.flatMap((p) => p.signals).find((x) => x.seriesId === s.id)
  if (sig) {
    const pubT = publisherTrend(s, sig.latestDate)
    return {
      ...base,
      latestDate: sig.latestDate,
      latestValue: sig.latestValue,
      change2w: sig.change2w,
      change2wAbs: sig.change2w == null ? undefined : change2wAbs,
      level: s.metric === 'rt' ? 'unknown' : sig.level,
      trend: sig.trend,
      trendBy: pubT && pubT.trend === sig.trend ? pubT.by : undefined,
      trendLabel: pubT && pubT.trend === sig.trend ? pubT.label : undefined,
      levelBasis: sig.levelBasis,
      stale: sig.stale,
    }
  }
  const last = lastObs(s)
  if (!last) return { ...base, level: 'unknown', trend: 'unknown', levelBasis: 'No recent data', stale: true }
  const [date, value] = last
  let level: ActivityLevel = 'unknown'
  let levelBasis = 'Not enough history to compare'
  const pub = s.official && (!s.official.asOf || s.official.asOf === date) ? s.official : undefined
  const pubT = publisherTrend(s, date)
  if (s.metric === 'rt') {
    // Rt is the direction of spread, not the amount of illness: a trend, never an activity level.
    levelBasis = 'Rt shows direction of spread, not amount'
  } else if (s.metric === 'cases_ytd') {
    levelBasis = 'Year-to-date count (no activity level)'
  } else if (pub?.level && pub.level !== 'unknown') {
    level = pub.level
    levelBasis = `${pub.by ?? 'Publisher'} category${pub.label ? ` “${pub.label}”` : ''}`
  } else if (s.thresholds) {
    const t = s.thresholds
    level = levelFromCuts(value, [t.low, t.moderate, t.high, t.veryHigh])
    levelBasis = t.by
  } else {
    const rank = rankAgainstHistory(s.points, date, value)
    if (rank) {
      level = levelFromPercentile(rank.percentile)
      levelBasis = `Compared with the past ${rank.n >= 78 ? `${Math.round(rank.n / 52)} years` : `${rank.n} weeks`} of this measure`
    }
  }
  const computed = computeTrend(s.points, { minFloor: s.unit === 'count' ? 5 : 0 })
  const ytd = s.metric === 'cases_ytd'
  return {
    ...base,
    latestDate: date,
    latestValue: value,
    change2w: ytd ? undefined : computed.change2w,
    change2wAbs: ytd || computed.change2w == null ? undefined : change2wAbs,
    level,
    trend: ytd ? 'unknown' : (pubT?.trend ?? (s.metric === 'rt' ? 'unknown' : computed.trend)),
    trendBy: pubT?.by,
    trendLabel: pubT?.label,
    levelBasis,
    stale: date < addDays(now.slice(0, 10), -STALE_DAYS),
  }
}

/**
 * How to show the 2-week change next to a trend. The percentage compares 3-week averages, so it is
 * hidden where it would contradict what the reader sees: when the latest week is 0, or when the trend is
 * Steady although the percentage is large (a tiny base, below the small-change floor). The absolute
 * change of the same averages is shown instead.
 */
export function changeDisplay(r: Pick<SignalRow, 'change2w' | 'change2wAbs' | 'latestValue' | 'trend' | 'series'>): {
  text: string
  kind: 'pct' | 'abs' | 'none'
} {
  // Rt is itself a rate of spread; a percentage change of it reads as a contradiction next to "Growing".
  if (r.series.metric === 'rt') return { text: '—', kind: 'none' }
  if (r.change2w == null || !Number.isFinite(r.change2w)) return { text: '—', kind: 'none' }
  const pctContradicts = r.latestValue === 0 || (r.trend === 'steady' && Math.abs(Math.round(r.change2w * 100)) >= 10)
  if (!pctContradicts) return { text: formatChange(r.change2w), kind: 'pct' }
  if (r.change2wAbs == null || !Number.isFinite(r.change2wAbs)) return { text: '—', kind: 'none' }
  return { text: formatAbsChange(r.change2wAbs, r.series.unit), kind: 'abs' }
}

/** Signed absolute change on a series' scale: "+0.05 pts", "−1.2 per 100k", "+3". */
export function formatAbsChange(d: number, unit: Unit): string {
  if (!Number.isFinite(d)) return '—'
  if (d === 0) return 'no change'
  const sign = d > 0 ? '+' : '−'
  const v = formatValue(Math.abs(d), unit)
  if (unit === '%') return `${sign}${v.replace('%', '')} pts`
  return `${sign}${v}${unit === 'per100k' ? ' per 100k' : ''}`
}

/** "CDC NSSP trend: No change" — the publisher's own trend call, verbatim. */
export function publisherTrendText(r: Pick<SignalRow, 'trendBy' | 'trendLabel'>): string | undefined {
  if (!r.trendBy || !r.trendLabel) return undefined
  return `${r.trendBy} trend: ${r.trendLabel}`
}

/** Every all-ages series for the pathogen (and its sub-types) outside county/sewershed level, plus the selected county. */
export function signalRows(
  all: Series[],
  pathogen: PathogenId,
  geo: GeoSelection,
  pulse: PulseFile | undefined,
  manifest: Manifest | undefined,
  now: string,
): SignalRow[] {
  const rows = all
    .filter((s) => (s.pathogen === pathogen || PARENT[s.pathogen] === pathogen) && !s.age)
    .filter((s) => {
      if (s.geo.type === 'sewershed') return false
      if (s.geo.type === 'county' || s.geo.type === 'mdh-region') return geo.type === s.geo.type && geo.code === s.geo.code
      return true
    })
    .map((s) => summarizeSeries(s, pulse, manifest, now))
  return rows.sort(
    (a, b) =>
      (a.series.pathogen === pathogen ? 0 : 1) - (b.series.pathogen === pathogen ? 0 : 1) ||
      GEO_ORDER.indexOf(a.series.geo.type) - GEO_ORDER.indexOf(b.series.geo.type) ||
      metricRank(a.series.metric) - metricRank(b.series.metric) ||
      a.label.localeCompare(b.label),
  )
}

/** Geographies listed behind a disclosure in the signals table (finer than the selected place). */
const SUB_STATE: GeoType[] = ['mdh-district', 'sewershed']

const SUB_GEO_NAME: Partial<Record<GeoType, string>> = { 'mdh-district': 'MDH district', sewershed: 'treatment plant' }

/**
 * A series label without its leading illness name, e.g. "Flu — % of ED visits (NSSP)" → "% of ED visits
 * (NSSP)", "Influenza A — wastewater…" → "Wastewater…". The table groups rows by measure and tags sub-types,
 * so the prefix only adds noise (and its spelling varies by source).
 */
export function measureLabel(label: string): string {
  const m = /^([^—:%]{2,32}?)\s*(?:—|:|–)\s+(.+)$/.exec(label)
  const rest = m ? m[2] : label
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

export interface SignalSubGroup {
  key: string
  /** e.g. "Flu A wastewater by MDH district". */
  label: string
  rows: SignalRow[]
}

export interface SignalGroup {
  metric: MetricKind
  /** Measure heading, e.g. "Emergency department visits". */
  title: string
  rows: SignalRow[]
  /** Sub-state geographies, collapsed by default. */
  subgroups: SignalSubGroup[]
}

/** Group signal rows by measure (tab order); sub-state rows go into collapsed sub-groups per sub-type. */
export function groupSignalRows(rows: SignalRow[], pathogen: PathogenId): SignalGroup[] {
  const groups = new Map<MetricKind, SignalGroup>()
  for (const r of rows) {
    const m = r.series.metric
    if (!groups.has(m)) groups.set(m, { metric: m, title: METRIC_LABEL[m] ?? METRIC_TAB[m]?.label ?? m, rows: [], subgroups: [] })
    const g = groups.get(m)!
    if (!SUB_STATE.includes(r.series.geo.type)) {
      g.rows.push(r)
      continue
    }
    const sub = r.series.pathogen !== pathogen ? `${pathogenName(r.series.pathogen)} ` : ''
    const key = `${m}|${r.series.geo.type}|${r.series.pathogen}|${r.series.source}`
    let sg = g.subgroups.find((x) => x.key === key)
    if (!sg) {
      sg = { key, label: `${sub}${METRIC_LABEL[m]?.toLowerCase() ?? m} by ${SUB_GEO_NAME[r.series.geo.type] ?? r.series.geo.type}`, rows: [] }
      g.subgroups.push(sg)
    }
    sg.rows.push(r)
  }
  for (const g of groups.values()) {
    for (const sg of g.subgroups) sg.label = `${sg.label.charAt(0).toUpperCase()}${sg.label.slice(1)}`
  }
  return [...groups.values()].sort((a, b) => metricRank(a.metric) - metricRank(b.metric))
}

// ───────────────────────── Forecasts ─────────────────────────

/** Whole weeks between the last observed week and a forecast target week. */
export function weeksAhead(lastDate: string | undefined, target: string): number | undefined {
  if (!lastDate) return undefined
  return Math.round(daysBetween(lastDate, target) / 7)
}

// ───────────────────────── Plain-language numbers ─────────────────────────

/** An absolute amount on a series' scale, e.g. "0.37 percentage points" or "40 admissions". */
export function formatAmount(v: number, unit: Unit, metric: MetricKind): string {
  if (!Number.isFinite(v)) return '—'
  switch (unit) {
    case '%':
      return `${v < 1 ? v.toFixed(2) : v.toFixed(1)} percentage point${v === 1 ? '' : 's'}`
    case 'per100k':
      return `${v < 1 ? v.toFixed(2) : v.toFixed(1)} per 100,000 residents`
    case 'count': {
      const n = Math.round(v).toLocaleString('en-US')
      const noun = metric === 'hosp_admissions' ? 'admissions' : metric === 'cases' ? 'cases' : metric === 'deaths' ? 'deaths' : ''
      return noun ? `${n} ${noun}` : n
    }
    default:
      return v < 1 ? v.toFixed(2) : v.toFixed(1)
  }
}

/** Pathogen name for use mid-sentence: "flu", "norovirus", but "COVID-19", "RSV", "Salmonella". */
export function sentenceName(id: PathogenId): string {
  const name = pathogenName(id)
  if (/^Flu\b/.test(name)) return `flu${name.slice(3)}`
  if (/[A-Z]/.test(name.slice(1))) return name
  const kind = getProfile(id)?.kind
  if (kind && kind !== 'virus' && kind !== 'syndrome') return name
  return name.charAt(0).toLowerCase() + name.slice(1)
}

export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * One plain sentence describing what the latest value means for an average person.
 * `who` is the mid-sentence pathogen name (see sentenceName).
 */
export function plainMeaning(s: Series, value: number, who: string): string {
  return capFirst(meaningOf(s, value, who))
}

function meaningOf(s: Series, value: number, who: string): string {
  const where = geoLabel(s.geo)
  // The one natural-frequency phrasing used across the app ("about 1 in 400", "about 6 in 10").
  const ratio = aboutOneIn(value)
  switch (s.metric) {
    case 'ed_visit_pct':
      if (value <= 0) return `Almost no emergency department visits in ${where} were for ${who} that week.`
      return ratio
        ? `${ratio} emergency department visits in ${where} were for ${who} that week.`
        : `${value.toFixed(0)}% of emergency department visits in ${where} were for ${who} that week.`
    case 'test_positivity':
      if (value <= 0) return `Almost no lab tests for ${who} came back positive that week.`
      return ratio ? `${ratio} lab tests for ${who} came back positive that week.` : `${value.toFixed(0)}% of lab tests for ${who} came back positive that week.`
    case 'detection_rate':
      if (value <= 0) return `${who} was almost never found in multi-germ panel tests that week.`
      return ratio
        ? `${who} was found in ${ratio} multi-germ panel tests on sick patients that week.`
        : `${who} was found in ${value.toFixed(0)}% of multi-germ panel tests on sick patients that week.`
    case 'ili_pct':
      return ratio ? `${ratio} clinic visits in ${where} were for flu-like illness that week.` : `${value.toFixed(1)}% of clinic visits were for flu-like illness that week.`
    case 'hosp_admissions': {
      const n = Math.round(value)
      return `${n.toLocaleString('en-US')} ${n === 1 ? 'person was' : 'people were'} newly admitted to the hospital with ${who} in ${where} that week.`
    }
    case 'hosp_rate': {
      if (value >= 1) return `About ${value.toFixed(1)} of every 100,000 residents of ${where} were admitted to the hospital with ${who} that week.`
      const perMillion = Math.round(value * 10)
      return perMillion >= 1
        ? `About ${perMillion} of every 1 million residents of ${where} were admitted to the hospital with ${who} that week.`
        : `Fewer than 1 in every 1 million residents of ${where} were admitted to the hospital with ${who} that week.`
    }
    case 'wastewater_level':
      return `Wastewater viral activity for ${who} in ${where} was ${value.toFixed(1)}${s.official?.label ? ` (“${s.official.label}”)` : ''} that week.`
    case 'wastewater_conc':
      return `Sewage samples in ${where} contained this much ${who} genetic material, adjusted for waste content. Compare it with this place’s own past values.`
    case 'ww_detections':
      return `${who} was detected at ${Math.round(value)} wastewater site${Math.round(value) === 1 ? '' : 's'} that week.`
    case 'cases':
      return `${Math.round(value).toLocaleString('en-US')} ${who} case${Math.round(value) === 1 ? ' was' : 's were'} reported in ${where} that week.`
    case 'cases_ytd':
      return `${Math.round(value).toLocaleString('en-US')} ${who} case${Math.round(value) === 1 ? ' has' : 's have'} been reported in ${where} so far this year.`
    case 'outbreaks':
      return `${Math.round(value)} ${who} outbreak${Math.round(value) === 1 ? ' was' : 's were'} reported in ${where} that week.`
    case 'deaths':
      return `${Math.round(value)} death${Math.round(value) === 1 ? ' was' : 's were'} reported with ${who} in ${where} that week.`
    case 'rt':
      if (s.official?.label) return `${s.official.label}: each infection is estimated to lead to about ${value.toFixed(2)} more.`
      return value > 1
        ? `Each infection is estimated to lead to about ${value.toFixed(2)} more, so ${who} is likely growing.`
        : `Each infection is estimated to lead to about ${value.toFixed(2)} more, so ${who} is likely not growing.`
  }
}
