// Gathers every published signal for one illness and arranges it for the illness page: one chart per
// measure (led by a single series, with the selected county and the U.S. for comparison), the other series
// of that measure as compact tiles, age charts, and a one-line note for measures that stopped updating.
// Nothing here creates values: every number shown traces to a Series point or a pulse SignalSummary.
import type {
  ActivityLevel, AgeGroupId, Forecast, MetricKind, PathogenId, Point, Series, SignalSummary, TrendDirection, Unit,
} from '../../../shared/types'
import { addDays } from '../../../shared/mmwr'
import { measureFamily } from '../../../shared/dedupe'
import type { DashboardData } from '../../lib/data'
import { pathogenName } from '../../content'
import { METRIC_LABEL } from '../../lib/format'
import { lastPoint, preferredForecast } from '../../lib/series'
import type { GeoSelection } from '../../lib/state'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { seriesVar } from '../charts/chartTheme'
import { ageGroupOf, METRIC_ORDER, pickAgeBands, publisherLabel, relatedIds, pulseFor, summaryOf } from './meta'

/** Measures with no new value for this long are collapsed into a one-line note instead of a chart. */
export const STALE_WEEKS = 8

/** Sources that republish other publishers' data (e.g. the CDC forecast hubs' copies of NSSP and NHSN). */
const MIRROR_SOURCES = new Set(['cdc-hubs'])

export interface Entry {
  series: Series
  signal?: SignalSummary
  name: string
  color?: string
  muted: boolean
  /** Weekly admissions count matching a per-100k rate entry (same source, place and week). */
  count?: Series
}

export interface SignalGroup {
  key: string
  metric: MetricKind
  unit: Unit
  /** Card heading, e.g. "Emergency department visits" or "Statewide wastewater (WastewaterSCAN, 4 plants)". */
  title: string
  /** Short line under the heading (what the axis measures and, for derived series, what it covers). */
  subtitle: string
  /** The series that leads this measure: drawn first, quoted in the summary, used for the tile. */
  lead: Entry
  /** Lines drawn on the chart: the lead, the county selected on the Map, and the U.S. (muted). */
  entries: Entry[]
  /** Other series of the same measure (other systems, sub-types or regions), shown as compact tiles. */
  alternates: Entry[]
  /** Series of this measure left off the page (all are on the Trends page). */
  hidden: number
  forecasts: Forecast[]
  showThresholds: boolean
  /** Holds the illness's pulse primary signal. */
  primary: boolean
}

export interface AgeGroupChart {
  key: string
  pathogen: PathogenId
  metric: MetricKind
  unit: Unit
  entries: (Entry & { group?: AgeGroupId; highlight: boolean })[]
  /** True when one band matches the selected audience and the others are de-emphasized. */
  emphasis: boolean
}

export interface StaleNote {
  key: string
  /** Measure, e.g. "Outbreaks". */
  title: string
  /** Series name, e.g. "Minnesota (MDH)". */
  name: string
  source: string
  /** Latest week with a value. */
  date: string
}

export interface Latest {
  date: string
  value: number
  level?: ActivityLevel
  trend?: TrendDirection
  basis?: string
  /** Publisher's own wording for the latest week (never an MN Pulse summary). */
  officialLabel?: string
  /** MN Pulse's plain-language fact derived from the source (Series.summary). */
  summary?: string
  stale?: boolean
}

/** Latest value for an entry, preferring the pulse analysis (which carries level/trend). */
export function latestOf(e: Pick<Entry, 'series' | 'signal'>): Latest | undefined {
  const s = e.signal
  const off = e.series.official
  const summary = summaryOf(e.series)
  if (s) {
    return {
      date: s.latestDate,
      value: s.latestValue,
      level: s.level,
      trend: s.trend,
      basis: s.levelBasis,
      officialLabel: !off?.asOf || off.asOf === s.latestDate ? publisherLabel(e.series) : undefined,
      summary,
      stale: s.stale,
    }
  }
  const lp = lastPoint(e.series.points)
  if (!lp) return undefined
  const offApplies = off && (!off.asOf || off.asOf === lp[0])
  return {
    date: lp[0],
    value: lp[1],
    level: offApplies ? off?.level : undefined,
    trend: offApplies ? off?.trend : undefined,
    basis: offApplies && off?.by && publisherLabel(e.series) ? off.by : undefined,
    officialLabel: offApplies ? publisherLabel(e.series) : undefined,
    summary,
  }
}

/** The last 16 weeks of an entry, for sparklines. */
export function sparkOf(e: Pick<Entry, 'series' | 'signal'>): Point[] {
  return e.signal?.spark?.length ? e.signal.spark : e.series.points.slice(-16)
}

const GEO_RANK: Record<string, number> = { state: 0, county: 1, 'mdh-region': 2, 'hhs-region': 3, 'census-region': 4, national: 9 }

function geoLabel(s: Series): string {
  const g = s.geo
  if (g.type === 'national') return 'U.S. (for comparison)'
  if (g.type === 'state') return g.name || 'Minnesota'
  if (g.type === 'county') return MN_COUNTY_BY_FIPS[g.code] ? `${MN_COUNTY_BY_FIPS[g.code].name} County` : g.name
  if (g.type === 'hhs-region') return g.name || `HHS ${g.code}`
  return g.name || g.code
}

/** Dataset abbreviation from a label's trailing parentheses ("… (NSSP)" → "NSSP"), else the dataset id. */
export const datasetAbbr = (s: Series) => s.label.match(/\(([^()]+)\)\s*$/)?.[1] ?? s.dataset

const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Statewide medians MN Pulse derives from a handful of plants ("median of 4 plants"). */
const plantsOf = (s: Series) => (s.attrs?.derived && s.attrs?.plants ? Number(s.attrs.plants) : undefined)

/**
 * Line / tile name: what is measured when it differs from the page ("Flu A", "Norovirus GII") and where
 * ("Minnesota", "median of 4 MN plants", "HHS Region 5 (…)").
 */
function entryName(s: Series, pageId: PathogenId): string {
  const what = s.metric.startsWith('wastewater')
    ? s.label.split(' — ')[0].replace(/\s*\(.*\)$/, '')
    : s.pathogen !== pageId
      ? pathogenName(s.pathogen)
      : ''
  const plants = plantsOf(s)
  const where = plants ? `median of ${plants} MN plants` : geoLabel(s)
  return capFirst([what, where].filter(Boolean).join(', '))
}

function groupTitle(metric: MetricKind, lead: Series): string {
  if (metric === 'wastewater_conc') {
    const plants = plantsOf(lead)
    if (lead.source === 'wastewaterscan' && plants) return `Statewide wastewater (WastewaterSCAN, ${plants} plants)`
    if (lead.source === 'mdh') return 'Wastewater (MDH monitoring)'
    return `Wastewater (${datasetAbbr(lead)})`
  }
  if (metric === 'wastewater_level' && lead.source === 'cdc-nwss') return 'Wastewater activity (CDC NWSS)'
  return METRIC_LABEL[metric]
}

/**
 * Drop copies of a measure republished by a mirror source (e.g. CDC NSSP ER visits via the forecast hubs) when the
 * original publisher's series of the same measurement system, place and age is present. Different systems that
 * share a metric (NHSN admissions vs RESP-NET rates) are distinct measures and are both kept.
 */
function dropMirrors(list: Series[]): Series[] {
  const key = (s: Series) => [s.pathogen, s.metric, s.unit, s.geo.type, s.geo.code, s.age ?? '', measureFamily(s.dataset)].join('|')
  const original = new Set(list.filter((s) => !MIRROR_SOURCES.has(s.source)).map(key))
  return list.filter((s) => !MIRROR_SOURCES.has(s.source) || !original.has(key(s)))
}

/** Measures whose values are only comparable within one source (concentrations depend on lab and method). */
const groupKeyOf = (s: Series) => (s.metric === 'wastewater_conc' ? `${s.metric}|${s.unit}|${s.source}` : `${s.metric}|${s.unit}`)

export interface BuildResult {
  /** One per measure, the pulse primary measure first. */
  groups: SignalGroup[]
  ages: AgeGroupChart[]
  /** Pulse signals that have no series file (shown as tiles with their latest figure). */
  orphans: { signal: SignalSummary; pathogen: PathogenId }[]
  /** Measures with no new value in the last STALE_WEEKS weeks (one-line note). */
  stale: StaleNote[]
  /** Map layers exist for this illness (county or wastewater-plant detail on the Map). */
  hasMap: boolean
  /** A county is selected and has its own series on this page. */
  countyName?: string
}

export function buildSignals(
  data: DashboardData | undefined,
  id: PathogenId,
  geo: GeoSelection,
  audience: AgeGroupId,
): BuildResult {
  const empty: BuildResult = { groups: [], ages: [], orphans: [], stale: [], hasMap: false }
  if (!data) return empty
  const ids = relatedIds(id)
  const pulseEntries = data.pulse.pathogens.filter((p) => ids.includes(p.pathogen))
  const signalById = new Map<string, SignalSummary>()
  for (const p of pulseEntries) for (const s of p.signals) signalById.set(s.seriesId, s)
  const pulse = pulseFor(data.pulse, id)
  const primaryId = pulse?.primary?.seriesId
  const primaryMetric = pulse?.primary?.metric

  const ref = (data.manifest.generatedAt || data.pulse.generatedAt || new Date().toISOString()).slice(0, 10)
  const cutoff = addDays(ref, -7 * STALE_WEEKS)
  const isFresh = (s: Series) => s.id === primaryId || (lastPoint(s.points)?.[0] ?? '') >= cutoff

  const usable = dropMirrors(data.series.filter((s) => ids.includes(s.pathogen) && s.points.some((p) => p[1] != null)))
  const county = geo.type === 'county' ? geo.code : undefined
  const keepGeo = (s: Series) =>
    s.geo.type === 'state' ||
    s.geo.type === 'hhs-region' ||
    s.geo.type === 'census-region' ||
    s.geo.type === 'national' ||
    (s.geo.type === 'county' && s.geo.code === county)

  const allAges = usable.filter((s) => !!s.age && keepGeo(s) && s.geo.type !== 'national' && isFresh(s))
  const overall = usable.filter((s) => !s.age && keepGeo(s))

  // ── group all-ages series by measure ──
  const byKey = new Map<string, Series[]>()
  for (const s of overall) {
    const k = groupKeyOf(s)
    byKey.set(k, [...(byKey.get(k) ?? []), s])
  }

  // Fold weekly admission counts into the matching per-100k rate (same data, two scales).
  const rateKey = 'hosp_rate|per100k'
  const countKey = 'hosp_admissions|count'
  const countFor = new Map<string, Series>()
  if (byKey.has(rateKey) && byKey.has(countKey)) {
    const rates = byKey.get(rateKey)!
    const remaining: Series[] = []
    for (const c of byKey.get(countKey)!) {
      const r = rates.find(
        (x) => x.pathogen === c.pathogen && x.geo.type === c.geo.type && x.geo.code === c.geo.code && x.source === c.source && x.dataset === c.dataset,
      )
      if (r) countFor.set(r.id, c)
      else remaining.push(c)
    }
    if (remaining.length) byKey.set(countKey, remaining)
    else byKey.delete(countKey)
  }

  const stale: StaleNote[] = []
  const groups: SignalGroup[] = []
  const entryOf = (s: Series, extra: Partial<Entry> = {}): Entry => ({
    series: s,
    signal: signalById.get(s.id),
    name: entryName(s, id),
    muted: false,
    count: countFor.get(s.id),
    ...extra,
  })

  for (const [key, list] of byKey) {
    const [metric, unit] = key.split('|') as [MetricKind, Unit]
    // Counts are not comparable across places of different size: keep national counts off MN charts.
    const members = (unit === 'count' ? list.filter((s) => s.geo.type !== 'national') : list).sort(
      (a, b) =>
        (a.id === primaryId ? -1 : 0) - (b.id === primaryId ? -1 : 0) ||
        (GEO_RANK[a.geo.type] ?? 5) - (GEO_RANK[b.geo.type] ?? 5) ||
        ids.indexOf(a.pathogen) - ids.indexOf(b.pathogen) ||
        // Publisher-defined activity levels, then a pulse summary, then the newest data lead the measure.
        (b.thresholds ? 1 : 0) - (a.thresholds ? 1 : 0) ||
        (signalById.has(b.id) ? 1 : 0) - (signalById.has(a.id) ? 1 : 0) ||
        (lastPoint(b.points)?.[0] ?? '').localeCompare(lastPoint(a.points)?.[0] ?? '') ||
        (MIRROR_SOURCES.has(a.source) ? 1 : 0) - (MIRROR_SOURCES.has(b.source) ? 1 : 0) ||
        a.source.localeCompare(b.source) ||
        a.id.localeCompare(b.id),
    )
    const local = members.filter((s) => s.geo.type !== 'national')
    for (const s of local.filter((x) => !isFresh(x))) {
      stale.push({ key: s.id, title: groupTitle(metric, s), name: entryName(s, id), source: s.source, date: lastPoint(s.points)?.[0] ?? '' })
    }
    const fresh = local.filter(isFresh)
    // Only national (or only stale) lines → nothing current and Minnesota-specific to chart for this measure.
    if (!fresh.length) continue
    const leadS = fresh.find((s) => s.geo.type !== 'county') ?? fresh[0]
    const countyS = fresh.find((s) => s.geo.type === 'county' && s.pathogen === leadS.pathogen && s !== leadS)
    const usS = members.find((s) => s.geo.type === 'national' && s.pathogen === leadS.pathogen && isFresh(s))
    const altS = fresh.filter((s) => s !== leadS && s !== countyS)

    let slot = 0
    const lead = entryOf(leadS, { color: seriesVar(++slot) })
    const entries: Entry[] = [lead]
    if (countyS) {
      // A county line from another system (e.g. MDH RESP-NET next to NHSN) says so in its name.
      const other = countyS.source !== leadS.source
      entries.push(entryOf(countyS, { color: seriesVar(++slot), name: `${entryName(countyS, id)}${other ? ` (${datasetAbbr(countyS)})` : ''}` }))
    }
    if (usS) entries.push(entryOf(usS, { name: 'U.S. (for comparison)', muted: true }))
    const alternates = altS.slice(0, 6).map((s) => entryOf(s))
    const charted = new Set([leadS, countyS, usS, ...altS.slice(0, 6)].filter(Boolean))
    const forecasts = entries
      .filter((e) => !e.muted)
      .map((e) => preferredForecast(data.forecasts.forecasts, e.series))
      .filter((f): f is Forecast => !!f)
    const plants = plantsOf(leadS)
    groups.push({
      key,
      metric,
      unit,
      title: groupTitle(metric, leadS),
      subtitle: plants
        ? `Median of the ${plants} Minnesota plants WastewaterSCAN tests${leadS.attrs?.metroPlants === '0' ? ' (none in the Twin Cities metro)' : ''}`
        : '',
      lead,
      entries,
      alternates,
      hidden: members.filter((s) => !charted.has(s) && isFresh(s)).length,
      forecasts,
      showThresholds: !!leadS.thresholds,
      primary: leadS.id === primaryId,
    })
  }
  const rank = (g: SignalGroup) => (g.primary ? -2 : g.metric === primaryMetric ? -1 : METRIC_ORDER.indexOf(g.metric))
  groups.sort((a, b) => rank(a) - rank(b) || (b.lead.signal ? 1 : 0) - (a.lead.signal ? 1 : 0))

  // ── age-specific charts ──
  const ageKeyMap = new Map<string, Series[]>()
  for (const s of allAges) {
    const k = `${s.pathogen}|${s.metric}|${s.unit}|${s.geo.type}|${s.geo.code}|${s.source}`
    ageKeyMap.set(k, [...(ageKeyMap.get(k) ?? []), s])
  }
  const ages: AgeGroupChart[] = []
  for (const [key, list] of ageKeyMap) {
    const bands = pickAgeBands(list)
    if (bands.length < 2) continue
    const groupsOf = bands.map((s) => ageGroupOf(s))
    const emphasis = groupsOf.includes(audience)
    ages.push({
      key,
      pathogen: bands[0].pathogen,
      metric: bands[0].metric,
      unit: bands[0].unit,
      emphasis,
      entries: bands.map((s, i) => {
        const g = groupsOf[i]
        const highlight = emphasis && g === audience
        return {
          series: s,
          signal: signalById.get(s.id),
          name: s.age ?? s.label,
          // Emphasis: the selected band keeps its fixed slot color; the rest go gray (TrendChart's muted color).
          color: emphasis && !highlight ? undefined : `var(--series-${i + 1})`,
          muted: emphasis && !highlight,
          group: g,
          highlight,
        }
      }),
    })
  }

  // Pulse signals with no series file: shown as tiles (latest figure only); old ones join the stale note.
  const seriesIds = new Set(data.series.map((s) => s.id))
  const orphans: BuildResult['orphans'] = []
  const seen = new Set<string>()
  for (const p of pulseEntries) {
    for (const signal of p.signals) {
      if (seriesIds.has(signal.seriesId) || signal.geo.type === 'national' || seen.has(signal.seriesId)) continue
      if (signal.geo.type === 'county' && signal.geo.code !== county) continue
      if (signal.geo.type === 'sewershed' || signal.geo.type === 'mdh-region' || signal.geo.type === 'mdh-district') continue
      seen.add(signal.seriesId)
      if (signal.latestDate < cutoff && signal.seriesId !== primaryId) {
        stale.push({ key: signal.seriesId, title: METRIC_LABEL[signal.metric], name: signal.geo.name, source: signal.source, date: signal.latestDate })
      } else orphans.push({ signal, pathogen: p.pathogen })
    }
  }

  const countyName =
    county && overall.some((s) => s.geo.type === 'county') ? `${MN_COUNTY_BY_FIPS[county]?.name ?? county} County` : undefined

  return {
    groups,
    ages,
    orphans,
    stale: stale.sort((a, b) => (a.date < b.date ? 1 : -1)),
    hasMap: data.pulse.mapLayers.some((l) => ids.includes(l.pathogen)),
    countyName,
  }
}
