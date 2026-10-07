// Pure helpers shared by the county map, its legend, tooltip and side panels.
// Nothing here invents values: every number comes from pulse.json / series files.
import { scaleLinear } from 'd3-scale'
import type {
  ActivityLevel, CountyMetric, Manifest, MapLayer, MetricKind, PathogenId, PulseFile, Series, SignalSummary, SitePulse, TrendDirection,
  Unit,
} from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { getProfile, pathogenName } from '../../content'
import { formatValue, METRIC_LABEL } from '../../lib/format'
import { findSeries, lastPoint } from '../../lib/series'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'

export type MapMode = 'level' | 'value'

/** Levels in display order, plus 'unknown' (shown only when present). */
export const LEGEND_LEVELS: ActivityLevel[] = [...LEVELS]

/** Sequential steps (light → dark in light mode; the dark theme supplies its own steps). */
export const SEQ_VARS = ['--seq-100', '--seq-200', '--seq-300', '--seq-400', '--seq-500', '--seq-600', '--seq-700'] as const

export const NO_DATA_FILL = 'var(--surface-3)'

export function layerById(pulse: PulseFile, id: string | null | undefined): MapLayer | undefined {
  if (!id) return undefined
  return pulse.mapLayers.find((l) => l.id === id)
}

export function countyMetric(pulse: PulseFile, fips: string, layerId: string): CountyMetric | undefined {
  return pulse.counties.find((c) => c.fips === fips)?.metrics[layerId]
}

/** Map of FIPS → metric for one county layer (only counties that report it). */
export function countyMetricsFor(pulse: PulseFile, layerId: string): Map<string, CountyMetric> {
  const out = new Map<string, CountyMetric>()
  for (const c of pulse.counties) {
    const m = c.metrics[layerId]
    if (m && MN_COUNTY_BY_FIPS[c.fips]) out.set(c.fips, m)
  }
  return out
}

/** Effective level for a metric: missing level or a null value → 'unknown'. */
export function metricLevel(m: CountyMetric | undefined): ActivityLevel {
  if (!m || m.value == null) return 'unknown'
  return m.level ?? 'unknown'
}

export function levelRank(level: ActivityLevel | undefined): number {
  return level ? LEVELS.indexOf(level) : -1
}

/**
 * The site layer that goes with a layer: the layer itself when it is a site layer; otherwise the
 * wastewater site layer for the same pathogen, then any site layer for that pathogen, then the first
 * wastewater-level site layer.
 */
export function siteLayerFor(pulse: PulseFile, layer: MapLayer | undefined): MapLayer | undefined {
  const sites = pulse.mapLayers.filter((l) => l.kind === 'site')
  if (!sites.length) return undefined
  if (layer?.kind === 'site') return layer
  if (layer) {
    const fam = family(layer.pathogen)
    const exact = sites.filter((l) => l.pathogen === layer.pathogen)
    const same = exact.length ? exact : sites.filter((l) => family(l.pathogen) === fam)
    const ww = same.find((l) => l.metric === 'wastewater_level') ?? same[0]
    if (ww) return ww
  }
  return sites.find((l) => l.metric === 'wastewater_level') ?? sites[0]
}

/** Flu A / Flu B belong with flu when matching layers. */
function family(p: PathogenId): PathogenId {
  return p === 'influenza-a' || p === 'influenza-b' ? 'influenza' : p
}

/** Sites that have a location and a metric for this site layer. */
export function sitesFor(pulse: PulseFile, siteLayerId: string | undefined): SitePulse[] {
  if (!siteLayerId) return []
  return pulse.sites.filter((s) => s.metrics[siteLayerId])
}

/** NSSP county ED values are reported for the health service area the county belongs to. */
export function isHsaEstimate(layer: MapLayer | undefined): boolean {
  if (!layer || layer.kind !== 'county') return false
  return /nssp/i.test(layer.source) || layer.metric === 'ed_visit_pct'
}

export const HSA_NOTE = 'County values are estimates for the health service area'

export function sourceName(manifest: Manifest | undefined, id: string | undefined): string {
  if (!id) return ''
  const s = manifest?.sources.find((x) => x.id === id)
  return s?.name ?? id
}

/** Group title for the layer picker. */
const GROUP_TITLE: Partial<Record<MetricKind, string>> = {
  ed_visit_pct: 'Emergency department visits',
  hosp_rate: 'Hospitalizations',
  hosp_admissions: 'Hospitalizations',
  test_positivity: 'Lab test positivity',
  cases: 'Reported cases',
  wastewater_level: 'Wastewater',
  wastewater_conc: 'Wastewater',
  ww_detections: 'Wastewater',
}

const GROUP_ORDER = ['Emergency department visits', 'Hospitalizations', 'Lab test positivity', 'Reported cases', 'Wastewater']

export interface LayerGroup {
  title: string
  layers: MapLayer[]
}

export function groupTitle(layer: MapLayer): string {
  const base = GROUP_TITLE[layer.metric] ?? METRIC_LABEL[layer.metric]
  return layer.kind === 'site' ? `${base} (treatment plants)` : `${base}${base === 'Wastewater' ? ' (by county)' : ''}`
}

export function groupLayers(layers: MapLayer[]): LayerGroup[] {
  const map = new Map<string, MapLayer[]>()
  for (const l of layers) {
    const t = groupTitle(l)
    if (!map.has(t)) map.set(t, [])
    map.get(t)!.push(l)
  }
  const order = (t: string) => {
    const base = GROUP_ORDER.findIndex((g) => t.startsWith(g))
    return (base === -1 ? 50 : base * 2) + (t.includes('treatment plants') ? 1 : 0)
  }
  return [...map.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([title, ls]) => ({ title, layers: [...ls].sort((a, b) => pathogenName(a.pathogen).localeCompare(pathogenName(b.pathogen))) }))
}

/** Short label: "Flu · ED visits". */
export function layerShortLabel(layer: MapLayer): string {
  const metric: Partial<Record<MetricKind, string>> = {
    ed_visit_pct: 'ED visits',
    hosp_rate: 'hospitalizations',
    hosp_admissions: 'hospital admissions',
    test_positivity: 'test positivity',
    cases: 'cases',
    wastewater_level: 'wastewater',
    wastewater_conc: 'wastewater',
    ww_detections: 'wastewater detections',
  }
  return `${pathogenName(layer.pathogen)} · ${metric[layer.metric] ?? METRIC_LABEL[layer.metric].toLowerCase()}`
}

const RESPIRATORY: PathogenId[] = ['influenza', 'influenza-a', 'influenza-b', 'covid', 'rsv', 'respiratory-combined', 'ili']

function isRespiratory(p: PathogenId): boolean {
  if (RESPIRATORY.includes(p)) return true
  const cat = getProfile(p)?.category
  return cat === 'respiratory-viral' || cat === 'respiratory-bacterial'
}

/**
 * Default layer: the county ED layer for the preferred pathogen (when given), else for the
 * highest-scoring respiratory pathogen, else any county ED layer, any county layer, any site layer.
 */
export function defaultLayerId(pulse: PulseFile, prefer?: PathogenId): string | undefined {
  const county = pulse.mapLayers.filter((l) => l.kind === 'county')
  const ed = county.filter((l) => l.metric === 'ed_visit_pct')
  if (prefer) {
    const hit = ed.find((l) => l.pathogen === prefer) ?? county.find((l) => l.pathogen === prefer)
    if (hit) return hit.id
  }
  const ranked = [...pulse.pathogens].sort((a, b) => b.score - a.score)
  for (const p of ranked) {
    if (!isRespiratory(p.pathogen)) continue
    const hit = ed.find((l) => l.pathogen === p.pathogen)
    if (hit) return hit.id
  }
  return ed[0]?.id ?? county[0]?.id ?? pulse.mapLayers[0]?.id
}

// ───────────────────────── Value bins (sequential mode) ─────────────────────────

export interface ValueBin {
  lo: number
  hi: number
  /** CSS color (a --seq-N var). */
  color: string
}

/** 5–7 "nice" equal-interval bins over the observed values, mapped onto the sequential ramp. */
export function makeBins(values: number[]): ValueBin[] {
  const vals = values.filter((v) => Number.isFinite(v))
  if (!vals.length) return []
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [{ lo: min, hi: max, color: `var(${SEQ_VARS[3]})` }]
  let edges: number[] = []
  for (const n of [6, 5, 7, 4, 8, 10]) {
    const t = scaleLinear().domain([min, max]).nice(n).ticks(n)
    if (t.length < 2) continue
    if (t[0] > min) t.unshift(min)
    if (t[t.length - 1] < max) t.push(max)
    const bins = t.length - 1
    if (bins >= 5 && bins <= 7) {
      edges = t
      break
    }
  }
  if (!edges.length) {
    const step = (max - min) / 5
    edges = [0, 1, 2, 3, 4, 5].map((i) => min + i * step)
  }
  const k = edges.length - 1
  return edges.slice(0, -1).map((lo, i) => ({
    lo,
    hi: edges[i + 1],
    color: `var(${SEQ_VARS[k === 1 ? 3 : Math.round((i * 6) / (k - 1))]})`,
  }))
}

export function binIndex(bins: ValueBin[], v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v) || !bins.length) return -1
  for (let i = 0; i < bins.length; i++) if (v < bins[i].hi) return i
  return bins.length - 1
}

export function binLabel(bin: ValueBin, unit: Unit): string {
  if (bin.lo === bin.hi) return formatValue(bin.lo, unit)
  // Decimals follow the bin width so labels read evenly (0.5–1.0%, not 0.50–1.0%).
  const step = Math.abs(bin.hi - bin.lo)
  const dec = unit === 'count' ? 0 : step >= 5 ? 0 : step >= 0.5 ? 1 : step >= 0.05 ? 2 : 3
  const f = (v: number) => (unit === 'count' ? Math.round(v).toLocaleString('en-US') : v.toFixed(dec))
  return `${f(bin.lo)}–${f(bin.hi)}${unit === '%' ? '%' : ''}`
}

// ───────────────────────── Plain-language bits ─────────────────────────

export const TREND_PHRASE: Record<TrendDirection, string> = {
  'rising-fast': 'rising fast',
  rising: 'rising',
  steady: 'holding steady',
  falling: 'falling',
  'falling-fast': 'falling fast',
  unknown: 'with no clear trend yet',
}

/** "Flu ED visits", "COVID-19 wastewater levels" — used inside sentences. */
export function layerPhrase(layer: MapLayer): string {
  const name = pathogenName(layer.pathogen)
  const m: Partial<Record<MetricKind, string>> = {
    ed_visit_pct: 'emergency department visits',
    hosp_rate: 'hospitalizations',
    hosp_admissions: 'hospital admissions',
    test_positivity: 'lab test positivity',
    cases: 'reported cases',
    wastewater_level: 'wastewater levels',
    wastewater_conc: 'wastewater levels',
    ww_detections: 'wastewater detections',
  }
  return `${name} ${m[layer.metric] ?? METRIC_LABEL[layer.metric].toLowerCase()}`
}

export function countyName(fips: string): string {
  return MN_COUNTY_BY_FIPS[fips]?.name ?? fips
}

export function countyNames(fips: string[] | undefined, max = 4): string {
  if (!fips?.length) return ''
  const names = fips.map((f) => MN_COUNTY_BY_FIPS[f]?.name).filter(Boolean) as string[]
  if (!names.length) return ''
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`
}

// ───────────────────────── Statewide comparison ─────────────────────────

/** Minnesota-wide signal for the same pathogen + metric, if the pulse has one. */
export function stateSignal(pulse: PulseFile, layer: MapLayer): SignalSummary | undefined {
  const p = pulse.pathogens.find((x) => x.pathogen === layer.pathogen)
  return p?.signals.find((s) => s.metric === layer.metric && s.geo.type === 'state')
}

/** Statewide series with the same pathogen, metric and unit (prefer the same source, then the freshest). */
export function stateSeriesFor(series: Series[], layer: MapLayer): Series | undefined {
  const cands = findSeries(series, { pathogen: layer.pathogen, metric: layer.metric, geoType: 'state', geoCode: '27' }).filter(
    (s) => s.unit === layer.unit,
  )
  if (!cands.length) return undefined
  const last = (s: Series) => lastPoint(s.points)?.[0] ?? ''
  return [...cands].sort((a, b) => Number(b.source === layer.source) - Number(a.source === layer.source) || (last(b) > last(a) ? 1 : -1))[0]
}

