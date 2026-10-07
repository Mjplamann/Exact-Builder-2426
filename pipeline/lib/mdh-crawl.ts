// HTML extraction for MDH statistics pages (cheerio): downloadable-file links with their link text and
// nearest preceding heading, the page's "Updated M/D/YYYY" date, data tables and key-statistic text.
// Everything here is pure (html in, plain objects out) so it can be unit-tested without the network.
import * as cheerio from 'cheerio'

export type LinkExt = 'csv' | 'xlsx' | 'xls' | 'pdf'

export interface PageLink {
  url: string
  ext: LinkExt
  /** Visible link text (whitespace-normalized). */
  text: string
  /** Best descriptive label: link text if informative, else title/aria-label/figure caption/heading. */
  label: string
  /** Nearest preceding h1–h6 text. */
  heading: string
}

export interface PageTable {
  caption: string
  heading: string
  headers: string[]
  rows: string[][]
}

export interface PageInfo {
  title: string
  /** ISO date parsed from "Updated M/D/YYYY" (or "Last updated ..."). */
  updated?: string
  updatedText?: string
  /** ISO date from the first "as of M/D/YYYY" phrase on the page. */
  asOf?: string
  /** Every "as of <date>" phrase with the text just before it, so callers can pick the relevant one. */
  asOfPhrases: { date: string; context: string }[]
  links: PageLink[]
  tables: PageTable[]
  /** Short text snippets that look like key statistics (numbers next to surveillance keywords). */
  keyStats: string[]
  /** Sentences stating an activity level or trend for a pathogen (publisher wording). */
  statements: string[]
  /** The page says some data are pending (recent weeks incomplete). */
  pendingNotice: boolean
  /** Whitespace-normalized main-content text (capped), for pages whose numbers sit in plain text. */
  text?: string
}

const ws = (s: string) => s.replace(/\s+/g, ' ').trim()

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Parse "10/1/2026", "October 1, 2026" or "Oct. 1, 2026" into ISO YYYY-MM-DD. */
export function parseLooseDate(s: string): string | undefined {
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    const mo = Number(m[1])
    const d = Number(m[2])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s)
  if (m) {
    const mi = MONTHS.findIndex((x) => x.startsWith(m![1].toLowerCase().slice(0, 3)))
    const d = Number(m[2])
    if (mi >= 0 && d >= 1 && d <= 31) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return undefined
}

const UNINFORMATIVE = /^(download|download (the )?(data|file|csv|spreadsheet)|data|csv|excel|xlsx?|pdf|here|click here|link|\(?csv\)?|\(?pdf\)?|downloadable data|data \(csv\)|download data \(csv\))$/i

function stripExtTag(s: string) {
  return ws(s.replace(/\((csv|pdf|xlsx?|excel)[^)]*\)/gi, ' ').replace(/\b(csv|pdf)\b\s*$/i, ''))
}

export function parsePage(html: string, pageUrl: string): PageInfo {
  const $ = cheerio.load(html)
  $('script, style, noscript, template').remove()
  // .text() concatenates adjacent blocks ("Updated 10/1/2026Data pending"); add separators so phrase
  // and date patterns see word boundaries.
  $('p, div, li, dt, dd, h1, h2, h3, h4, h5, h6, td, th, tr, table, section, article, figure, figcaption, caption, br').after(' ')
  const title = ws($('title').first().text() || $('h1').first().text())
  const mainSel = ['#block-bootstrap-mdh-content', 'main', '#body', 'body'].find((s) => $(s).length > 0) ?? 'body'
  const root = $(mainSel).first()
  const text = ws(root.text())

  // "Updated 10/1/2026" — MDH puts this near the top of every statistics page.
  let updated: string | undefined
  let updatedText: string | undefined
  const um = /(?:last\s+)?updated:?\s*((?:\d{1,2}\/\d{1,2}\/\d{2,4})|(?:[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}))/i.exec(text)
  if (um) {
    updatedText = ws(um[0])
    updated = parseLooseDate(um[1])
  }

  const asOfPhrases: { date: string; context: string }[] = []
  for (const m of text.matchAll(/\bas of:?\s*((?:\d{1,2}\/\d{1,2}\/\d{2,4})|(?:[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}))/gi)) {
    const date = parseLooseDate(m[1])
    if (date && asOfPhrases.length < 20) asOfPhrases.push({ date, context: text.slice(Math.max(0, (m.index ?? 0) - 60), m.index).trim() })
  }
  const asOf = asOfPhrases[0]?.date

  const links: PageLink[] = []
  const tables: PageTable[] = []
  let heading = ''
  root.find('h1, h2, h3, h4, h5, h6, a[href], table').each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? ''
    const node = $(el)
    if (/^h[1-6]$/.test(tag)) {
      heading = ws(node.text()).slice(0, 200)
      return
    }
    if (tag === 'table') {
      const caption = ws(node.find('caption').first().text()).slice(0, 200)
      let headers = node
        .find('thead tr')
        .last()
        .find('th, td')
        .map((_i, c) => ws($(c).text()))
        .get()
      const bodyRows = node.find('tbody tr').length ? node.find('tbody tr') : node.find('tr')
      const rows: string[][] = []
      bodyRows.each((_i, tr) => {
        const cells = $(tr)
          .find('th, td')
          .map((_j, c) => ws($(c).text()))
          .get()
        if (cells.some((c) => c !== '')) rows.push(cells)
      })
      if (!headers.length && rows.length) headers = rows.shift()!
      tables.push({ caption, heading, headers, rows })
      return
    }
    const href = node.attr('href') ?? ''
    let url: URL
    try {
      url = new URL(href, pageUrl)
    } catch {
      return
    }
    const em = /\.(csv|xlsx|xls|pdf)$/i.exec(url.pathname)
    if (!em) return
    url.hash = ''
    const ext = em[1].toLowerCase() as LinkExt
    const linkText = ws(node.text())
    const stripped = stripExtTag(linkText)
    let label = stripped
    if (!stripped || stripped.length < 8 || UNINFORMATIVE.test(stripped)) {
      const fig = node.closest('figure, .figure, .chart, .card, section, li, p, div')
      const figTitle = ws(fig.find('figcaption, caption, .title, .card-title, h2, h3, h4, h5').first().text())
      label =
        stripExtTag(node.attr('title') ?? '') ||
        stripExtTag(node.attr('aria-label') ?? '') ||
        figTitle ||
        heading ||
        stripped
    }
    links.push({ url: url.toString(), ext, text: linkText.slice(0, 200), label: label.slice(0, 200), heading })
  })

  // Key statistics: short snippets with a number next to a surveillance keyword.
  const keyStats: string[] = []
  const seen = new Set<string>()
  root.find('tr, li, p, dd, dt, strong, h3, h4, h5, .stat, .card-text, .key-stat').each((_, el) => {
    const node = $(el)
    const t =
      (el as { tagName?: string }).tagName?.toLowerCase() === 'tr'
        ? node
            .find('th, td')
            .map((_i, c) => ws($(c).text()))
            .get()
            .filter(Boolean)
            .join(' | ')
        : ws(node.text())
    if (t.length < 6 || t.length > 220 || seen.has(t)) return
    if (!/\d/.test(t)) return
    if (!/(positive|positivity|hospitali[sz]|outbreak|death|strain|subtype|level|activity|cases|ili|wastewater|rate)/i.test(t)) return
    seen.add(t)
    if (keyStats.length < 25) keyStats.push(t)
  })

  // Publisher statements of level/trend ("COVID-19 activity is low", "RSV hospitalizations are increasing").
  const statements: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > 260) continue
    if (!/(covid|influenza|flu\b|rsv|respiratory)/i.test(sentence)) continue
    if (!/\b(minimal|low|moderate|high|very high|increas\w*|decreas\w*|stable|steady|declin\w*|rising|elevated)\b/i.test(sentence)) continue
    if (statements.length < 20 && !statements.includes(sentence)) statements.push(sentence)
  }

  return {
    title,
    updated,
    updatedText,
    asOf,
    asOfPhrases,
    links,
    tables,
    keyStats,
    statements,
    pendingNotice: /\b(data pending|pending data|are pending|is pending)\b/i.test(text),
    text: text.slice(0, 60_000),
  }
}

/** Compact a table for diagnostics: header + first rows, cells truncated. */
export function compactTable(t: PageTable, maxRows = 3) {
  const cut = (s: string) => (s.length > 60 ? `${s.slice(0, 57)}...` : s)
  return {
    caption: t.caption || undefined,
    heading: t.heading || undefined,
    headers: t.headers.slice(0, 40).map(cut),
    rows: t.rows.slice(0, maxRows).map((r) => r.slice(0, 40).map(cut)),
    rowCount: t.rows.length,
  }
}
