// BIOFIRE® Syndromic Trends (bioMérieux) — Midwest and U.S. pathogen detection rates.
//
// BioFire Syndromic Trends aggregates de-identified results of BIOFIRE® FILMARRAY® respiratory (RP2.1) and
// gastrointestinal (GI) panel tests from participating U.S. labs. Its public figures exist only for the U.S.
// and the four Census regions; Minnesota is part of the 12-state "Midwest" region. There is no documented
// public API and bioMérieux's legal notice restricts automated extraction from its website databases, so
// syndromictrends.com is NOT scraped. Two legitimate ingestion paths:
//
//  1. biofire-trend — CSV files placed in data/manual/biofire/ (BioFire Trend exports supplied by bioMérieux
//     or a partner lab, or the MN Pulse long format). Format documentation: data/manual/biofire/README.md.
//  2. biofire-usma  — bioMérieux U.S. Medical Affairs "USMA TRENDS Insights" PDF reports, discovered from the
//     public index page (never guessed), with Midwest 2-week detection rates and 12-week averages extracted
//     only when the text is unambiguous (see pipeline/lib/biofire-usma.ts).
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { GeoRef, Point, Series } from '../../shared/types.ts'
import { fetchBuffer, fetchText } from '../lib/http.ts'
import { latestDate, makeSeries, roundValue } from '../lib/series.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'
import type { OrganismDef } from '../lib/biofire-organisms.ts'
import {
  DEFAULT_SMOOTHING, columnsOf, detectFormat, mergeObservations, parseLongCsv, parseWideCsv, type BiofireObs,
  type FileReport, type KeptGeo, type MergedSeriesObs,
} from '../lib/biofire-manual.ts'
import {
  USMA_INDEX_URL, extractPdfLinks, parseUsmaReport, parseWindowFromName, parseWindowFromText, pdfToText,
  reportNumber, windowWeek, type ReportWindow, type UsmaFinding,
} from '../lib/biofire-usma.ts'

const SOURCE = 'biofire'
export const MANUAL_DIR = path.join('data', 'manual', 'biofire')
/** Most recent USMA reports to read per run (override with BIOFIRE_USMA_MAX_PDFS). */
const MAX_PDFS = Math.max(1, Number(process.env.BIOFIRE_USMA_MAX_PDFS) || 10)
/** Wall-clock budget for downloading/parsing report PDFs (the module timeout is 6 minutes). */
const USMA_BUDGET_MS = 3.5 * 60_000

export const GEOS: Record<KeptGeo, GeoRef> = {
  US: { type: 'national', code: 'US', name: 'United States' },
  Midwest: { type: 'census-region', code: 'Midwest', name: 'Midwest (12 states incl. MN)' },
}

const SMOOTHING_TEXT: Record<string, string> = {
  '3wk_centered': '3-week centered average of participating sites’ rates (each site counts equally)',
  weekly_raw: 'single-week rate (not smoothed)',
  '2wk_window': '2-week window rate',
}

/** Error text including undici's `cause` (Node fetch reports network failures as just "fetch failed"). */
const errMsg = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e)
  const cause = (e as Error & { cause?: unknown }).cause
  const c = cause instanceof Error ? `${cause.message}${(cause as Error & { code?: string }).code ? ` [${(cause as Error & { code?: string }).code}]` : ''}` : ''
  return c && !e.message.includes(c) ? `${e.message} (${c})` : e.message
}

function variantOf(def: OrganismDef, smoothing: string): string | undefined {
  const parts = [def.variant, smoothing !== DEFAULT_SMOOTHING ? smoothing.replace(/_/g, '-') : undefined].filter(Boolean)
  return parts.length ? parts.join('-') : undefined
}

const panelText = (def: OrganismDef) => (def.panel === 'GI' ? 'gastrointestinal (GI)' : 'respiratory')

/** Build biofire-trend series from merged manual observations. Main series come before sub-target variants. */
export function buildTrendSeries(groups: MergedSeriesObs[]): Series[] {
  const out: Series[] = []
  for (const g of groups) {
    if (!g.obs.length || !g.def.pathogen) continue
    const points: Point[] = g.obs.map((o) => [o.week, o.value == null ? null : roundValue(o.value, 'detection_rate')])
    const last = g.obs[g.obs.length - 1]
    const flagged = g.obs.filter((o) => o.provisional).map((o) => o.week)
    const candidates = [...flagged, ...(g.smoothing === DEFAULT_SMOOTHING ? [last.week] : [])].sort()
    const where = g.geo === 'Midwest' ? 'in the 12-state Census Midwest region (includes Minnesota)' : 'across the U.S.'
    const s = makeSeries({
      source: SOURCE,
      dataset: 'biofire-trend',
      pathogen: g.def.pathogen,
      metric: 'detection_rate',
      geo: GEOS[g.geo],
      label: `${g.def.name} — BioFire detection rate, ${g.geo === 'Midwest' ? 'Midwest' : 'U.S.'}${g.smoothing === DEFAULT_SMOOTHING ? '' : ` (${g.smoothing.replace(/_/g, ' ')})`}`,
      points,
      provisionalFrom: candidates[0],
      variant: variantOf(g.def, g.smoothing),
      note:
        `Share of BIOFIRE® ${panelText(g.def)} panel tests at participating labs ${where} that detected ${g.def.label}; ` +
        `${SMOOTHING_TEXT[g.smoothing] ?? g.smoothing}. Patients tested are mostly symptomatic hospital and emergency ` +
        `department patients, so this is not the share of people infected.` +
        (g.smoothing === DEFAULT_SMOOTHING ? ' The newest week is revised once the following week arrives.' : ''),
    })
    const attrs: Record<string, string> = {
      organism: g.def.label,
      panel: g.def.panel === 'GI' ? 'Gastrointestinal' : 'Respiratory',
      smoothing: g.smoothing,
      file: last.file,
      snapshot: last.vintage,
    }
    if (last.nSites != null) attrs.sites = String(last.nSites)
    if (last.nTests != null) attrs.tests = String(last.nTests)
    if (last.sourceUrl) attrs.sourceUrl = last.sourceUrl
    s.attrs = attrs
    out.push(s)
  }
  const rank = (s: Series) => (s.id.split(':').length > 6 ? 1 : 0)
  return out.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

async function listCsv(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...(await listCsv(p)))
    else if (ent.isFile() && /\.csv$/i.test(ent.name)) out.push(p)
  }
  return out.sort()
}

interface PartResult {
  series: Series[]
  diag: Record<string, unknown>
  summary: string
  errors: string[]
}

/** Path 1: CSV files in data/manual/biofire/. */
export async function loadManual(ctx: SourceContext): Promise<PartResult> {
  const dir = path.resolve(ctx.rootDir, MANUAL_DIR)
  const diag: Record<string, unknown> = { dir: MANUAL_DIR }
  if (!existsSync(dir)) {
    return { series: [], diag: { ...diag, files: [] }, summary: `no ${MANUAL_DIR}/ directory`, errors: [] }
  }
  const files = await listCsv(dir)
  const reports: FileReport[] = []
  const all: BiofireObs[] = []
  const errors: string[] = []
  for (const file of files) {
    const rel = path.relative(dir, file)
    try {
      const text = await readFile(file, 'utf8')
      const format = detectFormat(columnsOf(text))
      let parsed: { obs: BiofireObs[]; report: FileReport }
      if (format === 'wide') parsed = parseWideCsv(path.basename(file), text)
      else if (format === 'long') {
        const dated = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(file))?.[1]
        const fallback = dated ?? (await stat(file)).mtime.toISOString()
        parsed = parseLongCsv(path.basename(file), text, fallback)
      } else {
        const cols = columnsOf(text)
        reports.push({
          file: rel, format: 'unknown', rows: 0, columns: cols.slice(0, 30), weekdays: {}, accepted: 0, skipped: {}, notes: {},
          warnings: ['header matches neither the BioFire Trend wide format nor the MN Pulse long format; file skipped'],
        })
        ctx.log.warn(`${rel}: unrecognized CSV header (${cols.slice(0, 8).join(', ')}); skipped`)
        continue
      }
      parsed.report.file = rel
      reports.push(parsed.report)
      all.push(...parsed.obs)
      for (const w of parsed.report.warnings) ctx.log.warn(`${rel}: ${w}`)
      ctx.log.info(`${rel}: ${parsed.report.format} format, ${parsed.report.rows} rows, ${parsed.report.accepted} values kept`)
    } catch (e) {
      errors.push(`${rel}: ${errMsg(e)}`)
    }
  }
  const series = buildTrendSeries(mergeObservations(all, ctx.historyStart))
  const latest = latestDate(series)
  diag.filesFound = files.length
  diag.files = reports
  diag.series = series.length
  diag.latestWeek = latest ?? null
  const summary = files.length
    ? `${files.length} manual CSV file(s) → ${series.length} series${latest ? ` through ${latest}` : ''}`
    : `no CSV files in ${MANUAL_DIR}/`
  return { series, diag, summary, errors }
}

function visibleText(html: string, max: number): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

interface ReportRef {
  url: string
  name: string
  number?: number
  window: ReportWindow | null
}

async function getPdf(url: string, name: string, cacheDir: string): Promise<{ buf: Uint8Array; cached: boolean }> {
  const file = path.join(cacheDir, name.replace(/[^\w.-]+/g, '_'))
  if (existsSync(file)) {
    const b = await readFile(file)
    if (b.length > 0) return { buf: new Uint8Array(b), cached: true }
  }
  const ab = await fetchBuffer(url, { timeoutMs: 90_000, retries: 2, headers: { Accept: 'application/pdf' } })
  const buf = new Uint8Array(ab)
  await writeFile(file, buf).catch(() => undefined)
  return { buf, cached: false }
}

/** Build biofire-usma series (Midwest) from accepted findings, one point per report window. */
export function buildUsmaSeries(
  items: { report: ReportRef & { window: ReportWindow }; finding: UsmaFinding }[],
  historyStart: string,
): { series: Series[]; conflicts: string[] } {
  const conflicts: string[] = []
  const byCode = new Map<string, Map<string, { report: ReportRef & { window: ReportWindow }; finding: UsmaFinding }>>()
  for (const it of items) {
    const week = windowWeek(it.report.window)
    if (week < historyStart) continue
    const m = byCode.get(it.finding.def.code) ?? new Map()
    const prev = m.get(week)
    if (prev && prev.finding.rate !== it.finding.rate) {
      conflicts.push(`${it.finding.def.code} ${week}: ${prev.report.name}=${prev.finding.rate}% vs ${it.report.name}=${it.finding.rate}%`)
    }
    // Same window in two reports: keep the later report (higher sequence number, else later file name).
    const later = (a: ReportRef, b: ReportRef) =>
      a.number != null && b.number != null && a.number !== b.number ? a.number > b.number : a.name > b.name
    if (!prev || later(it.report, prev.report)) m.set(week, it)
    byCode.set(it.finding.def.code, m)
  }
  const series: Series[] = []
  for (const m of byCode.values()) {
    const entries = [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    const def = entries[0][1].finding.def
    if (!def.pathogen) continue
    const latest = entries[entries.length - 1][1]
    const s = makeSeries({
      source: SOURCE,
      dataset: 'biofire-usma',
      pathogen: def.pathogen,
      metric: 'detection_rate',
      geo: GEOS.Midwest,
      label: `${def.name} — BioFire detection rate, Midwest (bioMérieux 2-week report)`,
      points: entries.map(([week, it]) => [week, roundValue(it.finding.rate, 'detection_rate')]),
      variant: def.variant,
      note:
        'From bioMérieux U.S. Medical Affairs “USMA TRENDS Insights” reports: share of BIOFIRE® panel tests at ' +
        'participating Midwest labs that detected this organism over the report’s 2-week window, plotted at the ' +
        'window’s final week. Mostly symptomatic hospital/ED patients; not the share of people infected.',
    })
    s.attrs = {
      report: latest.report.name,
      window: `${latest.report.window.start} to ${latest.report.window.end}`,
      avg12wk: `${latest.finding.avg12wk}%`,
      parsedBy: latest.finding.strategy,
    }
    series.push(s)
  }
  const rank = (s: Series) => (s.id.split(':').length > 6 ? 1 : 0)
  series.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))
  return { series, conflicts }
}

/** Path 2: bioMérieux USMA TRENDS Insights PDF reports. */
export async function loadUsma(ctx: SourceContext): Promise<PartResult> {
  const diag: Record<string, unknown> = { indexUrl: USMA_INDEX_URL, via: 'live' }
  if (/^(0|off|false|no)$/i.test(process.env.BIOFIRE_USMA ?? '')) {
    return { series: [], diag: { ...diag, skipped: 'BIOFIRE_USMA=off' }, summary: 'bioMérieux reports skipped (BIOFIRE_USMA=off)', errors: [] }
  }
  let html: string
  try {
    html = await fetchText(USMA_INDEX_URL, {
      timeoutMs: 45_000,
      retries: 2,
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.8' },
    })
  } catch (e) {
    diag.indexError = errMsg(e).slice(0, 300)
    return { series: [], diag, summary: `bioMérieux reports index unavailable (${errMsg(e).slice(0, 80)})`, errors: [`USMA index: ${errMsg(e).slice(0, 200)}`] }
  }
  diag.indexBytes = html.length
  const links = extractPdfLinks(html)
  diag.pdfLinksFound = links.length
  if (!links.length) {
    diag.indexTextSnippet = visibleText(html, 1500)
    const msg = 'no report PDF links found on the index page (layout change or links rendered by script)'
    ctx.log.warn(`USMA: ${msg}`)
    return { series: [], diag, summary: `bioMérieux reports: ${msg}`, errors: [`USMA: ${msg}`] }
  }
  const refs: ReportRef[] = links.map((url) => {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)
    return { url, name, number: reportNumber(url), window: parseWindowFromName(name) }
  })
  refs.sort((a, b) => {
    const ea = a.window?.end ?? ''
    const eb = b.window?.end ?? ''
    if (ea !== eb) return ea < eb ? 1 : -1
    return (b.number ?? 0) - (a.number ?? 0) || (a.name < b.name ? 1 : -1)
  })
  diag.pdfLinks = refs.slice(0, 40).map((r) => ({ name: r.name, url: r.url, window: r.window ? `${r.window.start}..${r.window.end}` : null }))
  const recent = refs.filter((r) => !r.window || r.window.end >= ctx.historyStart).slice(0, MAX_PDFS)

  const cacheDir = path.join(path.resolve(ctx.rootDir, ctx.cacheDir), 'biofire-usma')
  await mkdir(cacheDir, { recursive: true }).catch(() => undefined)
  const errors: string[] = []
  const items: { report: ReportRef & { window: ReportWindow }; finding: UsmaFinding }[] = []
  const pdfDiag: Record<string, unknown>[] = []
  const started = Date.now()
  for (const ref of recent) {
    const d: Record<string, unknown> = { name: ref.name, url: ref.url }
    pdfDiag.push(d)
    // Stay well inside the module timeout so manual-import series are never lost to a slow server.
    if (Date.now() - started > USMA_BUDGET_MS) {
      d.outcome = 'skipped: time budget for report downloads used up'
      continue
    }
    try {
      const { buf, cached } = await getPdf(ref.url, ref.name, cacheDir)
      d.bytes = buf.length
      d.cached = cached
      const pdf = await pdfToText(buf)
      const joined = pdf.text.join('\n')
      d.pages = pdf.pages
      d.textChars = joined.length
      d.snippet = joined.replace(/[^\S\n]+/g, ' ').slice(0, 2000)
      const textWindow = parseWindowFromText(joined.slice(0, 4000))
      const window = ref.window ?? textWindow
      d.window = window ? `${window.start}..${window.end}` : null
      d.windowFrom = ref.window ? 'file name' : textWindow ? 'report text' : null
      if (ref.window && textWindow && (ref.window.start !== textWindow.start || ref.window.end !== textWindow.end)) {
        d.windowMismatch = `file name ${ref.window.start}..${ref.window.end} vs text "${textWindow.raw}"`
      }
      const parsed = parseUsmaReport(pdf)
      d.accepted = parsed.accepted.map((f) => ({ code: f.def.code, rate: f.rate, avg12wk: f.avg12wk, by: f.strategy, evidence: f.evidence }))
      d.rejected = parsed.rejected.slice(0, 12)
      d.tableCandidates = parsed.tableCandidates.slice(0, 10)
      if (!window) {
        d.outcome = 'no report window found; values not used'
        continue
      }
      d.outcome = `${parsed.accepted.length} Midwest value(s) accepted`
      for (const f of parsed.accepted) items.push({ report: { ...ref, window }, finding: f })
    } catch (e) {
      d.error = errMsg(e).slice(0, 300)
      errors.push(`USMA ${ref.name}: ${errMsg(e).slice(0, 160)}`)
    }
  }
  diag.pdfs = pdfDiag
  const { series, conflicts } = buildUsmaSeries(items, ctx.historyStart)
  if (conflicts.length) diag.conflicts = conflicts.slice(0, 20)
  const latest = latestDate(series)
  diag.series = series.length
  diag.latestWeek = latest ?? null
  const read = pdfDiag.filter((d) => d.pages != null).length
  ctx.log.info(`USMA: ${links.length} PDF link(s), ${read}/${recent.length} read, ${items.length} Midwest value(s) accepted`)
  const summary = `bioMérieux reports: ${read}/${recent.length} PDF(s) read, ${items.length} Midwest value(s) parsed → ${series.length} series${latest ? ` through ${latest}` : ''}`
  return { series, diag, summary, errors }
}

export const biofire: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'BIOFIRE Syndromic Trends (Midwest)',
    publisher: 'bioMérieux — BIOFIRE® Syndromic Trends',
    url: 'https://syndromictrends.com/',
    description:
      'BioFire “detection rate”: of the BIOFIRE® FILMARRAY® respiratory (RP2.1) and gastrointestinal (GI) panel ' +
      'tests run at participating labs, the percentage that detected each organism. Labs are mostly hospitals and ' +
      'emergency departments testing people who are already sick, so it shows which germs are driving illness ' +
      'right now. Values are 3-week centered averages of each site’s rate (every site counts equally), so the ' +
      'newest week is provisional and gets revised. Data exist only for the U.S. and four Census regions; ' +
      'Minnesota is part of the 12-state Midwest region. It does NOT measure how many people are infected ' +
      '(it is not prevalence), is not specific to Minnesota, and one germ’s share can fall simply because ' +
      'another is surging. Loaded from BioFire Trend CSV exports placed in data/manual/biofire/ and from ' +
      'bioMérieux’s “USMA TRENDS Insights” PDF reports (Midwest 2-week rates vs. 12-week averages); ' +
      'syndromictrends.com itself is not scraped.',
    geography: 'U.S. Census Midwest region (12 states incl. Minnesota); United States',
    cadence: 'Weekly when CSV exports are added; bioMérieux reports every 2–4 weeks',
    attribution: 'BIOFIRE® Syndromic Trends / bioMérieux (syndromictrends.com)',
  },
  timeoutMs: 6 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const summaries: string[] = []
    const diagnostics: Record<string, unknown> = { runAt: ctx.now, historyStart: ctx.historyStart }
    let trend: Series[] = []
    let usma: Series[] = []
    try {
      const r = await loadManual(ctx)
      trend = r.series
      diagnostics.manual = r.diag
      summaries.push(r.summary)
      errors.push(...r.errors)
    } catch (e) {
      errors.push(`manual import: ${errMsg(e)}`)
    }
    try {
      const r = await loadUsma(ctx)
      usma = r.series
      diagnostics.usma = r.diag
      summaries.push(r.summary)
      errors.push(...r.errors)
    } catch (e) {
      errors.push(`USMA reports: ${errMsg(e)}`)
    }
    for (const e of errors) ctx.log.warn(e)
    diagnostics.latest = { 'biofire-trend': latestDate(trend) ?? null, 'biofire-usma': latestDate(usma) ?? null }
    diagnostics.errors = errors
    const empty = !trend.length && !usma.length
    const message = empty
      ? `No BioFire data yet: ${summaries.join('; ')}. Add BioFire Trend CSV exports to ${MANUAL_DIR}/ (formats in its README) — ` +
        'BioFire publishes no public API and its website is not scraped.'
      : `${summaries.join('; ')}${errors.length ? `. Problems: ${errors.slice(0, 4).join('; ')}` : ''}`
    return {
      datasets: [
        { source: SOURCE, dataset: 'biofire-trend', series: trend },
        { source: SOURCE, dataset: 'biofire-usma', series: usma },
      ],
      message,
      diagnostics,
    }
  },
}
