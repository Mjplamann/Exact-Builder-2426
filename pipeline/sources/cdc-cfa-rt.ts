// CDC Center for Forecasting and Outbreak Analytics (CFA) — epidemic trends and Rt for Minnesota.
//
// Datasets (data.cdc.gov):
//   * 5dqz-y4ea "CDC Epidemic Trends and Rt" — state + national. One model run per week (`as_of`,
//     usually a Tuesday). Each run re-estimates daily Rt for the ~28 days before `as_of` (56 days in
//     older runs) and assigns ONE epidemic-trend category per disease/state/run: Growing, Likely
//     Growing, Not Changing, Likely Declining, Declining, or Not Estimated (values blank).
//     `p_growing` = P(Rt > 1). Mirrored by PopHIVE, used automatically when data.cdc.gov is down.
//     Methods changed 2026-06-01 (per-state EpiNow2 → spatially pooled HGAM).
//   * ahfs-x44r "Epidemic Trends and Rt … at National, State, Local Level" (created 2026-10-01) —
//     adds health service area (HSA) estimates published as one row per county (identical values for
//     all counties in an HSA), with hubverse-style origin_date / target_date / horizon. Its column
//     names were not public when this was written, so they are discovered at runtime from the
//     Socrata view metadata and the county dataset is skipped (with a diagnostic) unless Minnesota
//     county rows can be identified unambiguously.
//
// Weekly series construction (both datasets): for every estimate date keep the value from the
// NEWEST model run that estimated it (the newest-vintage rule cdc-hubs uses for target data; a later
// run that is 'Not Estimated' across the board does not erase an earlier published estimate), then
// take, for each MMWR week, the estimate for the last estimated day of that week — the Saturday for
// complete weeks, the model-run date for the current partial week. Every point is a single value as
// published by CDC; nothing is averaged or interpolated. Days no run estimated become null points.
// `official` = the epidemic-trend category of the run behind the newest non-null point.
import type { GeoRef, PathogenId, Point, Series, TrendDirection } from '../../shared/types.ts'
import { addDays, weekEndingSaturday } from '../../shared/mmwr.ts'
import { MN_COUNTY_BY_FIPS, countyByName } from '../../shared/geo/mnCounties.ts'
import { fetchJson } from '../lib/http.ts'
import { loadCdcRows } from '../lib/cdcData.ts'
import { socrataQuery, soqlString } from '../lib/socrata.ts'
import { num } from '../lib/csv.ts'
import { makeSeries, roundValue, STATE_GEO, toIsoDate } from '../lib/series.ts'
import type { Logger } from '../lib/log.ts'
import type { SourceModule, SourceResult } from '../types.ts'

const SOURCE = 'cdc-cfa-rt'
export const STATE_DATASET = 'cfa-rt-mn'
export const COUNTY_DATASET = 'cfa-rt-county'
const STATE_ID = '5dqz-y4ea'
const LOCAL_ID = 'ahfs-x44r'
const BY = 'CDC CFA'

// ───────────────────────── parsing helpers (exported for tests) ─────────────────────────

const DISEASES: Record<string, { pathogen: PathogenId; name: string }> = {
  'covid-19': { pathogen: 'covid', name: 'COVID-19' },
  covid: { pathogen: 'covid', name: 'COVID-19' },
  'sars-cov-2': { pathogen: 'covid', name: 'COVID-19' },
  influenza: { pathogen: 'influenza', name: 'Flu' },
  flu: { pathogen: 'influenza', name: 'Flu' },
  rsv: { pathogen: 'rsv', name: 'RSV' },
}
const NAME_OF: Partial<Record<PathogenId, string>> = { covid: 'COVID-19', influenza: 'Flu', rsv: 'RSV' }

export function diseaseOf(raw: string | undefined): PathogenId | undefined {
  return raw ? DISEASES[raw.trim().toLowerCase()]?.pathogen : undefined
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/**
 * Dates arrive as ISO floating timestamps from the SODA API ("2026-09-29T00:00:00.000") and as
 * Socrata display strings in the PopHIVE mirror export ("2026 Sep 29 12:00:00 AM").
 */
export function parseCfaDate(raw: string | undefined | null): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  const m = /^(\d{4}) ([A-Za-z]{3})[A-Za-z]* (\d{1,2})\b/.exec(s)
  if (m) {
    const mm = MONTHS[m[2].toLowerCase()]
    return mm ? `${m[1]}-${mm}-${m[3].padStart(2, '0')}` : null
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return toIsoDate(s)
  return null
}

const TRENDS: Record<string, TrendDirection> = {
  growing: 'rising',
  'likely growing': 'rising',
  'not changing': 'steady',
  'likely declining': 'falling',
  declining: 'falling',
}
const normCategory = (c: string) => c.trim().toLowerCase().replace(/\s+/g, ' ')

/** CDC CFA epidemic-trend category → TrendDirection ('rising-fast'/'falling-fast' are never used). */
export function trendOf(category: string | undefined): TrendDirection | undefined {
  return category ? TRENDS[normCategory(category)] : undefined
}

export const isNotEstimated = (category: string | undefined) => normCategory(category ?? '') === 'not estimated'

/** "Likely Growing (86% chance Rt > 1)" — category verbatim plus CDC's P(Rt > 1). */
export function officialLabel(category: string, pGrowing: number | null): string {
  if (pGrowing == null || !trendOf(category)) return category
  const pct = pGrowing >= 0.995 ? '>99%' : pGrowing <= 0.005 ? '<1%' : `${Math.round(pGrowing * 100)}%`
  return `${category} (${pct} chance Rt > 1)`
}

export interface RtEstimate {
  /** '27' for the statewide estimate, 5-digit county FIPS for local (HSA) rows. */
  loc: string
  pathogen: PathogenId
  /** Model run (as_of / origin_date), ISO. */
  asOf: string
  /** Date the Rt estimate applies to (date / target_date), ISO. */
  date: string
  median: number | null
  lower: number | null
  upper: number | null
  pGrowing: number | null
  category: string
  intervalWidth?: number | null
  hsa?: string
  hsaName?: string
}

export const STATE_COLUMNS = ['as_of', 'disease', 'state', 'date', 'median', 'lower', 'upper', 'interval_width', 'p_growing', 'category']
const STATE_REQUIRED = ['as_of', 'disease', 'date', 'median', 'category']
/** Columns that are blank on 'Not Estimated' rows (and therefore absent from SODA JSON rows). */
const STATE_VALUE_COLUMNS = new Set(['median', 'lower', 'upper', 'interval_width', 'p_growing'])

export interface SchemaCheck {
  /** Field names present in at least one row. */
  seen: string[]
  /** Expected columns neither present in any row nor declared in the dataset metadata. */
  missing: string[]
  missingRequired: string[]
  /** Declared columns that no row carries a value for (informational). */
  noValues: string[]
}

/**
 * Check 5dqz-y4ea rows for schema drift. data.cdc.gov's JSON omits fields whose value is null, and
 * Minnesota's 'Not Estimated' rows (blank median/lower/upper/p_growing) come first in the dataset's
 * natural order, so every row is scanned and the dataset's declared columns (view metadata, when
 * available) count as present. Without metadata, a blank value column is only treated as missing
 * when some row has an estimated trend category — i.e. a value was expected but never appeared.
 */
export function checkStateSchema(rows: Record<string, string>[], declared?: string[]): SchemaCheck {
  const seen = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k)
  const known = new Set([...seen, ...(declared ?? [])])
  const estimated = rows.some((r) => trendOf(r.category) != null)
  const missing = STATE_COLUMNS.filter((c) => !known.has(c) && (declared?.length || estimated || !STATE_VALUE_COLUMNS.has(c)))
  return {
    seen: [...seen],
    missing,
    missingRequired: STATE_REQUIRED.filter((c) => missing.includes(c)),
    noValues: (declared ?? []).filter((c) => STATE_COLUMNS.includes(c) && !seen.has(c)),
  }
}

export interface ParseStats {
  rows: number
  kept: number
  otherLocation: number
  badDate: number
  unknownDisease: Record<string, number>
}

/** Normalize 5dqz-y4ea rows (API field names) for Minnesota. */
export function parseStateRows(rows: Record<string, string>[]): { estimates: RtEstimate[]; stats: ParseStats } {
  const stats: ParseStats = { rows: rows.length, kept: 0, otherLocation: 0, badDate: 0, unknownDisease: {} }
  const estimates: RtEstimate[] = []
  for (const r of rows) {
    if (r.state != null && r.state.trim() !== 'Minnesota') {
      stats.otherLocation++
      continue
    }
    const pathogen = diseaseOf(r.disease)
    if (!pathogen) {
      const k = r.disease ?? '(blank)'
      stats.unknownDisease[k] = (stats.unknownDisease[k] ?? 0) + 1
      continue
    }
    const asOf = parseCfaDate(r.as_of)
    const date = parseCfaDate(r.date)
    if (!asOf || !date) {
      stats.badDate++
      continue
    }
    estimates.push({
      loc: STATE_GEO.code,
      pathogen,
      asOf,
      date,
      median: num(r.median),
      lower: num(r.lower),
      upper: num(r.upper),
      pGrowing: num(r.p_growing),
      category: (r.category ?? '').trim(),
      intervalWidth: num(r.interval_width),
    })
    stats.kept++
  }
  return { estimates, stats }
}

/** For two rows from the same run and date, prefer the 95% interval when several are published. */
const preferInterval = (a: RtEstimate, b: RtEstimate) => a.intervalWidth === 0.95 && b.intervalWidth !== 0.95

/** Does `a` beat `b` for the same date: an actual estimate first, then the newer run, then the 95% interval. */
function better(a: RtEstimate, b: RtEstimate): boolean {
  const av = a.median != null
  const bv = b.median != null
  if (av !== bv) return av
  if (a.asOf !== b.asOf) return a.asOf > b.asOf
  return preferInterval(a, b)
}

/**
 * Keep, for every (location, pathogen, date), the estimate from the newest model run that produced
 * one. Some weekly runs are 'Not Estimated' across the board (e.g. MN runs of 2026-05-26 and
 * 2026-09-22, which blanked COVID-19 between two estimated runs); such blanks do not erase the
 * previous run's published estimate. A date only becomes null when no run estimated it. Sorted by date.
 */
export function newestPerDate(estimates: RtEstimate[]): Map<string, RtEstimate[]> {
  const best = new Map<string, Map<string, RtEstimate>>()
  for (const e of estimates) {
    const key = `${e.loc}|${e.pathogen}`
    let m = best.get(key)
    if (!m) best.set(key, (m = new Map()))
    const prev = m.get(e.date)
    if (!prev || better(e, prev)) m.set(e.date, e)
  }
  const out = new Map<string, RtEstimate[]>()
  for (const [key, m] of best) out.set(key, [...m.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)))
  return out
}

export interface RunInfo {
  asOf: string
  category: string
  /** First date in the run's estimation window (also when the run estimated nothing). */
  start: string
}

/**
 * The newest model run per (location, pathogen): its category (reported when it published no
 * estimate) and the start of its window (which dates the next weekly run will revise).
 */
export function newestRuns(estimates: RtEstimate[]): Map<string, RunInfo> {
  const out = new Map<string, RunInfo>()
  for (const e of estimates) {
    const key = `${e.loc}|${e.pathogen}`
    const prev = out.get(key)
    if (!prev || e.asOf > prev.asOf) out.set(key, { asOf: e.asOf, category: e.category, start: e.date })
    else if (e.asOf === prev.asOf && e.date < prev.start) prev.start = e.date
  }
  return out
}

/**
 * For each MMWR week (keyed by its Saturday), the estimate for the last day of that week that has
 * one; the week is null only when no day in it was estimated.
 */
export function weeklyLast(daily: RtEstimate[]): { week: string; e: RtEstimate }[] {
  const byWeek = new Map<string, RtEstimate>()
  for (const e of daily) {
    const wk = weekEndingSaturday(e.date)
    const prev = byWeek.get(wk)
    const ev = e.median != null
    const pv = prev?.median != null
    if (!prev || (ev && !pv) || (ev === pv && e.date > prev.date)) byWeek.set(wk, e)
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, e]) => ({ week, e }))
}

const r3 = (v: number) => String(Math.round(v * 1000) / 1000)

export interface BuildOptions {
  dataset: string
  geo: GeoRef
  historyStart: string
  note: string
  /** Prefix for the provenance attribute, e.g. "data.cdc.gov 5dqz-y4ea". */
  provenance: string
  /** Newest model run for this location/pathogen (from `newestRuns`), to flag a newer blank run. */
  newestRun?: RunInfo
}

/**
 * Build one weekly Rt series from newest-per-date daily estimates (sorted ascending). `official`
 * is CDC's epidemic-trend category from the model run behind the latest estimated day, so the
 * label always describes the newest value shown. CDC publishes no activity level for Rt (it is a
 * direction-of-spread measure), so `official.level` is always 'unknown' — this stops the analysis
 * from ranking Rt against its own history and calling it "high activity".
 */
export function buildRtSeries(daily: RtEstimate[], opts: BuildOptions): Series | null {
  const kept = daily.filter((e) => weekEndingSaturday(e.date) >= opts.historyStart)
  if (!kept.length) return null
  const weeks = weeklyLast(kept)
  const points: Point[] = weeks.map(({ week, e }) => [week, e.median == null ? null : roundValue(e.median, 'rt')])
  const valued = kept.filter((e) => e.median != null)
  const last = valued.length ? valued[valued.length - 1] : kept[kept.length - 1]
  const lastWeek = weekEndingSaturday(last.date)
  const finalWeek = points[points.length - 1][0]
  // Each weekly run re-estimates its whole window except the first week of the previous window.
  // Use the newest run's window even when that run was blank: the next run revises from there.
  const runStart =
    opts.newestRun && opts.newestRun.asOf >= last.asOf
      ? opts.newestRun.start
      : kept.filter((e) => e.asOf === last.asOf).reduce((m, e) => (e.date < m ? e.date : m), last.date)
  const nextRevised = weekEndingSaturday(addDays(runStart, 7))
  const pathogen = last.pathogen
  const s = makeSeries({
    source: SOURCE,
    dataset: opts.dataset,
    pathogen,
    metric: 'rt',
    geo: opts.geo,
    label: `${NAME_OF[pathogen] ?? pathogen} — estimated Rt (CDC CFA)`,
    points,
    provisionalFrom: nextRevised < points[0][0] ? points[0][0] : nextRevised <= finalWeek ? nextRevised : finalWeek,
    note: opts.note,
  })
  const trend = trendOf(last.category)
  s.official = {
    level: 'unknown',
    ...(trend ? { trend } : {}),
    ...(last.category ? { label: officialLabel(last.category, last.pGrowing) } : {}),
    asOf: lastWeek,
    by: BY,
  }
  const attrs: Record<string, string> = { modelRun: last.asOf, estimateDate: last.date, data: opts.provenance }
  if (opts.newestRun && opts.newestRun.asOf > last.asOf) {
    attrs.newestRun = opts.newestRun.asOf
    attrs.newestRunCategory = opts.newestRun.category || '(blank)'
  }
  if (last.category) attrs.category = last.category
  if (last.pGrowing != null) attrs.pGrowing = r3(last.pGrowing)
  if (last.lower != null) attrs.lower = r3(last.lower)
  if (last.upper != null) attrs.upper = r3(last.upper)
  if (last.intervalWidth) attrs.interval = `${Math.round(last.intervalWidth * 100)}% credible interval`
  if (last.hsa) attrs.hsa = last.hsa
  if (last.hsaName) attrs.hsaName = last.hsaName
  s.attrs = attrs
  return s
}

// ───────────────────────── ahfs-x44r (HSA / county) schema discovery ─────────────────────────

export interface SocrataColumn {
  name?: string
  fieldName: string
  dataTypeName?: string
}

export interface AhfsSchema {
  format: 'wide' | 'long'
  origin: string
  target: string
  horizon?: string
  /** Horizon is a numeric column, so `horizon <= 0` can be filtered server-side. */
  horizonNumeric?: boolean
  disease: string
  fips?: string
  fipsNumeric?: boolean
  countyName?: string
  state?: string
  median?: string
  lower?: string
  upper?: string
  pGrowing?: string
  category?: string
  intervalWidth?: string
  outputType?: string
  outputTypeId?: string
  value?: string
  hsa?: string
  hsaName?: string
  geoLevel?: string
}

const CANDIDATES: Record<Exclude<keyof AhfsSchema, 'format' | 'fipsNumeric' | 'horizonNumeric'>, string[]> = {
  origin: ['origin_date', 'as_of', 'reference_date', 'release_date'],
  target: ['target_date', 'date', 'estimate_date'],
  horizon: ['horizon'],
  disease: ['disease', 'pathogen', 'disease_name'],
  fips: ['county_fips', 'fips', 'county_fips_code', 'fips_code', 'countyfips', 'fips_county', 'county_code', 'geo_value', 'location', 'location_id'],
  countyName: ['county', 'county_name'],
  state: ['state', 'state_name', 'jurisdiction', 'state_abbr', 'state_abbreviation'],
  median: ['median', 'rt_median', 'median_rt', 'rt', 'rt_estimate', 'estimate', 'q_0_5', 'quantile_0_5', 'q50'],
  lower: ['lower', 'rt_lower', 'lower_95', 'lower_bound', 'ci_lower', 'lower_ci', 'q_0_025'],
  upper: ['upper', 'rt_upper', 'upper_95', 'upper_bound', 'ci_upper', 'upper_ci', 'q_0_975'],
  pGrowing: ['p_growing', 'prob_growing', 'probability_growing', 'p_growth'],
  category: ['category', 'trend_category', 'epidemic_trend', 'epidemic_trend_category', 'trend'],
  intervalWidth: ['interval_width'],
  outputType: ['output_type'],
  outputTypeId: ['output_type_id'],
  value: ['value'],
  hsa: ['hsa_nci_id', 'hsa_id', 'hsa', 'hsa_code', 'hsa_number'],
  hsaName: ['hsa_name', 'hsa_nci_name'],
  geoLevel: ['geo_type', 'geography_level', 'geo_level', 'geographic_level', 'geography_type', 'location_type', 'level', 'geo_resolution', 'resolution'],
}

/** Map Socrata columns to the fields we need, or explain why Minnesota county rows can't be identified. */
export function detectAhfsSchema(columns: SocrataColumn[]): { schema: AhfsSchema } | { reason: string } {
  const byName = new Map<string, SocrataColumn>()
  for (const c of columns) if (c.fieldName && !c.fieldName.startsWith(':')) byName.set(c.fieldName.toLowerCase(), c)
  const pick = (k: keyof typeof CANDIDATES) => {
    for (const n of CANDIDATES[k]) {
      const c = byName.get(n)
      if (c) return c
    }
    return undefined
  }
  const found: Partial<Record<keyof typeof CANDIDATES, SocrataColumn>> = {}
  for (const k of Object.keys(CANDIDATES) as (keyof typeof CANDIDATES)[]) {
    const c = pick(k)
    if (c) found[k] = c
  }
  // A column can satisfy only one role (e.g. 'date' must not be both origin and target).
  if (found.origin && found.target && found.origin.fieldName === found.target.fieldName) delete found.target
  const missing: string[] = []
  if (!found.origin) missing.push('origin date')
  if (!found.target) missing.push('target date')
  if (!found.disease) missing.push('disease')
  if (!found.fips && !(found.countyName && found.state)) missing.push('county FIPS (or county + state)')
  const long = !found.median && !!found.outputTypeId && !!found.value
  if (!found.median && !long) missing.push('Rt median (or output_type_id/value)')
  if (missing.length) return { reason: `could not identify ${missing.join(', ')}` }
  const f = (k: keyof typeof CANDIDATES) => found[k]?.fieldName
  return {
    schema: {
      format: long ? 'long' : 'wide',
      origin: f('origin')!,
      target: f('target')!,
      horizon: f('horizon'),
      horizonNumeric: found.horizon ? /number|integer|double/i.test(found.horizon.dataTypeName ?? '') : undefined,
      disease: f('disease')!,
      fips: f('fips'),
      fipsNumeric: found.fips ? /number|integer|double|money/i.test(found.fips.dataTypeName ?? '') : undefined,
      countyName: f('countyName'),
      state: f('state'),
      median: long ? undefined : f('median'),
      lower: long ? undefined : f('lower'),
      upper: long ? undefined : f('upper'),
      pGrowing: f('pGrowing'),
      category: f('category'),
      intervalWidth: f('intervalWidth'),
      outputType: long ? f('outputType') : undefined,
      outputTypeId: long ? f('outputTypeId') : undefined,
      value: long ? f('value') : undefined,
      hsa: f('hsa'),
      hsaName: f('hsaName'),
      geoLevel: f('geoLevel'),
    },
  }
}

/** Server-side filter that selects (a superset of) Minnesota county rows. */
export function ahfsMnWhere(s: AhfsSchema): string {
  if (s.fips) return s.fipsNumeric ? `${s.fips} between 27001 and 27199` : `${s.fips} like '27%'`
  return `${s.state} in ('Minnesota', 'MN')`
}

/** Filter for one release's rows: Minnesota, that origin date, and (when typed numeric) no forward horizons. */
export function ahfsReleaseWhere(s: AhfsSchema, origin: string): string {
  const parts = [ahfsMnWhere(s), `${s.origin} = ${soqlString(origin)}`]
  if (s.horizon && s.horizonNumeric) parts.push(`${s.horizon} <= 0`)
  return parts.join(' AND ')
}

/** Row cap for one ahfs-x44r release; reaching it means the release was truncated and is skipped. */
export const AHFS_MAX_ROWS = 400_000

export interface AhfsStats {
  rows: number
  kept: number
  notMnCounty: number
  notCountyLevel: number
  projected: number
  badDate: number
  unknownDisease: Record<string, number>
  conflicts: number
  geoLevels?: string[]
}

const cell = (r: Record<string, unknown>, k: string | undefined): string => {
  if (!k) return ''
  const v = r[k]
  return v == null ? '' : String(v).trim()
}

function resolveFips(r: Record<string, unknown>, s: AhfsSchema): string | null {
  if (s.fips) {
    const raw = cell(r, s.fips).replace(/\.0+$/, '')
    if (!/^\d{4,5}$/.test(raw)) return null
    const fips = raw.padStart(5, '0')
    return MN_COUNTY_BY_FIPS[fips] ? fips : null
  }
  const st = cell(r, s.state)
  if (st !== 'Minnesota' && st !== 'MN') return null
  return countyByName(cell(r, s.countyName).replace(/\s+county$/i, ''))?.fips ?? null
}

/** Normalize ahfs-x44r rows (one release) to county estimates; ambiguous data is counted in `conflicts`. */
export function parseAhfsRows(rows: Record<string, unknown>[], s: AhfsSchema): { estimates: RtEstimate[]; stats: AhfsStats } {
  const stats: AhfsStats = { rows: rows.length, kept: 0, notMnCounty: 0, notCountyLevel: 0, projected: 0, badDate: 0, unknownDisease: {}, conflicts: 0 }
  // If a geography-level column exists and some rows say "county", keep only those.
  let levelOk: (r: Record<string, unknown>) => boolean = () => true
  if (s.geoLevel) {
    const levels = [...new Set(rows.map((r) => cell(r, s.geoLevel)))]
    stats.geoLevels = levels.slice(0, 10)
    if (levels.some((l) => /county/i.test(l))) levelOk = (r) => /county/i.test(cell(r, s.geoLevel))
  }
  const groups = new Map<string, RtEstimate & { q?: Map<string, number> }>()
  for (const r of rows) {
    if (!levelOk(r)) {
      stats.notCountyLevel++
      continue
    }
    const fips = resolveFips(r, s)
    if (!fips) {
      stats.notMnCounty++
      continue
    }
    const pathogen = diseaseOf(cell(r, s.disease))
    if (!pathogen) {
      const k = cell(r, s.disease) || '(blank)'
      stats.unknownDisease[k] = (stats.unknownDisease[k] ?? 0) + 1
      continue
    }
    const asOf = parseCfaDate(cell(r, s.origin))
    const date = parseCfaDate(cell(r, s.target))
    if (!asOf || !date) {
      stats.badDate++
      continue
    }
    const horizon = s.horizon ? num(cell(r, s.horizon)) : null
    // Only estimates for dates already observed at release time (no forward projections).
    if (date > asOf || (horizon != null && horizon > 0)) {
      stats.projected++
      continue
    }
    const key = `${fips}|${pathogen}|${asOf}|${date}`
    const base: RtEstimate = {
      loc: fips,
      pathogen,
      asOf,
      date,
      median: null,
      lower: null,
      upper: null,
      pGrowing: s.pGrowing ? num(cell(r, s.pGrowing)) : null,
      category: cell(r, s.category),
      intervalWidth: s.intervalWidth ? num(cell(r, s.intervalWidth)) : null,
      hsa: cell(r, s.hsa) || undefined,
      hsaName: cell(r, s.hsaName) || undefined,
    }
    if (s.format === 'long') {
      if (s.outputType && cell(r, s.outputType).toLowerCase() !== 'quantile') continue
      const g = groups.get(key) ?? { ...base, q: new Map<string, number>() }
      const qid = num(cell(r, s.outputTypeId))
      const v = num(cell(r, s.value))
      if (qid != null && v != null) {
        const prevV = g.q!.get(String(qid))
        if (prevV != null && Math.abs(prevV - v) > 1e-9) stats.conflicts++
        else g.q!.set(String(qid), v)
      }
      if (!g.category && base.category) g.category = base.category
      if (g.pGrowing == null && base.pGrowing != null) g.pGrowing = base.pGrowing
      groups.set(key, g)
      continue
    }
    base.median = num(cell(r, s.median))
    base.lower = num(cell(r, s.lower))
    base.upper = num(cell(r, s.upper))
    const prev = groups.get(key)
    if (prev) {
      const differs =
        (prev.median == null) !== (base.median == null) ||
        (prev.median != null && base.median != null && Math.abs(prev.median - base.median) > 1e-9)
      if (differs) stats.conflicts++
      if (!preferInterval(base, prev)) continue
    }
    groups.set(key, base)
  }
  const estimates: RtEstimate[] = []
  for (const g of groups.values()) {
    if (g.q) {
      g.median = g.q.get('0.5') ?? null
      g.lower = g.q.get('0.025') ?? null
      g.upper = g.q.get('0.975') ?? null
      if (g.lower != null && g.upper != null) g.intervalWidth = 0.95
      delete g.q
    }
    estimates.push(g)
  }
  stats.kept = estimates.length
  return { estimates, stats }
}

// ───────────────────────── loaders ─────────────────────────

const STATE_NOTE =
  "CDC's estimate of the effective reproduction number (Rt) from daily emergency department visits (NSSP). " +
  'Rt above 1 means infections are likely growing; below 1, likely declining. It shows the direction of spread, not how much illness there is. ' +
  'Each week shows the estimate for its last day (the newest point is the latest model-run date), from the newest weekly model run that estimated that day; ' +
  'if a later run did not estimate a day, the earlier run\'s published estimate is kept. ' +
  'Recent weeks are nowcast-adjusted and revised weekly. CDC changed methods on 2026-06-01 (EpiNow2 → spatially pooled HGAM). ' +
  'Blank weeks: no CDC run estimated Rt (e.g. too few visits off-season).'

const COUNTY_NOTE =
  'CDC Rt for the health service area (HSA, a group of neighboring counties) — same value for every county in it. ' +
  'From emergency department visits (NSSP); above 1 means likely growing. Latest weekly release; recent days are revised.'

interface StateLoad {
  series: Series[]
  latestRun?: string
  diagnostics: Record<string, unknown>
}

async function loadState(historyStart: string, now: string, log: Logger): Promise<StateLoad> {
  const res = await loadCdcRows(STATE_ID, { where: "state = 'Minnesota'" }, (r) => r.state === 'Minnesota', log)
  // Mirror rows always carry every CSV column; live SODA rows omit null fields, so on the live path
  // also read the declared column list (best effort — the full-row scan alone is still correct).
  let declared: string[] | undefined
  if (res.via === 'data.cdc.gov') {
    try {
      const meta = await fetchJson<{ columns?: SocrataColumn[] }>(`https://data.cdc.gov/api/views/${STATE_ID}.json`, { retries: 1, timeoutMs: 60_000 })
      const cols = (meta.columns ?? []).map((c) => c.fieldName).filter((f) => f && !f.startsWith(':'))
      if (cols.length) declared = cols
    } catch (e) {
      log.warn(`${STATE_ID}: column metadata unavailable (${errText(e).slice(0, 120)}); checking schema from rows only`)
    }
  }
  const schema = checkStateSchema(res.rows, declared)
  if (schema.missing.length) {
    log.warn(`${STATE_ID} schema drift: missing column(s) ${schema.missing.join(', ')} (saw ${schema.seen.join(', ')}${declared ? `; declared ${declared.join(', ')}` : ''})`)
  }
  if (res.rows.length && schema.missingRequired.length) throw new Error(`${STATE_ID} schema drift: required column(s) ${schema.missingRequired.join(', ')} missing`)
  const { estimates, stats } = parseStateRows(res.rows)
  if (Object.keys(stats.unknownDisease).length) log.warn(`${STATE_ID}: ignoring unknown disease value(s) ${JSON.stringify(stats.unknownDisease)}`)
  if (stats.badDate) log.warn(`${STATE_ID}: ${stats.badDate} row(s) with unparseable dates`)
  // A trend category with a blank median is a publisher quirk (one real 2024-12-17 flu row); only
  // a widespread pattern suggests a renamed or emptied value column.
  const categorized = estimates.filter((e) => trendOf(e.category)).length
  const categoryWithoutValue = estimates.filter((e) => e.median == null && trendOf(e.category)).length
  if (categoryWithoutValue > Math.max(5, categorized * 0.01)) {
    log.warn(`${STATE_ID}: ${categoryWithoutValue} of ${categorized} row(s) have a trend category but no Rt median`)
  }
  const runs = [...new Set(estimates.map((e) => e.asOf))].sort()
  const latestRun = runs[runs.length - 1]
  const series: Series[] = []
  const perDisease: Record<string, unknown> = {}
  const newest = newestRuns(estimates)
  for (const [key, daily] of newestPerDate(estimates)) {
    const s = buildRtSeries(daily, {
      dataset: STATE_DATASET,
      geo: STATE_GEO,
      historyStart,
      note: STATE_NOTE,
      provenance: `data.cdc.gov ${STATE_ID}${res.via === 'pophive-mirror' ? ' (PopHIVE mirror)' : ''}`,
      newestRun: newest.get(key),
    })
    if (!s) continue
    const cat = s.attrs?.category ?? ''
    if (cat && !trendOf(cat) && !isNotEstimated(cat)) log.warn(`${STATE_ID}: unmapped trend category "${cat}" for ${key}`)
    series.push(s)
    perDisease[s.pathogen] = {
      modelRuns: new Set(estimates.filter((e) => e.pathogen === s.pathogen).map((e) => e.asOf)).size,
      latestRun: s.attrs?.modelRun,
      lastEstimateDate: s.attrs?.estimateDate,
      category: cat,
      newestRunCategory: s.attrs?.newestRunCategory,
      pGrowing: s.attrs?.pGrowing,
      weeks: s.points.length,
      nullWeeks: s.points.filter((p) => p[1] == null).length,
      firstWeek: s.points[0]?.[0],
      lastWeek: s.points[s.points.length - 1]?.[0],
    }
  }
  if (latestRun && latestRun < addDays(now.slice(0, 10), -14)) {
    log.warn(`${STATE_ID}: newest model run is ${latestRun}; the dataset may be paused or superseded by ${LOCAL_ID}`)
  }
  return {
    series,
    latestRun,
    diagnostics: {
      via: res.via,
      updatedAt: res.updatedAt,
      columnsSeen: schema.seen,
      ...(declared ? { columnsDeclared: declared } : {}),
      missingColumns: schema.missing,
      ...(schema.noValues.length ? { columnsWithoutValues: schema.noValues } : {}),
      ...stats,
      modelRuns: runs.length,
      ...(categoryWithoutValue ? { categoryWithoutValue } : {}),
      firstRun: runs[0],
      latestRun,
      categories: countBy(estimates.filter((e) => e.asOf === latestRun).map((e) => `${e.pathogen}:${e.category}`)),
      perDisease,
    },
  }
}

interface LocalLoad {
  series: Series[]
  latestOrigin?: string
  skipped?: string
  diagnostics: Record<string, unknown>
}

async function loadLocal(historyStart: string, log: Logger): Promise<LocalLoad> {
  const diagnostics: Record<string, unknown> = {}
  const meta = await fetchJson<{ columns?: SocrataColumn[]; rowsUpdatedAt?: number }>(
    `https://data.cdc.gov/api/views/${LOCAL_ID}.json`,
    { retries: 2, timeoutMs: 60_000 },
  )
  const columns = (meta.columns ?? []).filter((c) => c.fieldName && !c.fieldName.startsWith(':'))
  diagnostics.columns = columns.map((c) => `${c.fieldName}:${c.dataTypeName ?? '?'}`)
  if (meta.rowsUpdatedAt) diagnostics.updatedAt = new Date(meta.rowsUpdatedAt * 1000).toISOString()
  const det = detectAhfsSchema(columns)
  if ('reason' in det) {
    const skipped = `${det.reason} (columns: ${columns.map((c) => c.fieldName).join(', ') || 'none'})`
    log.warn(`${LOCAL_ID} skipped: ${skipped}`)
    return { series: [], skipped, diagnostics: { ...diagnostics, status: 'skipped', reason: skipped } }
  }
  const s = det.schema
  diagnostics.schema = s
  const where = ahfsMnWhere(s)
  const head = await socrataQuery<Record<string, unknown>>(LOCAL_ID, {
    select: s.origin,
    where: `${where} AND ${s.origin} IS NOT NULL`,
    order: `${s.origin} DESC`,
    pageSize: 1,
    maxRows: 1,
  })
  const latestRaw = head[0]?.[s.origin]
  if (latestRaw == null || latestRaw === '') {
    const skipped = `no rows match ${where}`
    log.warn(`${LOCAL_ID} skipped: ${skipped}`)
    return { series: [], skipped, diagnostics: { ...diagnostics, status: 'skipped', reason: skipped } }
  }
  const releaseWhere = ahfsReleaseWhere(s, String(latestRaw))
  diagnostics.where = releaseWhere
  const rows = await socrataQuery<Record<string, unknown>>(LOCAL_ID, { where: releaseWhere, maxRows: AHFS_MAX_ROWS })
  if (rows.length >= AHFS_MAX_ROWS) {
    const skipped = `release ${String(latestRaw)} reached the ${AHFS_MAX_ROWS}-row cap; counties or diseases could be cut off`
    log.warn(`${LOCAL_ID} skipped: ${skipped}`)
    return { series: [], skipped, diagnostics: { ...diagnostics, rows: rows.length, status: 'skipped', reason: skipped } }
  }
  const { estimates, stats } = parseAhfsRows(rows, s)
  Object.assign(diagnostics, stats)
  if (Object.keys(stats.unknownDisease).length) log.warn(`${LOCAL_ID}: ignoring unknown disease value(s) ${JSON.stringify(stats.unknownDisease)}`)
  if (stats.conflicts > 0) {
    const skipped = `${stats.conflicts} county/date key(s) carry different Rt values in one release — row structure not understood`
    log.warn(`${LOCAL_ID} skipped: ${skipped}`)
    return { series: [], skipped, diagnostics: { ...diagnostics, status: 'skipped', reason: skipped } }
  }
  if (!estimates.length) {
    const skipped = `${rows.length} row(s) fetched but none identified as Minnesota county estimates`
    log.warn(`${LOCAL_ID} skipped: ${skipped}`)
    return { series: [], skipped, diagnostics: { ...diagnostics, status: 'skipped', reason: skipped } }
  }
  const series: Series[] = []
  const newest = newestRuns(estimates)
  for (const [key, daily] of newestPerDate(estimates)) {
    const fips = daily[0].loc
    const county = MN_COUNTY_BY_FIPS[fips]
    const built = buildRtSeries(daily, {
      dataset: COUNTY_DATASET,
      geo: { type: 'county', code: fips, name: `${county.name} County` },
      historyStart,
      note: COUNTY_NOTE,
      provenance: `data.cdc.gov ${LOCAL_ID}`,
      newestRun: newest.get(key),
    })
    if (built) series.push(built)
  }
  const counties = new Set(estimates.map((e) => e.loc))
  if (counties.size < 87) log.warn(`${LOCAL_ID}: only ${counties.size}/87 Minnesota counties present in the latest release`)
  const latestOrigin = estimates.reduce((m, e) => (e.asOf > m ? e.asOf : m), '')
  return {
    series,
    latestOrigin,
    diagnostics: {
      ...diagnostics,
      status: 'ok',
      latestOrigin,
      counties: counties.size,
      hsas: new Set(estimates.map((e) => e.hsa).filter(Boolean)).size || undefined,
      categories: countBy(series.map((x) => `${x.pathogen}:${x.attrs?.category ?? ''}`)),
    },
  }
}

function countBy(items: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of items) out[i] = (out[i] ?? 0) + 1
  return out
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

// ───────────────────────── module ─────────────────────────

export const cdcCfaRt: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'CDC epidemic trends (Rt)',
    publisher: 'CDC Center for Forecasting and Outbreak Analytics (CFA)',
    url: 'https://www.cdc.gov/cfa-modeling-and-forecasting/rt-estimates/index.html',
    description:
      "CDC model estimates of the effective reproduction number (Rt) for COVID-19, flu and RSV in Minnesota, with CDC's weekly epidemic-trend call (Growing, Likely Growing, Not Changing, Likely Declining, Declining). " +
      'Rt is the average number of people each infected person goes on to infect: above 1 means infections are likely growing, below 1 likely declining. ' +
      'It is estimated from daily emergency department visits (NSSP). It measures the direction of spread, not how much illness there is — a virus at very low levels can still have Rt above 1 — and it is not a case count. ' +
      'Recent weeks are revised as more data arrive, and CDC skips estimates when there are too few visits. County values, when CDC publishes them, are health service area (HSA) estimates shared by neighboring counties.',
    geography: 'Minnesota statewide; health service areas shown by county when available',
    cadence: 'Weekly (model run on data through Tuesday, published later that week)',
    attribution: 'CDC Center for Forecasting and Outbreak Analytics — Epidemic Trends and Rt (data.cdc.gov 5dqz-y4ea, ahfs-x44r), based on NSSP emergency department data',
  },
  timeoutMs: 6 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const notes: string[] = []
    const diagnostics: Record<string, unknown> = {}
    let stateSeries: Series[] = []
    let countySeries: Series[] = []
    let stateLatest: string | undefined
    let localLatest: string | undefined

    try {
      const st = await loadState(ctx.historyStart, ctx.now, ctx.log)
      stateSeries = st.series
      stateLatest = st.latestRun
      diagnostics[STATE_ID] = st.diagnostics
      ctx.log.info(`${STATE_ID}: ${st.series.length} MN series via ${st.diagnostics.via}, newest model run ${st.latestRun ?? 'n/a'}`)
      if (!st.series.length) errors.push(`${STATE_ID}: no Minnesota estimates`)
    } catch (e) {
      errors.push(`${STATE_ID}: ${errText(e)}`)
      diagnostics[STATE_ID] = { error: errText(e) }
    }

    try {
      const lc = await loadLocal(ctx.historyStart, ctx.log)
      countySeries = lc.series
      localLatest = lc.latestOrigin
      diagnostics[LOCAL_ID] = lc.diagnostics
      if (lc.skipped) notes.push(`county Rt (${LOCAL_ID}) skipped: ${lc.skipped.slice(0, 200)}`)
      else ctx.log.info(`${LOCAL_ID}: ${lc.series.length} county series, release ${lc.latestOrigin}`)
    } catch (e) {
      errors.push(`${LOCAL_ID} (county Rt): ${errText(e)}`)
      diagnostics[LOCAL_ID] = { status: 'error', error: errText(e) }
    }

    diagnostics.freshness = { stateLatestRun: stateLatest, countyLatestRelease: localLatest }
    if (stateLatest && localLatest && localLatest > addDays(stateLatest, 7)) {
      const msg = `${LOCAL_ID} (release ${localLatest}) is newer than ${STATE_ID} (run ${stateLatest}); ${STATE_ID} may have been retired`
      ctx.log.warn(msg)
      notes.push(msg)
    }
    for (const err of errors) ctx.log.warn(err)
    const parts = [...(errors.length ? [`Partial refresh: ${errors.join('; ')}`] : []), ...notes]
    return {
      datasets: [
        { source: SOURCE, dataset: STATE_DATASET, series: stateSeries },
        { source: SOURCE, dataset: COUNTY_DATASET, series: countySeries },
      ],
      message: parts.length ? parts.join(' | ') : undefined,
      diagnostics,
    }
  },
}
