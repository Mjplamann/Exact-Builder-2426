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

/**
 * County values reported for the health service area (HSA, a group of neighboring counties) rather than the
 * county alone: CDC NSSP ER visits, CDC CFA Rt, and any layer whose series carry an HSA attribute.
 * Pass a sample series of the layer (or the county's own series) to check its attributes.
 */
export function isHsaEstimate(layer: MapLayer | undefined, sample?: Series): boolean {
  if (!layer || layer.kind !== 'county') return false
  if (/nssp|cfa-rt/i.test(layer.source) || layer.metric === 'ed_visit_pct' || layer.metric === 'rt') return true
  return !!(sample?.attrs && (sample.attrs.hsa || sample.attrs.hsaName))
}

/** The HSA's name for a tooltip: attrs.hsaName first, else attrs.hsa when it is a name (CFA's hsa is an id like "941"). */
export function hsaLabel(series: Series | undefined): string | undefined {
  const a = series?.attrs
  if (!a) return undefined
  if (a.hsaName?.trim()) return a.hsaName.trim()
  if (a.hsa?.trim() && !/^\d+$/.test(a.hsa.trim())) return a.hsa.trim()
  return undefined
}

/** Rt is the direction of spread, not an amount: it has no activity level. */
export function isLevelless(layer: Pick<MapLayer, 'metric'> | undefined): boolean {
  return layer?.metric === 'rt'
}

/** Value text for a layer: Rt keeps two decimals (1.05 vs 0.97 matters); everything else uses formatValue. */
export function formatLayerValue(v: number | null | undefined, layer: Pick<MapLayer, 'metric' | 'unit'>, opts?: { compact?: boolean }): string {
  if (layer.metric === 'rt' && v != null && Number.isFinite(v)) return v.toFixed(2)
  return formatValue(v, layer.unit, opts)
}

/** Short program name for the system a series comes from (for the layer picker and source notes). */
const PROGRAMS: [RegExp, string][] = [
  [/^nwss/, 'CDC NWSS'],
  [/^wwscan/, 'WastewaterSCAN'],
  [/^mdh-wastewater/, 'MDH'],
  [/^mdh-respnet/, 'MDH RESP-NET'],
  [/^nssp/, 'CDC NSSP'],
  [/^cfa/, 'CDC CFA'],
  [/^nhsn/, 'CDC NHSN'],
  [/^mdh/, 'MDH'],
]

export function programName(s: Pick<Series, 'dataset' | 'source'>): string {
  for (const [re, name] of PROGRAMS) if (re.test(s.dataset)) return name
  return s.source
}

/** Series ids look like "source:dataset:pathogen:metric:geoType:code". */
function idParts(seriesId: string): { source: string; dataset: string; pathogen: string } {
  const [source = '', dataset = '', pathogen = ''] = seriesId.split(':')
  return { source, dataset, pathogen }
}

/** Source id of the series behind one county/plant metric (a layer can mix sources, e.g. MDH + WastewaterSCAN plants). */
export function metricSource(m: CountyMetric | undefined, fallback?: string): string | undefined {
  return (m && idParts(m.seriesId).source) || fallback
}

/** Every metric drawn for a layer (county or plant). */
export function layerMetrics(pulse: PulseFile, layer: MapLayer): CountyMetric[] {
  const out: CountyMetric[] = []
  const rows = layer.kind === 'site' ? pulse.sites : pulse.counties
  for (const r of rows) {
    const m = r.metrics[layer.id]
    if (m) out.push(m)
  }
  return out
}

/** Programs behind a layer, most places first ("MDH + WastewaterSCAN"), and how many places report. */
export function layerPrograms(pulse: PulseFile, layer: MapLayer): { names: string[]; places: number } {
  const counts = new Map<string, number>()
  const ms = layerMetrics(pulse, layer)
  for (const m of ms) {
    const name = programName(idParts(m.seriesId))
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
  return { names, places: ms.length }
}

const MEASURE_SHORT: Record<string, string> = { 'wastewater activity level': 'wastewater level' }

/**
 * Picker text that tells look-alike layers apart by measure and program:
 * "COVID-19 — wastewater level (CDC NWSS, 27 plants)" vs "COVID-19 — wastewater concentration (MDH + WastewaterSCAN, 33 plants)".
 */
export function layerOptionLabel(pulse: PulseFile, layer: MapLayer): string {
  const raw = layer.label.includes(' — ') ? layer.label.split(' — ').slice(1).join(' — ') : layerShortLabel(layer).split(' · ')[1]
  const measure = MEASURE_SHORT[raw] ?? raw
  const { names, places } = layerPrograms(pulse, layer)
  const prog = names.length ? names.join(' + ') : ''
  const where = layer.kind === 'site' && places ? `${places} plant${places === 1 ? '' : 's'}` : ''
  const extra = [prog, where].filter(Boolean).join(', ')
  return `${pathogenName(layer.pathogen)} — ${measure}${extra ? ` (${extra})` : ''}`
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
  rt: 'Spread (Rt)',
}

const GROUP_ORDER = ['Emergency department visits', 'Hospitalizations', 'Lab test positivity', 'Reported cases', 'Spread (Rt)', 'Wastewater']

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
    rt: 'Rt',
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

export function binLabel(bin: ValueBin, unit: Unit, metric?: MetricKind): string {
  if (bin.lo === bin.hi) return metric === 'rt' ? bin.lo.toFixed(2) : formatValue(bin.lo, unit)
  // Decimals follow the bin width so labels read evenly (0.5–1.0%, not 0.50–1.0%); Rt always uses two.
  const step = Math.abs(bin.hi - bin.lo)
  const dec = metric === 'rt' ? 2 : unit === 'count' ? 0 : step >= 5 ? 0 : step >= 0.5 ? 1 : step >= 0.05 ? 2 : 3
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
    rt: 'Rt estimates',
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

/** Measures that belong together when looking for a statewide twin. */
const MEASURE_FAMILY: Partial<Record<MetricKind, string>> = {
  hosp_rate: 'hosp',
  hosp_admissions: 'hosp',
  wastewater_level: 'ww',
  wastewater_conc: 'ww',
  ww_detections: 'ww',
  cases: 'cases',
  cases_ytd: 'cases',
}
const measureFamily = (m: MetricKind) => MEASURE_FAMILY[m] ?? m

/**
 * Minnesota-wide signal that goes with a layer: same pathogen and measure family, preferring the same
 * source (MDH county hospitalizations → MDH's statewide RESP-NET rate, not CDC NHSN), then the same metric,
 * then the same unit.
 */
export function stateSignal(pulse: PulseFile, layer: MapLayer, seriesById?: Map<string, Series>): SignalSummary | undefined {
  const fam = family(layer.pathogen)
  // A layer can mix sources (29 MDH plants + 4 WastewaterSCAN plants): the one behind most places leads.
  const counts = new Map<string, number>()
  for (const m of layerMetrics(pulse, layer)) {
    const src = idParts(m.seriesId).source
    counts.set(src, (counts.get(src) ?? 0) + 1)
  }
  const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? layer.source
  const sourceScore = (src: string) => (src === main ? 4 : counts.has(src) || src === layer.source ? 3 : 0)
  let best: { s: SignalSummary; score: number } | undefined
  for (const p of pulse.pathogens) {
    if (p.pathogen !== layer.pathogen && p.pathogen !== fam) continue
    for (const s of p.signals) {
      if (s.geo.type !== 'state' || measureFamily(s.metric) !== measureFamily(layer.metric)) continue
      const sp = seriesById?.get(s.seriesId)?.pathogen ?? idParts(s.seriesId).pathogen
      if (sp !== layer.pathogen) continue
      const score = sourceScore(s.source) + (s.metric === layer.metric ? 2 : 0) + (s.unit === layer.unit ? 1 : 0)
      if (!best || score > best.score) best = { s, score }
    }
  }
  return best?.s
}

// ───────────────────────── Level scales ─────────────────────────

/** Publishers whose category scale has three steps (Low / Moderate / High), so "Low" is its floor (mirrors the pipeline). */
const THREE_STEP_SCALES = [/^pub:MDH RESP-NET/]

/**
 * Which scale a series' level is on: a publisher's own categories ("pub:MDH RESP-NET"), published cut-points
 * ("cuts:…"), or its own history ("history"); null when the measure has no level (Rt). Mirrors how the
 * pipeline rates levels, so a county and the state can be compared only when they share a scale.
 * County ER visits are rated with Minnesota's cut-points for the same pathogen (pass `stateEd`).
 */
export function levelScaleOf(s: Series | undefined, latestDate?: string, stateEd?: Series): string | null {
  if (!s || s.metric === 'rt') return null
  const off = s.official
  if (off?.level && off.level !== 'unknown' && (!off.asOf || !latestDate || off.asOf === latestDate)) return `pub:${off.by ?? s.source}`
  if (s.thresholds) return `cuts:${s.metric}:${s.thresholds.by}`
  if (s.geo.type === 'county' && s.metric === 'ed_visit_pct' && stateEd?.thresholds) return `cuts:${s.metric}:${stateEd.thresholds.by}`
  return 'history'
}

/** Statewide all-ages ER-visit series for a pathogen that carries CDC cut-points (used to rate county ER visits). */
export function stateEdSeries(series: Series[], pathogen: PathogenId): Series | undefined {
  return series.find((s) => s.geo.type === 'state' && s.metric === 'ed_visit_pct' && s.pathogen === pathogen && !s.age && s.thresholds)
}

/** True for a three-step publisher scale, where "Low" is the bottom step. */
export function isThreeStepScale(scale: string | null): boolean {
  return !!scale && THREE_STEP_SCALES.some((re) => re.test(scale))
}

/**
 * Position of a level within its own scale, 0 (bottom step) to 1 (top step); null when there is no level.
 * Lets measures on different scales be ranked fairly: MDH's "Low" is its floor (0), CDC's "Low" is step 2 of 5.
 */
export function scalePosition(level: ActivityLevel, scale: string | null): number | null {
  if (scale == null || level === 'unknown') return null
  const i = LEVELS.indexOf(level)
  if (i < 0) return null
  if (isThreeStepScale(scale)) return Math.min(1, Math.max(0, i - 1) / 2)
  return i / (LEVELS.length - 1)
}

/** Percentile (0–100) of a value among the series' weekly values from the ~3 years before `date` (needs 26+ weeks). */
export function historyPercentile(s: Series | undefined, date: string, value: number | null | undefined): number | undefined {
  if (!s || value == null) return undefined
  const from = `${Number(date.slice(0, 4)) - 3}${date.slice(4)}`
  const hist: number[] = []
  for (const [d, v] of s.points) if (v != null && d < date && d >= from) hist.push(v)
  if (hist.length < 26) return undefined
  let below = 0
  let equal = 0
  for (const v of hist) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return ((below + equal / 2) / hist.length) * 100
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

