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
import { fetchBuffer, fetchJson, HttpError } from '../lib/http.ts'
import { num, parseCsv } from '../lib/csv.ts'
import { soqlString, socrataUrl } from '../lib/socrata.ts'
import { POPHIVE_MIRRORS } from '../lib/cdcData.ts'
import { latestDate, makeSeries, STATE_GEO } from '../lib/series.ts'
import type { Logger } from '../lib/log.ts'
import type { SourceModule, SourceResult } from '../types.ts'

export const DATASET_ID = 'x9gk-5huc'
const SOURCE = 'cdc-nndss'
const DATASET = 'nndss-mn'
const POPHIVE = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data'

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
   * first alternative with any matching row is used, so renamed labels never double count. Within a
   * component exactly one row is used: if several labels match it, the ', Total' row wins, and with no
   * Total the week is left blank and a warning is raised (see resolveComponents).
   */
  alternatives: RegExp[][]
  note?: string
}

/** Lower-case, collapse whitespace (CDC labels contain double spaces), strip trailing punctuation. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim()
}

// Exact Minnesota labels seen 2022–2026 (x9gk-5huc) are listed beside each rule.
//
// Every pattern is anchored at both ends. The only optional suffix is ', Total', because CDC has split
// labels into Total / Confirmed / Probable rows before (Novel Influenza A in 2025, Coccidioidomycosis
// 'Total' added in 2025). A Confirmed or Probable row must never match, or it would be added on top of
// the Total. If CDC renames a label so that no pattern matches, the disease drops out of the latest
// table and the module warns (see `labelDrift`) instead of guessing.
const T = '(, total)?'
const rx = (body: string) => new RegExp(`^${body}${T}$`)
export const RULES: PathogenRule[] = [
  // 'Pertussis'
  { pathogen: 'pertussis', name: 'Whooping cough (pertussis)', alternatives: [[rx('pertussis')]] },
  // 'Measles, Indigenous' + 'Measles, Imported'
  {
    pathogen: 'measles',
    name: 'Measles',
    alternatives: [[/^measles,? indigenous$/, /^measles,? imported$/], [rx('measles')]],
    note: 'Indigenous and imported cases combined.',
  },
  // 'Salmonellosis (excluding Salmonella Typhi infection and Salmonella Paratyphi infection)'
  { pathogen: 'salmonella', name: 'Salmonellosis', alternatives: [[rx('salmonellosis( \\(excluding [^)]*\\))?')]] },
  // 'Shiga toxin-producing Escherichia coli (STEC)'
  {
    pathogen: 'stec',
    name: 'Shiga toxin-producing E. coli (STEC)',
    alternatives: [[rx('shiga toxin.producing (escherichia coli|e\\. ?coli)( \\(stec\\))?')]],
  },
  // 'Shigellosis'
  { pathogen: 'shigella', name: 'Shigellosis', alternatives: [[rx('shigellosis')]] },
  // 'Campylobacteriosis'
  { pathogen: 'campylobacter', name: 'Campylobacteriosis', alternatives: [[rx('campylobacteriosis')]] },
  // 'Hepatitis A, Confirmed' (2023+) ; 'Hepatitis, A, acute' (2022–2023)
  {
    pathogen: 'hepatitis-a',
    name: 'Hepatitis A',
    alternatives: [[/^hepatitis,? a, confirmed$/], [/^hepatitis,? a,? acute$/]],
  },
  // 'Mpox' (2024+)
  { pathogen: 'mpox', name: 'Mpox', alternatives: [[rx('mpox')], [rx('monkeypox( virus infection)?')]] },
  // 'Arboviral diseases, West Nile virus disease' ; older tables split neuroinvasive / non-neuroinvasive
  {
    pathogen: 'west-nile',
    name: 'West Nile virus disease',
    alternatives: [
      [rx('(arboviral diseases, )?west nile virus disease')],
      [
        /^(arboviral diseases, )?west nile virus disease,? neuroinvasive$/,
        /^(arboviral diseases, )?west nile virus disease,? non-neuroinvasive$/,
      ],
    ],
    note: 'Neuroinvasive and non-neuroinvasive disease combined.',
  },
  // not in x9gk-5huc for MN as of 2026 (Lyme is published annually)
  { pathogen: 'lyme', name: 'Lyme disease', alternatives: [[rx('lyme disease')]] },
  // 'Ehrlichiosis and Anaplasmosis, Anaplasma phagocytophilum infection' (2022–2023 only)
  {
    pathogen: 'anaplasmosis',
    name: 'Anaplasmosis',
    alternatives: [[rx('anaplasmosis')], [rx('(ehrlichiosis and anaplasmosis, )?anaplasma phagocytophilum infection')]],
  },
  // 'Babesiosis' (2022–2024 only)
  { pathogen: 'babesiosis', name: 'Babesiosis', alternatives: [[rx('babesiosis')]] },
  // 'Cryptosporidiosis'
  { pathogen: 'cryptosporidium', name: 'Cryptosporidiosis', alternatives: [[rx('cryptosporidiosis')]] },
  // 'Cyclosporiasis'
  { pathogen: 'cyclospora', name: 'Cyclosporiasis', alternatives: [[rx('cyclosporiasis')]] },
  // 'Giardiasis'
  { pathogen: 'giardia', name: 'Giardiasis', alternatives: [[rx('giardiasis')]] },
  // Not in x9gk-5huc as of 2026. 'Streptococcal toxic shock syndrome' is deliberately NOT mapped:
  // it is a small subset of invasive group A strep and would understate it. The two wordings are
  // separate alternatives (never summed).
  {
    pathogen: 'strep-a',
    name: 'Invasive group A strep',
    alternatives: [
      [rx('invasive (disease, )?group a strep(tococcus|tococcal)?( disease| infection)?')],
      [rx('group a strep(tococcus|tococcal)?( disease| infection)?,? invasive')],
    ],
  },
]

/** CDC cell flags other than '-' (no reported cases): the cell is not a count at all. */
export const FLAG_WORDS: Record<string, string> = {
  U: 'unavailable',
  N: 'not reportable',
  NN: 'not nationally notifiable',
  NP: 'not published',
  NC: 'not calculated',
}
const isUnavailable = (flag: string | undefined) => !!flag && flag in FLAG_WORDS

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
  m2Flag: string
  m3Flag: string
  m4Flag: string
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
      m2Flag: (r.m2_flag ?? '').trim(),
      m3Flag: (r.m3_flag ?? '').trim(),
      m4Flag: (r.m4_flag ?? '').trim(),
    }
    const key = `${year}|${week}|${row.norm}`
    if (byKey.has(key)) stats.duplicates++
    byKey.set(key, row)
  }
  const rows = [...byKey.values()].sort((a, b) => (a.weekEnding < b.weekEnding ? -1 : a.weekEnding > b.weekEnding ? 1 : 0))
  return { rows, stats }
}

// ───────────────────────── series building ─────────────────────────

/** One pathogen in one weekly table, after choosing the label alternative and combining components. */
export interface PathogenWeek {
  year: number
  week: number
  weekEnding: string
  labels: string[]
  m1: number | null
  m3: number | null
  m4: number | null
  /** CDC flag explaining a null m3/m4 when it is not a plain blank ('U', 'NP', ...). */
  m3Flag?: string
  m4Flag?: string
  /** 52-week max per component (not additive across components). */
  m2: { label: string; value: number | null }[]
  /** Labels that matched but were not used because a ', Total' row for the same component exists. */
  dropped?: string[]
  /**
   * Several labels matched the same component and none is a ', Total' row: they may overlap, so they
   * are not added together and every count for the week is null.
   */
  ambiguous?: string[]
}

/** Sum of the reported components; null when every component is blank. */
export function sumReported(values: (number | null)[]): number | null {
  const reported = values.filter((v): v is number => v != null)
  return reported.length ? reported.reduce((a, b) => a + b, 0) : null
}

/**
 * Combine one measure across components. A component flagged unavailable / not published ('U', 'NP',
 * ...) makes the total unknown (null, flag kept); otherwise blanks ('-') add nothing.
 */
export function combineMeasure(cells: { value: number | null; flag: string }[]): { value: number | null; flag?: string } {
  const unknown = cells.find((c) => c.value == null && isUnavailable(c.flag))
  if (unknown) return { value: null, flag: unknown.flag }
  return { value: sumReported(cells.map((c) => c.value)) }
}

const TOTAL_SUFFIX = /, total$/

/** One row per component: a single label, or the ', Total' row when CDC lists Total beside its parts. */
export function resolveComponents(byComp: Map<number, NndssRow[]>): { chosen: NndssRow[]; dropped: string[]; ambiguous: string[] } {
  const chosen: NndssRow[] = []
  const dropped: string[] = []
  const ambiguous: string[] = []
  for (const comp of [...byComp.keys()].sort((a, b) => a - b)) {
    const rows = byComp.get(comp)!
    if (rows.length === 1) {
      chosen.push(rows[0])
      continue
    }
    const totals = rows.filter((r) => TOTAL_SUFFIX.test(r.norm))
    if (totals.length === 1) {
      chosen.push(totals[0])
      dropped.push(...rows.filter((r) => r !== totals[0]).map((r) => r.label))
    } else {
      ambiguous.push(...rows.map((r) => r.label))
    }
  }
  return { chosen, dropped, ambiguous }
}

export function groupByPathogen(rows: NndssRow[]): Map<PathogenId, PathogenWeek[]> {
  // pathogen → weekEnding → alternative → component → rows
  const acc = new Map<PathogenId, Map<string, Map<number, Map<number, NndssRow[]>>>>()
  for (const row of rows) {
    const m = matchLabel(row.norm)
    if (!m) continue
    const weeks = acc.get(m.rule.pathogen) ?? new Map<string, Map<number, Map<number, NndssRow[]>>>()
    acc.set(m.rule.pathogen, weeks)
    const alts = weeks.get(row.weekEnding) ?? new Map<number, Map<number, NndssRow[]>>()
    weeks.set(row.weekEnding, alts)
    const comps = alts.get(m.alt) ?? new Map<number, NndssRow[]>()
    alts.set(m.alt, comps)
    const list = comps.get(m.comp) ?? []
    list.push(row)
    comps.set(m.comp, list)
  }
  const out = new Map<PathogenId, PathogenWeek[]>()
  for (const [pathogen, weeks] of acc) {
    const list: PathogenWeek[] = []
    for (const [weekEnding, alts] of [...weeks].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const byComp = alts.get(Math.min(...alts.keys()))!
      const first = [...byComp.values()][0][0]
      const { chosen, dropped, ambiguous } = resolveComponents(byComp)
      const base = { year: first.year, week: first.week, weekEnding }
      if (ambiguous.length) {
        list.push({ ...base, labels: [...byComp.values()].flat().map((r) => r.label), m1: null, m3: null, m4: null, m2: [], ambiguous })
        continue
      }
      const m1 = combineMeasure(chosen.map((c) => ({ value: c.m1, flag: c.m1Flag })))
      const m3 = combineMeasure(chosen.map((c) => ({ value: c.m3, flag: c.m3Flag })))
      const m4 = combineMeasure(chosen.map((c) => ({ value: c.m4, flag: c.m4Flag })))
      const pw: PathogenWeek = {
        ...base,
        labels: chosen.map((c) => c.label),
        m1: m1.value,
        m3: m3.value,
        m4: m4.value,
        m2: chosen.map((c) => ({ label: c.label, value: c.m2 })),
      }
      if (m3.flag) pw.m3Flag = m3.flag
      if (m4.flag) pw.m4Flag = m4.flag
      if (dropped.length) pw.dropped = dropped
      list.push(pw)
    }
    out.set(pathogen, list)
  }
  return out
}

const fmt = (n: number) => n.toLocaleString('en-US')
const cases = (n: number) => `${fmt(n)} case${n === 1 ? '' : 's'}`
const cellWord = (flag?: string) => (flag && FLAG_WORDS[flag] ? `marked ${FLAG_WORDS[flag]}` : 'blank')

/** Plain-language year-to-date comparison for the latest table week. */
export function ytdSummary(year: number, m3: number | null, m4: number | null, m3Flag?: string, m4Flag?: string): string {
  const prev = year - 1
  if (m3 != null && m4 != null) return `${cases(m3)} so far in ${year} vs ${fmt(m4)} by this week in ${prev}`
  if (m3 != null) return `${cases(m3)} so far in ${year} (${prev} count for this week is ${cellWord(m4Flag)})`
  if (m4 != null) return `${year} count is ${cellWord(m3Flag)} in CDC's weekly table; ${fmt(m4)} by this week in ${prev}`
  if (m3Flag || m4Flag) return `${year} year-to-date count is ${cellWord(m3Flag)} and ${prev} is ${cellWord(m4Flag)} in CDC's weekly table`
  return `${year} and ${prev} year-to-date counts are blank in CDC's weekly table`
}

export const BASE_NOTE =
  "Provisional counts from CDC's weekly NNDSS tables for Minnesota. Each point is the table's 'current week' cell as CDC first published it: " +
  'the cases Minnesota had assigned to that MMWR week when the table came out. It is not a count by illness onset and it is never revised. ' +
  'Cases reported later are credited to earlier weeks and are never added back to these points, so the weekly points undercount; ' +
  'the year-to-date total is the better guide. Blank cells are shown as missing, not zero.'

/** Weeks kept for a series whose current-week cells are blank across the whole history window. */
export const BLANK_SERIES_WEEKS = 13

const BY = 'MN Pulse summary of CDC NNDSS year-to-date counts'

export interface BuildResult {
  series: Series[]
  perPathogen: Record<string, unknown>
  skipped: Record<string, string>
  /** Schema-drift / label problems worth surfacing in result.message. */
  warnings: string[]
}

export function buildSeries(byPathogen: Map<PathogenId, PathogenWeek[]>, historyStart: string, latestTableWeek: string): BuildResult {
  const series: Series[] = []
  const perPathogen: Record<string, unknown> = {}
  const skipped: Record<string, string> = {}
  const warnings: string[] = []
  const recentCutoff = addDays(latestTableWeek, -56)
  const driftCutoff = addDays(latestTableWeek, -364)
  for (const rule of RULES) {
    const weeks = byPathogen.get(rule.pathogen)
    if (!weeks?.length) {
      skipped[rule.pathogen] = 'no matching label in Minnesota rows'
      continue
    }
    const kept = weeks.filter((w) => w.weekEnding >= historyStart)
    let points: Point[] = kept.map((w) => [w.weekEnding, w.m1])
    const latest = weeks[weeks.length - 1]
    const nonNull = points.filter((p) => p[1] != null)
    const labelsUsed = [...new Set(weeks.flatMap((w) => w.labels))]
    // A label seen in the past year but missing from the newest table: CDC probably renamed or split it.
    if (latest.weekEnding < latestTableWeek && latest.weekEnding >= driftCutoff) {
      warnings.push(
        `${rule.name}: no matching label in the latest table (${latestTableWeek}); last seen ${latest.weekEnding} as '${latest.labels.join("' + '")}' — CDC may have renamed or split it`,
      )
    }
    const ambiguousWeeks = kept.filter((w) => w.ambiguous)
    if (ambiguousWeeks.length) {
      const last = ambiguousWeeks[ambiguousWeeks.length - 1]
      warnings.push(
        `${rule.name}: ${ambiguousWeeks.length} week(s) list overlapping labels (${[...new Set(last.ambiguous)].join('; ')}), so their counts were left blank rather than added together`,
      )
    }
    if (!points.length || (latest.weekEnding < recentCutoff && !nonNull.length)) {
      skipped[rule.pathogen] = `label no longer in the weekly tables (last seen ${latest.year} week ${latest.week}) and no current-week counts`
      perPathogen[rule.pathogen] = { labels: labelsUsed, lastSeen: latest.weekEnding }
      continue
    }
    // Diseases Minnesota sends to CDC only after year-end: YTD blank ('-', not 'U'/'NP') in every table of
    // this year AND of last year, while last year's YTD (m4, backfilled) is non-zero. Requiring two blank
    // years avoids flagging diseases that simply have no cases yet this year (measles in January, West
    // Nile in June).
    const plainBlank = (w: PathogenWeek) => w.m3 == null && !w.m3Flag && !w.ambiguous
    const thisYear = weeks.filter((w) => w.year === latest.year)
    const lastYear = weeks.filter((w) => w.year === latest.year - 1)
    const blankAllYear = lastYear.length > 0 && thisYear.every(plainBlank) && lastYear.every(plainBlank) && (latest.m4 ?? 0) > 0
    const notes = [BASE_NOTE]
    if (rule.note) notes.push(rule.note)
    if (blankAllYear) {
      notes.push(
        `Minnesota's ${latest.year} year-to-date count has been blank all year in these tables while ${latest.year - 1} shows ${fmt(latest.m4!)} by the same week, so Minnesota appears to report this disease to CDC after year-end; blanks do not mean zero cases.`,
      )
    }
    // Compactness: when every current-week cell in the window is blank, only the latest weeks are listed
    // (dropping blanks loses nothing).
    let trimmedFrom: string | undefined
    if (!nonNull.length && points.length > BLANK_SERIES_WEEKS) {
      trimmedFrom = points[0][0]
      points = points.slice(-BLANK_SERIES_WEEKS)
      notes.push(`Only the latest ${BLANK_SERIES_WEEKS} weeks are listed because every current-week cell since ${trimmedFrom} is blank.`)
    }
    const s = makeSeries({
      source: SOURCE,
      dataset: DATASET,
      pathogen: rule.pathogen,
      metric: 'cases',
      geo: STATE_GEO,
      label: `${rule.name} — current-week cases in CDC's weekly table (NNDSS)`,
      points,
      note: notes.join(' '),
    })
    const attrs: Record<string, string> = {
      nndssLabel: [...new Set(latest.labels)].join(' + '),
      mmwrWeek: `${latest.year}-W${String(latest.week).padStart(2, '0')}`,
    }
    if (latest.m3 != null) attrs.ytd = String(latest.m3)
    if (latest.m4 != null) attrs.ytdPrevYear = String(latest.m4)
    if (latest.m3Flag) attrs.ytdFlag = `${latest.m3Flag} (${FLAG_WORDS[latest.m3Flag]})`
    if (latest.m4Flag) attrs.ytdPrevYearFlag = `${latest.m4Flag} (${FLAG_WORDS[latest.m4Flag]})`
    if (latest.m2.length === 1) {
      if (latest.m2[0].value != null) attrs.max52 = String(latest.m2[0].value)
    } else {
      for (const c of latest.m2) if (c.value != null) attrs[`max52 (${c.label})`] = String(c.value)
    }
    if (blankAllYear) attrs.currentYear = 'blank all year (reported after year-end)'
    if (latest.ambiguous) attrs.overlappingLabels = [...new Set(latest.ambiguous)].join(' | ')
    s.attrs = attrs
    // NNDSS publishes no level or trend; the year-to-date comparison is MN Pulse's wording of CDC's counts.
    if (!latest.ambiguous) {
      s.official = { label: ytdSummary(latest.year, latest.m3, latest.m4, latest.m3Flag, latest.m4Flag), asOf: latest.weekEnding, by: BY }
    }
    series.push(s)
    const lastNonNull = nonNull[nonNull.length - 1]
    const dropped = [...new Set(kept.flatMap((w) => w.dropped ?? []))]
    perPathogen[rule.pathogen] = {
      labels: labelsUsed,
      points: points.length,
      nonNullPoints: nonNull.length,
      ...(trimmedFrom ? { blankSince: trimmedFrom } : {}),
      latestTableWeek: latest.weekEnding,
      latestNonNull: lastNonNull ? { date: lastNonNull[0], value: lastNonNull[1] } : null,
      ytd: latest.m3,
      ytdPrevYear: latest.m4,
      blankAllYear,
      ...(dropped.length ? { droppedInFavorOfTotal: dropped } : {}),
      ...(ambiguousWeeks.length ? { ambiguousWeeks: ambiguousWeeks.length } : {}),
    }
  }
  return { series, perPathogen, skipped, warnings }
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
  /** Why the live API was not used: HTTP status + response body, or the network error. */
  liveError?: string
  /** data.cdc.gov answered but rejected the query or returned nothing: a likely schema change, not an outage. */
  liveRejected?: boolean
}

class EmptyResultError extends Error {}

/**
 * Short, useful description of a live-API failure. HttpError messages start with the full SODA URL
 * (~320 chars), which hides the response body (e.g. Socrata's 'query.soql.no-such-column'), so the
 * status and body are reported on their own. HTTP 400 or an empty result means the query itself no
 * longer fits the dataset (renamed column, changed values), which is reported as a possible schema change.
 */
export function describeLiveError(e: unknown): { text: string; rejected: boolean } {
  if (e instanceof HttpError) {
    const body = e.body.replace(/\s+/g, ' ').trim().slice(0, 200)
    return { text: `HTTP ${e.status}${body ? `: ${body}` : ''}`, rejected: e.status === 400 }
  }
  if (e instanceof EmptyResultError) return { text: e.message, rejected: true }
  if (e instanceof Error) {
    // undici puts the reason in `cause` (system errors: string code; DOMException: numeric code 0 + message).
    const cause = (e as Error & { cause?: { code?: unknown; message?: string } }).cause
    const why = typeof cause?.code === 'string' && cause.code ? cause.code : cause?.message
    return { text: `${e.message}${why && !e.message.includes(why) ? `: ${why}` : ''}`.slice(0, 240), rejected: false }
  }
  return { text: String(e).slice(0, 240), rejected: false }
}

const LIVE_PAGE_SIZE = 50_000
/** Per-request timeout and retries for data.cdc.gov, kept small so the mirror is reached well within timeoutMs. */
const LIVE_TIMEOUT_MS = 90_000
const LIVE_RETRIES = 1
/** Stop paging the live API after this long and fall back to the mirror. */
const LIVE_BUDGET_MS = 200_000

/** SODA paging with a bounded time budget (socrataQuery's 4 × 120 s retries could outlast timeoutMs). */
async function fetchLiveRows(q: ReturnType<typeof liveQuery>): Promise<Record<string, unknown>[]> {
  const headers: Record<string, string> = {}
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN
  const started = Date.now()
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; offset < q.maxRows; offset += LIVE_PAGE_SIZE) {
    if (Date.now() - started > LIVE_BUDGET_MS) throw new Error(`live paging exceeded ${LIVE_BUDGET_MS / 1000}s at offset ${offset}`)
    const url = socrataUrl(DATASET_ID, { ...q, order: ':id', limit: LIVE_PAGE_SIZE, offset })
    const page = await fetchJson<Record<string, unknown>[]>(url, { headers, timeoutMs: LIVE_TIMEOUT_MS, retries: LIVE_RETRIES })
    rows.push(...page)
    if (page.length < LIVE_PAGE_SIZE) break
  }
  return rows
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
  let live: { text: string; rejected: boolean }
  try {
    const rows = await fetchLiveRows(q)
    if (rows.length === 0) throw new EmptyResultError('query returned no Minnesota rows')
    let updatedAt: string | undefined
    try {
      const meta = await fetchJson<SocrataMeta>(`https://data.cdc.gov/api/views/${DATASET_ID}.json`, { retries: 0, timeoutMs: 30_000 })
      if (meta.rowsUpdatedAt) updatedAt = new Date(meta.rowsUpdatedAt * 1000).toISOString()
    } catch {
      /* metadata is optional */
    }
    return { rows: rows.map(stringify), via: 'data.cdc.gov', url, updatedAt }
  } catch (e) {
    live = describeLiveError(e)
  }
  log.warn(
    live.rejected
      ? `data.cdc.gov rejected the ${DATASET_ID} query (${live.text}) — possible schema change; using PopHIVE mirror`
      : `data.cdc.gov ${DATASET_ID} unavailable (${live.text}); using PopHIVE mirror`,
  )
  const path = POPHIVE_MIRRORS[DATASET_ID] ?? 'nnds/raw/x9gk-5huc'
  const mirrorUrl = `${POPHIVE}/${path}.csv.xz`
  const [meta, buf] = await Promise.all([
    // ~9.5 MB; worst case 3 × 100 s + backoff, so live (≤ ~3.5 min) + mirror stays under timeoutMs.
    fetchJson<SocrataMeta>(`${POPHIVE}/${path}.json`, { timeoutMs: 60_000, retries: 2 }),
    fetchBuffer(mirrorUrl, { timeoutMs: 100_000, retries: 2 }),
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
    liveError: live.text,
    liveRejected: live.rejected,
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
      "Provisional weekly counts of nationally notifiable diseases that the Minnesota Department of Health reports to CDC, from CDC's weekly NNDSS tables: whooping cough, measles, mpox, hepatitis A, West Nile virus and other reportable infections, with year-to-date totals compared with the same week last year. " +
      "Each weekly point is the table's 'current week' cell as CDC first published it: the cases Minnesota had assigned to that week at the time. It is not a count by when people got sick, and it is never revised. Cases reported later are credited to earlier weeks and show up only in the year-to-date totals, so the weekly points undercount. " +
      "Minnesota's current-week cells are often blank, and some diseases (such as Salmonella, Campylobacter and E. coli STEC) are blank all year and only appear after year-end. A blank is not zero. These are reported cases only, so they undercount infections, and they say nothing about counties.",
    geography: 'Minnesota statewide',
    cadence: 'Weekly (CDC posts each table midweek for the MMWR week ending the previous Saturday)',
    attribution: "CDC National Notifiable Diseases Surveillance System (NNDSS) weekly tables via data.cdc.gov (dataset x9gk-5huc); mirror: PopHIVE/Ingest (Yale School of Public Health)",
  },
  // Worst case: live API ≈ 3.5 min (1 page × 2 × 90 s + 30 s metadata), mirror ≈ 5 min; normally ~10 s.
  timeoutMs: 10 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const warnings: string[] = []
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
      for (const w of built.warnings) ctx.log.warn(w)
      warnings.push(...built.warnings)

      // Unmapped labels worth knowing about (no PathogenId), with the latest year-to-date count.
      const latestRows = rows.filter((r) => r.weekEnding === latest.weekEnding)
      const unmappedWatch = latestRows
        .filter((r) => !matchLabel(r.norm) && WATCH_UNMAPPED.test(r.norm))
        .map((r) => ({ label: r.label, ytd: r.m3, ytdPrevYear: r.m4 }))
      const allLabels = new Set(rows.map((r) => r.label))
      const yearsSeen: Record<string, number> = {}
      for (const r of rows) yearsSeen[r.year] = (yearsSeen[r.year] ?? 0) + 1
      const newestCount = latestDate(series)

      Object.assign(diagnostics, {
        via: loaded.via,
        url: loaded.url,
        datasetUpdatedAt: loaded.updatedAt,
        liveError: loaded.liveError,
        liveRejected: loaded.liveRejected,
        rowsScanned: loaded.scanned,
        rowsRead: loaded.rows.length,
        parse: stats,
        columnsSeen: schema.seen,
        latestTableWeek: { year: latest.year, week: latest.week, weekEnding: latest.weekEnding },
        newestNonBlankCurrentWeek: newestCount ?? null,
        rowsByYear: yearsSeen,
        labelsInMinnesotaRows: allLabels.size,
        pathogens: built.perPathogen,
        skipped: built.skipped,
        warnings: built.warnings,
        unmappedWatch,
      })
      info.push(`Latest CDC table: ${latest.year} week ${latest.week} (week ending ${latest.weekEnding}).`)
      // run.ts dates the source by its newest non-null point; explain why that can lag the table.
      if (!newestCount || newestCount < latest.weekEnding) {
        info.push(
          `Minnesota leaves most current-week cells blank, so the newest weekly count (${newestCount ?? 'none'}) can lag the table; year-to-date totals are current through ${latest.weekEnding}.`,
        )
      }
      if (loaded.via === 'pophive-mirror') {
        if (loaded.liveRejected) {
          warnings.push(`data.cdc.gov rejected the query (${(loaded.liveError ?? '').slice(0, 160)}) — possible schema change`)
          info.push('Served from the PopHIVE GitHub mirror.')
        } else {
          info.push(`Served from the PopHIVE GitHub mirror because data.cdc.gov was unavailable (${(loaded.liveError ?? '').slice(0, 120)}).`)
        }
      }
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
        [
          errors.length ? `${series.length ? 'Partial refresh' : 'Refresh failed'}: ${errors.join('; ')}.` : '',
          warnings.length ? `Warning: ${warnings.join('; ')}.` : '',
          ...info,
        ]
          .filter(Boolean)
          .join(' ') || undefined,
      diagnostics,
    }
  },
}
