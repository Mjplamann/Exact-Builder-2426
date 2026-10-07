// Generic, defensive normalizer for MDH downloadable tables (CSV files and HTML data tables).
//
// The new MDH respiratory/flu/wastewater CSV schemas were not published anywhere we could read when
// this was written, so nothing here hard-codes column names. Instead each table is analyzed:
//   1. how weeks are expressed: a date column (ISO, M/D/YYYY, "Oct 4, 2025"), an MMWR "YYYYWW" string,
//      year + week columns, season ("2025-26") + MMWR week, or a week × season matrix;
//   2. the geography: wastewater site, county, region (and which MDH region scheme), or statewide;
//   3. long-format dimensions: a pathogen column, a measure column, age/race/sex stratifiers (only
//      the all-ages/overall rows are kept), publisher risk-level and trend columns;
//   4. numeric value columns: which pathogen and metric each one carries, from its header, the row's
//      pathogen/measure, or the file context (link text) supplied in the spec.
// A series is emitted only when the mapping is unambiguous. Anything else is skipped and the reason
// is recorded in the diagnostics so the parsers can be refined after the first CI run.
import Papa from 'papaparse'
import type { ActivityLevel, GeoRef, MetricKind, PathogenId, Point, Series, TrendDirection } from '../../shared/types.ts'
import { METRIC_UNITS } from '../../shared/types.ts'
import { mmwrWeekEnding, weekEndingSaturday, weeksInMmwrYear } from '../../shared/mmwr.ts'
import { num } from './csv.ts'
import { roundValue, STATE_GEO } from './series.ts'
import {
  countiesCentroid, countyGeo, countyList, detectRegionScheme, plantCounty, regionGeo, regionToken, type RegionScheme,
} from './mdh-geo.ts'

// ───────────────────────── Text helpers ─────────────────────────

/** Lower-case, punctuation-free header text ("% Positive (RSV)" → "% positive rsv"). */
export function normHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/%/g, ' % ')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pseudo-pathogen for a bare "coronavirus" label, resolved per file (seasonal CoV when SARS-CoV-2 is separate). */
type PathogenHit = PathogenId | 'cov?'

const PATHOGEN_RULES: [RegExp, PathogenHit][] = [
  [/influenza ?like( illness)?|\bili\b/g, 'ili'],
  [/para ?influenza( virus(es)?)?|\bh?piv ?\d?\b/g, 'parainfluenza'],
  [/non ?(covid( 19)?|sars cov 2) corona ?virus(es)?|(seasonal|human|common|endemic) (human )?corona ?virus(es)?|\bh?cov (229e|nl63|oc43|hku1)\b|\b(229e|nl63|oc43|hku1)\b|\bhcov\b/g, 'seasonal-cov'],
  [/sars ?cov ?2|\bcovid( 19)?\b/g, 'covid'],
  [/(human )?metapneumo ?virus|\bh?mpv\b/g, 'hmpv'],
  [/rhino ?virus( ?(and|or)? ?entero ?virus)?|entero ?virus|\brv ?ev\b|\bev ?rv\b|\bhrv\b|rhino ?entero/g, 'rhino-entero'],
  [/adeno ?virus(es)?|\badeno\b|\badv\b/g, 'adenovirus'],
  [/\brsv\b|respiratory syncytial( virus)?/g, 'rsv'],
  [/influenza a ?(and|or|\+)? ?b\b|influenza a b\b|\bflu a ?(and|or|\+)? ?b\b|total influenza|all influenza|any influenza|influenza total/g, 'influenza'],
  [/influenza a\b|\bflu ?a\b|\binf ?a\b|\bh1n1( ?pdm ?(09)?)?\b|\bh3n2\b/g, 'influenza-a'],
  [/influenza b\b|\bflu ?b\b|\binf ?b\b|\bvictoria\b|\byamagata\b/g, 'influenza-b'],
  [/influenza|\bflu\b/g, 'influenza'],
  [/pertussis|whooping cough/g, 'pertussis'],
  [/measles|rubeola/g, 'measles'],
  [/mycoplasma/g, 'mycoplasma'],
  [/acute respiratory illness(es)?|\bari\b|all respiratory viruses|respiratory viruses combined|combined respiratory|any respiratory virus/g, 'respiratory-combined'],
  [/\bcorona ?virus(es)?\b/g, 'cov?'],
]

/** Every pathogen named in a piece of text (header or cell), most specific first. */
export function detectPathogens(text: string): PathogenHit[] {
  let s = ` ${normHeader(text)} `
  const found: PathogenHit[] = []
  for (const [re, p] of PATHOGEN_RULES) {
    re.lastIndex = 0
    if (re.test(s)) {
      if (!found.includes(p)) found.push(p)
      re.lastIndex = 0
      s = s.replace(re, ' ')
    }
  }
  return found
}

function stripPathogens(text: string): string {
  let s = ` ${normHeader(text)} `
  for (const [re] of PATHOGEN_RULES) {
    re.lastIndex = 0
    s = s.replace(re, ' ')
  }
  return s.replace(/\s+/g, ' ').trim()
}

// ───────────────────────── Dates ─────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Parse a date cell (ISO, ISO datetime, M/D/YYYY, M/D/YY, "Oct 4, 2025") to ISO; null otherwise. */
export function parseDateCell(raw: string): string | null {
  const s = raw.trim()
  let y: number
  let mo: number
  let d: number
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s)
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?: .*)?$/.exec(s))) {
    ;[mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? `20${m[3]}` : m[3])]
  } else if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/.exec(s))) {
    mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1
    ;[d, y] = [Number(m[2]), Number(m[3])]
  } else if ((m = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{4})$/.exec(s))) {
    mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1
    ;[d, y] = [Number(m[1]), Number(m[3])]
  } else return null
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return dt.toISOString().slice(0, 10)
}

/** Parse an MMWR year-week string: "202540", "2025-40", "2025W40", "2025 wk 40". */
export function parseYearWeek(raw: string): { year: number; week: number } | null {
  const m = /^(20\d\d)\s*[-_ ]?\s*(?:w|wk|week)?\s*(\d{1,2})$/i.exec(raw.trim())
  if (!m) return null
  const year = Number(m[1])
  const week = Number(m[2])
  if (week < 1 || week > weeksInMmwrYear(year)) return null
  return { year, week }
}

/** Parse a season label ("2025-26", "2025-2026", "2025–26 season") to its first year. */
export function parseSeason(raw: string): number | null {
  const m = /^(?:season\s*)?(20\d\d)\s*[-–—/]\s*(\d{2}|20\d\d)(?:\s*season)?$/i.exec(raw.trim())
  if (!m) return null
  const start = Number(m[1])
  const end = Number(m[2].length === 2 ? `${String(start).slice(0, 2)}${m[2]}` : m[2])
  return end === start + 1 ? start : null
}

function weekNumber(raw: string): number | null {
  const s = raw.trim()
  if (!/^\d{1,2}$/.test(s)) return null
  const w = Number(s)
  return w >= 1 && w <= 53 ? w : null
}

/** Week-ending Saturday of MMWR week `week` within a season starting in `startYear` (weeks 40–39). */
export function seasonWeekEnding(startYear: number, week: number): string | null {
  const year = week >= 40 ? startYear : startYear + 1
  if (week > weeksInMmwrYear(year)) return null
  return mmwrWeekEnding(year, week)
}

// ───────────────────────── Roles of numeric columns ─────────────────────────

export type Role =
  | 'skip'
  | 'positivity'
  | 'ili'
  | 'ed'
  | 'conc'
  | 'outbreaks'
  | 'deaths'
  | 'rate'
  | 'hosp'
  | 'positives'
  | 'tests'
  | 'population'
  | 'percent'
  | 'count'
  | 'value'
  | 'bare'
  | 'unknown'

const FILLER = /\b(weekly|week|wk|mn|minnesota|statewide|state|the|of|in|for|by|and|or|virus|viruses|data|total|all|type|subtype|season|series|value|values|region|district|county)\b/g

/** True when a header names only a pathogen/place/season (no measure words). */
function isBare(h: string): boolean {
  const n = normHeader(h)
  if (regionToken(h) || (countyGeo(h) && countyGeo(h) !== STATE_GEO) || parseSeason(h) != null) return true
  // A bare header must name a subject (pathogen or a statewide/combined total); "week" or "data" alone is not one.
  if (!detectPathogens(h).length && !/^(total|statewide|minnesota|all|overall|combined)$/.test(n)) return false
  let s = stripPathogens(h)
  s = s.replace(/\b20\d\d( \d{2,4})?\b/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
  return s === ''
}

/** What a numeric column measures, judged from its header alone. */
export function headerRole(header: string): Role {
  const s = ` ${normHeader(header)} `
  const pct = /( % |\bpercent|\bpct\b|\bproportion\b|\bprop\b|\bperc\b)/.test(s)
  const pos = /\bpos(itive|itives|itivity)?\b/.test(s)
  const rate = /\brate\b|\bper 100\b|\bper 100 000\b|\b100k\b|\bper100k\b|\bincidence\b|\bper capita\b/.test(s)
  if (/\b(cumulative|cum|ytd|year to date|season to date|lower|upper|lcl|ucl|ci|confidence|baseline|threshold|cutoff|percentile|rank|prior|previous|last year|median|z score|change|difference|diff|flag|footnote|notes?|suppressed|epidemic|expected)\b/.test(s))
    return 'skip'
  if (/\b(lat|latitude|lon|long|longitude|lng|fips|geoid|zip|zipcode|id|code)\b/.test(s)) return 'skip'
  if (/positivity/.test(s) || (pct && pos) || /\bpos(itive)? rate\b/.test(s)) return 'positivity'
  if (/\bili\b|influenza like/.test(s)) {
    if (pct) return 'ili'
    if (rate) return 'skip'
    return /\b(visits|patients|count|number|num|n|cases|total|encounters)\b/.test(s) ? 'count' : 'ili'
  }
  if (/\b(ed|emergency|er)\b/.test(s) && pct) return 'ed'
  if (/wastewater|concentration|\bcopies\b|pmmov|normali[sz]ed|genome|\bgc\b|viral load|\bload\b/.test(s)) return rate ? 'skip' : 'conc'
  if (/outbreak/.test(s)) return 'outbreaks'
  if (/death|mortality|\bdied\b|fatalit/.test(s)) return rate ? 'skip' : 'deaths'
  if (rate) return 'rate'
  if (/hospitali[sz]|\badmission|\badmit|\bhosp\b|inpatient/.test(s)) return 'hosp'
  if (/\b(labs?|laborator(y|ies)|providers?|sites?|schools?|facilities|facility|hospitals|clinics?|reporting|enrollment|enrolled|students?|residents?|staff|beds?|sewersheds?|plants?)\b/.test(s))
    return 'skip'
  if (pos || /\bdetect(ion|ions|ed)?\b/.test(s)) return 'positives'
  if (/\btests?\b|\btested\b|\bspecimens?\b|\bsamples?\b|\bdenominator\b/.test(s)) return 'tests'
  if (/\bpop(ulation)?\b|\bpop size\b/.test(s)) return 'population'
  if (pct) return 'percent'
  if (/\b(count|counts|number|num|no|n|cases?|visits|patients|encounters|reports?|reported)\b/.test(s)) return 'count'
  if (/\btotal\b/.test(s) && s.trim() !== 'total') return 'count'
  if (/^ (value|values|result|estimate|amount|measure|measure value) $/.test(s)) return 'value'
  if (isBare(header)) return 'bare'
  return 'unknown'
}

/** Variant discriminator for smoothed / unweighted columns. */
function variantOf(header: string): string | undefined {
  const s = normHeader(header)
  if (/moving|rolling|smooth|\b\d ?(wk|week) (avg|average|mean)\b|\bma\b/.test(s)) return 'avg'
  if (/unweighted/.test(s)) return 'unweighted'
  return undefined
}

// ───────────────────────── Spec / result types ─────────────────────────

export interface NormalizeSpec {
  /** Pathogens this file may carry (undefined = any). */
  pathogens?: PathogenId[]
  /** Pathogen assumed for a value column that names none (from the link text). */
  defaultPathogen?: PathogenId
  /** Metrics this file may carry. */
  metrics: MetricKind[]
  /** What a column named only by pathogen/place/season measures (opt-in per file). */
  bareMeans?: MetricKind
  /** How to combine several rows in one week for one series: 'mean' (sample-level wastewater) or 'strict'. */
  combine?: 'mean' | 'strict'
  /** Drop points before this date (e.g. RESP-NET was metro-only before 2023-24). */
  minDate?: string
  /** Treat site/plant/facility columns as wastewater sewersheds (wastewater site files only). */
  allowSites?: boolean
}

export interface NormalizeOptions {
  historyStart: string
  /** Drop points after this date (no future weeks). */
  maxDate: string
  /** Repository root (for county centroids of wastewater sites). */
  rootDir: string
  /** Who to credit in series.official.by. */
  officialBy?: string
}

export interface NormalizedSeries {
  pathogen: PathogenId
  metric: MetricKind
  geo: GeoRef
  variant?: string
  points: Point[]
  columns: string[]
  computed?: string
  official?: Series['official']
  attrs?: Record<string, string>
}

export interface ValueColumnDiag {
  column: string
  role: Role
  pathogen?: string
  metric?: string
  status: string
}

export interface NormalizeDiag {
  dateStrategy: string | null
  weekdays?: Record<string, number>
  geo: { level: 'state' | 'region' | 'county' | 'site'; column?: string; scheme?: RegionScheme; fromHeaders?: boolean }
  pathogenColumn?: string
  metricColumn?: string
  stratifiers?: string[]
  levelColumns?: string[]
  trendColumns?: string[]
  dependentColumns?: string[]
  valueColumns: ValueColumnDiag[]
  rows: number
  rowsUsed: number
  skipped: Record<string, number>
  unparsed: string[]
  series: number
  latest?: string
}

// ───────────────────────── Official classifications ─────────────────────────

const LEVEL_WORDS: [RegExp, ActivityLevel][] = [
  [/^(very high|extremely high)$/, 'very-high'],
  [/^(minimal|very low|none|no activity)$/, 'minimal'],
  [/^(high|substantial)$/, 'high'],
  [/^(moderate|medium)$/, 'moderate'],
  [/^low$/, 'low'],
]

export function levelFromLabel(raw: string): ActivityLevel | undefined {
  const s = normHeader(raw).replace(/\b(risk|level|activity|category)\b/g, ' ').replace(/\s+/g, ' ').trim()
  for (const [re, lvl] of LEVEL_WORDS) if (re.test(s)) return lvl
  return undefined
}

export function trendFromLabel(raw: string): TrendDirection | undefined {
  const s = normHeader(raw)
  if (!s) return undefined
  if (/(sharp|rapid|substantial|large)\w* (increas|ris|grow)/.test(s)) return 'rising-fast'
  if (/(sharp|rapid|substantial|large)\w* (decreas|declin|fall|drop)/.test(s)) return 'falling-fast'
  if (/^(increas|rising|growing|up|likely growing|growing|elevated and increasing)/.test(s) || /\bincreas/.test(s)) return 'rising'
  if (/^(decreas|declin|falling|down|likely declining)/.test(s) || /\bdecreas|\bdeclin/.test(s)) return 'falling'
  if (/^(stable|steady|no change|unchanged|plateau|not changing|flat)/.test(s)) return 'steady'
  return undefined
}

// ───────────────────────── CSV → grid ─────────────────────────

/** Decode bytes as UTF-8, falling back to Windows-1252 (common for exported spreadsheets). */
export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Parse CSV text into a header and rows, skipping title lines above the header and footnote lines. */
export function csvToGrid(text: string): { header: string[]; rows: string[][]; headerRow: number } {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const all = (res.data as unknown[][]).map((r) => r.map((c) => (c == null ? '' : String(c).trim())))
  const filled = (r: string[]) => r.filter((c) => c !== '').length
  const width = Math.max(0, ...all.slice(0, 50).map(filled))
  let h = 0
  for (let i = 0; i < Math.min(6, all.length); i++) {
    const cells = all[i].filter((c) => c !== '')
    const nonNum = cells.filter((c) => num(c) == null || parseSeason(c) != null).length
    if (cells.length >= 2 && cells.length >= Math.ceil(width * 0.5) && nonNum >= cells.length * 0.6) {
      h = i
      break
    }
  }
  const header = dedupeHeaders(all[h] ?? [])
  const rows = all.slice(h + 1).filter((r) => filled(r) >= Math.min(2, header.length))
  return { header, rows, headerRow: h }
}

export function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((h, i) => {
    const base = h.trim() || `column_${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

// ───────────────────────── Analysis ─────────────────────────

interface Col {
  idx: number
  raw: string
  h: string
  nonEmpty: number
  numeric: number
  distinct: string[]
}

type DateStrategy =
  | { kind: 'date'; col: number }
  | { kind: 'yyyyww'; col: number }
  | { kind: 'yearWeek'; yearCol: number; weekCol: number }
  | { kind: 'seasonWeek'; seasonCol: number; weekCol: number }
  | { kind: 'seasonMatrix'; weekCol: number; seasons: Map<number, number> }

const OVERALL = /^(all|all ages|all age groups|overall|total|any|statewide|minnesota|all races|all races ethnicities|all ethnicities|all races and ethnicities|both|both sexes|all sexes|all groups|total population|all persons|everyone)$/

function share(col: Col, rows: string[][], fn: (s: string) => unknown): number {
  let ok = 0
  let n = 0
  for (const r of rows) {
    const v = r[col.idx] ?? ''
    if (v === '') continue
    n++
    if (fn(v)) ok++
  }
  return n ? ok / n : 0
}

function detectDates(cols: Col[], rows: string[][]): { strategy: DateStrategy | null; used: Set<number> } {
  const used = new Set<number>()
  const dateCols = cols.filter((c) => c.nonEmpty > 0 && share(c, rows, parseDateCell) >= 0.8)
  for (const c of dateCols) used.add(c.idx)
  const pick =
    dateCols.find((c) => /\b(end|ending|ended)\b/.test(c.h)) ??
    dateCols.find((c) => /\b(week|date|mmwr|period)\b/.test(c.h) && !/\b(start|begin|beginning|report|updated|as of)\b/.test(c.h)) ??
    dateCols.find((c) => /\b(start|begin|beginning)\b/.test(c.h)) ??
    dateCols.find((c) => !/\b(report|updated|as of|run|extract)\b/.test(c.h))
  const weekish = (c: Col) => /\b(week|wk|mmwr|epiweek|epi week|yrwk|yearweek|year week|period)\b/.test(c.h)
  const ywCols = cols.filter((c) => weekish(c) && share(c, rows, parseYearWeek) >= 0.8)
  for (const c of ywCols) used.add(c.idx)
  const seasonCols = cols.filter((c) => /\bseason\b/.test(c.h) && share(c, rows, parseSeason) >= 0.8)
  for (const c of seasonCols) used.add(c.idx)
  const weekCols = cols.filter(
    (c) =>
      /\b(week|wk)\b/.test(c.h) &&
      !/\b(start|end|ending|date)\b/.test(c.h) &&
      share(c, rows, weekNumber) >= 0.9 &&
      (/\b(mmwr|epi)\b/.test(c.h) || rows.some((r) => (weekNumber(r[c.idx] ?? '') ?? 0) >= 40)),
  )
  for (const c of weekCols) used.add(c.idx)
  const yearCols = cols.filter((c) => /\b(year|yr)\b/.test(c.h) && share(c, rows, (s) => /^20\d\d$/.test(s.trim())) >= 0.9)
  for (const c of yearCols) used.add(c.idx)
  // Other columns that are only calendar bookkeeping.
  for (const c of cols) {
    if (/^(mmwr )?(year|yr|week|wk|season|epi ?week|week number|week num|week no|mmwr|mmwr week|mmwr year|week of season|season week|month|day)$/.test(c.h) || /\bmmwr\b/.test(c.h))
      used.add(c.idx)
  }

  if (pick) return { strategy: { kind: 'date', col: pick.idx }, used }
  if (ywCols[0]) return { strategy: { kind: 'yyyyww', col: ywCols[0].idx }, used }
  if (seasonCols[0] && weekCols[0]) return { strategy: { kind: 'seasonWeek', seasonCol: seasonCols[0].idx, weekCol: weekCols[0].idx }, used }
  if (yearCols[0] && weekCols[0]) return { strategy: { kind: 'yearWeek', yearCol: yearCols[0].idx, weekCol: weekCols[0].idx }, used }
  if (weekCols[0]) {
    const seasons = new Map<number, number>()
    for (const c of cols) {
      const s = parseSeason(c.raw.replace(/\b(season|rate|cases|count|percent|%)\b/gi, ' ').replace(/[^0-9\-–/ ]+/g, ' ').trim())
      if (s != null && !used.has(c.idx)) seasons.set(c.idx, s)
    }
    if (seasons.size) return { strategy: { kind: 'seasonMatrix', weekCol: weekCols[0].idx, seasons }, used }
  }
  return { strategy: null, used }
}

function describeStrategy(s: DateStrategy, cols: Col[]): string {
  const n = (i: number) => cols[i]?.raw ?? `#${i}`
  switch (s.kind) {
    case 'date':
      return `date column "${n(s.col)}"`
    case 'yyyyww':
      return `MMWR year-week column "${n(s.col)}"`
    case 'yearWeek':
      return `year "${n(s.yearCol)}" + MMWR week "${n(s.weekCol)}"`
    case 'seasonWeek':
      return `season "${n(s.seasonCol)}" + MMWR week "${n(s.weekCol)}"`
    case 'seasonMatrix':
      return `week × season matrix (week "${n(s.weekCol)}", ${s.seasons.size} season columns)`
  }
}

const isNumericCol = (c: Col) => c.nonEmpty > 0 && c.numeric / c.nonEmpty >= 0.6

interface GeoPlan {
  level: 'state' | 'region' | 'county' | 'site'
  col?: number
  scheme?: RegionScheme
  siteId?: number
  siteName?: number
  siteCounty?: number
  siteRegion?: number
  sitePop?: number
  lat?: number
  lon?: number
  fromHeaders?: boolean
  attrCols: Set<number>
}

interface PathogenResolution {
  pathogen?: PathogenId
  reason?: string
}

function resolvePathogen(
  hits: PathogenHit[],
  spec: NormalizeSpec,
  fileHasCovid: boolean,
  header?: string,
): PathogenResolution {
  let list = hits.map((p) => (p === 'cov?' ? (fileHasCovid ? 'seasonal-cov' : null) : p)).filter((p): p is PathogenId => !!p)
  if (hits.includes('cov?') && !fileHasCovid) return { reason: 'bare "coronavirus" label (cannot tell seasonal CoV from SARS-CoV-2)' }
  const allowCombined = !spec.pathogens || spec.pathogens.includes('respiratory-combined')
  if (list.length > 1) {
    if (allowCombined && ['covid', 'influenza', 'rsv'].every((p) => list.includes(p as PathogenId))) list = ['respiratory-combined']
    else return { reason: `names several pathogens (${list.join(', ')})` }
  }
  if (list.length === 0 && header != null) {
    const h = normHeader(header)
    if (/^(combined|all viruses|all respiratory|covid flu rsv)$/.test(h) && allowCombined) list = ['respiratory-combined']
    else if (/^total$/.test(h)) {
      if (spec.defaultPathogen) list = [spec.defaultPathogen]
      else if (allowCombined && spec.pathogens?.includes('respiratory-combined')) list = ['respiratory-combined']
    }
  }
  const p = list[0]
  if (!p) return {}
  if (spec.pathogens && !spec.pathogens.includes(p)) return { reason: `pathogen ${p} not expected in this file` }
  return { pathogen: p }
}

function roleMetric(role: Role, spec: NormalizeSpec): MetricKind | null {
  const allow = (m: MetricKind) => (spec.metrics.includes(m) ? m : null)
  const single = (ms: MetricKind[]) => (ms.length === 1 ? ms[0] : null)
  switch (role) {
    case 'positivity':
      return allow('test_positivity')
    case 'ili':
      return allow('ili_pct')
    case 'ed':
      return allow('ed_visit_pct')
    case 'conc':
      return allow('wastewater_conc')
    case 'outbreaks':
      return allow('outbreaks')
    case 'deaths':
      return allow('deaths')
    case 'rate':
      return allow('hosp_rate')
    case 'hosp':
      return allow('hosp_admissions')
    case 'percent':
      return single(spec.metrics.filter((m) => METRIC_UNITS[m] === '%'))
    case 'count':
      return single(spec.metrics.filter((m) => METRIC_UNITS[m] === 'count'))
    case 'value':
      return single(spec.metrics)
    case 'bare':
      return spec.bareMeans && spec.metrics.includes(spec.bareMeans) ? spec.bareMeans : null
    default:
      return null
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

/** Normalize one table (header + rows) into weekly series. Never throws on unexpected layouts. */
export function normalizeTable(
  header: string[],
  rowsIn: string[][],
  spec: NormalizeSpec,
  opts: NormalizeOptions,
): { series: NormalizedSeries[]; diag: NormalizeDiag } {
  const diag: NormalizeDiag = {
    dateStrategy: null,
    geo: { level: 'state' },
    valueColumns: [],
    rows: rowsIn.length,
    rowsUsed: 0,
    skipped: {},
    unparsed: [],
    series: 0,
  }
  const skip = (why: string) => (diag.skipped[why] = (diag.skipped[why] ?? 0) + 1)
  try {
    return normalizeInner(header, rowsIn, spec, opts, diag, skip)
  } catch (e) {
    diag.unparsed.push(`normalizer error: ${e instanceof Error ? e.message : String(e)}`)
    return { series: [], diag }
  }
}

function normalizeInner(
  header: string[],
  rowsIn: string[][],
  spec: NormalizeSpec,
  opts: NormalizeOptions,
  diag: NormalizeDiag,
  skip: (why: string) => void,
): { series: NormalizedSeries[]; diag: NormalizeDiag } {
  const rows = rowsIn.filter((r) => r.some((c) => c !== ''))
  const cols: Col[] = header.map((raw, idx) => {
    const seen = new Set<string>()
    let nonEmpty = 0
    let numeric = 0
    for (const r of rows) {
      const v = (r[idx] ?? '').trim()
      if (!v) continue
      nonEmpty++
      if (num(v) != null) numeric++
      if (seen.size < 200) seen.add(v)
    }
    return { idx, raw, h: normHeader(raw), nonEmpty, numeric, distinct: [...seen] }
  })
  if (!rows.length || !cols.length) {
    diag.unparsed.push('empty table')
    return { series: [], diag }
  }

  // 1) Weeks.
  const { strategy, used } = detectDates(cols, rows)
  if (!strategy) {
    diag.unparsed.push('no weekly date column found (no week-ending date, MMWR year-week, season+week or year+week columns)')
    return { series: [], diag }
  }
  diag.dateStrategy = describeStrategy(strategy, cols)

  // 2) Geography.
  const geo: GeoPlan = { level: 'state', attrCols: new Set() }
  const textCols = cols.filter((c) => !used.has(c.idx) && c.nonEmpty > 0 && !isNumericCol(c))
  const idHeader = (c: Col) => /\b(id|code|number|no|npdes)\b/.test(c.h)
  const siteCols = spec.allowSites
    ? cols.filter(
        (c) =>
          !used.has(c.idx) &&
          c.nonEmpty > 0 &&
          /\b(site|plant|wwtp|facility|sewershed|treatment|utility)\b/.test(c.h) &&
          !/\b(count|population|pop|served|lat|latitude|lon|longitude)\b/.test(c.h) &&
          (!isNumericCol(c) || idHeader(c)),
      )
    : []
  const countyCol =
    cols.find(
      (c) =>
        !used.has(c.idx) &&
        c.nonEmpty > 0 &&
        (/\bcounty\b/.test(c.h) || /\b(fips|geoid)\b/.test(c.h)) &&
        !/\bcounties\b/.test(c.h) &&
        (!isNumericCol(c) || /\b(fips|geoid|code)\b/.test(c.h)) &&
        share(c, rows, (s) => countyGeo(s)) >= 0.6,
    ) ?? textCols.find((c) => c.distinct.length >= 5 && share(c, rows, (s) => countyGeo(s) && countyGeo(s) !== STATE_GEO) >= 0.8)
  const regionCol = textCols.find(
    (c) =>
      (/\b(region|regions|district|area|zone|geography|geographic|location|hcc|coalition)\b/.test(c.h) || share(c, rows, regionToken) >= 0.8) &&
      share(c, rows, regionToken) >= 0.6,
  )
  const latCol = cols.find((c) => /^(lat|latitude|y)$/.test(c.h) && isNumericCol(c))
  const lonCol = cols.find((c) => /^(lon|long|longitude|lng|x)$/.test(c.h) && isNumericCol(c))
  const popCol = cols.find((c) => isNumericCol(c) && headerRole(c.raw) === 'population')
  if (siteCols.length) {
    geo.level = 'site'
    const idCol = siteCols.find(idHeader)
    const nameCol = siteCols.find((c) => c !== idCol) ?? idCol
    geo.siteId = (idCol ?? nameCol)!.idx
    geo.siteName = (nameCol ?? idCol)!.idx
    geo.col = geo.siteId
    const cc = textCols.find((c) => /\bcount(y|ies)\b/.test(c.h))
    if (cc) geo.siteCounty = cc.idx
    if (regionCol) geo.siteRegion = regionCol.idx
    if (popCol) geo.sitePop = popCol.idx
    if (latCol && lonCol) {
      geo.lat = latCol.idx
      geo.lon = lonCol.idx
    }
    for (const c of [...siteCols, cc, regionCol, popCol, latCol, lonCol]) if (c) geo.attrCols.add(c.idx)
  } else if (countyCol) {
    geo.level = 'county'
    geo.col = countyCol.idx
    geo.attrCols.add(countyCol.idx)
    if (regionCol) geo.attrCols.add(regionCol.idx)
  } else if (regionCol) {
    const labels = regionCol.distinct
    const scheme = detectRegionScheme(labels)
    if (!scheme) {
      if (labels.every((l) => regionToken(l) === 'State')) {
        geo.attrCols.add(regionCol.idx)
      } else {
        diag.unparsed.push(`region labels not recognized as an MDH scheme: ${labels.slice(0, 12).join(', ')}`)
        return { series: [], diag }
      }
    } else {
      geo.level = 'region'
      geo.col = regionCol.idx
      geo.scheme = scheme
      geo.attrCols.add(regionCol.idx)
    }
  }
  for (const c of cols) if (/\b(fips|geoid|county code|county id|region code|region id)\b/.test(c.h)) geo.attrCols.add(c.idx)
  if (popCol) geo.attrCols.add(popCol.idx)

  // Wide-by-geography: value columns named after regions or counties.
  const numericCols = cols.filter((c) => !used.has(c.idx) && !geo.attrCols.has(c.idx) && isNumericCol(c))
  let headerScheme: RegionScheme | null = null
  if (geo.level === 'state') {
    const regionHeaders = numericCols.filter((c) => {
      const t = regionToken(c.raw)
      return t && t !== 'State'
    })
    if (regionHeaders.length >= 3) {
      headerScheme = detectRegionScheme(regionHeaders.map((c) => c.raw))
      if (headerScheme) {
        geo.level = 'region'
        geo.scheme = headerScheme
        geo.fromHeaders = true
      }
    }
    const countyHeaders = numericCols.filter((c) => {
      const g = countyGeo(c.raw)
      return g && g !== STATE_GEO
    })
    if (!headerScheme && countyHeaders.length >= 5) {
      geo.level = 'county'
      geo.fromHeaders = true
    }
  }
  diag.geo = {
    level: geo.level,
    column: geo.col != null ? cols[geo.col].raw : undefined,
    scheme: geo.scheme,
    fromHeaders: geo.fromHeaders || undefined,
  }

  // 3) Long-format dimensions.
  const dimCols = textCols.filter((c) => !geo.attrCols.has(c.idx))
  const levelCols: { idx: number; pathogens: PathogenHit[] }[] = []
  const trendCols: { idx: number; pathogens: PathogenHit[] }[] = []
  const stratifiers: { idx: number }[] = []
  let pathogenCol: Col | undefined
  let metricCol: Col | undefined
  const unknownDims: Col[] = []
  for (const c of dimCols) {
    const vals = c.distinct.filter((v) => v !== '')
    if (vals.length && vals.every((v) => levelFromLabel(v) || /^(n\/?a|unknown|insufficient data|no data|-+|\*)$/i.test(v)) && vals.some((v) => levelFromLabel(v))) {
      levelCols.push({ idx: c.idx, pathogens: detectPathogens(c.raw) })
      continue
    }
    if (vals.length && /\b(trend|direction|change|status)\b/.test(c.h) && vals.some((v) => trendFromLabel(v))) {
      trendCols.push({ idx: c.idx, pathogens: detectPathogens(c.raw) })
      continue
    }
    if (/\bage\b|\bagegroup\b|\bage group\b|\bage cat|\brace\b|\bethnic|\bsex\b|\bgender\b/.test(c.h)) {
      stratifiers.push({ idx: c.idx })
      continue
    }
    const pathogenShare = vals.length ? vals.filter((v) => OVERALL.test(normHeader(v)) || detectPathogens(v).length === 1).length / vals.length : 0
    if (!pathogenCol && pathogenShare >= 0.6 && vals.some((v) => detectPathogens(v).length === 1)) {
      pathogenCol = c
      continue
    }
    const metricShare = vals.length ? vals.filter((v) => !['bare', 'unknown', 'skip'].includes(headerRole(v))).length / vals.length : 0
    if (!metricCol && metricShare >= 0.6 && /\b(measure|metric|indicator|variable|statistic|stat|unit|units|type|outcome measure)\b/.test(c.h)) {
      metricCol = c
      continue
    }
    unknownDims.push(c)
  }
  if (pathogenCol) diag.pathogenColumn = pathogenCol.raw
  if (metricCol) diag.metricColumn = metricCol.raw
  if (stratifiers.length) diag.stratifiers = stratifiers.map((s) => cols[s.idx].raw)
  if (levelCols.length) diag.levelColumns = levelCols.map((s) => cols[s.idx].raw)
  if (trendCols.length) diag.trendColumns = trendCols.map((s) => cols[s.idx].raw)

  // Stratifiers: keep only the overall rows.
  let usable = rows
  for (const st of stratifiers) {
    const keep = usable.filter((r) => OVERALL.test(normHeader(r[st.idx] ?? '')))
    if (!keep.length) {
      diag.unparsed.push(
        `stratified by "${cols[st.idx].raw}" with no overall/all-ages rows (${cols[st.idx].distinct.slice(0, 8).join(', ')})`,
      )
      return { series: [], diag }
    }
    diag.skipped['stratifier (not overall)'] = (diag.skipped['stratifier (not overall)'] ?? 0) + usable.length - keep.length
    usable = keep
  }

  // 4) Dates per row.
  const rowDate = (r: string[]): string | null => {
    switch (strategy.kind) {
      case 'date': {
        const iso = parseDateCell(r[strategy.col] ?? '')
        return iso ? weekEndingSaturday(iso) : null
      }
      case 'yyyyww': {
        const yw = parseYearWeek(r[strategy.col] ?? '')
        return yw ? mmwrWeekEnding(yw.year, yw.week) : null
      }
      case 'yearWeek': {
        const y = Number((r[strategy.yearCol] ?? '').trim())
        const w = weekNumber(r[strategy.weekCol] ?? '')
        return y >= 2000 && w && w <= weeksInMmwrYear(y) ? mmwrWeekEnding(y, w) : null
      }
      case 'seasonWeek': {
        const s = parseSeason(r[strategy.seasonCol] ?? '')
        const w = weekNumber(r[strategy.weekCol] ?? '')
        return s != null && w ? seasonWeekEnding(s, w) : null
      }
      case 'seasonMatrix': {
        // The date depends on the column; return a marker that the row has a valid week.
        return weekNumber(r[strategy.weekCol] ?? '') ? 'matrix' : null
      }
    }
  }
  if (strategy.kind === 'date') {
    const wd: Record<string, number> = {}
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (const r of usable) {
      const iso = parseDateCell(r[strategy.col] ?? '')
      if (iso) {
        const k = names[new Date(`${iso}T00:00:00Z`).getUTCDay()]
        wd[k] = (wd[k] ?? 0) + 1
      }
    }
    diag.weekdays = wd
  }

  // Functional-dependency check: an unrecognized text column is harmless only if it never splits a
  // (week, place, pathogen, measure) group. Otherwise the file has a dimension we do not understand.
  const groupKey = (r: string[]) =>
    [
      strategy.kind === 'seasonMatrix' ? r[strategy.weekCol] : rowDate(r),
      geo.col != null ? r[geo.col] : '',
      pathogenCol ? r[pathogenCol.idx] : '',
      metricCol ? r[metricCol.idx] : '',
    ].join('|')
  const dependent: string[] = []
  for (const c of unknownDims) {
    const m = new Map<string, string>()
    let splits = false
    for (const r of usable) {
      const k = groupKey(r)
      const v = r[c.idx] ?? ''
      const prev = m.get(k)
      if (prev === undefined) m.set(k, v)
      else if (prev !== v) {
        splits = true
        break
      }
    }
    if (splits) {
      diag.unparsed.push(`unrecognized dimension column "${c.raw}" (values: ${c.distinct.slice(0, 8).join(', ')})`)
      return { series: [], diag }
    }
    dependent.push(c.raw)
  }
  if (dependent.length) diag.dependentColumns = dependent

  // 5) Value columns.
  const fileHasCovid =
    numericCols.some((c) => detectPathogens(c.raw).includes('covid')) ||
    (pathogenCol?.distinct.some((v) => detectPathogens(v).includes('covid')) ?? false)
  interface VCol {
    col: Col
    role: Role
    hits: PathogenHit[]
    variant?: string
    headerGeo?: GeoRef | null
    season?: number
  }
  const vcols: VCol[] = []
  for (const c of numericCols) {
    if (geo.lat === c.idx || geo.lon === c.idx || geo.sitePop === c.idx) continue
    const season = strategy.kind === 'seasonMatrix' ? strategy.seasons.get(c.idx) : undefined
    if (strategy.kind === 'seasonMatrix' && season == null) {
      diag.valueColumns.push({ column: c.raw, role: headerRole(c.raw), status: 'not a season column in a week × season matrix' })
      continue
    }
    const label = season != null ? c.raw.replace(/(20\d\d)\s*[-–—/]\s*(\d{2}|20\d\d)/, ' ') : c.raw
    let headerGeo: GeoRef | null | undefined
    if (geo.fromHeaders) {
      headerGeo = geo.level === 'region' && geo.scheme ? regionGeo(c.raw, geo.scheme) : countyGeo(c.raw)
      if (!headerGeo) {
        diag.valueColumns.push({ column: c.raw, role: headerRole(c.raw), status: 'header is not a place in a wide-by-place table' })
        continue
      }
    }
    vcols.push({ col: c, role: season != null && isBare(label) ? 'bare' : headerRole(label), hits: detectPathogens(label), variant: variantOf(label), headerGeo, season })
  }

  // 6) Rows → raw observations.
  type Obs = { date: string; value: number; col: number }
  const groups = new Map<string, { pathogen: PathogenId; metric: MetricKind; geo: GeoRef; variant?: string; obs: Obs[]; levels: Map<string, string[]> }>()
  const positives = new Map<string, { geo: GeoRef; obs: Obs[] }>()
  const tests = new Map<string, { geo: GeoRef; obs: Obs[] }>()
  const geoCache = new Map<string, GeoRef | null>()
  const sites = new Map<string, { name: string; counties: Set<string>; pop?: number; lat?: number; lon?: number; region?: string }>()
  const colStatus = new Map<number, ValueColumnDiag>()
  const setStatus = (v: VCol, status: string, pathogen?: string, metric?: string) => {
    const prev = colStatus.get(v.col.idx)
    if (prev && prev.status === 'mapped') return
    colStatus.set(v.col.idx, { column: v.col.raw, role: v.role, pathogen, metric, status })
  }
  const lowerBound = [opts.historyStart, spec.minDate ?? ''].sort().pop()!

  for (const r of usable) {
    const d0 = rowDate(r)
    if (!d0) {
      skip('no parseable week')
      continue
    }
    // Row geography.
    let rowGeo: GeoRef | null = STATE_GEO
    if (geo.level === 'site' && geo.siteId != null) {
      const id = (r[geo.siteId] ?? '').trim()
      if (!id || OVERALL.test(normHeader(id))) {
        skip('site total/blank row')
        continue
      }
      const name = (r[geo.siteName ?? geo.siteId] ?? id).trim() || id
      const site = sites.get(id) ?? { name, counties: new Set<string>() }
      if (geo.siteCounty != null) for (const f of countyList(r[geo.siteCounty] ?? '')) site.counties.add(f)
      if (geo.sitePop != null) {
        const p = num(r[geo.sitePop])
        if (p != null) site.pop = Math.max(site.pop ?? 0, p)
      }
      if (geo.lat != null && geo.lon != null) {
        const la = num(r[geo.lat])
        const lo = num(r[geo.lon])
        if (la != null && lo != null && la > 40 && la < 50 && lo > -98 && lo < -89) [site.lat, site.lon] = [la, lo]
      }
      if (geo.siteRegion != null && r[geo.siteRegion]) site.region = r[geo.siteRegion]
      sites.set(id, site)
      rowGeo = { type: 'sewershed', code: `mdh-${slug(id)}`, name }
    } else if (geo.col != null) {
      const raw = (r[geo.col] ?? '').trim()
      const key = `${geo.level}|${raw}`
      if (!geoCache.has(key)) geoCache.set(key, geo.level === 'county' ? countyGeo(raw) : regionGeo(raw, geo.scheme!))
      rowGeo = geoCache.get(key) ?? null
      if (!rowGeo) {
        skip(`unmatched ${geo.level} "${raw.slice(0, 30)}"`)
        continue
      }
    }
    // Row pathogen / measure.
    let rowPathogen: PathogenHit[] = []
    if (pathogenCol) {
      const cell = r[pathogenCol.idx] ?? ''
      if (OVERALL.test(normHeader(cell))) {
        const allow = !spec.pathogens || spec.pathogens.includes('respiratory-combined')
        if (!allow) {
          skip('pathogen total row')
          continue
        }
        rowPathogen = ['respiratory-combined']
      } else {
        rowPathogen = detectPathogens(cell)
        if (rowPathogen.length !== 1) {
          skip(`unrecognized pathogen "${cell.slice(0, 30)}"`)
          continue
        }
      }
    }
    const rowRole: Role | null = metricCol ? headerRole(r[metricCol.idx] ?? '') : null
    let used = false
    for (const v of vcols) {
      const cell = r[v.col.idx] ?? ''
      const value = num(cell)
      if (value == null) continue
      let date = d0
      if (strategy.kind === 'seasonMatrix') {
        const w = weekNumber(r[strategy.weekCol] ?? '')!
        const dd = seasonWeekEnding(v.season!, w)
        if (!dd) continue
        date = dd
      }
      if (date < lowerBound || date > opts.maxDate) continue
      const hits = v.hits.length ? v.hits : rowPathogen
      let role = v.role
      if (rowRole && ['value', 'count', 'percent', 'bare'].includes(role)) role = rowRole
      const g = v.headerGeo ?? rowGeo!
      const res = resolvePathogen(hits, spec, fileHasCovid, v.hits.length ? undefined : v.col.raw)
      let pathogen = res.pathogen ?? (!hits.length && !res.reason ? spec.defaultPathogen : undefined)
      if (role === 'ili') pathogen = 'ili'
      if (role === 'positives' || role === 'tests') {
        if (!spec.metrics.includes('test_positivity')) {
          setStatus(v, `${role} count (no positivity expected in this file)`)
          continue
        }
        const pk = `${role === 'tests' && !v.hits.length && !rowPathogen.length ? '*' : pathogen ?? '?'}|${g.type}|${g.code}|${v.variant ?? ''}`
        const bucket = role === 'positives' ? positives : tests
        if (!bucket.has(pk)) bucket.set(pk, { geo: g, obs: [] })
        bucket.get(pk)!.obs.push({ date, value, col: v.col.idx })
        setStatus(v, `used as ${role} for computing positivity`, pathogen)
        used = true
        continue
      }
      const metric = roleMetric(role, spec)
      if (!metric) {
        setStatus(v, role === 'skip' ? 'ignored (auxiliary column)' : `measure not mapped (role ${role}; file expects ${spec.metrics.join('/')})`, pathogen)
        continue
      }
      if (!pathogen) {
        setStatus(v, res.reason ?? 'no pathogen in header, row or link text', undefined, metric)
        continue
      }
      if (metric === 'ili_pct' && pathogen !== 'ili') {
        setStatus(v, 'ILI percentage with a pathogen-specific label', pathogen, metric)
        continue
      }
      const key = [pathogen, metric, g.type, g.code, v.variant ?? ''].join('|')
      let grp = groups.get(key)
      if (!grp) {
        grp = { pathogen, metric, geo: g, variant: v.variant, obs: [], levels: new Map() }
        groups.set(key, grp)
      }
      grp.obs.push({ date, value, col: v.col.idx })
      // Publisher level/trend labels for this row.
      const labels: string[] = []
      for (const lc of [...levelCols, ...trendCols]) {
        const lab = (r[lc.idx] ?? '').trim()
        if (!lab) continue
        const lcp = lc.pathogens.filter((p): p is PathogenId => p !== 'cov?')
        const applies = lcp.length ? lcp.includes(pathogen) : vcols.length === 1 || !!pathogenCol
        if (applies) labels.push(lab)
      }
      if (labels.length) grp.levels.set(date, labels)
      setStatus(v, 'mapped', pathogen, metric)
      used = true
    }
    if (used) diag.rowsUsed++
    else skip('no mapped values')
  }
  for (const v of vcols) if (!colStatus.has(v.col.idx)) setStatus(v, 'no numeric values in range')
  diag.valueColumns = [...diag.valueColumns, ...colStatus.values()].slice(0, 60)

  // 7) Observations → weekly points, rejecting ambiguous groups.
  const combine = (obs: Obs[], label: string, metric: MetricKind): Point[] | string => {
    const byDate = new Map<string, Obs[]>()
    for (const o of obs) {
      if (!byDate.has(o.date)) byDate.set(o.date, [])
      byDate.get(o.date)!.push(o)
    }
    const pts: Point[] = []
    for (const [date, os] of [...byDate].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const colsInWeek = new Set(os.map((o) => o.col))
      if (colsInWeek.size > 1 && new Set(os.map((o) => o.value)).size > 1) return `${label}: several columns give different values for the same week`
      let v: number
      if (spec.combine === 'mean') v = os.reduce((a, o) => a + o.value, 0) / os.length
      else {
        if (new Set(os.map((o) => o.value)).size > 1) return `${label}: several different values in week ${date} (unrecognized dimension?)`
        v = os[0].value
      }
      pts.push([date, roundValue(v, metric)])
    }
    return pts
  }

  const out: NormalizedSeries[] = []
  for (const g of groups.values()) {
    const label = `${g.pathogen}/${g.metric}/${g.geo.code}${g.variant ? `/${g.variant}` : ''}`
    const pts = combine(g.obs, label, g.metric)
    if (typeof pts === 'string') {
      diag.unparsed.push(pts)
      continue
    }
    if (!pts.length) continue
    const s: NormalizedSeries = {
      pathogen: g.pathogen,
      metric: g.metric,
      geo: g.geo,
      variant: g.variant,
      points: pts,
      columns: [...new Set(g.obs.map((o) => cols[o.col].raw))],
    }
    const lastDate = pts[pts.length - 1][0]
    const labs = g.levels.get(lastDate)
    if (labs?.length) {
      const level = labs.map(levelFromLabel).find(Boolean)
      const trend = labs.map(trendFromLabel).find(Boolean)
      if (level || trend) s.official = { level, trend, label: labs.join('; '), asOf: lastDate, by: opts.officialBy ?? 'MDH' }
    }
    out.push(s)
  }

  // Positivity computed from published positives ÷ tests, only where no published percentage exists.
  for (const [pk, posBucket] of positives) {
    const posObs = posBucket.obs
    const [p, gtype, gcode, variant] = pk.split('|')
    if (p === '?' || p === '*') continue
    const pathogen = p as PathogenId
    if (out.some((s) => s.pathogen === pathogen && s.metric === 'test_positivity' && s.geo.type === gtype && s.geo.code === gcode)) continue
    const tObs = (tests.get(pk) ?? tests.get(`*|${gtype}|${gcode}|${variant}`))?.obs
    if (!tObs) continue
    const posPts = combine(posObs, `${pathogen} positives`, 'cases')
    const testPts = combine(tObs, `${pathogen} tests`, 'cases')
    if (typeof posPts === 'string' || typeof testPts === 'string') {
      diag.unparsed.push(typeof posPts === 'string' ? posPts : (testPts as string))
      continue
    }
    const tMap = new Map(testPts)
    const pts: Point[] = []
    for (const [d, pv] of posPts) {
      const tv = tMap.get(d)
      if (pv == null || tv == null || tv <= 0 || pv > tv) continue
      pts.push([d, roundValue((pv / tv) * 100, 'test_positivity')])
    }
    if (!pts.length) continue
    out.push({
      pathogen,
      metric: 'test_positivity',
      geo: posBucket.geo,
      variant: variant || undefined,
      points: pts,
      columns: [...new Set([...posObs, ...tObs].map((o) => cols[o.col].raw))],
      computed: 'MDH positive tests ÷ tests performed',
    })
  }

  // Sewershed details (counties, population, coordinates).
  if (geo.level === 'site') {
    for (const s of out) {
      if (s.geo.type !== 'sewershed') continue
      const id = [...sites.keys()].find((k) => `mdh-${slug(k)}` === s.geo.code)
      const site = id != null ? sites.get(id) : undefined
      if (!site) continue
      let counties = [...site.counties]
      let coordBasis: string | undefined
      if (!counties.length) {
        const f = plantCounty(site.name)
        if (f) counties = [f]
        if (f) coordBasis = 'county centroid (plant city)'
      }
      let coord: [number, number] | undefined
      if (site.lat != null && site.lon != null) {
        coord = [Math.round(site.lon * 1e4) / 1e4, Math.round(site.lat * 1e4) / 1e4]
        coordBasis = 'site coordinates (MDH)'
      } else if (counties.length) {
        coord = countiesCentroid(counties, opts.rootDir)
        coordBasis ??= 'population-weighted centroid of counties served'
        if (!coord) coordBasis = undefined
      }
      s.geo = {
        ...s.geo,
        name: site.name,
        counties: counties.length ? counties : undefined,
        population: site.pop != null ? Math.round(site.pop) : undefined,
        coord,
      }
      const attrs: Record<string, string> = {}
      if (coordBasis) attrs.coordBasis = coordBasis
      if (site.region) attrs.region = site.region
      if (Object.keys(attrs).length) s.attrs = attrs
    }
  }

  diag.series = out.length
  diag.latest = out.reduce<string | undefined>((m, s) => {
    const d = s.points[s.points.length - 1]?.[0]
    return d && (!m || d > m) ? d : m
  }, undefined)
  if (!out.length && !diag.unparsed.length) diag.unparsed.push('no value column could be mapped unambiguously to a pathogen and measure')
  return { series: out, diag }
}

