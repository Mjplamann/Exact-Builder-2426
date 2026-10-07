// bioMérieux U.S. Medical Affairs "USMA TRENDS Insights" PDF reports (BIOFIRE® Syndromic Trends digests).
//
// The reports compare each organism's detection rate over the latest 2-week window with its 12-week average,
// by U.S. Census region. Their layout is not documented and changes over time, so this parser only accepts
// Midwest values when the wording or table header leaves no doubt about which number is which:
//
//   • "sentence": one sentence naming only the Midwest, exactly one organism, exactly two percentages, a
//     "past two weeks"/"2-week" cue and a "12-week average" phrase directly attached to one of the numbers.
//   • "midwest-table": a table row with exactly one organism and two numbers, under a heading that is just
//     "Midwest", below a header row that names both "2 weeks" and "12-week average" (column order taken
//     from the header).
//
// Everything else is reported in diagnostics (rejected sentences, table-like rows, text snippets) so the
// parser can be tightened against real reports after a CI run.
import { addDays, parseISODate, weekEndingSaturday } from '../../shared/mmwr.ts'
import { findOrganismsInText, type OrganismDef } from './biofire-organisms.ts'

export const USMA_INDEX_URL = 'https://www.biomerieux.com/us/en/education/resource-hub/trends-reports.html'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

/** Collect report PDF links from the index page HTML (hrefs, data attributes and JSON-escaped paths). */
export function extractPdfLinks(html: string, baseUrl: string = USMA_INDEX_URL): string[] {
  const src = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
  const found = new Set<string>()
  const attr = /(?:href|src|data-[\w-]+)\s*=\s*["']([^"']+?\.pdf(?:[?#][^"']*)?)["']/gi
  const bare = /(?:https?:\/\/[^\s"'<>()]+?|\/content\/dam\/[^\s"'<>()]+?)\.pdf\b/gi
  let m: RegExpExecArray | null
  while ((m = attr.exec(src))) found.add(m[1])
  while ((m = bare.exec(src))) found.add(m[0])
  const out = new Set<string>()
  for (const link of found) {
    try {
      const u = new URL(link.trim(), baseUrl)
      if (!/^https?:$/.test(u.protocol)) continue
      if (!/trends/i.test(decodeURIComponent(u.pathname))) continue
      u.hash = ''
      out.add(u.toString())
    } catch {
      /* ignore malformed */
    }
  }
  return [...out]
}

export interface ReportWindow {
  start: string
  end: string
  /** The text the window was read from. */
  raw: string
}

function isoFrom(y: number, mo: number, d: number): string | null {
  if (!mo || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return dt.toISOString().slice(0, 10)
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/**
 * Report window from a file name such as "18--USMA-TRENDS-Insights-Report-21SEP25-4OCT25.pdf",
 * "06--USMA-TRENDS-Report-02FEB2025-15FEB2025.pdf" or "...-14DEC25-3JAN26.pdf".
 */
export function parseWindowFromName(name: string): ReportWindow | null {
  const base = decodeURIComponent(name.split('/').pop() ?? name)
  const re = /(\d{1,2})([A-Za-z]{3,4})(\d{4}|\d{2})?[-_–]+(\d{1,2})([A-Za-z]{3,4})(\d{4}|\d{2})(?![0-9])/
  const m = re.exec(base)
  if (!m) return null
  const sm = MONTHS[m[2].toLowerCase()]
  const em = MONTHS[m[5].toLowerCase()]
  const ey = fullYear(m[6])
  const sy = m[3] ? fullYear(m[3]) : sm > em ? ey - 1 : ey
  const start = isoFrom(sy, sm, Number(m[1]))
  const end = isoFrom(ey, em, Number(m[4]))
  if (!start || !end || start > end) return null
  const span = (parseISODate(end).getTime() - parseISODate(start).getTime()) / 86_400_000
  if (span > 42) return null
  return { start, end, raw: m[0] }
}

/** Report window from report text, e.g. "August 16 - August 29, 2026" or "Dec 14, 2025 – Jan 3, 2026". */
export function parseWindowFromText(text: string): ReportWindow | null {
  const t = text.replace(/[–—‑]/g, '-').replace(/\s+/g, ' ')
  const mon = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?'
  const re = new RegExp(`${mon} (\\d{1,2})(?:, (\\d{4}))? ?(?:-|to|through) ?(?:${mon} )?(\\d{1,2}), (\\d{4})`, 'i')
  const m = re.exec(t)
  if (!m) return null
  const sm = MONTHS[m[1].slice(0, 3).toLowerCase()]
  const em = m[4] ? MONTHS[m[4].slice(0, 3).toLowerCase()] : sm
  const ey = Number(m[6])
  const sy = m[3] ? Number(m[3]) : sm > em ? ey - 1 : ey
  const start = isoFrom(sy, sm, Number(m[2]))
  const end = isoFrom(ey, em, Number(m[5]))
  if (!start || !end || start > end) return null
  const span = (parseISODate(end).getTime() - parseISODate(start).getTime()) / 86_400_000
  if (span > 42) return null
  return { start, end, raw: m[0] }
}

/** MMWR week-ending Saturday for the week holding a report window's final day. */
export function windowWeek(w: ReportWindow): string {
  const d = parseISODate(w.end).getUTCDay()
  // A window ending on a Sunday (Mon–Sun reporting) belongs to the Sun–Sat week that ended the day before.
  return d === 0 ? addDays(w.end, -1) : weekEndingSaturday(w.end)
}

/** Report sequence number from the file name ("18--USMA-..." → 18). */
export function reportNumber(name: string): number | undefined {
  const m = /(?:^|\/)(\d{1,3})-{1,2}USMA/i.exec(decodeURIComponent(name))
  return m ? Number(m[1]) : undefined
}

// ── PDF text ──

export interface PdfText {
  pages: number
  /** Reading-order text (pdf.js content order), one string per page. */
  text: string[]
  /** Visual rows rebuilt from item positions; cells separated by " | " where there is a column gap. */
  rows: string[]
}

interface Item {
  str: string
  x: number
  y: number
  width: number
  fontSize: number
  hasEOL: boolean
}

/** Rebuild visual rows from positioned text items (top to bottom, left to right). */
export function itemsToRows(items: Item[]): string[] {
  const visible = items.filter((i) => i.str.trim() !== '')
  const lines: { y: number; tol: number; items: Item[] }[] = []
  for (const it of visible) {
    const tol = Math.max(2, it.fontSize * 0.35)
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(tol, l.tol))
    if (line) line.items.push(it)
    else lines.push({ y: it.y, tol, items: [it] })
  }
  lines.sort((a, b) => b.y - a.y)
  return lines.map((l) => {
    const sorted = l.items.sort((a, b) => a.x - b.x)
    let out = ''
    let prevEnd = -Infinity
    for (const it of sorted) {
      const gap = it.x - prevEnd
      if (out) out += gap > Math.max(6, it.fontSize * 1.0) ? ' | ' : gap > it.fontSize * 0.1 ? ' ' : ''
      out += it.str.trim()
      prevEnd = it.x + it.width
    }
    return out
  })
}

export async function pdfToText(buf: Uint8Array): Promise<PdfText> {
  const { getDocumentProxy, extractTextItems } = await import('unpdf')
  const pdf = await getDocumentProxy(buf)
  const { totalPages, items } = await extractTextItems(pdf)
  const text: string[] = []
  const rows: string[] = []
  for (const page of items) {
    text.push(page.map((i) => i.str + (i.hasEOL ? '\n' : '')).join('').replace(/[^\S\n]+/g, ' '))
    rows.push(...itemsToRows(page))
  }
  return { pages: totalPages, text, rows }
}

// ── Parsing ──

export type UsmaStrategy = 'sentence' | 'midwest-table'

export interface UsmaFinding {
  def: OrganismDef
  /** Midwest detection rate over the report window (percent). */
  rate: number
  /** The report's 12-week average for the same organism (percent). */
  avg12wk: number
  strategy: UsmaStrategy
  evidence: string
}

export interface UsmaParse {
  accepted: UsmaFinding[]
  rejected: { reason: string; text: string }[]
  /** Rows that look like data (organism + ≥2 percentages) but were not accepted. */
  tableCandidates: string[]
}

const REGION_RE = /\b(Northeast(?:ern)?|North|Midwest(?:ern)?|South(?:ern)?|West(?:ern)?)\b/g
const AVG_RE = /\b(?:12|twelve)[\s-]*(?:wk|week)s?\s*(?:rolling\s+)?(?:average|avg\.?|mean)\b/gi
const TWO_WEEK_RE = /\b(?:past|last|previous|prior|recent|most recent)\s+(?:two|2)\s+weeks\b|(?<![0-9])(?:two|2)[\s-]*(?:wk|week)s?\b(?!\s*(?:rolling\s+)?(?:average|avg|mean))/i
const PCT_RE = /(?<![0-9.])(\d{1,3}(?:\.\d+)?)\s*%/g

function regionsIn(s: string): Set<string> {
  const out = new Set<string>()
  for (const m of s.matchAll(REGION_RE)) {
    const r = m[1].toLowerCase()
    out.add(r.startsWith('north') ? 'Northeast' : r.startsWith('mid') ? 'Midwest' : r.startsWith('south') ? 'South' : 'West')
  }
  return out
}

function percentsIn(s: string): { value: number; index: number; end: number }[] {
  const out: { value: number; index: number; end: number }[] = []
  for (const m of s.matchAll(PCT_RE)) {
    const v = Number(m[1])
    if (v <= 100) out.push({ value: v, index: m.index!, end: m.index! + m[0].length })
  }
  return out
}

/** Split reading-order text into sentences, keeping short heading-like lines apart. */
export function toSentences(pageText: string): string[] {
  const out: string[] = []
  let para = ''
  const flush = () => {
    if (para.trim()) out.push(...para.replace(/(\d)-\s+(wk|week)/gi, '$1-$2').split(/(?<=[.!?])\s+(?=[A-Z(•▪●"“])|\s*[•▪●]\s+/))
    para = ''
  }
  for (const raw of pageText.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = line.length <= 40 && !/[.!?,;:%)]$/.test(line)
    if (heading) {
      flush()
      out.push(line)
    } else para += (para ? ' ' : '') + line
  }
  flush()
  return out.map((s) => s.trim()).filter(Boolean)
}

function trackedOrganisms(s: string) {
  const hits = findOrganismsInText(s)
  const tracked = new Map<string, OrganismDef>()
  for (const h of hits) if (h.def.pathogen) tracked.set(h.def.code, h.def)
  return { hits, tracked }
}

/** Strategy 1: an unambiguous Midwest sentence. Returns a finding or a rejection reason (null = not relevant). */
export function parseSentence(sentence: string): UsmaFinding | { reason: string } | null {
  const s = sentence.replace(/\s+/g, ' ').trim()
  const avgs = [...s.matchAll(AVG_RE)]
  if (!avgs.length) return null
  const regions = regionsIn(s)
  if (!regions.has('Midwest')) return null
  if (regions.size > 1) return { reason: 'several regions in one sentence' }
  const { tracked } = trackedOrganisms(s)
  if (tracked.size !== 1) return { reason: tracked.size ? 'several organisms in one sentence' : 'no recognized organism' }
  const pcts = percentsIn(s)
  if (pcts.length !== 2) return { reason: `expected 2 percentages, found ${pcts.length}` }
  if (avgs.length !== 1) return { reason: 'several 12-week average phrases' }
  if (!TWO_WEEK_RE.test(s.replace(AVG_RE, ' '))) return { reason: 'no 2-week window cue' }
  const avg = avgs[0]
  const avgEnd = avg.index! + avg[0].length
  // The 12-week average must be the number written right after the phrase ("12-week average of 12.2%")
  // or right before it in parentheses-like form ("12.2% (12-week average)").
  const after = pcts.filter((p) => p.index >= avgEnd && /^[\s:,(]*(?:of|was|is|at|=|:)?[\s:(]*(?:approximately|about|~)?\s*$/i.test(s.slice(avgEnd, p.index)))
  const before = pcts.filter((p) => p.end <= avg.index! && /^\s*\(\s*(?:the\s+|a\s+)?$/i.test(s.slice(p.end, avg.index!)))
  const avgPct = after.length === 1 ? after[0] : after.length === 0 && before.length === 1 ? before[0] : null
  if (!avgPct) return { reason: 'cannot tell which number is the 12-week average' }
  const ratePct = pcts.find((p) => p !== avgPct)!
  const def = [...tracked.values()][0]
  return { def, rate: ratePct.value, avg12wk: avgPct.value, strategy: 'sentence', evidence: s.slice(0, 300) }
}

const NUM_TOKEN_RE = /(?<![A-Za-z0-9.])(\d{1,3}(?:\.\d+)?)\s*(%?)(?![A-Za-z0-9])/g

/** Strategy 2: rows of a table under a "Midwest" heading with an explicit "2 weeks | 12-week average" header. */
export function parseMidwestTables(rows: string[]): { accepted: UsmaFinding[]; rejected: { reason: string; text: string }[] } {
  const accepted: UsmaFinding[] = []
  const rejected: { reason: string; text: string }[] = []
  let region: string | null = null
  let header: { order: ('rate' | 'avg')[]; at: number } | null = null
  rows.forEach((row, i) => {
    const plain = row.replace(/\s*\|\s*/g, ' ').trim()
    const regions = regionsIn(plain)
    // A heading row: just a region name (optionally "Region"/"Census Region").
    if (regions.size === 1 && /^(?:the\s+)?(?:northeast(?:ern)?|north|midwest(?:ern)?|south(?:ern)?|west(?:ern)?)(?:\s+(?:census\s+)?region)?:?$/i.test(plain)) {
      region = [...regions][0]
      header = null
      return
    }
    const avgM = [...plain.matchAll(AVG_RE)]
    const twoM = TWO_WEEK_RE.exec(plain.replace(AVG_RE, (x) => ' '.repeat(x.length)))
    if (avgM.length === 1 && twoM && percentsIn(plain).length === 0) {
      header = { order: twoM.index < avgM[0].index! ? ['rate', 'avg'] : ['avg', 'rate'], at: i }
      return
    }
    if (region !== 'Midwest' || !header || i - header.at > 40) return
    const { hits, tracked } = trackedOrganisms(plain)
    if (!hits.length) return
    if (regions.size) return void rejected.push({ reason: 'table row names a region', text: row })
    if (tracked.size !== 1 || hits.length !== 1) return void rejected.push({ reason: 'table row: not exactly one organism', text: row })
    // Count numbers outside the organism name (names contain digits: PIV 3, 229E, H1-2009, F40/41).
    const h = hits[0]
    const rest = plain.slice(0, h.index) + ' '.repeat(h.length) + plain.slice(h.index + h.length)
    const nums = [...rest.matchAll(NUM_TOKEN_RE)].map((m) => Number(m[1])).filter((v) => v <= 100)
    if (nums.length !== 2) return void rejected.push({ reason: `table row: expected 2 numbers, found ${nums.length}`, text: row })
    const [a, b] = nums
    const rate = header.order[0] === 'rate' ? a : b
    const avg = header.order[0] === 'rate' ? b : a
    accepted.push({ def: h.def, rate, avg12wk: avg, strategy: 'midwest-table', evidence: row.slice(0, 200) })
  })
  return { accepted, rejected }
}

/** Parse one report. Conflicting values for the same organism within a report are all dropped. */
export function parseUsmaReport(pdf: Pick<PdfText, 'text' | 'rows'>): UsmaParse {
  const found: UsmaFinding[] = []
  const rejected: { reason: string; text: string }[] = []
  for (const page of pdf.text) {
    for (const sentence of toSentences(page)) {
      const r = parseSentence(sentence)
      if (!r) continue
      if ('reason' in r) rejected.push({ reason: r.reason, text: sentence.replace(/\s+/g, ' ').slice(0, 240) })
      else found.push(r)
    }
  }
  const t = parseMidwestTables(pdf.rows)
  found.push(...t.accepted)
  rejected.push(...t.rejected)

  const byCode = new Map<string, UsmaFinding[]>()
  for (const f of found) byCode.set(f.def.code, [...(byCode.get(f.def.code) ?? []), f])
  const accepted: UsmaFinding[] = []
  for (const list of byCode.values()) {
    const distinct = new Set(list.map((f) => `${f.rate}|${f.avg12wk}`))
    if (distinct.size === 1) accepted.push(list[0])
    else for (const f of list) rejected.push({ reason: 'conflicting values for this organism in the report', text: f.evidence })
  }

  const acceptedEvidence = new Set(accepted.map((f) => f.evidence))
  const tableCandidates = pdf.rows
    .filter((r) => !acceptedEvidence.has(r.slice(0, 200)) && percentsIn(r).length >= 2 && findOrganismsInText(r).length > 0)
    .slice(0, 15)
  return { accepted, rejected: rejected.slice(0, 25), tableCandidates }
}
