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
// 3), rounded to 4 significant figures. These units cannot be compared with CDC NWSS values or
// across targets.
//
// Robustness: a plant whose file fails to load, or whose schema drifted so that no usable values
// remain, is reported as an error and its previously published series are kept unchanged. If no
// plant loads, the module returns no data so the orchestrator keeps the previous files and marks
// the source stale. All fetches share one time budget that stays under the module timeout.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { geoCentroid } from 'd3-geo'
import type { Feature, FeatureCollection } from 'geojson'
import type { ActivityLevel, GeoRef, PathogenId, Point, Series, TrendDirection } from '../../shared/types.ts'
import { addDays, weekEndingSaturday } from '../../shared/mmwr.ts'
import { median } from '../../shared/stats.ts'
import { fetchJson, HttpError } from '../lib/http.ts'
import { latestDate, makeSeries, since, STATE_GEO, toWeekEnding } from '../lib/series.ts'
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
/** Weeks before last week used to judge a plant's usual number of samples per week. */
const USUAL_WEEKS = 8
/** A plant whose newest numeric value is this much older than its newest sample is treated as broken. */
const MAX_VALUE_LAG_DAYS = 14
/** Module timeout, and the shared fetch budget kept safely below it. */
const MODULE_TIMEOUT_MS = 8 * 60_000
const FETCH_BUDGET_MS = 7 * 60_000
/** Sample and target fields without which a plant file cannot produce data. */
const REQUIRED_SAMPLE_FIELDS = ['collection_date', 'targets']
const REQUIRED_TARGET_FIELDS = ['gc_g_dry_weight', 'gc_g_dry_weight_pmmov']

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
  /** Rare/emerging target: also counted in the statewide detection tally. */
  rare?: boolean
  note?: string
  /** Caveat about how WastewaterSCAN's per-sample category behaves for this target. */
  categoryNote?: string
}

const SEASONAL_CATEGORY_NOTE = 'Its category reads Low out of season even when nothing is detected.'

const H5_NOTE =
  'Detects any H5 influenza (not only H5N1); animal sources such as milk or bird droppings can cause detections, so they do not by themselves show human infection.'

/** Keyed by targets.json `public` id, which merges assay versions. */
export const PUBLIC_TARGETS: Record<string, TargetSpec> = {
  SC2_N: { pathogen: 'covid', name: 'COVID-19 (SARS-CoV-2 N gene)' },
  Influenza_A: { pathogen: 'influenza-a', name: 'Influenza A', categoryNote: SEASONAL_CATEGORY_NOTE },
  Influenza_B: { pathogen: 'influenza-b', name: 'Influenza B', categoryNote: SEASONAL_CATEGORY_NOTE },
  RSV: { pathogen: 'rsv', name: 'RSV (A and B combined)', categoryNote: SEASONAL_CATEGORY_NOTE },
  HMPV_4: { pathogen: 'hmpv', name: 'hMPV', categoryNote: SEASONAL_CATEGORY_NOTE },
  Noro_G2: { pathogen: 'norovirus', name: 'Norovirus GII' },
  Rotavirus: { pathogen: 'rotavirus', name: 'Rotavirus' },
  HAdV_F: { pathogen: 'adenovirus-gi', name: 'Adenovirus group F (enteric)' },
  'EV-D68': {
    pathogen: 'rhino-entero',
    name: 'EV-D68',
    variant: 'ev-d68',
    note: 'EV-D68 only, not rhinovirus or other enteroviruses.',
    categoryNote: 'Its category has two levels only (Low, Very high).',
  },
  HPIV: { pathogen: 'parainfluenza', name: 'Parainfluenza (HPIV)' },
  HAV: { pathogen: 'hepatitis-a', name: 'Hepatitis A', rare: true },
  MeV: {
    pathogen: 'measles',
    name: 'Measles (wild-type assay)',
    rare: true,
    note: 'Wild-type measles assay; one infected person or visitor can cause a detection.',
  },
  MPXV_G2R: {
    pathogen: 'mpox',
    name: 'Mpox clade II (MPXV G2R)',
    variant: 'clade-ii',
    rare: true,
    note: 'Clade II-specific G2R_WA assay since Dec 2022 (generic G2R_G before).',
  },
  'MPXV_dD14-16': { pathogen: 'mpox', name: 'Mpox clade Ib (MPXV dD14-16)', variant: 'clade-ib', rare: true },
  InfA_H5: { pathogen: 'h5n1', name: 'Influenza A H5', rare: true, note: H5_NOTE },
  WNV: { pathogen: 'west-nile', name: 'West Nile virus', rare: true },
}

/**
 * Rare targets that get a statewide "plants with a detection" series. Measles, mpox and H5 are left
 * out: CDC NWSS (cdc-nwss) publishes the same statewide count across all Minnesota NWSS sites,
 * including these 4 plants, and the analysis de-duplicates by pathogen|metric|geo, so a fresher
 * 4-plant count would replace the fuller CDC count. Their weekly tallies stay in diagnostics.
 */
export const STATE_DETECTION_PATHOGENS: PathogenId[] = ['hepatitis-a', 'west-nile']

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
  /** Newest sample date with a numeric normalized value for any target other than PMMoV. */
  lastValueDate?: string
  /** Week-ending Saturday → number of samples collected that week (whole file). */
  weekCounts: Map<string, number>
  assaysSeen: string[]
  sampleKeys: string[]
  targetKeys: string[]
  /** Required fields (REQUIRED_SAMPLE_FIELDS / REQUIRED_TARGET_FIELDS) absent from every record. */
  missingRequired: string[]
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
  const weekCounts = new Map<string, number>()
  for (const s of valid) {
    const wk = weekEndingSaturday(s.date)
    weekCounts.set(wk, (weekCounts.get(wk) ?? 0) + 1)
  }

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
  let lastValueDate: string | undefined
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
      const value = finite(pm) && pm >= 0 ? pm * PMMOV_SCALE : null
      if (value != null && pub !== 'PMMoV') lastValueDate = s.date
      d.raw.push([s.date, value])
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
  const missingRequired: string[] = []
  for (const k of [...REQUIRED_TARGET_FIELDS, 'activity_category']) {
    if (kept > 0 && !targetKeys.has(k)) {
      warnings.push(`schema drift: target field "${k}" not present`)
      if (REQUIRED_TARGET_FIELDS.includes(k)) missingRequired.push(k)
    }
  }
  for (const k of REQUIRED_SAMPLE_FIELDS) {
    if (samples.length > 0 && !sampleKeys.has(k)) {
      warnings.push(`schema drift: sample field "${k}" not present`)
      missingRequired.push(k)
    }
  }
  return {
    targets,
    samples: samples.length,
    samplesKept: kept,
    firstDate: valid[0]?.date,
    lastDate: valid[valid.length - 1]?.date,
    lastValueDate,
    weekCounts,
    assaysSeen: [...assayRange.keys()].sort(),
    sampleKeys: [...sampleKeys].sort(),
    targetKeys: [...targetKeys].sort(),
    missingRequired,
    warnings,
    unknownCategories: [...unknownCategories],
  }
}

/**
 * Why a reduced plant file cannot be published (schema drift or no usable values), or null when
 * it is usable. run() treats a non-null result as a failure for that plant.
 */
export function unusableReason(r: PlantReduction): string | null {
  if (r.missingRequired.length) return `schema drift: required field(s) ${r.missingRequired.join(', ')} not present`
  if (r.samples > 0 && r.samplesKept === 0 && !r.lastDate) return 'no sample has a usable collection_date and targets'
  if (r.samplesKept > 0 && !r.lastValueDate) return 'no numeric gc_g_dry_weight_pmmov value in any sample (schema drift?)'
  if (r.lastDate && r.lastValueDate && r.lastValueDate < addDays(r.lastDate, -MAX_VALUE_LAG_DAYS))
    return `samples after ${r.lastValueDate} (through ${r.lastDate}) carry no numeric gc_g_dry_weight_pmmov (schema drift?)`
  return null
}

/**
 * Weeks that may still receive samples: the week in progress, and last week when it has fewer
 * samples than this plant usually has (median of the USUAL_WEEKS calendar weeks before it, empty
 * weeks counted as 0). Results usually post 2–5 days after collection, so on Sunday–Wednesday last
 * week is often still missing its Friday sample.
 */
export function openWeeks(weekCounts: Map<string, number>, now: string): Set<string> {
  const current = weekEndingSaturday(now.slice(0, 10))
  const previous = addDays(current, -7)
  const out = new Set<string>([current])
  const prior: number[] = []
  for (let i = 1; i <= USUAL_WEEKS; i++) prior.push(weekCounts.get(addDays(previous, -7 * i)) ?? 0)
  const usual = median(prior)
  if (usual > 0 && (weekCounts.get(previous) ?? 0) < usual) out.add(previous)
  return out
}

/** provisionalFrom for a series whose newest week is `lastWeek`. */
function provisionalFor(lastWeek: string | undefined, open: Set<string>): string | undefined {
  if (!lastWeek) return undefined
  return open.has(lastWeek) || lastWeek > [...open].sort().at(-1)! ? lastWeek : undefined
}

/** Round to `digits` significant figures (keeps tiny non-zero values non-zero). */
export function sig(v: number, digits = 4): number {
  return v === 0 ? 0 : Number(v.toPrecision(digits))
}

/**
 * Weekly mean keyed by week-ending Saturday. A week whose samples all lack a value is kept as null
 * (the target was run but produced no usable number); weeks with no sample are absent.
 */
export function weeklyMeans(raw: [string, number | null][]): Point[] {
  const buckets = new Map<string, number[]>()
  for (const [d, v] of raw) {
    const wk = weekEndingSaturday(d)
    const arr = buckets.get(wk) ?? []
    if (v != null && Number.isFinite(v)) arr.push(v)
    buckets.set(wk, arr)
  }
  return [...buckets.keys()].sort().map((wk): Point => {
    const vals = buckets.get(wk)!
    return [wk, vals.length ? sig(vals.reduce((a, b) => a + b, 0) / vals.length) : null]
  })
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

export type CountyFeatures = Map<string, Feature>

export async function loadCountyFeatures(rootDir: string): Promise<CountyFeatures> {
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
  /** This plant's entries in WastewaterSCAN's categories file (trend verdicts), when reachable. */
  categories?: Record<string, RawCategoryEntry>
}

export interface BuildOptions {
  now: string
  historyStart: string
  countyFeatures?: CountyFeatures
  /** targets.json suggested_label per assay id (extra lookup key for the categories file). */
  assayLabels?: Map<string, string>
}

const CONC_NOTE =
  'Gene copies per gram of dry solids ÷ PMMoV (fecal-strength marker) × 1,000,000; weekly mean of samples (usually 3). Compare within one plant and target only. Official level: WastewaterSCAN’s category for the latest sample (since Jan 2026).'

/**
 * Keys to try in the categories file for one target: the assay id, then the targets.json public id,
 * then suggested_label. The only known sample is keyed "N Gene"/"RSV", where all three agree.
 */
export function categoryKeys(assay: string, pub: string, labels?: Map<string, string>): string[] {
  return [...new Set([assay, pub, labels?.get(assay)].filter((k): k is string => !!k))]
}

export interface PlantBuild {
  series: Series[]
  skipped: Record<string, string>
  discontinued: string[]
  /** Weeks of this plant that may still receive samples (see openWeeks). */
  openWeeks: Set<string>
  /** Categories-file lookups (only counted when the file was available). */
  trendLookups: { hit: number; miss: number }
}

export function buildPlantSeries(input: PlantInput, opts: BuildOptions): PlantBuild {
  const { uid, plant, reduction, categories } = input
  const geo = plantGeo(uid, plant, opts.countyFeatures)
  const cutoff = addDays(opts.now.slice(0, 10), -DISCONTINUED_DAYS)
  const open = openWeeks(reduction.weekCounts, opts.now)
  const series: Series[] = []
  const skipped: Record<string, string> = {}
  const discontinued: string[] = []
  const trendLookups = { hit: 0, miss: 0 }
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
    const points = since(weeklyMeans(d.raw), opts.historyStart)
    if (!points.length) continue
    const lastWeek = points[points.length - 1][0]
    const switchNote =
      Object.keys(d.assays).length > 1
        ? ` Assays merged by WastewaterSCAN: ${Object.entries(d.assays)
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
      provisionalFrom: provisionalFor(lastWeek, open),
      note: [CONC_NOTE, spec.categoryNote, spec.note].filter(Boolean).join(' ') + switchNote,
    })
    const asOf = toWeekEnding(d.latest.date) ?? undefined
    const attrs: Record<string, string> = {
      plant: (plant?.site_name ?? plant?.name ?? geo.name).trim(),
      assay: describeAssays(d.assays, d.latest.assay),
    }
    if (NWSS_IDS[uid]) attrs.nwssId = NWSS_IDS[uid]
    // Plain fact from the sample results (gene copies > 0), shown next to the publisher category,
    // which can read "Low" out of season with nothing detected.
    const detected = asOf ? d.detectWeeks.get(asOf) : undefined
    if (detected !== undefined) attrs.detectedLatestWeek = detected ? 'yes' : 'no'
    // Publisher's classification of the latest sample ('not calculated' → none).
    const cat = mapActivityCategory(d.latest.category)
    let verdict: ReturnType<typeof trendFromCategory> = null
    if (categories) {
      const key = categoryKeys(d.latest.assay, pub, opts.assayLabels).find((k) => categories[k])
      if (key) {
        trendLookups.hit++
        verdict = trendFromCategory(categories[key])
      } else trendLookups.miss++
    }
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
  return { series, skipped, discontinued, openWeeks: open, trendLookups }
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

const DETECT_ORDER: PathogenId[] = ['measles', 'mpox', 'h5n1', 'hepatitis-a', 'west-nile']

export interface DetectionOptions extends BuildOptions {
  /** Names of the plants whose results are in the tally (for the note). */
  plantNames: string[]
  /** Union of the plants' open weeks (see openWeeks): such a week may still change. */
  openWeeks: Set<string>
  /** Pathogens to publish (default STATE_DETECTION_PATHOGENS). */
  pathogens?: PathogenId[]
}

const listNames = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** Statewide weekly count of plants with any sample that detected a rare target (gene copies > 0). */
export function buildDetectionSeries(acc: DetectionAccumulator, opts: DetectionOptions): Series[] {
  const out: Series[] = []
  const wanted = new Set(opts.pathogens ?? STATE_DETECTION_PATHOGENS)
  const pathogens = [...acc.weeks.keys()]
    .filter((p) => wanted.has(p))
    .sort((a, b) => DETECT_ORDER.indexOf(a) - DETECT_ORDER.indexOf(b))
  const plantCount = opts.plantNames.length
  for (const pathogen of pathogens) {
    const byWeek = acc.weeks.get(pathogen)!
    const weeks = [...byWeek.keys()].filter((w) => w >= opts.historyStart).sort()
    if (!weeks.length) continue
    const points: Point[] = weeks.map((w) => [w, byWeek.get(w)!.detected.size])
    const lastWeek = weeks[weeks.length - 1]
    const lastCell = byWeek.get(lastWeek)!
    const last = acc.lastDetection.get(pathogen)
    const name = DETECT_NAMES[pathogen] ?? pathogen
    const assays = [...(acc.assays.get(pathogen) ?? [])].sort().join(', ')
    const s = makeSeries({
      source: SOURCE,
      dataset: DS_DETECT,
      pathogen,
      metric: 'ww_detections',
      geo: STATE_GEO,
      label: `${name} — Minnesota WastewaterSCAN plants with a detection (of ${plantCount})`,
      points,
      provisionalFrom: provisionalFor(lastWeek, opts.openWeeks),
      note:
        `Number of Minnesota WastewaterSCAN plants where at least one sample that week detected this target (gene copies > 0; assays: ${assays}). ` +
        `Weeks are included only when at least one plant was tested. Plants: ${listNames(opts.plantNames)}. ` +
        `This is not a case count: one infected person or a visitor can cause a detection.` +
        (pathogen === 'h5n1' ? ` ${H5_NOTE}` : ''),
    })
    // No `official`: WastewaterSCAN publishes no statewide classification for this count.
    s.attrs = {
      assays,
      plantsTestedLatestWeek: String(lastCell.tested.size),
      lastDetection: last ? `${last.date} (${last.plant})` : `none since ${weeks[0]}`,
    }
    out.push(s)
  }
  return out
}

/** Compact per-pathogen tally for diagnostics (all rare targets, published or not). */
export function detectionSummary(acc: DetectionAccumulator, published: Set<PathogenId>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const pathogen of [...acc.weeks.keys()].sort((a, b) => DETECT_ORDER.indexOf(a) - DETECT_ORDER.indexOf(b))) {
    const byWeek = acc.weeks.get(pathogen)!
    const weeks = [...byWeek.keys()].sort()
    const lastWeek = weeks.at(-1)
    const cell = lastWeek ? byWeek.get(lastWeek)! : undefined
    const last = acc.lastDetection.get(pathogen)
    out[pathogen] = {
      published: published.has(pathogen),
      latestWeek: lastWeek ?? null,
      latestWeekDetected: cell ? `${cell.detected.size} of ${cell.tested.size}` : null,
      weeksWithDetection: weeks.filter((w) => byWeek.get(w)!.detected.size > 0).length,
      lastDetection: last ? `${last.date} (${last.plant})` : null,
    }
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Smallest time worth starting a fetch attempt with. */
const MIN_ATTEMPT_MS = 10_000

/**
 * fetchJson under a shared deadline: each attempt's timeout is capped by the time left, and no
 * attempt starts with less than MIN_ATTEMPT_MS left. 4xx responses (other than 429) are not retried.
 */
export async function fetchJsonWithin<T>(
  url: string,
  opts: { timeoutMs: number; retries: number },
  deadline: number,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const left = deadline - Date.now()
    if (left < MIN_ATTEMPT_MS) {
      throw new Error(`time budget exhausted${lastErr ? ` after: ${errMsg(lastErr)}` : ` before fetching ${url}`}`)
    }
    try {
      return await fetchJson<T>(url, { timeoutMs: Math.min(opts.timeoutMs, left), retries: 0 })
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e
      lastErr = e
    }
    if (attempt < opts.retries) await sleep(Math.min(1000 * 2 ** attempt, Math.max(0, deadline - Date.now())))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

interface PlantRef {
  uid: string
  meta?: RawPlant
}

async function discoverPlants(
  ctx: SourceContext,
  diag: Record<string, unknown>,
  notices: string[],
  deadline: number,
): Promise<PlantRef[]> {
  try {
    // 11.6 MB (mostly sewershed polygons), needed only to find the plants: short budget, and the
    // built-in list plus each plant file's own `plant` metadata cover a failure.
    const idx = await fetchJsonWithin<{ plants?: RawPlant[] }>(`${GCS}/plants.json`, { timeoutMs: 60_000, retries: 1 }, deadline)
    const all = Array.isArray(idx?.plants) ? idx.plants : []
    const keys = new Set<string>()
    for (const p of all.slice(0, 20)) for (const k of Object.keys(p ?? {})) keys.add(k)
    const missing = ['uid', 'state', 'counties_served', 'sewershed_pop', 'point'].filter((k) => !keys.has(k))
    if (missing.length) ctx.log.warn(`plants.json schema drift: missing ${missing.join(', ')}`)
    const mn = selectMnPlants(all)
      .map((p) => ({ uid: uidOf(p), meta: p }))
      .filter((p): p is { uid: string; meta: RawPlant } => !!p.uid)
    const found = mn.map((p) => p.uid).sort()
    const expected = [...FALLBACK_MN_PLANTS].sort()
    const changed = found.join(',') !== expected.join(',')
    if (mn.length && changed) {
      ctx.log.warn(
        `Minnesota plant list changed: found ${found.join(', ')}; expected ${expected.join(', ')}. Update FALLBACK_MN_PLANTS, NWSS_IDS and meta text.`,
      )
    }
    diag.plantsIndex = {
      via: 'live',
      totalPlants: all.length,
      mnPlants: mn.map((p) => `${p.uid} ${p.meta.name ?? ''}`.trim()),
      changedFromBuiltIn: changed,
      fieldsSeen: [...keys].filter((k) => k !== 'polygon').sort(),
      missingFields: missing,
    }
    if (mn.length) return mn
    ctx.log.warn(`plants.json listed no Minnesota plants (of ${all.length}); using the built-in list`)
  } catch (e) {
    // Not an error for the run: the built-in list and each plant file's own metadata suffice.
    ctx.log.warn(`plants.json unavailable (${errMsg(e).slice(0, 160)}); using the built-in plant list`)
    notices.push('plant index unavailable, used the built-in plant list')
    diag.plantsIndex = { via: 'fallback', error: errMsg(e).slice(0, 300) }
  }
  return FALLBACK_MN_PLANTS.map((uid) => ({ uid }))
}

interface TargetDictionary {
  assayToPublic: Map<string, string>
  assayLabels: Map<string, string>
}

async function loadTargets(ctx: SourceContext, diag: Record<string, unknown>, deadline: number): Promise<TargetDictionary> {
  try {
    const t = await fetchJsonWithin<{ targets?: RawTargetDef[] }>(`${GCS}/targets.json`, { timeoutMs: 45_000, retries: 1 }, deadline)
    const defs = Array.isArray(t?.targets) ? t.targets : []
    if (!defs.length || !defs.some((d) => typeof d?.public === 'string')) {
      ctx.log.warn('targets.json schema drift: no targets[].public; using the built-in assay map')
    }
    diag.targetsDictionary = { via: 'live', entries: defs.length }
    const assayLabels = new Map<string, string>()
    for (const d of defs) {
      if (d && typeof d.id === 'string' && typeof d.suggested_label === 'string' && d.suggested_label.trim())
        assayLabels.set(d.id, d.suggested_label.trim())
    }
    return { assayToPublic: assayPublicMap(defs), assayLabels }
  } catch (e) {
    ctx.log.warn(`targets.json unavailable (${errMsg(e)}); using the built-in assay map`)
    diag.targetsDictionary = { via: 'fallback', error: errMsg(e).slice(0, 300) }
    return { assayToPublic: assayPublicMap(null), assayLabels: new Map() }
  }
}

async function loadCategories(ctx: SourceContext, diag: Record<string, unknown>, deadline: number): Promise<RawCategories | null> {
  try {
    const c = await fetchJsonWithin<RawCategories>(CATEGORIES_URL, { timeoutMs: 30_000, retries: 0 }, deadline)
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

/** Series from the previously published file for this source and dataset (empty when none). */
async function previousSeries(rootDir: string, dataset: string): Promise<Series[]> {
  try {
    const file = JSON.parse(await readFile(path.join(rootDir, 'public', 'data', 'series', `${SOURCE}__${dataset}.json`), 'utf8'))
    return Array.isArray(file?.series)
      ? (file.series as Series[]).filter((s) => s?.source === SOURCE && Array.isArray(s.points))
      : []
  } catch {
    return []
  }
}

export const wastewaterscan: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'WastewaterSCAN',
    publisher: 'WastewaterSCAN (Stanford University, Emory University and Verily)',
    url: 'https://data.wastewaterscan.org/',
    description:
      'Levels of virus genetic material in wastewater solids at the Minnesota treatment plants in the WastewaterSCAN program (4 as of October 2026: Rochester, Mankato, Red Wing and St. Cloud). ' +
      'Targets are COVID-19, influenza A and B, RSV, hMPV, EV-D68, norovirus, rotavirus, enteric adenovirus, hepatitis A, measles, mpox, H5 influenza and West Nile virus. ' +
      'Values are normalized to PMMoV, a marker of how much human waste a sample contains, and shown per million PMMoV copies. A statewide weekly count shows how many of these plants detected hepatitis A or West Nile virus. ' +
      'This does NOT count cases. It covers only the people served by these plants, none of them in the Twin Cities, Duluth or northwest Minnesota. ' +
      'Values cannot be compared across targets or with CDC NWSS numbers. A single detection of a rare virus can come from one traveler, and H5 can come from animals.',
    geography: 'Minnesota WastewaterSCAN sewersheds (4 as of October 2026); statewide detection counts',
    cadence: 'About 3 samples per plant per week (usually Mon/Wed/Fri); results usually post 2–5 days after collection',
    attribution: ATTRIBUTION,
  },
  timeoutMs: MODULE_TIMEOUT_MS,
  async run(ctx): Promise<SourceResult> {
    const deadline = Date.now() + FETCH_BUDGET_MS
    const errors: string[] = []
    /** Non-failures worth showing on the Sources page. */
    const notices: string[] = []
    const diagnostics: Record<string, unknown> = { attribution: ATTRIBUTION }
    const opts: BuildOptions = { now: ctx.now, historyStart: ctx.historyStart }
    try {
      opts.countyFeatures = await loadCountyFeatures(ctx.rootDir)
    } catch (e) {
      ctx.log.warn(`county geometry unavailable for centroid fallback: ${errMsg(e)}`)
    }

    // Independent small files in parallel, so one stall cannot use up the whole budget.
    const [plants, dict, categories] = await Promise.all([
      discoverPlants(ctx, diagnostics, notices, deadline),
      loadTargets(ctx, diagnostics, deadline),
      loadCategories(ctx, diagnostics, deadline),
    ])
    opts.assayLabels = dict.assayLabels

    // Plant files (~3.5 MB each) are fetched in parallel and processed in order.
    const files = await Promise.allSettled(
      plants.map((p) => fetchJsonWithin<RawPlantFile>(`${GCS}/${p.uid}.json`, { timeoutMs: 120_000, retries: 2 }, deadline)),
    )

    const conc: Series[] = []
    const acc = newDetectionAccumulator()
    const plantDiag: Record<string, unknown>[] = []
    const skippedAll: Record<string, string> = {}
    const loadedNames: string[] = []
    const failed: PlantRef[] = []
    const open = new Set<string>()
    const lookups = { hit: 0, miss: 0 }
    for (const [i, p] of plants.entries()) {
      try {
        const res = files[i]
        if (res.status === 'rejected') throw res.reason
        const file = res.value
        if (!file || !Array.isArray(file.samples)) throw new Error('response has no samples[] array (feed moved or changed shape?)')
        const meta: RawPlant = { ...(p.meta ?? {}), ...(file.plant ?? {}) }
        const reduction = reduceSamples(file.samples, dict.assayToPublic, ctx.historyStart)
        for (const w of reduction.warnings) ctx.log.warn(`${p.uid}: ${w}`)
        const bad = unusableReason(reduction)
        if (bad) throw new Error(bad)
        const built = buildPlantSeries({ uid: p.uid, plant: meta, reduction, categories: categories?.[p.uid] }, opts)
        const name = (built.series[0]?.geo.name ?? plantGeo(p.uid, meta).name).replace(' (WastewaterSCAN)', '')
        addDetections(acc, p.uid, name, reduction, ctx.historyStart)
        loadedNames.push(name)
        for (const w of built.openWeeks) open.add(w)
        lookups.hit += built.trendLookups.hit
        lookups.miss += built.trendLookups.miss
        conc.push(...built.series)
        Object.assign(skippedAll, built.skipped)
        if (!built.series.length) ctx.log.warn(`${p.uid}: no active targets (all discontinued or unmapped)`)
        if (reduction.unknownCategories.length)
          ctx.log.warn(`${p.uid}: unrecognized activity_category value(s): ${reduction.unknownCategories.join(', ')}`)
        const updated = typeof file.updated === 'string' ? file.updated : undefined
        if (updated && updated.slice(0, 10) < addDays(ctx.now.slice(0, 10), -14))
          ctx.log.warn(`${p.uid}: plant file last updated ${updated} (more than 14 days ago)`)
        const lastWeek = reduction.lastDate ? weekEndingSaturday(reduction.lastDate) : undefined
        plantDiag.push({
          uid: p.uid,
          name: meta.name ?? null,
          updated: updated ?? null,
          samples: reduction.samples,
          samplesInWindow: reduction.samplesKept,
          firstSample: reduction.firstDate ?? null,
          lastSample: reduction.lastDate ?? null,
          samplesLatestWeek: lastWeek ? `${reduction.weekCounts.get(lastWeek) ?? 0} (week ${lastWeek})` : null,
          provisionalWeek: lastWeek && built.openWeeks.has(lastWeek) ? lastWeek : null,
          series: built.series.length,
          assaysSeen: reduction.assaysSeen,
          discontinued: built.discontinued,
          sampleFields: reduction.sampleKeys,
          targetFields: reduction.targetKeys,
          warnings: reduction.warnings,
        })
        ctx.log.info(
          `${p.uid} ${meta.name ?? ''}: ${reduction.samples} samples (${reduction.firstDate}..${reduction.lastDate}), ${built.series.length} series`,
        )
      } catch (e) {
        failed.push(p)
        errors.push(`plant ${p.uid}: ${errMsg(e)}`)
        plantDiag.push({ uid: p.uid, error: errMsg(e).slice(0, 300) })
      }
    }
    diagnostics.plants = plantDiag
    diagnostics.skippedTargets = skippedAll
    if (categories) (diagnostics.categories as Record<string, unknown>).lookups = lookups

    const ok = loadedNames.length
    if (ok === 0) {
      // Nothing usable: return no series so the orchestrator keeps the previous files and marks
      // the source stale with this message.
      for (const err of errors) ctx.log.warn(err)
      return {
        datasets: [
          { source: SOURCE, dataset: DS_CONC, series: [] },
          { source: SOURCE, dataset: DS_DETECT, series: [] },
        ],
        message: `No Minnesota plant could be loaded (0 of ${plants.length}): ${errors.join('; ')}`,
        diagnostics,
      }
    }

    // A failed plant keeps its last published series unchanged, so one bad file does not remove
    // the plant from the dashboard.
    if (failed.length) {
      const prevConc = await previousSeries(ctx.rootDir, DS_CONC)
      const keptPrevious: Record<string, string | null> = {}
      for (const p of failed) {
        const kept = prevConc.filter((s) => s.geo?.code === `wwscan:${p.uid}`)
        conc.push(...kept)
        keptPrevious[p.uid] = kept.length ? `${kept.length} series through ${latestDate(kept) ?? 'n/a'}` : null
        if (kept.length) errors.push(`kept ${kept.length} previously published series for ${p.uid} (through ${latestDate(kept) ?? 'n/a'})`)
      }
      diagnostics.keptPrevious = keptPrevious
    }

    // Statewide counts need every plant: with a plant missing, history would be rewritten without
    // its detections, so the last published counts are kept instead when they exist.
    let detections: Series[] = []
    try {
      const fresh = buildDetectionSeries(acc, { ...opts, plantNames: loadedNames, openWeeks: open })
      if (!failed.length) detections = fresh
      else {
        const prevDet = await previousSeries(ctx.rootDir, DS_DETECT)
        const missing = failed.map((p) => p.uid).join(', ')
        const kept: string[] = []
        for (const pathogen of STATE_DETECTION_PATHOGENS) {
          const prev = prevDet.find((x) => x.pathogen === pathogen && x.metric === 'ww_detections')
          const s = fresh.find((x) => x.pathogen === pathogen)
          if (prev) {
            detections.push(prev)
            kept.push(`${pathogen} through ${latestDate([prev]) ?? 'n/a'}`)
          } else if (s) {
            s.attrs = { ...s.attrs, plantsMissing: missing }
            detections.push(s)
          }
        }
        errors.push(
          kept.length
            ? `kept previously published statewide detection counts (${kept.join(', ')}) because plant(s) ${missing} are missing`
            : `statewide detection counts cover ${ok} of ${plants.length} plants`,
        )
      }
    } catch (e) {
      errors.push(`detections: ${errMsg(e)}`)
    }
    diagnostics.detections = detectionSummary(acc, new Set(detections.map((s) => s.pathogen)))

    const latest = latestDate(conc)
    diagnostics.seriesCount = { [DS_CONC]: conc.length, [DS_DETECT]: detections.length }
    diagnostics.latestWeek = latest ?? null
    diagnostics.provisionalWeeks = [...open].sort()
    diagnostics.officialLevels = conc.filter((s) => s.official?.level).length
    diagnostics.officialTrends = conc.filter((s) => s.official?.trend).length
    for (const err of errors) ctx.log.warn(err)
    const summary = [`${ok} of ${plants.length} Minnesota plants`, latest ? `latest week ${latest}` : '', ...notices]
      .filter(Boolean)
      .join('; ')
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
