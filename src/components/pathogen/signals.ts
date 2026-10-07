// Gathers every published signal for one illness and groups it into same-unit charts.
// Nothing here creates values: every number shown traces to a Series point or a pulse SignalSummary.
import type {
  ActivityLevel, AgeGroupId, Forecast, MetricKind, PathogenId, Series, SignalSummary, TrendDirection, Unit,
} from '../../../shared/types'
import type { DashboardData } from '../../lib/data'
import { pathogenName } from '../../content'
import { lastPoint, preferredForecast } from '../../lib/series'
import type { GeoSelection } from '../../lib/state'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { ageGroupOf, METRIC_ORDER, pickAgeBands, relatedIds, pulseFor } from './meta'

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
  entries: Entry[]
  /** Series left off the chart to keep it readable (shown on the Trends page). */
  hidden: number
  forecasts: Forecast[]
  showThresholds: boolean
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

export interface Latest {
  date: string
  value: number
  level?: ActivityLevel
  trend?: TrendDirection
  basis?: string
  officialLabel?: string
  stale?: boolean
}

/** Latest value for an entry, preferring the pulse analysis (which carries level/trend). */
export function latestOf(e: Pick<Entry, 'series' | 'signal'>): Latest | undefined {
  const s = e.signal
  const off = e.series.official
  if (s) {
    return {
      date: s.latestDate,
      value: s.latestValue,
      level: s.level,
      trend: s.trend,
      basis: s.levelBasis,
      officialLabel: off?.label,
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
    basis: offApplies && off?.by ? off.by : undefined,
    officialLabel: offApplies ? off?.label : undefined,
  }
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

const datasetAbbr = (s: Series) => s.label.match(/\(([^()]+)\)\s*$/)?.[1] ?? s.dataset

export interface BuildResult {
  groups: SignalGroup[]
  ages: AgeGroupChart[]
  /** Pulse signals whose series file did not load (shown as plain figures). */
  orphans: SignalSummary[]
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
  const empty: BuildResult = { groups: [], ages: [], orphans: [], hasMap: false }
  if (!data) return empty
  const ids = relatedIds(id)
  const pulseEntries = data.pulse.pathogens.filter((p) => ids.includes(p.pathogen))
  const signalById = new Map<string, SignalSummary>()
  for (const p of pulseEntries) for (const s of p.signals) signalById.set(s.seriesId, s)
  const primaryMetric = pulseFor(data.pulse, id)?.primary?.metric

  const usable = data.series.filter((s) => ids.includes(s.pathogen) && s.points.some((p) => p[1] != null))
  const county = geo.type === 'county' ? geo.code : undefined
  const keepGeo = (s: Series) =>
    s.geo.type === 'state' ||
    s.geo.type === 'hhs-region' ||
    s.geo.type === 'census-region' ||
    s.geo.type === 'national' ||
    (s.geo.type === 'county' && s.geo.code === county)

  const allAges = usable.filter((s) => !!s.age && keepGeo(s) && s.geo.type !== 'national')
  const overall = usable.filter((s) => !s.age && keepGeo(s))

  // ── group all-ages series by measure ──
  const byKey = new Map<string, Series[]>()
  for (const s of overall) {
    const k = `${s.metric}|${s.unit}`
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

  const groups: SignalGroup[] = []
  for (const [key, list] of byKey) {
    const [metric, unit] = key.split('|') as [MetricKind, Unit]
    // Counts are not comparable across places of different size: keep national counts off MN charts.
    let members = unit === 'count' ? list.filter((s) => s.geo.type !== 'national') : list
    if (!members.length) continue
    members = [...members].sort(
      (a, b) =>
        (GEO_RANK[a.geo.type] ?? 5) - (GEO_RANK[b.geo.type] ?? 5) ||
        ids.indexOf(a.pathogen) - ids.indexOf(b.pathogen) ||
        (signalById.has(b.id) ? 1 : 0) - (signalById.has(a.id) ? 1 : 0) ||
        a.source.localeCompare(b.source) ||
        a.id.localeCompare(b.id),
    )
    // Only national lines left → nothing Minnesota-specific to show for this measure.
    if (members.every((s) => s.geo.type === 'national')) continue
    const shown = members.slice(0, 6)
    const multiPathogen = new Set(shown.map((s) => s.pathogen)).size > 1
    const keyCounts = new Map<string, number>()
    for (const s of shown) {
      const k = `${s.pathogen}|${s.geo.type}|${s.geo.code}`
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1)
    }
    let slot = 0
    const entries: Entry[] = shown.map((s) => {
      const muted = s.geo.type === 'national'
      const dup = (keyCounts.get(`${s.pathogen}|${s.geo.type}|${s.geo.code}`) ?? 0) > 1
      const parts = [multiPathogen ? pathogenName(s.pathogen) : '', geoLabel(s)].filter(Boolean)
      const name = `${parts.join(', ')}${dup ? ` (${datasetAbbr(s)})` : ''}`
      const color = muted ? undefined : `var(--series-${Math.min(8, ++slot)})`
      return { series: s, signal: signalById.get(s.id), name, color, muted, count: countFor.get(s.id) }
    })
    const lead = entries.filter((e) => !e.muted)
    const forecasts = lead.map((e) => preferredForecast(data.forecasts.forecasts, e.series)).filter((f): f is Forecast => !!f)
    groups.push({
      key,
      metric,
      unit,
      entries,
      hidden: members.length - shown.length,
      forecasts,
      showThresholds: lead.length === 1 && !!lead[0].series.thresholds && entries[0] === lead[0],
    })
  }
  groups.sort((a, b) => {
    const pa = a.metric === primaryMetric ? -1 : METRIC_ORDER.indexOf(a.metric)
    const pb = b.metric === primaryMetric ? -1 : METRIC_ORDER.indexOf(b.metric)
    return pa - pb
  })

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
          color: `var(--series-${i + 1})`,
          muted: emphasis && !highlight,
          group: g,
          highlight,
        }
      }),
    })
  }

  const seriesIds = new Set(data.series.map((s) => s.id))
  const orphans = pulseEntries
    .flatMap((p) => p.signals)
    .filter((s) => !seriesIds.has(s.seriesId) && s.geo.type !== 'national')
    .filter((s, i, arr) => arr.findIndex((x) => x.seriesId === s.seriesId) === i)

  const countyName =
    county && overall.some((s) => s.geo.type === 'county') ? `${MN_COUNTY_BY_FIPS[county]?.name ?? county} County` : undefined

  return {
    groups,
    ages,
    orphans,
    hasMap: data.pulse.mapLayers.some((l) => ids.includes(l.pathogen)),
    countyName,
  }
}
