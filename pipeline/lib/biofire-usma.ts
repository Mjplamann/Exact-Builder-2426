// bioMérieux U.S. Medical Affairs "USMA TRENDS Insights" PDF reports (BIOFIRE® Syndromic Trends digests).
//
// The reports compare each organism's detection rate over the latest 2-week window with its 12-week average,
// by U.S. Census region. Their layout is not documented and changes over time, so this parser only accepts
// Midwest values when the wording or table header leaves no doubt about which number is which:
//
//   • "sentence": one sentence that opens with (or is scoped by) the Midwest before its first number, names no
//     other geography and no "overall/all regions/except/…" scope, has exactly one organism, exactly two
//     percentages, a "past two weeks"/"2-week" cue and a "12-week average" phrase directly attached to one of
//     the numbers. The other number must be stated as a level ("was 1.6%", "rose to 3.2%", "norovirus 17%"),
//     never as a change ("39% higher", "rose by 1.2%", "increased 45%", "an increase of 20%").
//   • "midwest-table": a table row with exactly one organism and two numbers, under a heading that is just
//     "Midwest", below a header row that names both "2 weeks" and "12-week average" (column order taken
//     from the header).
//
// Everything else is reported in diagnostics (rejected sentences, table-like rows, text snippets) so the
// parser can be tightened against real reports after a CI run.
import { addDays, parseISODate, weekEndingSaturday } from '../../shared/mmwr.ts'
import { findOrganismsInText, panelInText, type BiofirePanel, type OrganismDef } from './biofire-organisms.ts'

export const USMA_INDEX_URL = 'https://www.biomerieux.com/us/en/education/resource-hub/trends-reports.html'
/**
 * Bump whenever the acceptance rules change: published points from an older parser version are not carried
 * forward (they are re-derived from the reports instead).
 */
export const USMA_PARSER_VERSION = 'usma-v2'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
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

/** Row separator between pages (table context never carries across pages). */
export const PAGE_BREAK = '\f'

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
    rows.push(...itemsToRows(page), PAGE_BREAK)
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

const REGION_RE = /\b(Northeast(?:ern)?|North|Midwest(?:ern)?|South(?:ern)?|West(?:ern)?)\b/gi
const AVG_RE = /\b(?:12|twelve)[\s-]*(?:wk|week)s?\s*(?:rolling\s+)?(?:average|avg\.?|mean)\b/gi
const TWO_WEEK_RE = /\b(?:past|last|previous|prior|recent|most recent)\s+(?:two|2)\s+weeks\b|(?<![0-9])(?:two|2)[\s-]*(?:wk|week)s?\b(?!\s*(?:rolling\s+)?(?:average|avg|mean))/i
const PCT_RE = /(?<![0-9.])(\d{1,3}(?:\.\d+)?)\s*%/g
/** Mentions of non-Census-region geographies that make a sentence's numbers ambiguous. */
const OTHER_GEO_RE = /(?<![A-Za-z])U\.\s?S\.|\b(?:[Nn]ational(?:ly)?|[Nn]ationwide|US|USA|United States|[Cc]ountry|HHS|[Rr]egion\s*\d+|[Ss]outheast(?:ern)?|[Ss]outhwest(?:ern)?|[Nn]orthwest(?:ern)?|[Mm]id-?[Aa]tlantic|[Nn]ew [Ee]ngland|[Pp]acific|[Mm]ountain|[Gg]reat [Ll]akes)\b/
/** Wording that widens or narrows the scope beyond "the Midwest" ("Across all regions … highest in the Midwest"). */
const SCOPE_RE = /\b(?:overall|all\s+(?:(?:four|4|five|5|census|u\.?\s?s\.?)\s+)?regions|every\s+region|each\s+region|across\s+(?:all|regions|the\s+(?:country|nation|regions|four|4))|except|excluding|exclusive\s+of|outside|other\s+regions?|remaining\s+regions?|elsewhere|rest\s+of|aside\s+from|apart\s+from|besides|unlike|led\s+by|driven\s+by)\b/i
/** An explicit Midwest anchor (must come before the first number). */
const MIDWEST_START_RE = /^(?:[-–•▪●*]\s*)?(?:(?:in|for|within|across|throughout|among)\s+)?(?:the\s+)?midwest(?:ern)?\b/i
const MIDWEST_ANCHOR_RE = /\b(?:in|for|within|across|throughout|among)\s+the\s+midwest(?:ern)?(?:\s+(?:census\s+)?region)?\b|\bthe\s+midwest(?:'s|’s)|\bmidwest(?:ern)?\s+(?:region|labs?|sites?|detections?|detection|rates?|positivity)\b/i
/** Change (not level) wording anywhere in the sentence. */
const CHANGE_SENTENCE_RE = /percentage[\s-]+points?|\bpp\b|p\.p\.|\bfold\b|\btimes\s+(?:higher|lower|greater|more|the)\b|\bdoubled\b|\btripled\b|\bhalved\b/i
/** A level construction right before the rate number: "was 1.6%", "rose to 3.2%", "detected in 3.1%", "at 2%". */
const LEVEL_BEFORE_RE = /(?:\b(?:was|were|is|are|at|of|to|reached|reaching|remained|remains|stayed|stood|hit|measured|totaled|averaged|averaging|detected\s+in|positive\s+in|positivity|rates?)|[:=(—–])\s*(?:approximately|about|around|roughly|nearly|almost|~|≈)?\s*$/i
/** "an increase of 45%", "a drop of 20%": "of" after a change noun is not a level. */
const CHANGE_OF_RE = /\b(?:increase|decrease|rise|drop|decline|jump|growth|change|gain|fall|reduction|surge|spike|uptick|downtick|difference|swing)s?\s+of\s*(?:approximately|about|around|roughly|nearly|~)?\s*$/i
/** Change wording right after the rate number: "39% higher", "1.2% above", "20% increase", "45% over the 12-week". */
const CHANGE_AFTER_RE = /^\s*(?:\(\s*)?(?:(?:[A-Za-z]+\s+){0,2}(?:higher|lower|above|below|more|less|greater|fewer|increase[sd]?|decrease[sd]?|rise|rose|drop(?:ped)?|jump(?:ed)?|decline[sd]?|change[sd]?|relative|points?)\b|pp\b|up\b|down\b|from\b|over\s+(?:the|its|a)\s+(?:12|twelve)|under\s+(?:the|its|a)\s+(?:12|twelve))/i

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

/** A line ending in one of these words (or a comma/dash) continues on the next line. */
const CONTINUES_RE = /(?:\b(?:a|an|the|of|to|in|on|at|by|for|from|with|and|or|vs\.?|versus|than|was|were|is|are|as|its|their|over|under|below|above|compared|while|which|that)|[,;:–-])$/i

/**
 * Split reading-order text into sentences, keeping short heading-like lines apart. A short line is joined to
 * the next one (not treated as a heading) when it ends mid-phrase or the next line starts in lower case or with
 * a digit — narrow report columns wrap sentences into short lines.
 */
export function toSentences(pageText: string): string[] {
  const out: string[] = []
  let para = ''
  const flush = () => {
    if (para.trim()) out.push(...para.replace(/(\d)-\s+(wk|week)/gi, '$1-$2').split(/(?<=[.!?])\s+(?=[A-Z(•▪●"“])|\s*[•▪●]\s+/))
    para = ''
  }
  const lines = pageText.split('\n').map((l) => l.trim())
  lines.forEach((line, i) => {
    if (!line) return flush()
    const next = lines[i + 1] ?? ''
    const continues = CONTINUES_RE.test(line) || /^[a-z0-9(%]/.test(next)
    const heading = line.length <= 40 && !/[.!?,;:%)]$/.test(line) && !continues
    if (heading) {
      flush()
      out.push(line)
    } else para += (para ? ' ' : '') + line
  })
  flush()
  return out.map((s) => s.trim()).filter(Boolean)
}

/**
 * A short section heading naming one panel ("Respiratory Panel", "Gastrointestinal Insights"). Organism names
 * are blanked first so "Norovirus GI/GII" is not read as a GI heading.
 */
export function panelHeading(line: string): BiofirePanel | undefined {
  const s = line.replace(/\s*\|\s*/g, ' ').trim()
  if (!s || s.length > 60 || /\d\s*%/.test(s)) return undefined
  let blank = s
  for (const h of findOrganismsInText(s, 'RP')) blank = blank.slice(0, h.index) + ' '.repeat(h.length) + blank.slice(h.index + h.length)
  const gi = /\b(?:gastrointestinal|GI)\b/i.test(blank)
  const rp = /\b(?:respiratory|RP2(?:\.1)?)\b/i.test(blank)
  return gi === rp ? undefined : gi ? 'GI' : 'RP'
}

function trackedOrganisms(s: string, panel?: BiofirePanel) {
  const hits = findOrganismsInText(s, panel)
  const tracked = new Map<string, OrganismDef>()
  for (const h of hits) if (h.def.pathogen) tracked.set(h.def.code, h.def)
  return { hits, tracked, ambiguous: hits.some((h) => h.ambiguous) }
}

/**
 * Strategy 1: an unambiguous Midwest sentence. Returns a finding or a rejection reason (null = not relevant).
 * `panel` is the report's panel context (file name / section heading); a panel named in the sentence wins.
 */
export function parseSentence(sentence: string, panel?: BiofirePanel): UsmaFinding | { reason: string } | null {
  const s = sentence.replace(/\s+/g, ' ').trim()
  const avgs = [...s.matchAll(AVG_RE)]
  if (!avgs.length) return null
  const regions = regionsIn(s)
  if (!regions.has('Midwest')) return null
  if (regions.size > 1) return { reason: 'several regions in one sentence' }
  if (OTHER_GEO_RE.test(s)) return { reason: 'also mentions national or other geographies' }
  if (SCOPE_RE.test(s)) return { reason: 'scope wording (overall/all regions/except/…) — numbers may not be Midwest values' }
  const pcts = percentsIn(s)
  const firstNum = pcts.length ? pcts[0].index : s.length
  const head = s.slice(0, firstNum)
  if (!MIDWEST_START_RE.test(s) && !MIDWEST_ANCHOR_RE.test(head)) return { reason: 'no Midwest anchor before the numbers' }
  const { hits, tracked, ambiguous } = trackedOrganisms(s, panelInText(s) ?? panel)
  if (ambiguous) return { reason: 'adenovirus without a known panel (respiratory vs GI F40/41)' }
  if (tracked.size !== 1) return { reason: tracked.size ? 'several organisms in one sentence' : 'no recognized organism' }
  if (pcts.length !== 2) return { reason: `expected 2 percentages, found ${pcts.length}` }
  if (avgs.length !== 1) return { reason: 'several 12-week average phrases' }
  if (!TWO_WEEK_RE.test(s.replace(AVG_RE, ' '))) return { reason: 'no 2-week window cue' }
  if (CHANGE_SENTENCE_RE.test(s)) return { reason: 'change wording (percentage points/fold/doubled)' }
  const avg = avgs[0]
  const avgEnd = avg.index! + avg[0].length
  // The 12-week average must be the number written right after the phrase ("12-week average of 12.2%")
  // or right before it in parentheses-like form ("12.2% (12-week average)").
  const after = pcts.filter((p) => p.index >= avgEnd && /^[\s:,(]*(?:of|was|is|at|=|:)?[\s:(]*(?:approximately|about|~)?\s*$/i.test(s.slice(avgEnd, p.index)))
  const before = pcts.filter((p) => p.end <= avg.index! && /^\s*\(\s*(?:the\s+|a\s+)?$/i.test(s.slice(p.end, avg.index!)))
  const avgPct = after.length === 1 ? after[0] : after.length === 0 && before.length === 1 ? before[0] : null
  if (!avgPct) return { reason: 'cannot tell which number is the 12-week average' }
  const ratePct = pcts.find((p) => p !== avgPct)!
  // The rate must be written as a level, right after a level word or directly after the organism name.
  const pre = s.slice(0, ratePct.index)
  const org = hits.find((h) => h.def.pathogen)!
  const afterOrganism = org.index + org.length <= ratePct.index && /^[\s:,–—-]*(?:at\s+)?$/i.test(s.slice(org.index + org.length, ratePct.index))
  if (CHANGE_OF_RE.test(pre)) return { reason: 'rate written as a change ("an increase of …")' }
  if (!afterOrganism && !LEVEL_BEFORE_RE.test(pre)) return { reason: 'rate not written as a level (e.g. "rose by", "increased", "fell")' }
  if (CHANGE_AFTER_RE.test(s.slice(ratePct.end))) return { reason: 'rate followed by change wording (higher/lower/above/below/…)' }
  const def = [...tracked.values()][0]
  return { def, rate: ratePct.value, avg12wk: avgPct.value, strategy: 'sentence', evidence: s.slice(0, 300) }
}

const NUM_TOKEN_RE = /(?<![A-Za-z0-9.])(\d{1,3}(?:\.\d+)?)\s*(%?)(?![A-Za-z0-9])/g
const HEADING_RE = /^(?:the\s+)?(?:northeast(?:ern)?|north|midwest(?:ern)?|south(?:ern)?|west(?:ern)?)(?:\s+(?:census\s+)?region)?:?$/i

/**
 * Strategy 2: rows of a table under a "Midwest" heading with an explicit "2 weeks | 12-week average" header.
 * The Midwest context ends at any other region heading or line, the nation, a page break, or a header row that
 * repeats without a region heading right before it (the next table may belong to a region named only in a
 * graphic).
 */
export function parseMidwestTables(rows: string[], panel?: BiofirePanel): { accepted: UsmaFinding[]; rejected: { reason: string; text: string }[] } {
  const accepted: UsmaFinding[] = []
  const rejected: { reason: string; text: string }[] = []
  let region: string | null = null
  let header: { order: ('rate' | 'avg')[]; at: number } | null = null
  let prevWasHeading = false
  let section: BiofirePanel | undefined
  rows.forEach((row, i) => {
    const wasHeading = prevWasHeading
    prevWasHeading = false
    if (row === PAGE_BREAK) {
      region = null
      header = null
      return
    }
    const plain = row.replace(/\s*\|\s*/g, ' ').trim()
    if (!plain) return
    const regions = regionsIn(plain)
    // A heading row: just a region name (optionally "Region"/"Census Region"), any capitalization.
    if (regions.size === 1 && HEADING_RE.test(plain)) {
      region = [...regions][0]
      header = null
      prevWasHeading = true
      return
    }
    const avgM = [...plain.matchAll(AVG_RE)]
    const twoM = TWO_WEEK_RE.exec(plain.replace(AVG_RE, (x) => ' '.repeat(x.length)))
    const isHeader = avgM.length === 1 && !!twoM && percentsIn(plain).length === 0
    const hasOrganism = findOrganismsInText(plain, 'RP').length > 0
    const ph = isHeader || hasOrganism ? undefined : panelHeading(plain)
    if (ph) {
      section = ph
      return
    }
    // Any other line naming a different region (or several, or the nation) ends the Midwest context.
    if (!hasOrganism && (regions.size > 1 || (regions.size === 1 && !regions.has('Midwest')) || OTHER_GEO_RE.test(plain))) {
      region = null
      header = null
      return
    }
    if (isHeader && twoM) {
      if (header && !wasHeading) region = null
      header = { order: twoM.index < avgM[0].index! ? ['rate', 'avg'] : ['avg', 'rate'], at: i }
      return
    }
    if (region !== 'Midwest' || !header || i - header.at > 40) return
    const { hits, tracked, ambiguous } = trackedOrganisms(plain, panel ?? section)
    if (!hits.length) return
    if (regions.size || OTHER_GEO_RE.test(plain)) return void rejected.push({ reason: 'table row names a region', text: row })
    if (ambiguous) return void rejected.push({ reason: 'table row: adenovirus without a known panel', text: row })
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
export function parseUsmaReport(pdf: Pick<PdfText, 'text' | 'rows'>, panel?: BiofirePanel): UsmaParse {
  const found: UsmaFinding[] = []
  const rejected: { reason: string; text: string }[] = []
  // Section headings decide the panel only when the file name does not.
  let section: BiofirePanel | undefined
  for (const page of pdf.text) {
    for (const sentence of toSentences(page)) {
      const ph = panelHeading(sentence)
      if (ph && !findOrganismsInText(sentence, 'RP').length) {
        section = ph
        continue
      }
      const r = parseSentence(sentence, panel ?? section)
      if (!r) continue
      if ('reason' in r) rejected.push({ reason: r.reason, text: sentence.replace(/\s+/g, ' ').slice(0, 240) })
      else found.push(r)
    }
  }
  const t = parseMidwestTables(pdf.rows, panel)
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
    .filter((r) => !acceptedEvidence.has(r.slice(0, 200)) && percentsIn(r).length >= 2 && findOrganismsInText(r, 'RP').length > 0)
    .slice(0, 15)
  return { accepted, rejected: rejected.slice(0, 25), tableCandidates }
}
