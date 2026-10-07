// Minnesota Department of Health (MDH) — weekly respiratory surveillance pages and watch-list pages.
//
// MDH publishes its weekly flu / viral respiratory / wastewater statistics as HTML pages with
// "Downloadable data (CSV)" links. The CSV file names and columns are not documented anywhere we could
// read, so this module:
//   1. crawls the statistics pages (www.health.state.mn.us, falling back to www.health.mn.gov),
//      extracting every .csv/.xlsx/.pdf link with its link text and nearest heading, the page's
//      "Updated M/D/YYYY" date, data tables and key-statistic text;
//   2. maps each CSV to a dataset by its link text (LINK_SPECS, from MDH's published link titles),
//      falling back to a page-level generic spec;
//   3. parses each file with a defensive normalizer (pipeline/lib/mdh-normalize.ts) that emits a series
//      only when the pathogen, measure, week and place are unambiguous;
//   4. reads pertussis and measles year-to-date counts from their HTML tables;
//   5. returns full diagnostics (header, first rows, row counts, why a column was or was not mapped)
//      so parsing can be refined after each CI run.
// Nothing is synthesized: blank/suppressed cells are omitted and every value comes from an MDH file.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MetricKind, PathogenId, Point, Series } from '../../shared/types.ts'
import { weekEndingSaturday } from '../../shared/mmwr.ts'
import { HttpError, fetchBuffer } from '../lib/http.ts'
import { latestDate, makeSeries, STATE_GEO } from '../lib/series.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'
import { compactTable, parsePage, type PageInfo, type PageLink } from '../lib/mdh-crawl.ts'
import { csvToGrid, decodeText, normalizeTable, type NormalizeDiag, type NormalizedSeries, type NormalizeSpec } from '../lib/mdh-normalize.ts'
import { parseMeaslesPage, parsePertussisPage } from '../lib/mdh-watch.ts'

const SOURCE = 'mdh'
export const MDH_HOSTS = ['www.health.state.mn.us', 'www.health.mn.gov']

/** Weekly statistics pages crawled for downloadable data. */
export const DATA_PAGES = [
  '/diseases/flu/stats/hosp.html',
  '/diseases/flu/stats/lab.html',
  '/diseases/flu/stats/out.html',
  '/diseases/flu/stats/death.html',
  '/diseases/respiratory/stats/hosp.html',
  '/diseases/respiratory/stats/setting.html',
  '/diseases/respiratory/stats/tsys.html',
  '/diseases/respiratory/stats/lab.html',
  '/diseases/wastewater/stats/index.html',
  '/diseases/flu/stats/index.html',
  '/diseases/respiratory/stats/index.html',
  // Prior-season files (e.g. "RESP-NET by County, 2023-2025") extend county history.
  '/diseases/respiratory/stats/archive.html',
]
const ARCHIVE_PAGES = new Set(['/diseases/respiratory/stats/archive.html'])
const MEASLES_PAGE = '/diseases/measles/stats.html'

export function pertussisPages(nowIso: string): { path: string; year: number }[] {
  const year = Number(nowIso.slice(0, 4))
  const years = [...new Set([year, 2026])].sort((a, b) => b - a)
  return years.map((y) => ({ path: `/diseases/pertussis/stats/stats${String(y % 100).padStart(2, '0')}.html`, year: y }))
}

// ───────────────────────── Link specs ─────────────────────────

export interface LinkSpec extends NormalizeSpec {
  key: string
  /** Matched against the link label/text (then the nearest heading). First match wins. */
  match: RegExp
  /** Dataset id (stable). Defaults to one derived from the metric. */
  dataset?: string
  /** Surveillance program, used in labels ("MDH RESP-NET"). */
  program: string
  /** Plain-language caveat stored as series.note. */
  note: string
  /** Appended to series ids (e.g. outbreak setting). */
  variant?: string
  /** Series from specs in the same family merge (current season wins over archive). */
  family?: string
  /** Display name used for 'respiratory-combined' series from this file. */
  combinedName?: string
  /** Hospitalization/death files: mark the latest week provisional when the page says data are pending. */
  pendingSensitive?: boolean
  /** Record the file but do not parse it (reason). */
  skip?: string
}

const FLU: PathogenId[] = ['influenza', 'influenza-a', 'influenza-b']
const RESP3: PathogenId[] = ['covid', 'influenza', 'rsv', 'respiratory-combined']
const MLS_PANEL: PathogenId[] = [
  'rhino-entero', 'hmpv', 'adenovirus', 'parainfluenza', 'seasonal-cov', 'covid', 'rsv', 'influenza', 'influenza-a', 'influenza-b',
  'mycoplasma', 'chlamydia-pneumoniae', 'pertussis',
]
const WW: PathogenId[] = ['covid', 'influenza', 'influenza-a', 'influenza-b', 'rsv', 'measles']

const PRELIM = 'MDH data are preliminary and recent weeks are often revised.'

export const LINK_SPECS: LinkSpec[] = [
  // Laboratory (Minnesota Laboratory System, MLS)
  {
    key: 'flu-lab-positivity',
    match: /influenza positive tests and percent positivity|weekly total of influenza positive/i,
    dataset: 'mdh-lab',
    program: 'MLS lab survey',
    pathogens: FLU,
    defaultPathogen: 'influenza',
    metrics: ['test_positivity'],
    note: `Share of influenza tests reported positive by Minnesota Laboratory System clinical labs (voluntary weekly reporting). ${PRELIM}`,
  },
  { key: 'flu-lab-subtype', match: /positives by subtype|influenza a subtyp/i, program: 'MDH Public Health Laboratory', metrics: [], note: '', skip: 'Counts of positive specimens by influenza A subtype; no matching percentage measure.' },
  {
    key: 'rsv-lab-positivity',
    match: /rsv positive tests and percent positivity|mls weekly rsv/i,
    dataset: 'mdh-lab',
    program: 'MLS lab survey',
    pathogens: ['rsv'],
    defaultPathogen: 'rsv',
    metrics: ['test_positivity'],
    note: `Share of RSV tests reported positive by Minnesota Laboratory System clinical labs. ${PRELIM}`,
  },
  {
    key: 'mls-other-molecular',
    match: /other molecular testing|mls other molecular/i,
    dataset: 'mdh-lab',
    program: 'MLS other molecular testing',
    // Flu and RSV have dedicated all-lab positivity files; panel-subset values for them would be a
    // different measure under the same series id, so they are not taken from this file.
    pathogens: MLS_PANEL.filter((p) => !['influenza', 'influenza-a', 'influenza-b', 'rsv'].includes(p)),
    metrics: ['test_positivity'],
    note: `Share of molecular (PCR panel) tests positive, from the subset of Minnesota Laboratory System labs that report multiplex panel results. ${PRELIM}`,
  },
  // Influenza hospital surveillance (all MN hospitals, lab-confirmed)
  {
    key: 'flu-hosp-type',
    match: /hospitali[sz]ed influenza cases by type/i,
    dataset: 'mdh-hosp',
    program: 'influenza hospital surveillance',
    pathogens: FLU,
    defaultPathogen: 'influenza',
    metrics: ['hosp_admissions'],
    bareMeans: 'hosp_admissions',
    family: 'flu-hosp-weekly',
    pendingSensitive: true,
    note: `Laboratory-confirmed influenza hospitalizations reported by Minnesota hospitals, by week. ${PRELIM}`,
  },
  {
    key: 'flu-hosp-season',
    match: /hospitali[sz]ed influenza cases by season/i,
    dataset: 'mdh-hosp',
    program: 'influenza hospital surveillance',
    pathogens: FLU,
    defaultPathogen: 'influenza',
    metrics: ['hosp_admissions'],
    bareMeans: 'hosp_admissions',
    family: 'flu-hosp-weekly',
    pendingSensitive: true,
    note: `Laboratory-confirmed influenza hospitalizations reported by Minnesota hospitals, by week. ${PRELIM}`,
  },
  {
    key: 'flu-hosp-region',
    match: /influenza hospitali[sz]ations and incidence by region|hospitali[sz]ations .*by region/i,
    dataset: 'mdh-hosp',
    program: 'influenza hospital surveillance',
    pathogens: FLU,
    defaultPathogen: 'influenza',
    metrics: ['hosp_admissions', 'hosp_rate'],
    pendingSensitive: true,
    note: `Laboratory-confirmed influenza hospitalizations by MDH region of residence. ${PRELIM}`,
  },
  { key: 'flu-hosp-age', match: /influenza hospitali[sz]ations and incidence by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  // Outpatient influenza-like illness (ILINet)
  { key: 'ili-age', match: /\(ili\) by age|ili by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  {
    key: 'ili-region',
    match: /\(ili\) by region|ili by region/i,
    dataset: 'mdh-ili',
    program: 'ILINet outpatient surveillance',
    pathogens: ['ili'],
    defaultPathogen: 'ili',
    metrics: ['ili_pct'],
    bareMeans: 'ili_pct',
    note: `Percent of outpatient visits at sentinel clinics for influenza-like illness (fever with cough or sore throat), by region. Small regions can swing week to week. ${PRELIM}`,
  },
  {
    key: 'ili',
    match: /influenza[- ]like illness|\(ili\)/i,
    dataset: 'mdh-ili',
    program: 'ILINet outpatient surveillance',
    pathogens: ['ili'],
    defaultPathogen: 'ili',
    metrics: ['ili_pct'],
    bareMeans: 'ili_pct',
    note: `Percent of outpatient visits at sentinel clinics for influenza-like illness (fever with cough or sore throat). ILI is a symptom measure, not a lab-confirmed flu count. ${PRELIM}`,
  },
  // Influenza deaths
  { key: 'flu-deaths-age', match: /deaths associated with influenza by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  {
    key: 'flu-deaths',
    match: /deaths associated with influenza/i,
    dataset: 'mdh-deaths',
    program: 'influenza mortality surveillance',
    pathogens: FLU,
    defaultPathogen: 'influenza',
    metrics: ['deaths'],
    bareMeans: 'deaths',
    pendingSensitive: true,
    note: 'Influenza-associated deaths. Counts keep rising for months as death certificates are matched.',
  },
  // RESP-NET hospitalization rates
  {
    key: 'respnet-county-archive',
    match: /resp-?net (data )?by county.*20\d\d/i,
    dataset: 'mdh-respnet-county',
    program: 'RESP-NET',
    pathogens: RESP3,
    metrics: ['hosp_rate'],
    bareMeans: 'hosp_rate',
    family: 'respnet-county',
    combinedName: 'COVID-19, flu and RSV',
    note: 'Weekly laboratory-confirmed hospitalizations per 100,000 county residents (MDH RESP-NET). Rates in small counties can jump on a single hospitalization.',
  },
  {
    key: 'respnet-county',
    match: /resp-?net (data )?by county/i,
    dataset: 'mdh-respnet-county',
    program: 'RESP-NET',
    pathogens: RESP3,
    metrics: ['hosp_rate'],
    bareMeans: 'hosp_rate',
    family: 'respnet-county',
    combinedName: 'COVID-19, flu and RSV',
    pendingSensitive: true,
    note: `Weekly laboratory-confirmed hospitalizations per 100,000 county residents (MDH RESP-NET). Rates in small counties can jump on a single hospitalization. ${PRELIM}`,
  },
  { key: 'respnet-age', match: /resp-?net by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  { key: 'respnet-race', match: /resp-?net by race/i, program: '', metrics: [], note: '', skip: 'Race/ethnicity-stratified (not used).' },
  {
    key: 'respnet-season',
    match: /respiratory virus[- ]associated hospitali[sz]ations|rates of respiratory virus/i,
    dataset: 'mdh-hosp',
    program: 'RESP-NET',
    pathogens: RESP3,
    metrics: ['hosp_rate'],
    bareMeans: 'hosp_rate',
    family: 'respnet-state',
    combinedName: 'COVID-19, flu and RSV',
    pendingSensitive: true,
    // RESP-NET covered only the 7-county metro before the 2023-24 season; earlier weeks are not statewide.
    minDate: '2023-10-01',
    note: `Weekly laboratory-confirmed hospitalizations per 100,000 Minnesotans (MDH RESP-NET, statewide since the 2023-24 season). ${PRELIM}`,
  },
  // Outbreaks by setting
  {
    key: 'k12-outbreaks',
    match: /outbreaks in k-?12|k-?12 schools?/i,
    dataset: 'mdh-outbreaks',
    program: 'K-12 school outbreak reports',
    pathogens: ['respiratory-combined'],
    defaultPathogen: 'respiratory-combined',
    metrics: ['outbreaks'],
    bareMeans: 'outbreaks',
    variant: 'k12',
    combinedName: 'Respiratory illness in schools',
    note: 'Acute respiratory illness outbreaks reported by K-12 schools (10% of students absent with respiratory symptoms on one day). Reported during the school year only.',
  },
  { key: 'ltc-covid-cases', match: /(long[- ]term|congregate) care.*covid|covid.*(long[- ]term|congregate) care/i, program: '', metrics: [], note: '', skip: 'Resident/staff COVID-19 case counts (not mapped).' },
  {
    key: 'ltc-outbreaks',
    match: /outbreaks in long[- ]term care|long[- ]term care facilit.*outbreak/i,
    dataset: 'mdh-outbreaks',
    program: 'long-term care outbreak reports',
    pathogens: ['influenza', 'rsv', 'covid'],
    metrics: ['outbreaks'],
    bareMeans: 'outbreaks',
    variant: 'ltc',
    note: 'Influenza and RSV outbreaks reported by long-term care facilities (nursing homes and assisted living).',
  },
  // Syndromic surveillance
  {
    key: 'syndromic-region',
    match: /syndromic surveillance (data )?by region/i,
    dataset: 'mdh-syndromic',
    program: 'syndromic surveillance',
    pathogens: RESP3,
    metrics: ['ed_visit_pct'],
    note: 'Share of emergency department visits with a diagnosis of this illness, by region (hospital ADT messages).',
  },
  {
    key: 'syndromic',
    match: /syndromic surveillance/i,
    dataset: 'mdh-syndromic',
    program: 'syndromic surveillance',
    pathogens: RESP3,
    metrics: ['ed_visit_pct'],
    note: 'Share of emergency department visits with a diagnosis of this illness (hospital ADT messages).',
  },
  // Wastewater
  { key: 'ww-detection', match: /detection map/i, program: '', metrics: [], note: '', skip: 'Per-site detection status (presence/absence), not a concentration.' },
  {
    key: 'ww-regional',
    match: /regional wastewater/i,
    dataset: 'mdh-wastewater',
    program: 'wastewater monitoring',
    pathogens: WW,
    metrics: ['wastewater_conc'],
    bareMeans: 'wastewater_conc',
    combine: 'mean',
    note: 'Viral RNA in wastewater normalized to PMMoV (a marker of human waste); regional values are sewershed-population-weighted averages of site values (MDH). Units are relative, so compare a place with its own history.',
  },
  {
    key: 'ww-site',
    match: /treatment plant site data|wastewater treatment plant|plant site data/i,
    dataset: 'mdh-wastewater',
    program: 'wastewater monitoring',
    pathogens: WW,
    metrics: ['wastewater_conc'],
    bareMeans: 'wastewater_conc',
    combine: 'mean',
    allowSites: true,
    note: 'Viral RNA in wastewater at this treatment plant, normalized to PMMoV; several samples in one week are averaged. Units are relative, so compare a plant with its own history.',
  },
  {
    key: 'ww-hosp',
    match: /wastewater compared to hospitali[sz]ation/i,
    dataset: 'mdh-wastewater',
    program: 'wastewater monitoring',
    pathogens: ['covid'],
    defaultPathogen: 'covid',
    metrics: ['wastewater_conc'],
    combine: 'mean',
    note: 'Statewide SARS-CoV-2 in wastewater normalized to PMMoV (MDH).',
  },
]

/** Page-level fallback specs: only columns whose headers name both pathogen and measure are used. */
const PAGE_DEFAULTS: Record<string, Omit<LinkSpec, 'key' | 'match'>> = {
  '/diseases/flu/stats/lab.html': { program: 'MLS lab survey', pathogens: FLU, metrics: ['test_positivity'], note: PRELIM },
  '/diseases/respiratory/stats/lab.html': { program: 'MLS lab survey', pathogens: MLS_PANEL, metrics: ['test_positivity'], note: PRELIM },
  '/diseases/flu/stats/hosp.html': { program: 'influenza hospital surveillance', pathogens: FLU, metrics: ['hosp_admissions', 'hosp_rate'], note: PRELIM, pendingSensitive: true },
  '/diseases/respiratory/stats/hosp.html': { program: 'RESP-NET', pathogens: RESP3, metrics: ['hosp_rate'], minDate: '2023-10-01', note: PRELIM, pendingSensitive: true },
  '/diseases/flu/stats/out.html': { program: 'ILINet outpatient surveillance', pathogens: ['ili'], metrics: ['ili_pct'], note: PRELIM },
  '/diseases/flu/stats/death.html': { program: 'influenza mortality surveillance', pathogens: FLU, metrics: ['deaths'], note: PRELIM, pendingSensitive: true },
  '/diseases/respiratory/stats/setting.html': { program: 'outbreak reports', pathogens: ['influenza', 'rsv', 'covid', 'respiratory-combined'], metrics: ['outbreaks'], note: PRELIM },
  '/diseases/respiratory/stats/tsys.html': { program: 'syndromic surveillance', pathogens: RESP3, metrics: ['ed_visit_pct'], note: PRELIM },
  '/diseases/wastewater/stats/index.html': { program: 'wastewater monitoring', pathogens: WW, metrics: ['wastewater_conc'], combine: 'mean', note: 'Viral RNA in wastewater normalized to PMMoV (MDH).' },
  '/diseases/flu/stats/index.html': { program: 'influenza surveillance', pathogens: FLU, metrics: ['test_positivity', 'hosp_admissions', 'hosp_rate', 'ili_pct'], note: PRELIM },
  '/diseases/respiratory/stats/index.html': { program: 'respiratory surveillance', pathogens: RESP3, metrics: ['test_positivity', 'hosp_rate', 'ed_visit_pct'], note: PRELIM },
}

/** First spec whose pattern matches the link label or text, else its heading. */
export function matchSpec(link: Pick<PageLink, 'label' | 'text' | 'heading'>): LinkSpec | undefined {
  return (
    LINK_SPECS.find((s) => s.match.test(link.label) || s.match.test(link.text)) ??
    (link.heading ? LINK_SPECS.find((s) => s.match.test(link.heading)) : undefined)
  )
}

const DATASET_BY_METRIC: Record<MetricKind, string> = {
  test_positivity: 'mdh-lab',
  detection_rate: 'mdh-lab',
  hosp_admissions: 'mdh-hosp',
  hosp_rate: 'mdh-hosp',
  ili_pct: 'mdh-ili',
  outbreaks: 'mdh-outbreaks',
  deaths: 'mdh-deaths',
  wastewater_conc: 'mdh-wastewater',
  wastewater_level: 'mdh-wastewater',
  ww_detections: 'mdh-wastewater',
  ed_visit_pct: 'mdh-syndromic',
  cases: 'mdh-other',
  cases_ytd: 'mdh-other',
  rt: 'mdh-other',
}

export const DATASETS = [
  'mdh-lab', 'mdh-hosp', 'mdh-respnet-county', 'mdh-ili', 'mdh-outbreaks', 'mdh-wastewater', 'mdh-deaths', 'mdh-syndromic', 'mdh-other',
]

const NAMES: Partial<Record<PathogenId, string>> = {
  influenza: 'Flu', 'influenza-a': 'Flu A', 'influenza-b': 'Flu B', rsv: 'RSV', covid: 'COVID-19', hmpv: 'hMPV',
  'rhino-entero': 'Rhinovirus/enterovirus', adenovirus: 'Adenovirus', parainfluenza: 'Parainfluenza',
  'seasonal-cov': 'Seasonal coronaviruses', mycoplasma: 'Mycoplasma pneumoniae', 'chlamydia-pneumoniae': 'Chlamydia pneumoniae',
  pertussis: 'Whooping cough', measles: 'Measles', ili: 'Influenza-like illness', 'respiratory-combined': 'Respiratory viruses combined',
}

const METRIC_LABEL: Partial<Record<MetricKind, string>> = {
  test_positivity: '% of lab tests positive',
  hosp_rate: 'hospitalizations per 100,000 residents',
  hosp_admissions: 'hospitalizations per week',
  ili_pct: '% of outpatient visits for influenza-like illness',
  outbreaks: 'outbreaks reported per week',
  deaths: 'deaths per week',
  wastewater_conc: 'wastewater concentration (PMMoV-normalized)',
  ed_visit_pct: '% of emergency department visits',
  cases: 'reported cases',
  cases_ytd: 'cases reported so far this year',
}

function seriesLabel(spec: LinkSpec, n: NormalizedSeries): string {
  const name = n.pathogen === 'respiratory-combined' && spec.combinedName ? spec.combinedName : (NAMES[n.pathogen] ?? n.pathogen)
  const v = n.variant === 'avg' ? ', smoothed' : n.variant === 'unweighted' ? ', unweighted' : ''
  return `${name} — ${METRIC_LABEL[n.metric] ?? n.metric}${v} (MDH ${spec.program})`
}

// ───────────────────────── Fetching ─────────────────────────

function errMsg(e: unknown): string {
  if (e instanceof HttpError) return `HTTP ${e.status}`
  if (e instanceof Error) {
    const cause = (e as Error & { cause?: unknown }).cause
    const c = cause instanceof Error ? cause.message : cause ? String(cause) : ''
    return (c ? `${e.message} (${c})` : e.message).slice(0, 200)
  }
  return String(e).slice(0, 200)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

class MdhFetcher {
  /** Consecutive failures per host; a host is skipped for the rest of the run after 3. */
  private failures = new Map<string, number>()
  readonly attempts: { url: string; result: string }[] = []

  async get(url: string, timeoutMs: number): Promise<{ buf: ArrayBuffer; url: string }> {
    const u = new URL(url)
    const hosts = MDH_HOSTS.includes(u.hostname) ? [u.hostname, ...MDH_HOSTS.filter((h) => h !== u.hostname)] : [u.hostname]
    const errs: string[] = []
    for (const host of hosts) {
      if ((this.failures.get(host) ?? 0) >= 4) {
        errs.push(`${host}: skipped (unreachable earlier in this run)`)
        continue
      }
      const target = new URL(url)
      target.hostname = host
      try {
        const buf = await fetchBuffer(target.toString(), { timeoutMs, retries: 1 })
        this.failures.set(host, 0)
        this.attempts.push({ url: target.toString(), result: `ok ${buf.byteLength}B` })
        return { buf, url: target.toString() }
      } catch (e) {
        errs.push(`${host}: ${errMsg(e)}`)
        this.attempts.push({ url: target.toString(), result: errMsg(e) })
        if (!(e instanceof HttpError && e.status === 404)) this.failures.set(host, (this.failures.get(host) ?? 0) + 1)
      }
    }
    throw new Error(errs.join('; '))
  }
}

// ───────────────────────── Assembly ─────────────────────────

interface Built {
  series: Series
  family?: string
  priority: number
  file: string
}

const lastDateOf = (s: Series) => {
  for (let i = s.points.length - 1; i >= 0; i--) if (s.points[i][1] != null) return s.points[i][0]
  return ''
}

const cut = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 3)}...` : s)
const basename = (u: string) => {
  try {
    return decodeURIComponent(new URL(u).pathname.split('/').pop() ?? u)
  } catch {
    return u
  }
}

export function buildSeries(
  n: NormalizedSeries,
  spec: LinkSpec,
  ctx: { file: string; updated?: string; pending: boolean },
): Series {
  const metric = n.metric
  const dataset =
    spec.dataset && !(spec.dataset === 'mdh-respnet-county' && n.geo.type !== 'county')
      ? spec.dataset
      : n.geo.type === 'county' && metric === 'hosp_rate'
        ? 'mdh-respnet-county'
        : DATASET_BY_METRIC[metric]
  const variant = [spec.variant, n.variant].filter(Boolean).join('-') || undefined
  const notes = [spec.note]
  if (n.computed) notes.push(`Percent positive computed as ${n.computed}.`)
  const s = makeSeries({
    source: SOURCE,
    dataset,
    pathogen: n.pathogen,
    metric,
    geo: n.geo,
    label: seriesLabel(spec, n),
    points: n.points,
    note: notes.filter(Boolean).join(' '),
    variant,
    provisionalFrom: ctx.pending && spec.pendingSensitive && n.points.length ? n.points[n.points.length - 1][0] : undefined,
  })
  const attrs: Record<string, string> = { ...(n.attrs ?? {}), mdhFile: ctx.file }
  if (ctx.updated) attrs.mdhUpdated = ctx.updated
  s.attrs = attrs
  if (n.official) s.official = { ...n.official, by: `MDH ${spec.program}` }
  return s
}

interface FileDiag {
  url: string
  page: string
  label: string
  heading?: string
  ext: string
  spec: string | null
  status: 'parsed' | 'unparsed' | 'skipped' | 'recorded' | 'error'
  reason?: string
  fetchedFrom?: string
  bytes?: number
  headerRow?: number
  header?: string[]
  sample?: string[][]
  rows?: number
  parse?: Omit<NormalizeDiag, 'valueColumns'> & { valueColumns: NormalizeDiag['valueColumns'] }
  seriesIds?: string[]
}

function ytdSeries(
  pathogen: PathogenId,
  year: number,
  total: number,
  asOf: string,
  attrs: Record<string, string>,
  what: string,
): Series {
  const s = makeSeries({
    source: SOURCE,
    dataset: 'mdh-other',
    pathogen,
    metric: 'cases',
    geo: STATE_GEO,
    label: `${NAMES[pathogen] ?? pathogen} — cases reported in ${year} so far (MDH)`,
    points: [[weekEndingSaturday(asOf), total]],
    note: `Year-to-date ${what} reported to MDH in ${year}, as of ${asOf}. This is a cumulative count, not weekly cases.`,
    variant: 'ytd',
  })
  s.attrs = { ...attrs, asOf, year: String(year), cumulative: 'year-to-date' }
  return s
}

async function writeDiagnostics(ctx: SourceContext, diagnostics: Record<string, unknown>, log: SourceContext['log']) {
  const json = JSON.stringify(diagnostics, null, 1)
  try {
    await mkdir(ctx.cacheDir, { recursive: true })
    await writeFile(path.join(ctx.cacheDir, 'mdh-diagnostics.json'), json)
  } catch (e) {
    log.warn(`could not write cache diagnostics: ${errMsg(e)}`)
  }
  // The orchestrator only writes diagnostics for sources that return data; in CI keep them even when
  // nothing parsed, because they are how the parsers get refined.
  if (process.env.GITHUB_ACTIONS) {
    try {
      const dir = path.join(ctx.rootDir, 'public', 'data', 'diagnostics')
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, 'mdh.json'), JSON.stringify(diagnostics) + '\n')
    } catch (e) {
      log.warn(`could not write public diagnostics: ${errMsg(e)}`)
    }
  }
}

// ───────────────────────── Module ─────────────────────────

export const mdh: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'Minnesota Department of Health',
    publisher: 'Minnesota Department of Health (MDH)',
    url: 'https://www.health.state.mn.us/diseases/respiratory/stats/index.html',
    description:
      "MDH's weekly respiratory surveillance, read from the CSV files on its statistics pages: share of lab tests positive for flu, RSV and other respiratory viruses (Minnesota Laboratory System), flu hospitalizations, RESP-NET hospitalization rates statewide and by county, outpatient visits for influenza-like illness, K-12 school and long-term care outbreaks, and wastewater levels by region and treatment plant. Also year-to-date pertussis (whooping cough) and measles counts. These are reported and lab-confirmed cases only, so they undercount people who never see a doctor or get tested. Recent weeks are preliminary and are often revised upward.",
    geography: 'Minnesota statewide; MDH regions; counties (RESP-NET); wastewater treatment plants',
    cadence: 'Weekly (Thursdays 11 a.m. CT, data through the previous Saturday); pertussis and measles as updated',
    attribution: 'Minnesota Department of Health',
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const log = ctx.log
    const t0 = Date.now()
    const fetcher = new MdhFetcher()
    const errors: string[] = []
    const maxDate = weekEndingSaturday(ctx.now.slice(0, 10))
    const normOpts = { historyStart: ctx.historyStart, maxDate, rootDir: ctx.rootDir }

    // 1) Pages.
    const pertussis = pertussisPages(ctx.now)
    const pageList = [
      ...DATA_PAGES.map((p) => ({ path: p, kind: 'data' as const, year: 0 })),
      ...pertussis.map((p) => ({ path: p.path, kind: 'pertussis' as const, year: p.year })),
      { path: MEASLES_PAGE, kind: 'measles' as const, year: Number(ctx.now.slice(0, 4)) },
    ]
    const pages = await mapLimit(pageList, 4, async (pg) => {
      const url = `https://${MDH_HOSTS[0]}${pg.path}`
      try {
        const { buf, url: got } = await fetcher.get(url, 45_000)
        const html = decodeText(buf)
        const info = parsePage(html, got)
        return { ...pg, url: got, info, bytes: buf.byteLength, error: undefined as string | undefined }
      } catch (e) {
        return { ...pg, url, info: undefined as PageInfo | undefined, bytes: 0, error: errMsg(e) }
      }
    })
    const pagesOk = pages.filter((p) => p.info)
    for (const p of pages) if (p.error) log.warn(`page ${p.path}: ${p.error}`)
    log.info(`pages: ${pagesOk.length}/${pages.length} fetched`)

    // 2) Links (dedupe by URL; prefer an occurrence whose text matches a spec, then non-index pages).
    type Occ = { link: PageLink; page: (typeof pages)[number]; spec?: LinkSpec; order: number }
    const occs: Occ[] = []
    pages.forEach((p, order) => {
      if (p.kind !== 'data' || !p.info) return
      for (const link of p.info.links) occs.push({ link, page: p, spec: matchSpec(link), order })
    })
    const byUrl = new Map<string, Occ>()
    const rank = (o: Occ) => (o.spec ? 0 : 2) + (/\/index\.html$/.test(o.page.path) ? 1 : 0)
    for (const o of occs) {
      const k = new URL(o.link.url).pathname.toLowerCase()
      const prev = byUrl.get(k)
      if (!prev || rank(o) < rank(prev) || (rank(o) === rank(prev) && o.order < prev.order)) byUrl.set(k, o)
    }
    const links = [...byUrl.values()]

    // 3) Files.
    const built = new Map<string, Built>()
    const collisions: string[] = []
    const add = (b: Built) => {
      const id = b.series.id
      const prev = built.get(id)
      if (!prev) {
        built.set(id, b)
        return
      }
      if (prev.family && prev.family === b.family) {
        const [lo, hi] = prev.priority <= b.priority ? [prev, b] : [b, prev]
        const m = new Map<string, number | null>(lo.series.points)
        for (const [d, v] of hi.series.points) m.set(d, v)
        hi.series.points = [...m].sort(([a], [c]) => (a < c ? -1 : 1)) as Point[]
        built.set(id, hi)
        return
      }
      const la = lastDateOf(prev.series)
      const lb = lastDateOf(b.series)
      const keepNew = lb > la || (lb === la && b.series.points.length > prev.series.points.length)
      collisions.push(`${id}: kept ${keepNew ? b.file : prev.file}, dropped ${keepNew ? prev.file : b.file}`)
      if (keepNew) built.set(id, b)
    }
    const specsWithSeries = new Set<string>()

    const fileDiags = await mapLimit(links, 4, async (o): Promise<FileDiag> => {
      const isArchive = ARCHIVE_PAGES.has(o.page.path)
      const fallback = PAGE_DEFAULTS[o.page.path]
      const spec: LinkSpec | undefined =
        o.spec ?? (fallback && !isArchive ? { key: `generic:${o.page.path}`, match: /$^/, ...fallback } : undefined)
      const fd: FileDiag = {
        url: o.link.url,
        page: o.page.path,
        label: cut(o.link.label, 120),
        heading: o.link.heading ? cut(o.link.heading, 120) : undefined,
        ext: o.link.ext,
        spec: spec?.key ?? null,
        status: 'recorded',
      }
      if (o.link.ext !== 'csv') {
        fd.reason = `${o.link.ext.toUpperCase()} recorded only`
        return fd
      }
      if (!spec) {
        fd.reason = isArchive ? 'archive file with no matching spec' : 'no spec for this page'
        return fd
      }
      try {
        const { buf, url } = await fetcher.get(o.link.url, 90_000)
        fd.fetchedFrom = url !== o.link.url ? url : undefined
        fd.bytes = buf.byteLength
        const grid = csvToGrid(decodeText(buf))
        fd.headerRow = grid.headerRow || undefined
        fd.header = grid.header.slice(0, 60).map((h) => cut(h, 60))
        fd.sample = grid.rows.slice(0, 3).map((r) => r.slice(0, 60).map((c) => cut(c, 40)))
        fd.rows = grid.rows.length
        if (spec.skip) {
          fd.status = 'skipped'
          fd.reason = spec.skip
          return fd
        }
        const { series, diag } = normalizeTable(grid.header, grid.rows, spec, { ...normOpts, officialBy: `MDH ${spec.program}` })
        fd.parse = diag
        const file = basename(url)
        const ids: string[] = []
        for (const n of series) {
          const s = buildSeries(n, spec, { file, updated: o.page.info?.updated, pending: !!o.page.info?.pendingNotice })
          add({ series: s, family: spec.family, priority: isArchive ? 0 : 1, file })
          ids.push(s.id)
        }
        if (ids.length) specsWithSeries.add(spec.key)
        fd.seriesIds = ids.slice(0, 12)
        fd.status = ids.length ? 'parsed' : 'unparsed'
        if (!ids.length) fd.reason = diag.unparsed.join('; ').slice(0, 400) || 'no series'
        if (diag.unparsed.length) log.warn(`${file} (${spec.key}): ${diag.unparsed.join('; ').slice(0, 300)}`)
        return fd
      } catch (e) {
        fd.status = 'error'
        fd.reason = errMsg(e)
        errors.push(`${basename(o.link.url)}: ${fd.reason}`)
        return fd
      }
    })

    // 4) HTML data tables as a fallback for specs whose CSV did not parse.
    const tableDiags: Record<string, unknown>[] = []
    for (const p of pagesOk) {
      if (p.kind !== 'data') continue
      for (const t of p.info!.tables) {
        if (t.rows.length < 4) continue
        const spec = LINK_SPECS.find((s) => !s.skip && (s.match.test(t.caption) || (!t.caption && s.match.test(t.heading))))
        if (!spec || specsWithSeries.has(spec.key)) continue
        const { series, diag } = normalizeTable(t.headers, t.rows, spec, { ...normOpts, officialBy: `MDH ${spec.program}` })
        const file = `${p.path.split('/').pop()}#table`
        for (const n of series) {
          add({
            series: buildSeries(n, spec, { file, updated: p.info!.updated, pending: p.info!.pendingNotice }),
            family: spec.family,
            priority: ARCHIVE_PAGES.has(p.path) ? 0 : 1,
            file,
          })
        }
        if (series.length) specsWithSeries.add(spec.key)
        tableDiags.push({ page: p.path, spec: spec.key, caption: t.caption || t.heading, series: series.length, unparsed: diag.unparsed })
      }
    }

    // 5) Watch-list pages: pertussis and measles year-to-date counts.
    const other: Series[] = []
    const watch: Record<string, unknown> = {}
    const pertPage = pages.find((p) => p.kind === 'pertussis' && p.info && p.year === pertussis[0].year) ??
      pages.find((p) => p.kind === 'pertussis' && p.info)
    if (pertPage?.info) {
      try {
        const pp = parsePertussisPage(pertPage.info, pertPage.year)
        watch.pertussis = { page: pertPage.path, updated: pertPage.info.updated, ...pp, counties: pp.counties.slice(0, 15) }
        if (pp.total != null && pp.asOf) {
          const top = pp.counties.slice(0, 8).map((c) => `${c.name} ${c.cases}`).join(', ')
          other.push(
            ytdSeries('pertussis', pp.year, pp.total, pp.asOf, {
              ...(top ? { topCounties: top } : {}),
              countiesWithCases: String(pp.counties.filter((c) => c.cases > 0).length),
              totalBasis: pp.totalBasis ?? '',
              mdhFile: pertPage.path.split('/').pop()!,
            }, 'confirmed and probable pertussis cases'),
          )
        } else errors.push(`pertussis: ${pp.problem ?? 'no total or as-of date'}`)
      } catch (e) {
        errors.push(`pertussis: ${errMsg(e)}`)
      }
    } else watch.pertussis = { error: pages.filter((p) => p.kind === 'pertussis').map((p) => `${p.path}: ${p.error}`) }
    const measPage = pages.find((p) => p.kind === 'measles')
    if (measPage?.info) {
      try {
        const mp = parseMeaslesPage(measPage.info, measPage.year)
        watch.measles = { page: measPage.path, updated: measPage.info.updated, ...mp, tables: measPage.info.tables.slice(0, 4).map((t) => compactTable(t)) }
        if (mp.cases != null && mp.asOf) {
          other.push(ytdSeries('measles', mp.year, mp.cases, mp.asOf, { basis: cut(mp.basis ?? '', 120), mdhFile: 'stats.html' }, 'confirmed measles cases'))
        } else errors.push(`measles: ${mp.problem ?? 'no as-of date'}`)
      } catch (e) {
        errors.push(`measles: ${errMsg(e)}`)
      }
    } else watch.measles = { error: measPage?.error }
    for (const s of other) add({ series: s, priority: 1, file: s.attrs?.mdhFile ?? '' })

    // 6) Datasets.
    const all = [...built.values()].map((b) => b.series)
    const byDataset = new Map<string, Series[]>(DATASETS.map((d) => [d, []]))
    for (const s of all) {
      if (!byDataset.has(s.dataset)) byDataset.set(s.dataset, [])
      byDataset.get(s.dataset)!.push(s)
    }
    for (const list of byDataset.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1))

    // 7) Diagnostics + message.
    const csv = fileDiags.filter((f) => f.ext === 'csv')
    const count = (st: FileDiag['status']) => csv.filter((f) => f.status === st).length
    const latestByDataset = Object.fromEntries([...byDataset].map(([d, ss]) => [d, { series: ss.length, latest: latestDate(ss) ?? null }]))
    const summary = {
      pagesFetched: pagesOk.length,
      pagesTotal: pages.length,
      hostsUsed: [...new Set(pagesOk.map((p) => new URL(p.url).hostname))],
      csvFound: csv.length,
      csvParsed: count('parsed'),
      csvUnparsed: count('unparsed'),
      csvSkipped: count('skipped'),
      csvErrors: count('error'),
      csvNoSpec: count('recorded'),
      pdf: fileDiags.filter((f) => f.ext === 'pdf').length,
      xlsx: fileDiags.filter((f) => f.ext === 'xlsx' || f.ext === 'xls').length,
      series: all.length,
      latest: latestDate(all) ?? null,
      seconds: Math.round((Date.now() - t0) / 100) / 10,
    }
    const diagnostics: Record<string, unknown> = {
      source: SOURCE,
      generatedAt: ctx.now,
      via: 'live',
      summary,
      datasets: latestByDataset,
      pages: pages.map((p) => ({
        path: p.path,
        url: p.url,
        status: p.info ? 'ok' : 'error',
        error: p.error,
        bytes: p.bytes || undefined,
        title: p.info?.title ? cut(p.info.title, 100) : undefined,
        updated: p.info?.updated,
        updatedText: p.info?.updatedText,
        pendingNotice: p.info?.pendingNotice || undefined,
        links: p.info?.links.length,
        tables: p.info?.tables.slice(0, 8).map((t) => compactTable(t)),
        keyStats: p.info?.keyStats.slice(0, 15),
        statements: p.info?.statements.slice(0, 10),
      })),
      files: fileDiags,
      htmlTables: tableDiags,
      watch,
      collisions: collisions.slice(0, 30),
      errors: errors.slice(0, 30),
      fetchAttempts: pagesOk.length ? undefined : fetcher.attempts.slice(0, 20),
    }
    await writeDiagnostics(ctx, diagnostics, log)

    let message: string
    if (!pagesOk.length) {
      const sample = pages.find((p) => p.error)?.error ?? 'unknown error'
      message = `MDH pages unreachable (${pages.length} tried on ${MDH_HOSTS.join(', ')}): ${sample}`
    } else {
      message =
        `${pagesOk.length}/${pages.length} MDH pages fetched; ${summary.csvFound} CSV links found, ${summary.csvParsed} parsed into ${all.length - other.length} series` +
        (summary.csvUnparsed ? `, ${summary.csvUnparsed} not yet parseable` : '') +
        (summary.csvSkipped ? `, ${summary.csvSkipped} skipped by design` : '') +
        (summary.csvErrors ? `, ${summary.csvErrors} failed to download` : '') +
        (summary.pdf || summary.xlsx ? `; ${summary.pdf} PDF / ${summary.xlsx} XLSX recorded` : '') +
        `; watch list: ${other.map((s) => s.pathogen).join(', ') || 'none'}.`
      if (errors.length) message += ` Problems: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}.`
    }
    log.info(message)
    return {
      datasets: [...byDataset].map(([dataset, series]) => ({ source: SOURCE, dataset, series })),
      message,
      diagnostics,
    }
  },
}
