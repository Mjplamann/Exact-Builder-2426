// Pure parsing/mapping helpers for the CDC NREVSS source (pipeline/sources/cdc-nrevss.ts).
//
// Datasets (data.cdc.gov):
//   rgnm-fkqb  NREVSS dashboard: weekly NAAT % positive for 7 respiratory viruses, National + HHS regions.
//              A third-party catalog reports state rows for RSV and SARS-CoV-2 only, with a 3-week-average
//              column (percent_pos_3wma); their exact encoding and time span are UNVERIFIED (no live access).
//   3cxc-4k8q  RSV NAAT % positive by HHS region (regional values are centered 3-week moving averages).
//   gvsb-yw6g  SARS-CoV-2 NAAT % positive by HHS region (same layout as 3cxc-4k8q).
//   seuz-s2cv  National % of tests positive for COVID-19, influenza and RSV.
// All four can hold several "posted" vintages of the same week; the newest posting wins.
import type { GeoRef, PathogenId, Point } from '../../shared/types.ts'
import { weekEndingSaturday } from '../../shared/mmwr.ts'
import { num } from './csv.ts'
import { roundValue } from './series.ts'

export type GeoKey = 'HHS5' | 'US' | 'MN'

export const HHS5_GEO: GeoRef = { type: 'hhs-region', code: 'HHS5', name: 'HHS Region 5 (MN, WI, IL, IN, MI, OH)' }
export const US_GEO: GeoRef = { type: 'national', code: 'US', name: 'United States' }

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function hms(h: string | undefined, m: string | undefined, s: string | undefined, ampm: string | undefined): string {
  let hour = Number(h ?? 0)
  if (ampm) {
    const pm = ampm.toUpperCase() === 'PM'
    if (hour === 12) hour = pm ? 12 : 0
    else if (pm) hour += 12
  }
  return `${String(hour).padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}:${(s ?? '00').padStart(2, '0')}`
}

/**
 * Parse the timestamp formats Socrata emits into a sortable, timezone-free "YYYY-MM-DDTHH:MM:SS":
 *   SODA JSON         "2026-09-30T19:40:20.000"
 *   PopHIVE export    "2026 Sep 30 07:40:20 PM"
 *   rows.csv export   "09/30/2026 07:40:20 PM"
 */
export function parseSocrataTimestamp(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${hms(m[4], m[5], m[6], undefined)}`
  m = /^(\d{4})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(s)
  if (m && MONTHS[m[2].toLowerCase()]) {
    return `${m[1]}-${MONTHS[m[2].toLowerCase()]}-${m[3].padStart(2, '0')}T${hms(m[4], m[5], m[6], m[7])}`
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(s)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T${hms(m[4], m[5], m[6], m[7])}`
  return null
}

/** MMWR week-ending Saturday for a Socrata week field (normally already a Saturday). */
export function weekOf(raw: unknown): string | null {
  const ts = parseSocrataTimestamp(raw)
  if (!ts) return null
  const d = ts.slice(0, 10)
  const t = Date.parse(`${d}T00:00:00Z`)
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return null
  return weekEndingSaturday(d)
}

const PATHOGEN_ALIASES: Record<string, PathogenId> = {
  RSV: 'rsv',
  RESPIRATORYSYNCYTIALVIRUS: 'rsv',
  SARSCOV2: 'covid',
  COVID19: 'covid',
  COVID: 'covid',
  HMPV: 'hmpv',
  HUMANMETAPNEUMOVIRUS: 'hmpv',
  ADENOVIRUS: 'adenovirus',
  RESPIRATORYADENOVIRUS: 'adenovirus',
  ADV: 'adenovirus',
  PIV: 'parainfluenza',
  HPIV: 'parainfluenza',
  PARAINFLUENZA: 'parainfluenza',
  PARAINFLUENZAVIRUS: 'parainfluenza',
  PARAINFLUENZAVIRUSES: 'parainfluenza',
  RVEV: 'rhino-entero',
  RHINOVIRUSENTEROVIRUS: 'rhino-entero',
  HCOV: 'seasonal-cov',
  SEASONALCORONAVIRUS: 'seasonal-cov',
  SEASONALCORONAVIRUSES: 'seasonal-cov',
  COMMONHUMANCORONAVIRUS: 'seasonal-cov',
  COMMONHUMANCORONAVIRUSES: 'seasonal-cov',
  INFLUENZA: 'influenza',
  FLU: 'influenza',
}

/** Map an NREVSS/CDC pathogen label ('RV/EV', 'SARS-COV-2', 'HCOV', 'Influenza', …) to a PathogenId. */
export function normalizePathogen(raw: unknown): PathogenId | null {
  if (raw == null) return null
  const key = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return PATHOGEN_ALIASES[key] ?? null
}

/**
 * Rank rgnm-fkqb subtype encodings. Aggregate rows have subtype NULL for most viruses, but PIV and
 * HCoV publish only per-subtype rows plus subtype='Combined Type'. 2 = NULL (preferred),
 * 1 = combined/total (fallback), 0 = a component subtype (never used as the aggregate).
 */
export function subtypeRank(raw: unknown): 0 | 1 | 2 {
  const s = raw == null ? '' : String(raw).trim()
  if (s === '' || /^(null|na|n\/a)$/i.test(s)) return 2
  if (/\b(combined|total|overall|aggregate)\b|^all\b/i.test(s)) return 1
  return 0
}

const MN_STATE = /^(minnesota|mn|27)$/i
const AGGREGATE_STATE = /region|national|^usa?$|united states|^all$|overall|total|^(na|n\/a|null)$/i

/**
 * Which geography a row describes. Regional/national aggregate rows have an empty state (or a state cell
 * that repeats the level); rows naming a state are state-level rows (only Minnesota is kept).
 */
export function geoKeyOf(level: unknown, state?: unknown): GeoKey | 'other-state' | null {
  const lv = level == null ? '' : String(level).trim()
  const st = state == null ? '' : String(state).trim()
  if (st && st.toLowerCase() !== lv.toLowerCase() && !AGGREGATE_STATE.test(st)) {
    return MN_STATE.test(st) ? 'MN' : 'other-state'
  }
  if (/^(national|usa?|united states)$/i.test(lv)) return 'US'
  if (/^(hhs\s*)?region\s*0?5$/i.test(lv)) return 'HHS5'
  if (MN_STATE.test(lv)) return 'MN'
  return null
}

/** One observation candidate (one row of one vintage). */
export interface Obs {
  geo: GeoKey
  pathogen: PathogenId
  week: string
  /** Sortable posting timestamp ('' when the dataset has none). */
  posted: string
  /** Encoding preference (see subtypeRank); higher wins within a posting. */
  rank: number
  value: number | null
  tests: number | null
  /** Source field the value came from. */
  field: string
}

export interface ColumnCheck {
  columns: string[]
  missingRequired: string[]
  unexpected: string[]
}

/**
 * Union of keys seen across rows (SODA JSON omits null cells, so a column must be absent from every row to
 * count as missing).
 */
export function checkColumns(rows: Record<string, string>[], required: string[], optional: string[] = []): ColumnCheck {
  const seen = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k)
  const known = new Set([...required, ...optional])
  return {
    columns: [...seen].sort(),
    missingRequired: required.filter((c) => !seen.has(c)),
    unexpected: [...seen].filter((c) => !known.has(c) && !c.startsWith(':')).sort(),
  }
}

const pickNum = (r: Record<string, string>, fields: string[]): { value: number | null; field: string } => {
  for (const f of fields) {
    if (f in r) {
      const v = num(r[f])
      if (v != null) return { value: v, field: f }
    }
  }
  return { value: null, field: fields.find((f) => f in r) ?? fields[0] }
}

export interface ParseDiag {
  rows: number
  used: number
  levels: Record<string, number>
  pathogens: Record<string, number>
  unmappedPathogens: string[]
  skipped: Record<string, number>
  vintages: number
  latestPosted?: string
  latestWeek?: string
  /** Places seen among usable rows (HHS5 / US / MN) with row counts. */
  geos?: Record<string, number>
  /**
   * rgnm-fkqb pathogen labels that had only component-subtype rows for some place (no NULL or
   * combined/total aggregate) → the subtype labels seen. Signals a renamed 'Combined Type'.
   */
  componentOnly?: Record<string, string[]>
}

function newDiag(rows: number): ParseDiag {
  return { rows, used: 0, levels: {}, pathogens: {}, unmappedPathogens: [], skipped: {}, vintages: 0 }
}
const bump = (o: Record<string, number>, k: string) => (o[k] = (o[k] ?? 0) + 1)

function finishDiag(diag: ParseDiag, obs: Obs[], unmapped: Set<string>): ParseDiag {
  const posted = new Set(obs.map((o) => o.posted).filter(Boolean))
  diag.vintages = posted.size
  diag.latestPosted = [...posted].sort().pop()
  diag.latestWeek = obs.map((o) => o.week).sort().pop()
  diag.unmappedPathogens = [...unmapped].sort()
  diag.used = obs.length
  diag.geos = {}
  for (const o of obs) bump(diag.geos, o.geo)
  return diag
}

export const RGNM_REQUIRED = ['mmwrweek_end', 'level', 'pathogen', 'percent_pos']
export const RGNM_OPTIONAL = ['state', 'tests', 'detections', 'subtype', 'posted', 'tests_3wma', 'detections_5wma', 'percent_pos_3wma']

/**
 * rgnm-fkqb rows → observations. Regional/national rows use the weekly `percent_pos`. Minnesota state rows
 * use ONE field per pathogen series: `percent_pos_3wma` when any Minnesota row of that pathogen carries it,
 * otherwise `percent_pos` for every row — so a series never mixes 3-week averages with weekly values.
 */
export function parseRgnm(rows: Record<string, string>[]): { obs: Obs[]; diag: ParseDiag } {
  const diag = newDiag(rows.length)
  const unmapped = new Set<string>()
  const obs: Obs[] = []
  const mnHasMa = new Set<PathogenId>()
  const aggregates = new Set<string>()
  const components = new Map<string, Set<string>>()
  const kept: { r: Record<string, string>; geo: GeoKey; pathogen: PathogenId; rank: number; week: string }[] = []
  for (const r of rows) {
    bump(diag.levels, `${r.level ?? ''}${r.state ? ` / ${r.state}` : ''}`)
    const geo = geoKeyOf(r.level, r.state)
    if (geo === 'other-state' || geo == null) {
      bump(diag.skipped, geo ?? 'other-level')
      continue
    }
    const pathogen = normalizePathogen(r.pathogen)
    if (!pathogen) {
      unmapped.add(String(r.pathogen ?? ''))
      bump(diag.skipped, 'unmapped-pathogen')
      continue
    }
    const rank = subtypeRank(r.subtype)
    const placeKey = `${geo}|${String(r.pathogen)}`
    if (rank === 0) {
      bump(diag.skipped, 'component-subtype')
      let set = components.get(placeKey)
      if (!set) components.set(placeKey, (set = new Set()))
      set.add(String(r.subtype))
      continue
    }
    aggregates.add(placeKey)
    bump(diag.pathogens, String(r.pathogen))
    const week = weekOf(r.mmwrweek_end)
    if (!week) {
      bump(diag.skipped, 'bad-week')
      continue
    }
    if (geo === 'MN' && num(r.percent_pos_3wma) != null) mnHasMa.add(pathogen)
    kept.push({ r, geo, pathogen, rank, week })
  }
  for (const { r, geo, pathogen, rank, week } of kept) {
    const ma = geo === 'MN' && mnHasMa.has(pathogen)
    const field = ma ? 'percent_pos_3wma' : 'percent_pos'
    const tests = num(ma ? r.tests_3wma : r.tests)
    obs.push({ geo, pathogen, week, posted: parseSocrataTimestamp(r.posted) ?? '', rank, value: num(r[field]), tests, field })
  }
  const componentOnly: Record<string, string[]> = {}
  for (const [key, subs] of components) {
    if (aggregates.has(key)) continue
    const label = key.slice(key.indexOf('|') + 1)
    componentOnly[label] = [...new Set([...(componentOnly[label] ?? []), ...subs])].sort()
  }
  if (Object.keys(componentOnly).length) diag.componentOnly = componentOnly
  return { obs, diag: finishDiag(diag, obs, unmapped) }
}

/** Single-pathogen regional datasets (3cxc-4k8q RSV, gvsb-yw6g SARS-CoV-2). */
export const REGIONAL_LAYOUTS = {
  '3cxc-4k8q': {
    pathogen: 'rsv' as PathogenId,
    value: ['pcr_percent_positive', 'percent_pos'],
    tests: ['pcr_tests', 'number_tested'],
    required: ['level', 'mmwrweek_end', 'pcr_percent_positive', 'posted'],
    optional: ['perc_diff', 'percent_pos_2_week', 'percent_pos_4_week', 'pcr_detections', 'detections_2_week', 'detections_4_week', 'pcr_tests'],
  },
  'gvsb-yw6g': {
    pathogen: 'covid' as PathogenId,
    value: ['percent_pos', 'pcr_percent_positive'],
    tests: ['number_tested', 'pcr_tests'],
    required: ['level', 'mmwrweek_end', 'percent_pos', 'posted'],
    optional: ['perc_diff', 'percent_pos_2_week', 'percent_pos_4_week', 'number_tested', 'number_tested_2_week', 'number_tested_4_week'],
  },
} as const

export type RegionalId = keyof typeof REGIONAL_LAYOUTS

export function parseRegional(id: RegionalId, rows: Record<string, string>[]): { obs: Obs[]; diag: ParseDiag } {
  const layout = REGIONAL_LAYOUTS[id]
  const diag = newDiag(rows.length)
  const obs: Obs[] = []
  for (const r of rows) {
    bump(diag.levels, String(r.level ?? ''))
    const geo = geoKeyOf(r.level)
    if (geo !== 'HHS5' && geo !== 'US') {
      bump(diag.skipped, 'other-level')
      continue
    }
    const week = weekOf(r.mmwrweek_end)
    if (!week) {
      bump(diag.skipped, 'bad-week')
      continue
    }
    const { value, field } = pickNum(r, [...layout.value])
    obs.push({
      geo,
      pathogen: layout.pathogen,
      week,
      posted: parseSocrataTimestamp(r.posted) ?? '',
      rank: 2,
      value,
      tests: pickNum(r, [...layout.tests]).value,
      field,
    })
  }
  diag.pathogens[layout.pathogen] = obs.length
  return { obs, diag: finishDiag(diag, obs, new Set()) }
}

export const SEUZ_REQUIRED = ['week_end', 'pathogen', 'percent_test_positivity']

/** seuz-s2cv (national only): week_end, pathogen ('COVID-19' | 'Influenza' | 'RSV'), percent_test_positivity. */
export function parseSeuz(rows: Record<string, string>[]): { obs: Obs[]; diag: ParseDiag } {
  const diag = newDiag(rows.length)
  const unmapped = new Set<string>()
  const obs: Obs[] = []
  for (const r of rows) {
    if (r.geography && !/^(national|united states|us|usa)$/i.test(r.geography.trim())) {
      bump(diag.skipped, 'non-national')
      continue
    }
    const pathogen = normalizePathogen(r.pathogen)
    if (!pathogen) {
      unmapped.add(String(r.pathogen ?? ''))
      continue
    }
    bump(diag.pathogens, String(r.pathogen))
    const week = weekOf(r.week_end ?? r.mmwrweek_end)
    if (!week) {
      bump(diag.skipped, 'bad-week')
      continue
    }
    const { value, field } = pickNum(r, ['percent_test_positivity', 'percent_pos'])
    const posted = parseSocrataTimestamp(r.posted ?? r.date_updated ?? r.updated) ?? ''
    obs.push({ geo: 'US', pathogen, week, posted, rank: 2, value, tests: null, field })
  }
  return { obs, diag: finishDiag(diag, obs, unmapped) }
}

export interface Selected {
  /** key "geo|pathogen" → week → chosen observation */
  byGeoPathogen: Map<string, Map<string, Obs>>
  /** Same week/posting/encoding published twice with different values. */
  conflicts: number
}

/** Keep one observation per (geo, pathogen, week): newest posting first, then preferred subtype encoding. */
export function selectLatest(obs: Obs[]): Selected {
  const out = new Map<string, Map<string, Obs>>()
  let conflicts = 0
  for (const o of obs) {
    const k = `${o.geo}|${o.pathogen}`
    let weeks = out.get(k)
    if (!weeks) out.set(k, (weeks = new Map()))
    const prev = weeks.get(o.week)
    if (!prev) {
      weeks.set(o.week, o)
      continue
    }
    if (o.posted > prev.posted || (o.posted === prev.posted && o.rank > prev.rank)) weeks.set(o.week, o)
    else if (o.posted === prev.posted && o.rank === prev.rank && o.value !== prev.value) {
      conflicts++
      // Deterministic: keep the row that carries a value, then the larger test volume.
      if (prev.value == null || (o.value != null && (o.tests ?? 0) > (prev.tests ?? 0))) weeks.set(o.week, o)
    }
  }
  return { byGeoPathogen: out, conflicts }
}

/** Sorted weekly points on/after `historyStart` (null = published but blank). */
export function toPoints(weeks: Map<string, Obs> | undefined, historyStart: string): Point[] {
  if (!weeks) return []
  return [...weeks.values()]
    .filter((o) => o.week >= historyStart)
    .sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0))
    .map((o): Point => [o.week, o.value == null ? null : roundValue(o.value, 'test_positivity')])
}

/** The newest observation that carries a value. */
export function latestObs(weeks: Map<string, Obs> | undefined): Obs | undefined {
  if (!weeks) return undefined
  let best: Obs | undefined
  for (const o of weeks.values()) if (o.value != null && (!best || o.week > best.week)) best = o
  return best
}

/**
 * Does a Socrata column description say the value is a (centered) multi-week moving average?
 * 3cxc-4k8q's pcr_percent_positive: "The average of the weekly % test positivity for the current, previous,
 * and following weeks for HHS Region. The weekly percent positive is displayed for the national level."
 */
export function describesMovingAverage(description: string | undefined): boolean | undefined {
  if (!description) return undefined
  return /moving average|3-week|three-week|centered|current, previous,? and following/i.test(description)
}
