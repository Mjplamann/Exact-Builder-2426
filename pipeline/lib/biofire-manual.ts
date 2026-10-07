// Parsers for BioFire detection-rate CSVs placed in data/manual/biofire/ (see the README there).
//
//  (a) BioFire Trend native wide export, one organism per file:
//        "Trend <Organism> Detection Rates <YYYY-MM-DD>.csv"  with columns  Week,US,Northeast,Midwest,West,South
//      Values are proportions 0–1. The date in the file name is the snapshot (download) date.
//  (b) MN Pulse long format (one row per organism × geography × week):
//        source,panel,organism_code,organism_label,geo_type,geo_code,week_start|week_end,detection_rate,
//        smoothing,n_tests,n_positive,n_sites,provisional,retrieved_at,source_url,notes
//
// Only the U.S. and the Census Midwest region (which contains Minnesota) are kept.
//
// Units are decided per FILE, never per row: proportions (0–1) unless every value carries a "%" sign (a file
// re-saved from a spreadsheet with percent formatting), in which case the numbers are already percent. A file
// with mixed units, a proportion above 1 or a percentage above 100 is rejected whole — the scale is never guessed.
import { addDays, parseISODate, weekEndingSaturday } from '../../shared/mmwr.ts'
import { num, parseCsv } from './csv.ts'
import { matchOrganism, normalizePanel, type BiofirePanel, type OrganismDef } from './biofire-organisms.ts'

export type KeptGeo = 'US' | 'Midwest'
export const DEFAULT_SMOOTHING = '3wk_centered'
const KNOWN_SMOOTHING = new Set(['3wk_centered', 'weekly_raw', '2wk_window'])

export interface BiofireObs {
  def: OrganismDef
  geo: KeptGeo
  /** MMWR week-ending Saturday. */
  week: string
  /** Percent (0–100), or null when the source marks the value missing/suppressed. */
  value: number | null
  smoothing: string
  /** Snapshot identifier used to resolve the same week appearing in several files (newest wins). */
  vintage: string
  provisional: boolean
  file: string
  nTests?: number
  nPositive?: number
  nSites?: number
  sourceUrl?: string
  sourceTag?: string
}

export type ValueScale = 'proportion' | 'percent-sign'

export interface FileReport {
  file: string
  format: 'wide' | 'long' | 'unknown'
  rows: number
  columns: string[]
  /** How the file's numbers were read: proportions ×100, or values with a "%" sign taken as percent. */
  scale?: ValueScale
  /** Kept values in percent (after conversion), so an implausible scale stands out in diagnostics. */
  stats?: { n: number; min: number; median: number; max: number }
  organism?: string
  organismCode?: string
  snapshot?: string
  /** Weekday histogram of the raw date column, to confirm the week convention (Sun = week start, Sat = week end). */
  weekdays: Record<string, number>
  accepted: number
  /** Rows/values not used, by reason. */
  skipped: Record<string, number>
  /** Rows used but worth a look (e.g. week_start not a Sunday), by reason. */
  notes: Record<string, number>
  warnings: string[]
  firstWeek?: string
  lastWeek?: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WIDE_FILE_RE = /^Trend\s+(.+?)\s+Detection\s+Rates?\s+(\d{4}-\d{2}-\d{2})(?:\s*\(\d+\))?\.csv$/i
const WIDE_REGION_COLUMNS = ['US', 'Northeast', 'Midwest', 'West', 'South']
const LONG_COLUMNS = [
  'source', 'panel', 'organism_code', 'organism_label', 'geo_type', 'geo_code', 'week_start', 'week_end', 'detection_rate',
  'smoothing', 'n_tests', 'n_positive', 'n_sites', 'provisional', 'retrieved_at', 'source_url', 'notes',
]

function newReport(file: string, format: FileReport['format'], columns: string[], rows: number): FileReport {
  return { file, format, rows, columns, weekdays: {}, accepted: 0, skipped: {}, notes: {}, warnings: [] }
}

const bump = (r: Record<string, number>, k: string) => (r[k] = (r[k] ?? 0) + 1)

function weekday(iso: string): string {
  return WEEKDAYS[parseISODate(iso).getUTCDay()]
}

function trackWeeks(rep: FileReport, week: string) {
  if (!rep.firstWeek || week < rep.firstWeek) rep.firstWeek = week
  if (!rep.lastWeek || week > rep.lastWeek) rep.lastWeek = week
}

/**
 * Strict date parsing: ISO "YYYY-MM-DD" (optionally followed by a time) or U.S. "M/D/YYYY". The month and day
 * must be valid (no roll-over), so a D/M/Y date such as 30/06/2024 is rejected instead of misread.
 */
export function parseDateStrict(raw: string | undefined | null): string | null {
  const s = (raw ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s)
  let y: number, mo: number, d: number
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|\s)/.exec(s))) [y, mo, d] = [Number(m[3]), Number(m[1]), Number(m[2])]
  else return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

export interface ParseOptions {
  /** Latest acceptable date (e.g. run date + 7 days); later weeks are skipped as "future-week". */
  maxDate?: string
  /** Panel hint (from a "gi/" folder or file name) for names shared by both panels, i.e. plain "Adenovirus". */
  panel?: BiofirePanel
}

interface CellRead {
  value: number | null
  pct: boolean
}

function readCell(raw: string | undefined): CellRead | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  return { value: num(s), pct: /%\s*$/.test(s) }
}

/** Decide the file's unit from all its numeric cells (see the header comment). */
export function decideScale(cells: (CellRead | null)[]): { scale: ValueScale } | { error: string } {
  const nums = cells.filter((c): c is CellRead & { value: number } => c != null && c.value != null)
  const withPct = nums.filter((c) => c.pct).length
  const max = nums.reduce((a, c) => Math.max(a, c.value), -Infinity)
  if (withPct && withPct < nums.length) {
    return { error: `mixed units: ${withPct} of ${nums.length} values carry a % sign; file rejected (use proportions 0–1 throughout)` }
  }
  if (withPct) {
    if (max > 100) return { error: `percent values up to ${max}% exceed 100; file rejected` }
    return { scale: 'percent-sign' }
  }
  if (max > 1) {
    return { error: `values up to ${max} exceed 1 — the format uses proportions (0–1); file rejected (convert to proportions, nothing is re-scaled)` }
  }
  return { scale: 'proportion' }
}

const toPercent = (v: number, scale: ValueScale) => (scale === 'percent-sign' ? v : v * 100)

function valueStats(values: (number | null)[]): FileReport['stats'] {
  const v = values.filter((x): x is number => x != null).sort((a, b) => a - b)
  if (!v.length) return undefined
  const r = (x: number) => Math.round(x * 1000) / 1000
  const mid = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
  return { n: v.length, min: r(v[0]), median: r(mid), max: r(v[v.length - 1]) }
}

function scaleNote(rep: FileReport) {
  if (rep.scale === 'percent-sign') {
    rep.warnings.push('values carry a % sign; read as percentages (e.g. "0.50%" = 0.5%), not as proportions')
  }
}

export function columnsOf(text: string): string[] {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  return parseCsv(`${first}\n`).length === 0 ? first.split(',').map((c) => c.trim().replace(/^"|"$/g, '')) : []
}

/** Decide which format a CSV is in from its header row (case-insensitive). */
export function detectFormat(columns: string[]): FileReport['format'] {
  const lower = new Set(columns.map((c) => c.trim().toLowerCase()))
  if (lower.has('detection_rate') && lower.has('geo_code') && (lower.has('organism_code') || lower.has('organism_label')) &&
    (lower.has('week_start') || lower.has('week_end'))) return 'long'
  if (lower.has('week') && (lower.has('us') || lower.has('midwest'))) return 'wide'
  return 'unknown'
}

/** Case-insensitive column lookup helper. */
function getter(columns: string[]) {
  const map = new Map(columns.map((c) => [c.trim().toLowerCase(), c]))
  return (row: Record<string, string>, name: string): string | undefined => {
    const key = map.get(name.toLowerCase())
    return key == null ? undefined : row[key]
  }
}

/** Parse a BioFire Trend wide export. Values must be proportions (0–1) (or all "%"-suffixed percentages). */
export function parseWideCsv(fileName: string, text: string, opts: ParseOptions = {}): { obs: BiofireObs[]; report: FileReport } {
  const rows = parseCsv(text)
  const columns = rows.length ? Object.keys(rows[0]) : columnsOf(text)
  const rep = newReport(fileName, 'wide', columns, rows.length)
  const m = WIDE_FILE_RE.exec(fileName)
  if (!m) {
    rep.warnings.push(`file name does not match "Trend <Organism> Detection Rates <YYYY-MM-DD>.csv"; organism unknown, file skipped`)
    return { obs: [], report: rep }
  }
  const def = matchOrganism(m[1], opts.panel)
  rep.organism = m[1]
  rep.snapshot = m[2]
  if (!def) {
    rep.warnings.push(`organism "${m[1]}" is not a recognized BioFire target; file skipped`)
    return { obs: [], report: rep }
  }
  rep.organismCode = def.code
  if (def.code === 'ADV' && !opts.panel) {
    rep.warnings.push('plain "Adenovirus" read as the respiratory (RP2.1) target; put GI-panel exports in a gi/ subfolder')
  }
  if (!def.pathogen) {
    rep.warnings.push(`organism "${m[1]}" (${def.code}) is recognized but not tracked by MN Pulse; file skipped`)
    return { obs: [], report: rep }
  }
  const get = getter(columns)
  const lowerCols = new Set(columns.map((c) => c.toLowerCase()))
  const missing = WIDE_REGION_COLUMNS.filter((c) => !lowerCols.has(c.toLowerCase()))
  if (missing.length) rep.warnings.push(`schema drift: expected column(s) missing: ${missing.join(', ')}`)
  const extra = columns.filter((c) => !['week', ...WIDE_REGION_COLUMNS.map((x) => x.toLowerCase())].includes(c.toLowerCase()))
  if (extra.length) rep.warnings.push(`schema drift: unexpected column(s) ignored: ${extra.join(', ')}`)

  // Scale check first, over every region column: BioFire exports proportions. Never guess a different scale.
  const decided = decideScale(rows.flatMap((r) => WIDE_REGION_COLUMNS.map((g) => readCell(get(r, g)))))
  if ('error' in decided) {
    rep.warnings.push(decided.error)
    return { obs: [], report: rep }
  }
  rep.scale = decided.scale
  scaleNote(rep)

  const obs: BiofireObs[] = []
  const seenWeeks = new Set<string>()
  for (const r of rows) {
    const rawWeek = get(r, 'Week') ?? ''
    const iso = parseDateStrict(rawWeek)
    if (!iso) {
      bump(rep.skipped, 'bad-week')
      continue
    }
    const week = weekEndingSaturday(iso)
    if (opts.maxDate && week > opts.maxDate) {
      bump(rep.skipped, 'future-week')
      continue
    }
    bump(rep.weekdays, weekday(iso))
    if (seenWeeks.has(week)) bump(rep.notes, 'duplicate-week')
    seenWeeks.add(week)
    for (const geo of ['US', 'Midwest'] as const) {
      const cell = readCell(get(r, geo))
      if (!cell) continue // absent → no point
      const v = cell.value
      if (v != null && v < 0) {
        bump(rep.skipped, 'negative')
        continue
      }
      obs.push({
        def, geo, week, value: v == null ? null : toPercent(v, decided.scale), smoothing: DEFAULT_SMOOTHING, vintage: m[2],
        provisional: false, file: fileName,
      })
      rep.accepted++
      trackWeeks(rep, week)
    }
  }
  rep.stats = valueStats(obs.map((o) => o.value))
  if (rep.skipped['bad-week']) rep.warnings.push(`${rep.skipped['bad-week']} row(s) with an unparseable or invalid Week skipped (YYYY-MM-DD or M/D/YYYY)`)
  if (rep.skipped['future-week']) rep.warnings.push(`${rep.skipped['future-week']} row(s) dated after ${opts.maxDate} skipped`)
  if (rep.notes['duplicate-week']) {
    rep.warnings.push(`${rep.notes['duplicate-week']} row(s) fall in an MMWR week already in this file (daily dates?); the last row wins`)
  }
  return { obs, report: rep }
}

const truthy = (s: string | undefined) => /^(true|t|yes|y|1)$/i.test((s ?? '').trim())

function geoFromLong(geoType: string | undefined, geoCode: string | undefined): KeptGeo | 'site' | 'other' | null {
  const t = (geoType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const c = (geoCode ?? '').trim().toLowerCase()
  if (t === 'site') return 'site'
  if (t === 'nation' || t === 'national' || (!t && ['us', 'usa', 'united states', 'national'].includes(c))) {
    return ['us', 'usa', 'united states', 'national', ''].includes(c) ? 'US' : null
  }
  if (t === 'census_region' || t === 'region' || !t) {
    if (c === 'midwest') return 'Midwest'
    if (['northeast', 'north', 'south', 'west'].includes(c)) return 'other'
    return null
  }
  return null
}

/**
 * Parse an MN Pulse long-format CSV. `fallbackVintage` (a date in the file name, or '' when there is none) orders
 * snapshots when retrieved_at is blank; an empty vintage ranks below every dated snapshot.
 */
export function parseLongCsv(
  fileName: string, text: string, fallbackVintage: string, opts: ParseOptions = {},
): { obs: BiofireObs[]; report: FileReport } {
  const rows = parseCsv(text)
  const columns = rows.length ? Object.keys(rows[0]) : columnsOf(text)
  const rep = newReport(fileName, 'long', columns, rows.length)
  const get = getter(columns)
  const lowerCols = new Set(columns.map((c) => c.toLowerCase()))
  const missing = LONG_COLUMNS.filter((c) => !lowerCols.has(c) && !(c === 'week_end' && lowerCols.has('week_start')) &&
    !(c === 'week_start' && lowerCols.has('week_end')))
  if (missing.length) rep.warnings.push(`optional column(s) absent: ${missing.join(', ')}`)
  const extra = columns.filter((c) => !LONG_COLUMNS.includes(c.toLowerCase()))
  if (extra.length) rep.warnings.push(`schema drift: unexpected column(s) ignored: ${extra.join(', ')}`)

  // Units are decided for the whole file: one out-of-scale value means the file's scale cannot be trusted.
  const decided = decideScale(rows.map((r) => readCell(get(r, 'detection_rate'))))
  if ('error' in decided) {
    rep.warnings.push(decided.error)
    return { obs: [], report: rep }
  }
  rep.scale = decided.scale
  scaleNote(rep)

  const unmapped = new Set<string>()
  const seen = new Set<string>()
  const obs: BiofireObs[] = []
  for (const r of rows) {
    const panel = normalizePanel(get(r, 'panel')) ?? opts.panel
    const def = matchOrganism(get(r, 'organism_code'), panel) ?? matchOrganism(get(r, 'organism_label'), panel)
    if (!def) {
      bump(rep.skipped, 'unmapped-organism')
      unmapped.add(get(r, 'organism_code') || get(r, 'organism_label') || '(blank)')
      continue
    }
    if (!def.pathogen) {
      bump(rep.skipped, 'untracked-organism')
      continue
    }
    const geo = geoFromLong(get(r, 'geo_type'), get(r, 'geo_code'))
    if (geo === 'site') {
      bump(rep.skipped, 'site-level')
      continue
    }
    if (geo === 'other') {
      bump(rep.skipped, 'other-region')
      continue
    }
    if (!geo) {
      bump(rep.skipped, 'bad-geo')
      continue
    }
    // Week: map the 7-day window to the MMWR (Sun–Sat) week holding its middle day.
    const ws = parseDateStrict(get(r, 'week_start'))
    const we = parseDateStrict(get(r, 'week_end'))
    let week: string | null = null
    if (ws) {
      bump(rep.weekdays, weekday(ws))
      if (weekday(ws) !== 'Sun') bump(rep.notes, 'week_start-not-sunday')
      week = weekEndingSaturday(addDays(ws, 3))
    } else if (we) {
      bump(rep.weekdays, weekday(we))
      if (weekday(we) !== 'Sat') bump(rep.notes, 'week_end-not-saturday')
      week = weekEndingSaturday(addDays(we, -3))
    }
    if (!week) {
      bump(rep.skipped, 'bad-week')
      continue
    }
    if (opts.maxDate && week > opts.maxDate) {
      bump(rep.skipped, 'future-week')
      continue
    }
    const rate = readCell(get(r, 'detection_rate'))?.value ?? null
    if (rate != null && rate < 0) {
      bump(rep.skipped, 'negative')
      continue
    }
    const smoothing = (get(r, 'smoothing') ?? '').trim().toLowerCase() || DEFAULT_SMOOTHING
    if (!KNOWN_SMOOTHING.has(smoothing)) bump(rep.notes, `unknown-smoothing:${smoothing}`)
    const key = `${def.code}|${geo}|${week}|${smoothing}`
    if (seen.has(key)) bump(rep.notes, 'duplicate-key-last-wins')
    seen.add(key)
    const rawRetrieved = (get(r, 'retrieved_at') ?? '').trim()
    // Vintages compare as ISO strings; normalize other date spellings (e.g. 10/05/2026).
    const retrieved = /^\d{4}-\d{2}-\d{2}/.test(rawRetrieved) ? rawRetrieved : rawRetrieved ? (parseDateStrict(rawRetrieved) ?? '') : ''
    if (!retrieved && !fallbackVintage) bump(rep.notes, 'no-vintage')
    const o: BiofireObs = {
      def, geo, week, value: rate == null ? null : toPercent(rate, decided.scale), smoothing, vintage: retrieved || fallbackVintage,
      provisional: truthy(get(r, 'provisional')), file: fileName,
    }
    const nT = num(get(r, 'n_tests'))
    const nP = num(get(r, 'n_positive'))
    const nS = num(get(r, 'n_sites'))
    if (nT != null) o.nTests = nT
    if (nP != null) o.nPositive = nP
    if (nS != null) o.nSites = nS
    const url = (get(r, 'source_url') ?? '').trim()
    if (url) o.sourceUrl = url
    const tag = (get(r, 'source') ?? '').trim()
    if (tag) o.sourceTag = tag
    obs.push(o)
    rep.accepted++
    trackWeeks(rep, week)
  }
  rep.stats = valueStats(obs.map((o) => o.value))
  if (unmapped.size) rep.warnings.push(`unrecognized organism(s) skipped: ${[...unmapped].slice(0, 10).join(', ')}`)
  if (rep.skipped.negative) rep.warnings.push(`${rep.skipped.negative} row(s) with a negative detection_rate skipped`)
  if (rep.skipped['bad-week']) rep.warnings.push(`${rep.skipped['bad-week']} row(s) with a missing or invalid week date skipped (YYYY-MM-DD or M/D/YYYY)`)
  if (rep.skipped['future-week']) rep.warnings.push(`${rep.skipped['future-week']} row(s) dated after ${opts.maxDate} skipped`)
  if (rep.notes['no-vintage']) {
    rep.warnings.push(`${rep.notes['no-vintage']} row(s) have no retrieved_at and the file name has no date; they rank below any dated snapshot`)
  }
  if (rep.skipped['site-level']) {
    rep.warnings.push(`${rep.skipped['site-level']} site-level row(s) skipped (no published geography type for individual labs)`)
  }
  for (const k of ['week_start-not-sunday', 'week_end-not-saturday']) {
    if (rep.notes[k]) rep.warnings.push(`${rep.notes[k]} row(s) with ${k.replace(/-/g, ' ')}; mapped to the MMWR week containing the window's midpoint`)
  }
  if (rep.notes['duplicate-key-last-wins']) {
    rep.warnings.push(`${rep.notes['duplicate-key-last-wins']} duplicate organism/geo/week/smoothing row(s); the last row wins`)
  }
  return { obs, report: rep }
}

export interface MergedSeriesObs {
  def: OrganismDef
  geo: KeptGeo
  smoothing: string
  /** One observation per week (newest snapshot wins), sorted by week. */
  obs: BiofireObs[]
}

/**
 * Combine observations from all files: for each organism × geography × smoothing × week keep the value from
 * the newest snapshot (ties: the file read last). Weeks before `historyStart` are dropped.
 */
export function mergeObservations(all: BiofireObs[], historyStart: string): MergedSeriesObs[] {
  const groups = new Map<string, { def: OrganismDef; geo: KeptGeo; smoothing: string; weeks: Map<string, BiofireObs> }>()
  for (const o of all) {
    if (o.week < historyStart) continue
    const k = `${o.def.code}|${o.geo}|${o.smoothing}`
    let g = groups.get(k)
    if (!g) groups.set(k, (g = { def: o.def, geo: o.geo, smoothing: o.smoothing, weeks: new Map() }))
    const prev = g.weeks.get(o.week)
    if (!prev || o.vintage >= prev.vintage) g.weeks.set(o.week, o)
  }
  return [...groups.values()].map((g) => ({
    def: g.def,
    geo: g.geo,
    smoothing: g.smoothing,
    obs: [...g.weeks.values()].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0)),
  }))
}
