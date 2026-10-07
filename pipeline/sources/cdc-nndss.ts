// CDC NNDSS weekly provisional notifiable-disease tables — Minnesota rows (data.cdc.gov x9gk-5huc).
//
// Each row of x9gk-5huc is one cell of CDC's weekly NNDSS table as it was published that week:
//   states (reporting area; 'MINNESOTA' in 2022–2024, 'Minnesota' from 2025), year (TEXT), week,
//   label (disease; wording changes over time), m1 = current-week count, m2 = previous 52-week max,
//   m3 = cumulative YTD current MMWR year, m4 = cumulative YTD previous MMWR year, each with an
//   m*_flag ('-' no reported cases / blank, 'U' unavailable, 'N'/'NN'/'NP'/'NC' not notifiable,
//   not published, not calculated).
//
// Minnesota caveats (checked against the full PopHIVE copy, rows updated 2026-09-30):
//   * MN assigns cases to earlier MMWR weeks, so m1 is blank ('-') in most weeks even while m3 rises.
//     A blank is NOT zero: we keep it as null.
//   * Enteric diseases (Campylobacter, Salmonella, STEC, Shigella, Crypto, Cyclospora, Giardia) are
//     blank all current year for MN; the prior year's totals appear the next year in m4.
//   * m2 is the 52-week maximum, not a year-to-date count.
//   * The CSV export (mirror) formats numbers with thousands separators ('1,125').
//
// Primary: SODA JSON API. Fallback: PopHIVE/Ingest's mirrored CSV export (xz) + Socrata metadata,
// streamed through xz and pre-filtered to Minnesota lines (the full file is ~277 MB / 2M rows).
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { PathogenId, Point, Series } from '../../shared/types.ts'
import { addDays, mmwrWeekEnding, weeksInMmwrYear } from '../../shared/mmwr.ts'
import { fetchBuffer, fetchJson } from '../lib/http.ts'
import { num, parseCsv } from '../lib/csv.ts'
import { soqlString, socrataQuery, socrataUrl } from '../lib/socrata.ts'
import { POPHIVE_MIRRORS } from '../lib/cdcData.ts'
import { makeSeries, STATE_GEO } from '../lib/series.ts'
import type { Logger } from '../lib/log.ts'
import type { SourceModule, SourceResult } from '../types.ts'

export const DATASET_ID = 'x9gk-5huc'
const SOURCE = 'cdc-nndss'
const DATASET = 'nndss-mn'
const POPHIVE = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data'
const BY = 'CDC NNDSS weekly tables'

/** API field names we read. */
export const FIELDS = ['states', 'year', 'week', 'label', 'm1', 'm1_flag', 'm2', 'm2_flag', 'm3', 'm3_flag', 'm4', 'm4_flag']
const REQUIRED = ['states', 'year', 'week', 'label']
const METRIC_FIELDS = ['m1', 'm2', 'm3', 'm4']

// ───────────────────────── label → pathogen mapping ─────────────────────────

export interface PathogenRule {
  pathogen: PathogenId
  name: string
  /**
   * Label alternatives in priority order (newer wording first). Each alternative is a list of
   * component labels that are summed (e.g. indigenous + imported measles). For a given week the
   * first alternative with any matching row is used, so renamed labels never double count.
   */
  alternatives: RegExp[][]
  note?: string
}

/** Lower-case, collapse whitespace (CDC labels contain double spaces), strip trailing punctuation. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim()
}

// Exact Minnesota labels seen 2022–2026 (x9gk-5huc) are listed beside each rule.
export const RULES: PathogenRule[] = [
  // 'Pertussis'
  { pathogen: 'pertussis', name: 'Whooping cough (pertussis)', alternatives: [[/^pertussis$/]] },
  // 'Measles, Indigenous' + 'Measles, Imported'
  {
    pathogen: 'measles',
    name: 'Measles',
    alternatives: [[/^measles,? indigenous$/, /^measles,? imported$/], [/^measles(,? total)?$/]],
    note: 'Indigenous and imported cases combined.',
  },
  // 'Salmonellosis (excluding Salmonella Typhi infection and Salmonella Paratyphi infection)'
  { pathogen: 'salmonella', name: 'Salmonellosis', alternatives: [[/^salmonellosis\b/]] },
  // 'Shiga toxin-producing Escherichia coli (STEC)'
  { pathogen: 'stec', name: 'Shiga toxin-producing E. coli (STEC)', alternatives: [[/^shiga toxin.producing (escherichia coli|e\. ?coli)/]] },
  // 'Shigellosis'
  { pathogen: 'shigella', name: 'Shigellosis', alternatives: [[/^shigellosis$/]] },
  // 'Campylobacteriosis'
  { pathogen: 'campylobacter', name: 'Campylobacteriosis', alternatives: [[/^campylobacteriosis$/]] },
  // 'Hepatitis A, Confirmed' (2023+) ; 'Hepatitis, A, acute' (2022–2023)
  {
    pathogen: 'hepatitis-a',
    name: 'Hepatitis A',
    alternatives: [[/^hepatitis,? a, confirmed$/], [/^hepatitis,? a,? acute$/]],
  },
  // 'Mpox' (2024+)
  { pathogen: 'mpox', name: 'Mpox', alternatives: [[/^mpox$/], [/^monkeypox( virus infection)?$/]] },
  // 'Arboviral diseases, West Nile virus disease' ; older tables split neuroinvasive / non-neuroinvasive
  {
    pathogen: 'west-nile',
    name: 'West Nile virus disease',
    alternatives: [
      [/^(arboviral diseases, )?west nile virus disease$/],
      [/west nile virus disease,? neuroinvasive$/, /west nile virus disease,? non-neuroinvasive$/],
    ],
    note: 'Neuroinvasive and non-neuroinvasive disease combined.',
  },
  // not in x9gk-5huc for MN as of 2026 (Lyme is published annually)
  { pathogen: 'lyme', name: 'Lyme disease', alternatives: [[/^lyme disease$/]] },
  // 'Ehrlichiosis and Anaplasmosis, Anaplasma phagocytophilum infection' (2022–2023 only)
  {
    pathogen: 'anaplasmosis',
    name: 'Anaplasmosis',
    alternatives: [[/^anaplasmosis$/], [/anaplasma phagocytophilum/]],
  },
  // 'Babesiosis' (2022–2024 only)
  { pathogen: 'babesiosis', name: 'Babesiosis', alternatives: [[/^babesiosis$/]] },
  // 'Cryptosporidiosis'
  { pathogen: 'cryptosporidium', name: 'Cryptosporidiosis', alternatives: [[/^cryptosporidiosis$/]] },
  // 'Cyclosporiasis'
  { pathogen: 'cyclospora', name: 'Cyclosporiasis', alternatives: [[/^cyclosporiasis$/]] },
  // 'Giardiasis'
  { pathogen: 'giardia', name: 'Giardiasis', alternatives: [[/^giardiasis$/]] },
  // Not in x9gk-5huc as of 2026. 'Streptococcal toxic shock syndrome' is deliberately NOT mapped:
  // it is a small subset of invasive group A strep and would understate it.
  {
    pathogen: 'strep-a',
    name: 'Invasive group A strep',
    alternatives: [[/^invasive (disease, )?group a strep/, /^group a strep[a-z]*,? invasive/]],
  },
]

/** Notable labels with no PathogenId — reported in diagnostics only. */
const WATCH_UNMAPPED = /^(mumps|legionellosis|varicella|streptococcal toxic shock|novel influenza|influenza-associated pediatric)/

export function matchLabel(norm: string): { rule: PathogenRule; alt: number; comp: number } | null {
  for (const rule of RULES) {
    for (let a = 0; a < rule.alternatives.length; a++) {
      const c = rule.alternatives[a].findIndex((re) => re.test(norm))
      if (c >= 0) return { rule, alt: a, comp: c }
    }
  }
  return null
}

// ───────────────────────── row parsing ─────────────────────────

export interface NndssRow {
  year: number
  week: number
  weekEnding: string
  label: string
  norm: string
  m1: number | null
  m2: number | null
  m3: number | null
  m4: number | null
  m1Flag: string
}

export interface ParseStats {
  input: number
  minnesota: number
  badWeek: number
  duplicates: number
  stateSpellings: Record<string, number>
}

/** Keep Minnesota rows (any casing), parse numbers (commas allowed) and MMWR week-ending dates. */
export function parseRows(raw: Record<string, string>[]): { rows: NndssRow[]; stats: ParseStats } {
  const stats: ParseStats = { input: raw.length, minnesota: 0, badWeek: 0, duplicates: 0, stateSpellings: {} }
  const byKey = new Map<string, NndssRow>()
  for (const r of raw) {
    const state = (r.states ?? '').trim()
    if (state.toLowerCase() !== 'minnesota') continue
    stats.minnesota++
    stats.stateSpellings[state] = (stats.stateSpellings[state] ?? 0) + 1
    const year = Number(String(r.year ?? '').trim())
    const week = num(r.week)
    if (!Number.isInteger(year) || year < 2000 || week == null || !Number.isInteger(week) || week < 1 || week > weeksInMmwrYear(year)) {
      stats.badWeek++
      continue
    }
    const label = (r.label ?? '').replace(/\s+/g, ' ').trim()
    if (!label) continue
    const row: NndssRow = {
      year,
      week,
      weekEnding: mmwrWeekEnding(year, week),
      label,
      norm: normalizeLabel(label),
      m1: num(r.m1),
      m2: num(r.m2),
      m3: num(r.m3),
      m4: num(r.m4),
      m1Flag: (r.m1_flag ?? '').trim(),
    }
    const key = `${year}|${week}|${row.norm}`
    if (byKey.has(key)) stats.duplicates++
    byKey.set(key, row)
  }
  const rows = [...byKey.values()].sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : a.weekEnding > b.weekEnding ? 1 : 0))
  return { rows, stats }
}

// ───────────────────────── series building ─────────────────────────

/** One pathogen in one weekly table, after choosing the label alternative and summing components. */
export interface PathogenWeek {
  year: number
  week: number
  weekEnding: string
  labels: string[]
  m1: number | null
  m3: number | null
  m4: number | null
  /** 52-week max per component (not additive across components). */
  m2: { label: string; value: number | null }[]
}

/** Sum of the reported components; null when every component is blank. */
export function sumReported(values: (number | null)[]): number | null {
  const reported = values.filter((v): v is number => v != null)
  return reported.length ? reported.reduce((a, b) => a + b, 0) : null
}

export function groupByPathogen(rows: NndssRow[]): Map<PathogenId, PathogenWeek[]> {
  // pathogen → weekEnding → alt → rows
  const acc = new Map<PathogenId, Map<string, Map<number, NndssRow[]>>>()
  for (const row of rows) {
    const m = matchLabel(row.norm)
    if (!m) continue
    const weeks = acc.get(m.rule.pathogen) ?? new Map<string, Map<number, NndssRow[]>>()
    acc.set(m.rule.pathogen, weeks)
    const alts = weeks.get(row.weekEnding) ?? new Map<number, NndssRow[]>()
    weeks.set(row.weekEnding, alts)
    const list = alts.get(m.alt) ?? []
    list.push(row)
    alts.set(m.alt, list)
  }
  const out = new Map<PathogenId, PathogenWeek[]>()
  for (const [pathogen, weeks] of acc) {
    const list: PathogenWeek[] = []
    for (const [weekEnding, alts] of [...weeks].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const best = Math.min(...alts.keys())
      const comps = alts.get(best)!
      list.push({
        year: comps[0].year,
        week: comps[0].week,
        weekEnding,
        labels: comps.map((c) => c.label),
        m1: sumReported(comps.map((c) => c.m1)),
        m3: sumReported(comps.map((c) => c.m3)),
        m4: sumReported(comps.map((c) => c.m4)),
        m2: comps.map((c) => ({ label: c.label, value: c.m2 })),
      })
    }
    out.set(pathogen, list)
  }
  return out
}

const fmt = (n: number) => n.toLocaleString('en-US')
const cases = (n: number) => `${fmt(n)} case${n === 1 ? '' : 's'}`

/** Plain-language year-to-date comparison for the latest table week. */
export function ytdSummary(year: number, m3: number | null, m4: number | null): string {
  const prev = year - 1
  if (m3 != null && m4 != null) return `${cases(m3)} so far in ${year} vs ${fmt(m4)} by this week in ${prev}`
  if (m3 != null) return `${cases(m3)} so far in ${year} (${prev} count for this week is blank)`
  if (m4 != null) return `${year} count is blank in CDC's weekly table; ${fmt(m4)} by this week in ${prev}`
  return `${year} and ${prev} year-to-date counts are blank in CDC's weekly table`
}

const BASE_NOTE =
  "Provisional counts from CDC's weekly NNDSS tables for Minnesota, by the week CDC published them (not illness onset). " +
  'Each point is the count first published for that week; corrections show up only in the year-to-date total. ' +
  "Minnesota often assigns cases to earlier weeks, so this week's cell is frequently blank even when the year-to-date total rises; blanks are shown as missing, not zero."

export interface BuildResult {
  series: Series[]
  perPathogen: Record<string, unknown>
  skipped: Record<string, string>
}

export function buildSeries(byPathogen: Map<PathogenId, PathogenWeek[]>, historyStart: string, latestTableWeek: string): BuildResult {
  const series: Series[] = []
  const perPathogen: Record<string, unknown> = {}
  const skipped: Record<string, string> = {}
  const recentCutoff = addDays(latestTableWeek, -56)
  for (const rule of RULES) {
    const weeks = byPathogen.get(rule.pathogen)
    if (!weeks?.length) {
      skipped[rule.pathogen] = 'no matching label in Minnesota rows'
      continue
    }
    const kept = weeks.filter((w) => w.weekEnding >= historyStart)
    const points: Point[] = kept.map((w) => [w.weekEnding, w.m1])
    const latest = weeks[weeks.length - 1]
    const nonNull = points.filter((p) => p[1] != null)
    const labelsUsed = [...new Set(weeks.flatMap((w) => w.labels))]
    if (!points.length || (latest.weekEnding < recentCutoff && !nonNull.length)) {
      skipped[rule.pathogen] = `label no longer in the weekly tables (last seen ${latest.year} week ${latest.week}) and no current-week counts`
      perPathogen[rule.pathogen] = { labels: labelsUsed, lastSeen: latest.weekEnding }
      continue
    }
    // Diseases Minnesota sends to CDC only after year-end: YTD blank in every table of this year AND
    // of last year, while last year's YTD (m4, backfilled) is non-zero. Requiring two blank years avoids
    // flagging diseases that simply have no cases yet this year (measles in January, West Nile in June).
    const thisYear = weeks.filter((w) => w.year === latest.year)
    const lastYear = weeks.filter((w) => w.year === latest.year - 1)
    const blankAllYear =
      lastYear.length > 0 && thisYear.every((w) => w.m3 == null) && lastYear.every((w) => w.m3 == null) && (latest.m4 ?? 0) > 0
    const notes = [BASE_NOTE]
    if (rule.note) notes.push(rule.note)
    if (blankAllYear) {
      notes.push(
        `Minnesota's ${latest.year} year-to-date count has been blank all year in these tables while ${latest.year - 1} shows ${fmt(latest.m4!)} by the same week, so Minnesota appears to report this disease to CDC after year-end; blanks do not mean zero cases.`,
      )
    }
    const s = makeSeries({
      source: SOURCE,
      dataset: DATASET,
      pathogen: rule.pathogen,
      metric: 'cases',
      geo: STATE_GEO,
      label: `${rule.name} — cases in CDC's weekly table (NNDSS)`,
      points,
      note: notes.join(' '),
    })
    const attrs: Record<string, string> = {
      nndssLabel: [...new Set(latest.labels)].join(' + '),
      mmwrWeek: `${latest.year}-W${String(latest.week).padStart(2, '0')}`,
    }
    if (latest.m3 != null) attrs.ytd = String(latest.m3)
    if (latest.m4 != null) attrs.ytdPrevYear = String(latest.m4)
    if (latest.m2.length === 1) {
      if (latest.m2[0].value != null) attrs.max52 = String(latest.m2[0].value)
    } else {
      for (const c of latest.m2) if (c.value != null) attrs[`max52 (${c.label})`] = String(c.value)
    }
    if (blankAllYear) attrs.currentYear = 'blank all year (reported after year-end)'
    s.attrs = attrs
    s.official = { label: ytdSummary(latest.year, latest.m3, latest.m4), asOf: latest.weekEnding, by: BY }
    series.push(s)
    const lastNonNull = nonNull[nonNull.length - 1]
    perPathogen[rule.pathogen] = {
      labels: labelsUsed,
      points: points.length,
      nonNullPoints: nonNull.length,
      latestTableWeek: latest.weekEnding,
      latestNonNull: lastNonNull ? { date: lastNonNull[0], value: lastNonNull[1] } : null,
      ytd: latest.m3,
      ytdPrevYear: latest.m4,
      blankAllYear,
    }
  }
  return { series, perPathogen, skipped }
}

// ───────────────────────── loading (live API, mirror fallback) ─────────────────────────

interface SocrataMeta {
  rowsUpdatedAt?: number
  columns?: { name: string; fieldName: string }[]
}

export interface LoadResult {
  rows: Record<string, string>[]
  via: 'data.cdc.gov' | 'pophive-mirror'
  url: string
  updatedAt?: string
  /** Rows scanned before filtering to Minnesota (mirror only). */
  scanned?: number
  liveError?: string
}

function stringify(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return out
}

export function liveQuery(years: number[]) {
  return {
    select: FIELDS.join(','),
    where: `upper(states) = 'MINNESOTA' AND year IN (${years.map((y) => soqlString(String(y))).join(', ')})`,
    maxRows: 500_000,
  }
}

/** Convert mirror CSV lines (Socrata display-name headers) to rows keyed by API field names. */
export function mirrorRows(header: string, lines: string[], columns: { name: string; fieldName: string }[]): Record<string, string>[] {
  const rename = new Map(columns.map((c) => [c.name, c.fieldName]))
  return parseCsv([header, ...lines].join('\n')).map((raw) => {
    const row: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) row[rename.get(k) ?? k] = v
    return row
  })
}

/** Stream an xz buffer through `xz -dc`, keeping the header line and lines that pass `keep`. */
export function xzFilterLines(buf: ArrayBuffer | Uint8Array, keep: (line: string) => boolean): Promise<{ header: string; lines: string[]; scanned: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('xz', ['-dc'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let header: string | null = null
    const lines: string[] = []
    let scanned = 0
    let stderr = ''
    let exitCode: number | null | undefined
    let linesDone = false
    const finish = () => {
      if (exitCode === undefined || !linesDone) return
      if (exitCode !== 0) reject(new Error(`xz -dc exited with ${exitCode}: ${stderr.slice(0, 200)}`))
      else resolve({ header: header ?? '', lines, scanned })
    }
    child.on('error', reject)
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.stdin.on('error', () => {
      /* EPIPE if xz exits early; reported through the exit code */
    })
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
    rl.on('line', (line) => {
      if (header === null) {
        header = line.replace(/^﻿/, '')
        return
      }
      scanned++
      if (keep(line)) lines.push(line)
    })
    rl.on('close', () => {
      linesDone = true
      finish()
    })
    child.on('close', (code) => {
      exitCode = code
      finish()
    })
    child.stdin.end(Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)))
  })
}

const MN_LINE = /^"?minnesota"?,/i

async function loadRows(years: number[], log: Logger): Promise<LoadResult> {
  const q = liveQuery(years)
  const url = socrataUrl(DATASET_ID, q)
  let liveError: string
  try {
    const rows = await socrataQuery<Record<string, unknown>>(DATASET_ID, q)
    if (rows.length === 0) throw new Error('no rows returned')
    let updatedAt: string | undefined
    try {
      const meta = await fetchJson<SocrataMeta>(`https://data.cdc.gov/api/views/${DATASET_ID}.json`, { retries: 1 })
      if (meta.rowsUpdatedAt) updatedAt = new Date(meta.rowsUpdatedAt * 1000).toISOString()
    } catch {
      /* metadata is optional */
    }
    return { rows: rows.map(stringify), via: 'data.cdc.gov', url, updatedAt }
  } catch (e) {
    liveError = e instanceof Error ? e.message : String(e)
  }
  log.warn(`data.cdc.gov ${DATASET_ID} unavailable (${liveError.slice(0, 160)}); using PopHIVE mirror`)
  const path = POPHIVE_MIRRORS[DATASET_ID] ?? 'nnds/raw/x9gk-5huc'
  const mirrorUrl = `${POPHIVE}/${path}.csv.xz`
  const [meta, buf] = await Promise.all([
    fetchJson<SocrataMeta>(`${POPHIVE}/${path}.json`),
    fetchBuffer(mirrorUrl, { timeoutMs: 300_000 }),
  ])
  const { header, lines, scanned } = await xzFilterLines(buf, (l) => MN_LINE.test(l))
  if (!meta.columns?.length) log.warn('mirror metadata has no column list; CSV display names are used as-is')
  const yearSet = new Set(years.map(String))
  const rows = mirrorRows(header, lines, meta.columns ?? []).filter((r) => yearSet.has(String(r.year ?? '').trim()))
  return {
    rows,
    via: 'pophive-mirror',
    url: mirrorUrl,
    updatedAt: meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString() : undefined,
    scanned,
    liveError: liveError.slice(0, 300),
  }
}

/** Union of column names seen; returns missing required/metric columns. */
export function checkSchema(rows: Record<string, string>[]): { seen: string[]; missingRequired: string[]; missingMetrics: string[] } {
  const seen = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k)
  return {
    seen: [...seen].sort(),
    missingRequired: REQUIRED.filter((c) => !seen.has(c)),
    missingMetrics: METRIC_FIELDS.filter((c) => !seen.has(c)),
  }
}

// ───────────────────────── module ─────────────────────────

export const cdcNndss: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'CDC NNDSS weekly notifiable diseases',
    publisher: 'CDC — National Notifiable Diseases Surveillance System (NNDSS)',
    url: 'https://data.cdc.gov/NNDSS/NNDSS-Weekly-Data/x9gk-5huc',
    description:
      "Provisional weekly counts of nationally notifiable diseases that the Minnesota Department of Health reports to CDC, from CDC's weekly NNDSS tables: whooping cough, measles, mpox, hepatitis A, West Nile virus and other reportable infections, with year-to-date totals compared with the same week last year. Counts are by the week CDC published them, not when people got sick, and they are revised later. Minnesota's current-week cells are often blank because cases are credited to earlier weeks, and some diseases (such as Salmonella, Campylobacter and E. coli STEC) are blank all year and only appear after year-end. A blank is not zero. These are reported cases only, so they undercount infections, and they say nothing about counties.",
    geography: 'Minnesota statewide',
    cadence: 'Weekly (CDC posts each table midweek for the MMWR week ending the previous Saturday)',
    attribution: "CDC National Notifiable Diseases Surveillance System (NNDSS) weekly tables via data.cdc.gov (dataset x9gk-5huc); mirror: PopHIVE/Ingest (Yale School of Public Health)",
  },
  timeoutMs: 6 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const info: string[] = []
    const diagnostics: Record<string, unknown> = { datasetId: DATASET_ID }
    let series: Series[] = []
    try {
      // x9gk-5huc starts in 2022; earlier years in the list simply return no rows.
      const startYear = Number(ctx.historyStart.slice(0, 4))
      const endYear = Number(ctx.now.slice(0, 4))
      const years: number[] = []
      for (let y = startYear; y <= endYear; y++) years.push(y)
      const loaded = await loadRows(years, ctx.log)
      const schema = checkSchema(loaded.rows)
      if (schema.missingRequired.length) throw new Error(`schema drift: missing required column(s) ${schema.missingRequired.join(', ')}`)
      if (schema.missingMetrics.length) {
        const msg = `schema drift: metric column(s) ${schema.missingMetrics.join(', ')} not present in any Minnesota row`
        ctx.log.warn(msg)
        errors.push(msg)
      }
      const { rows, stats } = parseRows(loaded.rows)
      if (!rows.length) throw new Error(`no Minnesota rows parsed (${loaded.rows.length} rows read via ${loaded.via})`)
      if (stats.badWeek) ctx.log.warn(`${stats.badWeek} Minnesota row(s) with an invalid MMWR year/week were dropped`)
      const latest = rows[rows.length - 1]
      const byPathogen = groupByPathogen(rows)
      const built = buildSeries(byPathogen, ctx.historyStart, latest.weekEnding)
      series = built.series
      for (const [p, why] of Object.entries(built.skipped)) ctx.log.info(`${p}: skipped — ${why}`)

      // Unmapped labels worth knowing about (no PathogenId), with the latest year-to-date count.
      const latestRows = rows.filter((r) => r.weekEnding === latest.weekEnding)
      const unmappedWatch = latestRows
        .filter((r) => !matchLabel(r.norm) && WATCH_UNMAPPED.test(r.norm))
        .map((r) => ({ label: r.label, ytd: r.m3, ytdPrevYear: r.m4 }))
      const allLabels = new Set(rows.map((r) => r.label))
      const yearsSeen: Record<string, number> = {}
      for (const r of rows) yearsSeen[r.year] = (yearsSeen[r.year] ?? 0) + 1

      Object.assign(diagnostics, {
        via: loaded.via,
        url: loaded.url,
        datasetUpdatedAt: loaded.updatedAt,
        liveError: loaded.liveError,
        rowsScanned: loaded.scanned,
        rowsRead: loaded.rows.length,
        parse: stats,
        columnsSeen: schema.seen,
        latestTableWeek: { year: latest.year, week: latest.week, weekEnding: latest.weekEnding },
        rowsByYear: yearsSeen,
        labelsInMinnesotaRows: allLabels.size,
        pathogens: built.perPathogen,
        skipped: built.skipped,
        unmappedWatch,
      })
      info.push(`Latest CDC table: ${latest.year} week ${latest.week} (week ending ${latest.weekEnding}).`)
      if (loaded.via === 'pophive-mirror') info.push('Served from the PopHIVE GitHub mirror because data.cdc.gov was unavailable.')
      ctx.log.info(
        `${loaded.via}: ${loaded.rows.length} MN rows, ${allLabels.size} labels, latest table ${latest.year} week ${latest.week} (${latest.weekEnding}); ${series.length} series`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      ctx.log.error(msg)
      errors.push(msg)
    }
    return {
      datasets: [{ source: SOURCE, dataset: DATASET, series }],
      message:
        [errors.length ? `${series.length ? 'Partial refresh' : 'Refresh failed'}: ${errors.join('; ')}.` : '', ...info]
          .filter(Boolean)
          .join(' ') || undefined,
      diagnostics,
    }
  },
}
