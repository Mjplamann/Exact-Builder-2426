// WastewaterSCAN (Stanford University / Emory University / Verily): Minnesota plants, multi-pathogen.
//
// The public dashboard at data.wastewaterscan.org reads static JSON from the open Google Cloud
// Storage bucket `wastewater-dev-data`. These files have no documentation and could move, so the
// schema is checked on every run. We read the same files:
//   * json/plants.json   - every plant (id, uid, city, state, counties_served, sewershed_pop, point)
//   * json/targets.json  - assay dictionary; `public` merges assay versions (MeV_Roy + MeV_Roy_V2)
//   * json/<uid>.json    - one plant's full sample history: samples[].collection_date and
//                          samples[].targets[<assay>].{gc_g_dry_weight, gc_g_dry_weight_pmmov,
//                          activity_category, ...}
// Optional: data.wastewaterscan.org/data/categories/plants.json holds WastewaterSCAN's own 21-day
// trend test. It is used only for the trend, and only when that host is reachable.
//
// Values: gene copies per gram of dry solids divided by PMMoV (pepper mild mottle virus, a marker
// of how much human waste is in the sample), times 1,000,000. That is the "per million PMMoV" scale
// the WastewaterSCAN dashboard uses. Each weekly point is the mean of that week's samples (usually
// 3). These units cannot be compared with CDC NWSS values or across targets.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { geoCentroid } from 'd3-geo'
import type { Feature, FeatureCollection } from 'geojson'
import type { ActivityLevel, GeoRef, PathogenId, Point, Series, TrendDirection } from '../../shared/types.ts'
import { addDays, weekEndingSaturday } from '../../shared/mmwr.ts'
import { fetchJson } from '../lib/http.ts'
import { latestDate, makeSeries, since, STATE_GEO, toWeekEnding, toWeeklyPoints } from '../lib/series.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'

const SOURCE = 'wastewaterscan'
const DS_CONC = 'wwscan'
const DS_DETECT = 'wwscan-detections'
const GCS = 'https://storage.googleapis.com/wastewater-dev-data/json'
const CATEGORIES_URL = 'https://data.wastewaterscan.org/data/categories/plants.json'
/** The dashboard plots PMMoV-normalized ratios multiplied by one million. */
const PMMOV_SCALE = 1e6
/** A plant × target with no sample in this many days is treated as discontinued and left out. */
const DISCONTINUED_DAYS = 365
/** Trend window of WastewaterSCAN's own trend test (categories file). */
const TREND_DAYS = 21

export const ATTRIBUTION =
  'These data were collected as part of the WastewaterSCAN / SCAN project, a partnership between Stanford University, Emory University, and Verily, funded philanthropically through a gift to Stanford University. License: CC BY-NC 4.0.'

/** Minnesota plants as of 2026-10 (used only if plants.json cannot be read). */
export const FALLBACK_MN_PLANTS = ['e1e03cad', '90771388', '6c9b6f97', 'c089ed87']

/** CDC NWSS site ids for the same plants (matched by county and by CDC's H5 site map). */
export const NWSS_IDS: Record<string, string> = {
  e1e03cad: '1017', // Rochester
  '90771388': '993', // Mankato
  '6c9b6f97': '1003', // Red Wing
  c089ed87: '1028', // St. Cloud
}

// ───────────────────────── Raw feed shapes ─────────────────────────

export interface RawTarget {
  gc_g_dry_weight?: number | null
  gc_g_dry_weight_pmmov?: number | null
  activity_category?: string | null
  [k: string]: unknown
}
export interface RawSample {
  sample_id?: string
  collection_date?: string
  targets?: Record<string, RawTarget>
  [k: string]: unknown
}
export interface RawPlant {
  id?: string
  uid?: string
  uuid?: string
  city?: string | null
  state?: string | null
  name?: string | null
  site_name?: string | null
  counties_served?: (string | number)[] | null
  sewershed_pop?: number | null
  point?: { coordinates?: unknown } | null
  [k: string]: unknown
}
export interface RawPlantFile {
  samples?: RawSample[]
  plant?: RawPlant
  updated?: string
}
export interface RawTargetDef {
  id: string
  public?: string | null
  target?: string | null
  suggested_label?: string | null
}
interface RawCategoryEntry {
  category?: string
  method?: string
  details?: { trend?: { m?: number; p?: number; significant?: boolean }; tertile?: number; message?: string }
  lastSampleDate?: string
}
type RawCategories = Record<string, Record<string, RawCategoryEntry>>

// ───────────────────────── Target mapping ─────────────────────────

export interface TargetSpec {
  pathogen: PathogenId
  /** Display name used in the series label. */
  name: string
  variant?: string
  /** Rare/emerging target: also counted in the statewide detections series. */
  rare?: boolean
  note?: string
}

const H5_NOTE =
  'The H5 assay detects the H5 influenza subtype (not only H5N1). Detections can come from animal sources such as milk or bird droppings, so they do not by themselves show human infection.'

/** Keyed by targets.json `public` id, which merges assay versions. */
export const PUBLIC_TARGETS: Record<string, TargetSpec> = {
  SC2_N: { pathogen: 'covid', name: 'COVID-19 (SARS-CoV-2 N gene)' },
  Influenza_A: { pathogen: 'influenza-a', name: 'Influenza A' },
  Influenza_B: { pathogen: 'influenza-b', name: 'Influenza B' },
  RSV: { pathogen: 'rsv', name: 'RSV (A and B combined)' },
  HMPV_4: { pathogen: 'hmpv', name: 'hMPV' },
  Noro_G2: { pathogen: 'norovirus', name: 'Norovirus GII' },
  Rotavirus: { pathogen: 'rotavirus', name: 'Rotavirus' },
  HAdV_F: { pathogen: 'adenovirus-gi', name: 'Adenovirus group F (enteric)' },
  'EV-D68': {
    pathogen: 'rhino-entero',
    name: 'EV-D68',
    variant: 'ev-d68',
    note: 'Enterovirus D68 only. It does not measure rhinovirus or other enteroviruses.',
  },
  HPIV: { pathogen: 'parainfluenza', name: 'Parainfluenza (HPIV)' },
  HAV: { pathogen: 'hepatitis-a', name: 'Hepatitis A', rare: true },
  MeV: {
    pathogen: 'measles',
    name: 'Measles (wild-type assay)',
    rare: true,
    note: 'The measles assay targets wild-type virus. A detection can come from a single infected person or a visitor.',
  },
  MPXV_G2R: {
    pathogen: 'mpox',
    name: 'Mpox clade II (MPXV G2R)',
    variant: 'clade-ii',
    rare: true,
    note: 'Since Dec 2022 WastewaterSCAN has used the clade II-specific G2R_WA assay. Earlier samples used the generic G2R_G assay.',
  },
  'MPXV_dD14-16': { pathogen: 'mpox', name: 'Mpox clade Ib (MPXV dD14-16)', variant: 'clade-ib', rare: true },
  InfA_H5: { pathogen: 'h5n1', name: 'Influenza A H5', rare: true, note: H5_NOTE },
  WNV: { pathogen: 'west-nile', name: 'West Nile virus', rare: true },
}

/** Why known `public` targets are not published (shown in diagnostics). */
const SKIP_REASONS: Record<string, string> = {
  PMMoV: 'normalization control (fecal-strength marker)',
  C_auris: 'Candida auris: no matching pathogen id',
  TB_RD9: 'tuberculosis marker: no matching pathogen id',
  NDM: 'NDM antimicrobial-resistance gene: no matching pathogen id',
  Parvo_B19: 'parvovirus B19: no matching pathogen id',
  InfA_H1: 'influenza A H1 subtype marker: no subtype pathogen id (would collide with the Influenza A series)',
  InfA_H3: 'influenza A H3 subtype marker: no subtype pathogen id (would collide with the Influenza A series)',
  SC2_S: 'SARS-CoV-2 S gene (retired 2023)',
  HV_69_70_Del: 'SARS-CoV-2 variant marker (retired)',
  XBB_bkpt: 'SARS-CoV-2 variant marker (retired)',
}

/**
 * Assay → public id as published in targets.json on 2026-10-07. Used only when targets.json cannot
 * be read. A live dictionary always takes precedence.
 */
export const FALLBACK_ASSAY_PUBLIC: Record<string, string> = {
  'N Gene': 'SC2_N',
  'S Gene': 'SC2_S',
  'Influenza A': 'Influenza_A',
  'Influenza A F1R1': 'Influenza_A',
  'Influenza B': 'Influenza_B',
  RSV: 'RSV',
  HMPV_4: 'HMPV_4',
  Noro_G2: 'Noro_G2',
  Rota: 'Rotavirus',
  HAdV_F: 'HAdV_F',
  EVD68: 'EV-D68',
  EVD68_V2: 'EV-D68',
  HPIV: 'HPIV',
  HAV: 'HAV',
  MeV_Roy: 'MeV',
  MeV_Roy_V2: 'MeV',
  MPXV_G2R_G: 'MPXV_G2R',
  MPXV_G2R_WA: 'MPXV_G2R',
  'MPXV_dD14-16': 'MPXV_dD14-16',
  InfA_H5: 'InfA_H5',
  InfA_H1: 'InfA_H1',
  InfA_H1_V2: 'InfA_H1',
  InfA_H1_Verily: 'InfA_H1',
  InfA_H3_V2: 'InfA_H3',
  WNV: 'WNV',
  PMMoV: 'PMMoV',
}

/** Build the assay → public lookup from targets.json (falls back to the built-in table per assay). */
export function assayPublicMap(defs: RawTargetDef[] | null | undefined): Map<string, string> {
  const m = new Map<string, string>(Object.entries(FALLBACK_ASSAY_PUBLIC))
  for (const d of defs ?? []) {
    if (d && typeof d.id === 'string' && typeof d.public === 'string' && d.public.trim()) m.set(d.id, d.public.trim())
  }
  return m
}

// ───────────────────────── Publisher categories ─────────────────────────

/** WastewaterSCAN per-sample `activity_category` → our scale. 'not calculated' (or unknown) → null. */
export function mapActivityCategory(raw: string | null | undefined): { level: ActivityLevel; label: string } | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'very low':
      return { level: 'minimal', label: 'Very low' }
    case 'low':
      return { level: 'low', label: 'Low' }
    case 'medium':
    case 'moderate':
      return { level: 'moderate', label: 'Medium' }
    case 'high':
      return { level: 'high', label: 'High' }
    case 'very high':
      return { level: 'very-high', label: 'Very high' }
    case 'not detected':
      return { level: 'minimal', label: 'Not detected' }
    default:
      return null
  }
}

const KNOWN_CATEGORIES = new Set(['very low', 'low', 'medium', 'moderate', 'high', 'very high', 'not detected', 'not calculated'])

/**
 * WastewaterSCAN's own 21-day trend verdict (categories file). Only a statistically significant
 * slope sets a direction. "No trend" (not significant) is kept as text and does not mean "steady".
 */
export function trendFromCategory(
  entry: RawCategoryEntry | undefined,
): { trend?: TrendDirection; text: string; lastSampleDate?: string } | null {
  const t = entry?.details?.trend
  if (!t || typeof t.significant !== 'boolean') return null
  const p = typeof t.p === 'number' && Number.isFinite(t.p) ? ` (p = ${t.p.toFixed(2)})` : ''
  const last = typeof entry?.lastSampleDate === 'string' ? entry.lastSampleDate.slice(0, 10) : undefined
  if (t.significant && typeof t.m === 'number' && t.m > 0)
    return { trend: 'rising', text: `Upward trend in the last ${TREND_DAYS} days${p}`, lastSampleDate: last }
  if (t.significant && typeof t.m === 'number' && t.m < 0)
    return { trend: 'falling', text: `Downward trend in the last ${TREND_DAYS} days${p}`, lastSampleDate: last }
  return { text: `No significant trend in the last ${TREND_DAYS} days${p}`, lastSampleDate: last }
}

// ───────────────────────── Sample reduction (pure) ─────────────────────────

export interface AssayRange {
  first: string
  last: string
  n: number
}

export interface PublicTargetData {
  publicId: string
  assays: Record<string, AssayRange>
  /** [collection_date, PMMoV-normalized value × 1e6 | null] for every sample that ran this target. */
  raw: [string, number | null][]
  /** Week-ending Saturday → true when any sample that week had gene copies > 0. */
  detectWeeks: Map<string, boolean>
  lastDetection?: string
  latest?: { date: string; assay: string; category: string | null }
}

export interface PlantReduction {
  targets: Map<string, PublicTargetData>
  samples: number
  samplesKept: number
  firstDate?: string
  lastDate?: string
  assaysSeen: string[]
  sampleKeys: string[]
  targetKeys: string[]
  warnings: string[]
  unknownCategories: string[]
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ISO_RE = /^\d{4}-\d{2}-\d{2}/

/**
 * Reduce one plant's samples to per-`public`-target sample values. When two assay versions of the
 * same public target ran on one sample, the assay that is still running (latest last date) wins.
 */
export function reduceSamples(
  samples: RawSample[],
  assayToPublic: Map<string, string>,
  historyStart: string,
): PlantReduction {
  const warnings: string[] = []
  const sampleKeys = new Set<string>()
  const targetKeys = new Set<string>()
  const unknownCategories = new Set<string>()
  const valid: { date: string; targets: Record<string, RawTarget> }[] = []
  let badDates = 0
  for (const s of samples) {
    if (!s || typeof s !== 'object') continue
    for (const k of Object.keys(s)) sampleKeys.add(k)
    const date = typeof s.collection_date === 'string' && ISO_RE.test(s.collection_date) ? s.collection_date.slice(0, 10) : null
    if (!date || !s.targets || typeof s.targets !== 'object') {
      badDates++
      continue
    }
    valid.push({ date, targets: s.targets })
  }
  if (badDates) warnings.push(`${badDates} sample(s) without a usable collection_date/targets`)
  valid.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  // Pass 1: date range per assay (over the whole file, to pick the current assay version).
  const assayRange = new Map<string, AssayRange>()
  for (const s of valid) {
    for (const assay of Object.keys(s.targets)) {
      const r = assayRange.get(assay)
      if (!r) assayRange.set(assay, { first: s.date, last: s.date, n: 1 })
      else {
        r.last = s.date
        r.n++
      }
    }
  }
  const pubOf = (assay: string) => assayToPublic.get(assay) ?? assay

  // Pass 2: one value per sample per public target.
  const targets = new Map<string, PublicTargetData>()
  let kept = 0
  let missingPmmov = 0
  let missingGc = 0
  for (const s of valid) {
    if (weekEndingSaturday(s.date) < historyStart) continue
    kept++
    const chosen = new Map<string, string>()
    for (const assay of Object.keys(s.targets)) {
      const pub = pubOf(assay)
      const prev = chosen.get(pub)
      if (!prev) chosen.set(pub, assay)
      else {
        const a = assayRange.get(assay)!.last
        const b = assayRange.get(prev)!.last
        if (a > b || (a === b && assay > prev)) chosen.set(pub, assay)
      }
    }
    for (const [pub, assay] of chosen) {
      const t = s.targets[assay]
      if (!t || typeof t !== 'object') continue
      for (const k of Object.keys(t)) targetKeys.add(k)
      const cat = typeof t.activity_category === 'string' ? t.activity_category : null
      if (cat && !KNOWN_CATEGORIES.has(cat.trim().toLowerCase())) unknownCategories.add(cat)
      let d = targets.get(pub)
      if (!d) {
        d = { publicId: pub, assays: {}, raw: [], detectWeeks: new Map() }
        targets.set(pub, d)
      }
      const ar = d.assays[assay]
      if (!ar) d.assays[assay] = { first: s.date, last: s.date, n: 1 }
      else {
        ar.last = s.date
        ar.n++
      }
      const pm = t.gc_g_dry_weight_pmmov
      if (pub !== 'PMMoV' && !finite(pm)) missingPmmov++
      d.raw.push([s.date, finite(pm) && pm >= 0 ? pm * PMMOV_SCALE : null])
      const gc = t.gc_g_dry_weight
      if (!finite(gc)) missingGc++
      else {
        const wk = weekEndingSaturday(s.date)
        const detected = gc > 0
        d.detectWeeks.set(wk, (d.detectWeeks.get(wk) ?? false) || detected)
        if (detected) d.lastDetection = s.date
      }
      d.latest = { date: s.date, assay, category: cat }
    }
  }
  if (missingPmmov) warnings.push(`${missingPmmov} target result(s) without a numeric gc_g_dry_weight_pmmov`)
  if (missingGc) warnings.push(`${missingGc} target result(s) without a numeric gc_g_dry_weight`)
  for (const k of ['gc_g_dry_weight', 'gc_g_dry_weight_pmmov', 'activity_category']) {
    if (kept > 0 && !targetKeys.has(k)) warnings.push(`schema drift: target field "${k}" not present`)
  }
  for (const k of ['collection_date', 'targets']) {
    if (samples.length > 0 && !sampleKeys.has(k)) warnings.push(`schema drift: sample field "${k}" not present`)
  }
  return {
    targets,
    samples: samples.length,
    samplesKept: kept,
    firstDate: valid[0]?.date,
    lastDate: valid[valid.length - 1]?.date,
    assaysSeen: [...assayRange.keys()].sort(),
    sampleKeys: [...sampleKeys].sort(),
    targetKeys: [...targetKeys].sort(),
    warnings,
    unknownCategories: [...unknownCategories],
  }
}

/** "MeV_Roy_V2 (since 2026-02-27; earlier MeV_Roy)" or just "N Gene". */
export function describeAssays(assays: Record<string, AssayRange>, current: string): string {
  const others = Object.entries(assays)
    .filter(([a]) => a !== current)
    .sort(([, x], [, y]) => (x.first < y.first ? -1 : 1))
    .map(([a]) => a)
  if (!others.length) return current
  return `${current} (since ${assays[current]?.first ?? '?'}; earlier ${others.join(', ')})`
}

// ───────────────────────── Geography ─────────────────────────

type CountyFeatures = Map<string, Feature>

async function loadCountyFeatures(rootDir: string): Promise<CountyFeatures> {
  const file = path.join(rootDir, 'public', 'geo', 'mn-counties.geojson')
  const fc = JSON.parse(await readFile(file, 'utf8')) as FeatureCollection
  const m: CountyFeatures = new Map()
  for (const f of fc.features) {
    const fips = String((f.properties as { fips?: string } | null)?.fips ?? f.id ?? '')
    if (fips) m.set(fips, f)
  }
  return m
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4

export function normalizeCounties(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const c of raw) {
    const s = String(c ?? '').trim()
    if (/^\d{4,5}$/.test(s)) out.add(s.padStart(5, '0'))
  }
  return [...out].sort()
}

export function plantCoord(p: RawPlant | undefined): [number, number] | undefined {
  const c = p?.point?.coordinates
  if (Array.isArray(c) && c.length >= 2 && finite(c[0]) && finite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90)
    return [round4(c[0]), round4(c[1])]
  return undefined
}

export function plantGeo(uid: string, p: RawPlant | undefined, counties?: CountyFeatures): GeoRef {
  const city = (p?.city ?? '').trim() || (p?.name ?? '').replace(/,\s*[A-Z]{2}$/, '').trim() || uid
  const geo: GeoRef = { type: 'sewershed', code: `wwscan:${uid}`, name: `${city} (WastewaterSCAN)` }
  const fips = normalizeCounties(p?.counties_served)
  if (fips.length) geo.counties = fips
  if (finite(p?.sewershed_pop) && p.sewershed_pop > 0) geo.population = Math.round(p.sewershed_pop)
  const coord = plantCoord(p)
  if (coord) geo.coord = coord
  else if (counties && fips.length) {
    // No plant point: centroid of the counties served.
    const feats = fips.map((f) => counties.get(f)).filter((f): f is Feature => !!f)
    if (feats.length) {
      const [lon, lat] = geoCentroid({ type: 'FeatureCollection', features: feats })
      if (finite(lon) && finite(lat)) geo.coord = [round4(lon), round4(lat)]
    }
  }
  return geo
}

// ───────────────────────── Series building (pure) ─────────────────────────

export interface PlantInput {
  uid: string
  plant: RawPlant | undefined
  reduction: PlantReduction
  categories?: Record<string, RawCategoryEntry>
}

export interface BuildOptions {
  now: string
  historyStart: string
  countyFeatures?: CountyFeatures
}

const CONC_NOTE =
  'WastewaterSCAN measurement: gene copies per gram of dry solids divided by PMMoV (a marker of human fecal content), times one million. Each point is the mean of that week’s samples (usually 3). Compare trends within a plant and target only. These values cannot be compared with CDC NWSS values or with other targets.'

function provisionalFor(lastWeek: string | undefined, now: string): string | undefined {
  if (!lastWeek) return undefined
  // A week still in progress may get more samples (results arrive ~2 days after collection).
  return lastWeek >= weekEndingSaturday(now.slice(0, 10)) ? lastWeek : undefined
}

export function buildPlantSeries(
  input: PlantInput,
  opts: BuildOptions,
): { series: Series[]; skipped: Record<string, string>; discontinued: string[] } {
  const { uid, plant, reduction, categories } = input
  const geo = plantGeo(uid, plant, opts.countyFeatures)
  const cutoff = addDays(opts.now.slice(0, 10), -DISCONTINUED_DAYS)
  const series: Series[] = []
  const skipped: Record<string, string> = {}
  const discontinued: string[] = []
  // Stable order: follow PUBLIC_TARGETS order.
  const order = Object.keys(PUBLIC_TARGETS)
  const pubs = [...reduction.targets.keys()].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || (a < b ? -1 : 1)
  })
  for (const pub of pubs) {
    const d = reduction.targets.get(pub)!
    const spec = PUBLIC_TARGETS[pub]
    if (!spec) {
      skipped[pub] = SKIP_REASONS[pub] ?? 'no pathogen mapping'
      continue
    }
    if (!d.latest || d.latest.date < cutoff) {
      discontinued.push(`${pub} (last sample ${d.latest?.date ?? 'none'})`)
      continue
    }
    const points = since(toWeeklyPoints(d.raw, 'wastewater_conc', 'mean'), opts.historyStart)
    if (!points.length) continue
    const lastWeek = points[points.length - 1][0]
    const assays = Object.keys(d.assays)
    const switchNote =
      assays.length > 1
        ? ` Assay versions merged by WastewaterSCAN under "${pub}": ${Object.entries(d.assays)
            .sort(([, x], [, y]) => (x.first < y.first ? -1 : 1))
            .map(([a, r]) => `${a} ${r.first}–${r.last}`)
            .join('; ')}.`
        : ''
    const s = makeSeries({
      source: SOURCE,
      dataset: DS_CONC,
      pathogen: spec.pathogen,
      metric: 'wastewater_conc',
      geo,
      label: `${spec.name} — wastewater (WastewaterSCAN), per million PMMoV (normalized)`,
      points,
      variant: spec.variant,
      provisionalFrom: provisionalFor(lastWeek, opts.now),
      note: `${CONC_NOTE}${spec.note ? ` ${spec.note}` : ''}${switchNote}`,
    })
    const attrs: Record<string, string> = {
      plant: (plant?.site_name ?? plant?.name ?? geo.name).trim(),
      assay: describeAssays(d.assays, d.latest.assay),
    }
    if (NWSS_IDS[uid]) attrs.nwssId = NWSS_IDS[uid]
    // Publisher's classification of the latest sample.
    const asOf = toWeekEnding(d.latest.date) ?? undefined
    const cat = mapActivityCategory(d.latest.category)
    const verdict = trendFromCategory(categories?.[d.latest.assay])
    const verdictCurrent = verdict && (!verdict.lastSampleDate || toWeekEnding(verdict.lastSampleDate) === asOf)
    if (verdict && verdictCurrent) attrs.wwscanTrend = verdict.text
    const trend = verdictCurrent ? verdict?.trend : undefined
    if (cat || trend) {
      s.official = {
        ...(cat ? { level: cat.level } : {}),
        ...(trend ? { trend } : {}),
        label: [cat?.label, trend ? verdict!.text : undefined].filter(Boolean).join('; '),
        asOf,
        by: 'WastewaterSCAN',
      }
    }
    s.attrs = attrs
    series.push(s)
  }
  return { series, skipped, discontinued }
}

export interface DetectionAccumulator {
  /** pathogen → week → plants tested / plants with a detection */
  weeks: Map<PathogenId, Map<string, { tested: Set<string>; detected: Set<string> }>>
  assays: Map<PathogenId, Set<string>>
  lastDetection: Map<PathogenId, { date: string; plant: string }>
}

export function newDetectionAccumulator(): DetectionAccumulator {
  return { weeks: new Map(), assays: new Map(), lastDetection: new Map() }
}

/** Add one plant's rare-target results to the statewide detection tally. */
export function addDetections(acc: DetectionAccumulator, uid: string, plantName: string, r: PlantReduction, historyStart: string) {
  for (const [pub, d] of r.targets) {
    const spec = PUBLIC_TARGETS[pub]
    if (!spec?.rare) continue
    const byWeek = acc.weeks.get(spec.pathogen) ?? new Map()
    acc.weeks.set(spec.pathogen, byWeek)
    const assays = acc.assays.get(spec.pathogen) ?? new Set()
    acc.assays.set(spec.pathogen, assays)
    for (const a of Object.keys(d.assays)) assays.add(a)
    for (const [wk, detected] of d.detectWeeks) {
      if (wk < historyStart) continue
      const cell = byWeek.get(wk) ?? { tested: new Set<string>(), detected: new Set<string>() }
      cell.tested.add(uid)
      if (detected) cell.detected.add(uid)
      byWeek.set(wk, cell)
    }
    if (d.lastDetection) {
      const prev = acc.lastDetection.get(spec.pathogen)
      if (!prev || d.lastDetection > prev.date) acc.lastDetection.set(spec.pathogen, { date: d.lastDetection, plant: plantName })
    }
  }
}

const DETECT_NAMES: Partial<Record<PathogenId, string>> = {
  measles: 'Measles',
  mpox: 'Mpox (clade I or II)',
  h5n1: 'Influenza A H5',
  'hepatitis-a': 'Hepatitis A',
  'west-nile': 'West Nile virus',
}

export function buildDetectionSeries(acc: DetectionAccumulator, plantCount: number, opts: BuildOptions): Series[] {
  const out: Series[] = []
  const order: PathogenId[] = ['measles', 'mpox', 'h5n1', 'hepatitis-a', 'west-nile']
  const pathogens = [...acc.weeks.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  for (const pathogen of pathogens) {
    const byWeek = acc.weeks.get(pathogen)!
    const weeks = [...byWeek.keys()].filter((w) => w >= opts.historyStart).sort()
    if (!weeks.length) continue
    const points: Point[] = weeks.map((w) => [w, byWeek.get(w)!.detected.size])
    const lastWeek = weeks[weeks.length - 1]
    const lastCell = byWeek.get(lastWeek)!
    const last = acc.lastDetection.get(pathogen)
    const name = DETECT_NAMES[pathogen] ?? pathogen
    const s = makeSeries({
      source: SOURCE,
      dataset: DS_DETECT,
      pathogen,
      metric: 'ww_detections',
      geo: STATE_GEO,
      label: `${name} — Minnesota WastewaterSCAN plants with a detection (of ${plantCount})`,
      points,
      provisionalFrom: provisionalFor(lastWeek, opts.now),
      note:
        `Number of Minnesota WastewaterSCAN plants where at least one sample that week had any ${name} genetic material (gene copies > 0). ` +
        `Weeks are included only when at least one plant was tested. The plants are Rochester, Mankato, Red Wing and St. Cloud, and none are in the Twin Cities. ` +
        `This is not a case count: one infected person or a visitor can cause a detection.` +
        (pathogen === 'h5n1' ? ` ${H5_NOTE}` : ''),
    })
    s.attrs = {
      assays: [...(acc.assays.get(pathogen) ?? [])].sort().join(', '),
      plantsTestedLatestWeek: String(lastCell.tested.size),
      lastDetection: last ? `${last.date} (${last.plant})` : `none since ${weeks[0]}`,
    }
    if (lastCell.detected.size === 0) {
      s.official = {
        level: 'minimal',
        label: `Not detected (0 of ${lastCell.tested.size} plants tested)`,
        asOf: lastWeek,
        by: 'WastewaterSCAN sample results',
      }
    }
    out.push(s)
  }
  return out
}

// ───────────────────────── Fetching ─────────────────────────

/** MN plants from plants.json: state Minnesota, or any county served with FIPS prefix 27. */
export function selectMnPlants(plants: RawPlant[]): RawPlant[] {
  return plants.filter(
    (p) =>
      p &&
      (String(p.state ?? '').trim().toLowerCase() === 'minnesota' ||
        normalizeCounties(p.counties_served).some((c) => c.startsWith('27'))),
  )
}

const uidOf = (p: RawPlant): string | undefined =>
  (typeof p.uid === 'string' && p.uid) || (typeof p.id === 'string' ? p.id.split('-')[0] : undefined)

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function discoverPlants(
  ctx: SourceContext,
  diag: Record<string, unknown>,
  errors: string[],
): Promise<{ uid: string; meta?: RawPlant }[]> {
  try {
    const idx = await fetchJson<{ plants?: RawPlant[] }>(`${GCS}/plants.json`, { timeoutMs: 180_000, retries: 2 })
    const all = Array.isArray(idx?.plants) ? idx.plants : []
    const keys = new Set<string>()
    for (const p of all.slice(0, 20)) for (const k of Object.keys(p ?? {})) keys.add(k)
    const missing = ['uid', 'state', 'counties_served', 'sewershed_pop', 'point'].filter((k) => !keys.has(k))
    if (missing.length) ctx.log.warn(`plants.json schema drift: missing ${missing.join(', ')}`)
    const mn = selectMnPlants(all)
      .map((p) => ({ uid: uidOf(p), meta: p }))
      .filter((p): p is { uid: string; meta: RawPlant } => !!p.uid)
    diag.plantsIndex = {
      via: 'live',
      totalPlants: all.length,
      mnPlants: mn.map((p) => `${p.uid} ${p.meta.name ?? ''}`.trim()),
      fieldsSeen: [...keys].filter((k) => k !== 'polygon').sort(),
      missingFields: missing,
    }
    if (mn.length) return mn
    ctx.log.warn(`plants.json listed no Minnesota plants (of ${all.length}); using the built-in list`)
  } catch (e) {
    errors.push(`plants.json: ${errMsg(e)}`)
    diag.plantsIndex = { via: 'fallback', error: errMsg(e) }
  }
  return FALLBACK_MN_PLANTS.map((uid) => ({ uid }))
}

async function loadTargets(ctx: SourceContext, diag: Record<string, unknown>): Promise<Map<string, string>> {
  try {
    const t = await fetchJson<{ targets?: RawTargetDef[] }>(`${GCS}/targets.json`, { timeoutMs: 60_000, retries: 2 })
    const defs = Array.isArray(t?.targets) ? t.targets : []
    if (!defs.length || !defs.some((d) => typeof d?.public === 'string')) {
      ctx.log.warn('targets.json schema drift: no targets[].public; using the built-in assay map')
    }
    diag.targetsDictionary = { via: 'live', entries: defs.length }
    return assayPublicMap(defs)
  } catch (e) {
    ctx.log.warn(`targets.json unavailable (${errMsg(e)}); using the built-in assay map`)
    diag.targetsDictionary = { via: 'fallback', error: errMsg(e) }
    return assayPublicMap(null)
  }
}

async function loadCategories(ctx: SourceContext, diag: Record<string, unknown>): Promise<RawCategories | null> {
  try {
    const c = await fetchJson<RawCategories>(CATEGORIES_URL, { timeoutMs: 60_000, retries: 1 })
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('not a JSON object keyed by plant uid')
    diag.categories = { via: 'live', plants: Object.keys(c).length }
    return c
  } catch (e) {
    // Optional enrichment (trend verdicts); the host may block automated clients.
    ctx.log.info(`categories file unavailable (${errMsg(e).slice(0, 160)}); no WastewaterSCAN trend verdicts this run`)
    diag.categories = { via: 'unavailable', error: errMsg(e).slice(0, 300) }
    return null
  }
}

export const wastewaterscan: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'WastewaterSCAN',
    publisher: 'WastewaterSCAN (Stanford University, Emory University and Verily)',
    url: 'https://data.wastewaterscan.org/',
    description:
      'Levels of virus genetic material in wastewater solids at the 4 Minnesota treatment plants in the WastewaterSCAN program: Rochester, Mankato, Red Wing and St. Cloud. ' +
      'Targets are COVID-19, influenza A and B, RSV, hMPV, EV-D68, norovirus, rotavirus, enteric adenovirus, hepatitis A, measles, mpox, H5 influenza and West Nile virus. ' +
      'Values are normalized to PMMoV, a marker of how much human waste a sample contains, and shown per million PMMoV copies. The statewide count shows how many plants detected each rare target in a week. ' +
      'This does NOT count cases. It covers only the people served by these 4 plants, none of them in the Twin Cities, Duluth or northwest Minnesota. ' +
      'Values cannot be compared across targets or with CDC NWSS numbers. A single detection of a rare virus can come from one traveler, and H5 can come from animals.',
    geography: '4 Minnesota sewersheds (Rochester, Mankato, Red Wing, St. Cloud); statewide detection counts',
    cadence: 'About 3 samples per plant per week, posted about 2 days after collection',
    attribution: ATTRIBUTION,
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const diagnostics: Record<string, unknown> = { attribution: ATTRIBUTION }
    const opts: BuildOptions = { now: ctx.now, historyStart: ctx.historyStart }
    try {
      opts.countyFeatures = await loadCountyFeatures(ctx.rootDir)
    } catch (e) {
      ctx.log.warn(`county geometry unavailable for centroid fallback: ${errMsg(e)}`)
    }

    const plants = await discoverPlants(ctx, diagnostics, errors)
    const assayToPublic = await loadTargets(ctx, diagnostics)
    const categories = await loadCategories(ctx, diagnostics)

    const conc: Series[] = []
    const acc = newDetectionAccumulator()
    const plantDiag: Record<string, unknown>[] = []
    const skippedAll: Record<string, string> = {}
    let ok = 0
    // Sequential: each plant file is ~3.5 MB of JSON.
    for (const p of plants) {
      try {
        const file = await fetchJson<RawPlantFile>(`${GCS}/${p.uid}.json`, { timeoutMs: 180_000, retries: 2 })
        if (!file || !Array.isArray(file.samples)) throw new Error('response has no samples[] array (feed moved or changed shape?)')
        const meta: RawPlant | undefined = { ...(p.meta ?? {}), ...(file.plant ?? {}) }
        const reduction = reduceSamples(file.samples, assayToPublic, ctx.historyStart)
        const built = buildPlantSeries({ uid: p.uid, plant: meta, reduction, categories: categories?.[p.uid] }, opts)
        const geoName = built.series[0]?.geo.name ?? plantGeo(p.uid, meta).name
        addDetections(acc, p.uid, geoName.replace(' (WastewaterSCAN)', ''), reduction, ctx.historyStart)
        conc.push(...built.series)
        Object.assign(skippedAll, built.skipped)
        for (const w of reduction.warnings) ctx.log.warn(`${p.uid}: ${w}`)
        if (reduction.unknownCategories.length)
          ctx.log.warn(`${p.uid}: unrecognized activity_category value(s): ${reduction.unknownCategories.join(', ')}`)
        const updated = typeof file.updated === 'string' ? file.updated : undefined
        if (updated && updated.slice(0, 10) < addDays(ctx.now.slice(0, 10), -14))
          ctx.log.warn(`${p.uid}: plant file last updated ${updated} (more than 14 days ago)`)
        plantDiag.push({
          uid: p.uid,
          name: meta?.name ?? null,
          updated: updated ?? null,
          samples: reduction.samples,
          samplesInWindow: reduction.samplesKept,
          firstSample: reduction.firstDate ?? null,
          lastSample: reduction.lastDate ?? null,
          series: built.series.length,
          assaysSeen: reduction.assaysSeen,
          discontinued: built.discontinued,
          sampleFields: reduction.sampleKeys,
          targetFields: reduction.targetKeys,
          warnings: reduction.warnings,
        })
        ctx.log.info(
          `${p.uid} ${meta?.name ?? ''}: ${reduction.samples} samples (${reduction.firstDate}..${reduction.lastDate}), ${built.series.length} series`,
        )
        ok++
      } catch (e) {
        errors.push(`plant ${p.uid}: ${errMsg(e)}`)
        plantDiag.push({ uid: p.uid, error: errMsg(e) })
      }
    }

    let detections: Series[] = []
    try {
      detections = buildDetectionSeries(acc, ok, opts)
    } catch (e) {
      errors.push(`detections: ${errMsg(e)}`)
    }

    const latest = latestDate(conc)
    diagnostics.plants = plantDiag
    diagnostics.skippedTargets = skippedAll
    diagnostics.seriesCount = { [DS_CONC]: conc.length, [DS_DETECT]: detections.length }
    diagnostics.latestWeek = latest ?? null
    diagnostics.officialLevels = conc.filter((s) => s.official?.level).length
    diagnostics.officialTrends = conc.filter((s) => s.official?.trend).length
    for (const err of errors) ctx.log.warn(err)
    const summary = `${ok} of ${plants.length} Minnesota plants${latest ? `; latest week ${latest}` : ''}`
    return {
      datasets: [
        { source: SOURCE, dataset: DS_CONC, series: conc },
        { source: SOURCE, dataset: DS_DETECT, series: detections },
      ],
      message: errors.length ? `Partial refresh (${summary}): ${errors.join('; ')}` : summary,
      diagnostics,
    }
  },
}
