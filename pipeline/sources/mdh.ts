// Minnesota Department of Health (MDH) — weekly respiratory surveillance pages and watch-list pages.
//
// MDH publishes its weekly flu / viral respiratory / wastewater statistics as HTML pages with
// "Downloadable data (CSV)" links. The CSV layouts are not documented, so this module:
//   1. crawls the statistics pages (www.health.state.mn.us, falling back to MDH's other host names),
//      extracting every .csv/.xlsx/.pdf link with its link text and nearest heading, the page's
//      "Updated M/D/YYYY" date, data tables and key-statistic text;
//   2. maps each CSV to a dataset by its link text (LINK_SPECS, from MDH's published link titles),
//      falling back to a page-level generic spec;
//   3. parses each file with a defensive normalizer (pipeline/lib/mdh-normalize.ts) that emits a series
//      only when the pathogen, measure, week and place are unambiguous;
//   4. reads pertussis year-to-date counts (statewide and by county) and measles year-to-date counts
//      from their HTML tables;
//   5. returns full diagnostics (header, first rows, row counts, why a column was or was not mapped)
//      so parsing can be refined after each CI run.
// The specs below were checked against the real file layouts seen in the first CI run (2026-10-07,
// public/data/diagnostics/mdh.json). Nothing is synthesized: blank cells are omitted, suppressed cells
// ("<5", "*") are kept as null, and every value comes from an MDH file.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MetricKind, PathogenId, Point, Series, SeriesFile } from '../../shared/types.ts'
import { addDays, weekEndingSaturday } from '../../shared/mmwr.ts'
import { HttpError, fetchBuffer } from '../lib/http.ts'
import { latestDate, makeSeries, STATE_GEO } from '../lib/series.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'
import { compactTable, parsePage, type PageInfo, type PageLink } from '../lib/mdh-crawl.ts'
import { countiesCentroid, countyList } from '../lib/mdh-geo.ts'
import { csvToGrid, decodeText, normalizeTable, type NormalizeDiag, type NormalizedSeries, type NormalizeSpec } from '../lib/mdh-normalize.ts'
import { parseMeaslesPage, parsePertussisPage } from '../lib/mdh-watch.ts'

const SOURCE = 'mdh'
/** MDH serves the same site under several host names; the first is canonical. */
export const MDH_HOSTS = ['www.health.state.mn.us', 'www.health.mn.gov', 'www2cdn.web.health.state.mn.us', 'www.web.health.state.mn.us']
/** Stop starting downloads after this, so results and diagnostics return before the 8-minute module timeout. */
const RUN_BUDGET_MS = 6.5 * 60_000
/** A host is skipped for the rest of the run after this many consecutive failures. */
const HOST_FAILURE_LIMIT = 3

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
  /** Dataset id (stable). One dataset per surveillance program, so different programs never share ids. */
  dataset?: string
  /** Per-metric dataset for page-level specs that may see files from more than one program. */
  datasetByMetric?: Partial<Record<MetricKind, string>>
  /** Surveillance program, used in labels ("MDH RESP-NET"). */
  program: string
  /** Plain-language caveat stored as series.note. */
  note: string
  /** Shorter note for county series (keeps 87-county files compact). */
  countyNote?: string
  /** Appended to series ids (e.g. outbreak setting). */
  variant?: string
  /** Series from specs in the same family merge; on overlapping weeks the primary/current file wins. */
  family?: string
  /** This spec's file wins overlapping weeks within its family. */
  familyPrimary?: boolean
  /** Prior-season version of another spec (chosen by page path or a past year range in the link text). */
  archiveOf?: string
  /** Display name used for 'respiratory-combined' series from this file. */
  combinedName?: string
  /** Hospitalization/death files: mark recent weeks provisional when the page says data are pending. */
  pendingSensitive?: boolean
  /** Record the file but do not parse it (reason). */
  skip?: string
  /** Skip a file whose header shows a layout this spec cannot use (returns the reason). */
  headerSkip?: (header: string[]) => string | undefined
}

const FLU: PathogenId[] = ['influenza', 'influenza-a', 'influenza-b']
const RESP3: PathogenId[] = ['covid', 'influenza', 'rsv', 'respiratory-combined']
const MLS_PANEL: PathogenId[] = [
  'rhino-entero', 'hmpv', 'adenovirus', 'parainfluenza', 'seasonal-cov', 'covid', 'rsv', 'influenza', 'influenza-a', 'influenza-b',
  'mycoplasma', 'chlamydia-pneumoniae', 'pertussis',
]
const WW: PathogenId[] = ['covid', 'influenza', 'influenza-a', 'influenza-b', 'rsv', 'measles']

const PRELIM = 'MDH data are preliminary and recent weeks are often revised.'
const RESPNET_COUNTY_NOTE = 'Weekly lab-confirmed hospitalizations per 100,000 county residents (MDH RESP-NET); small counties can jump on one hospitalization.'
const hasHeader = (header: string[], re: RegExp) => header.some((h) => re.test(h.trim()))

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
    dataset: 'mdh-lab-mls',
    program: 'MLS other molecular testing',
    // Flu and RSV have dedicated all-lab positivity files; panel-subset values for them would be a
    // different measure under the same series id, so they are not taken from this file.
    pathogens: MLS_PANEL.filter((p) => !['influenza', 'influenza-a', 'influenza-b', 'rsv'].includes(p)),
    metrics: ['test_positivity'],
    note: `Share of molecular (PCR panel) tests positive, from the subset of Minnesota Laboratory System labs that report multiplex panel results. ${PRELIM}`,
    // Real layout (2026-10-07): per-county counts (MMP_TestTotal, MMP_hMPV, MMP_Rhinovirus, ...). The
    // "MMP" denominator mixes limited flu/COVID/RSV multiplex assays with full respiratory panels (e.g.
    // a county-week with 229 MMP tests and no non-flu/COVID/RSV detection), so pooled positivity for
    // rhinovirus, hMPV etc. would be diluted by an unknown amount. Not computed.
    headerSkip: (h) =>
      hasHeader(h, /^mmp_testtotal$/i)
        ? 'Per-county multiplex-panel counts; the panel test total mixes limited flu/COVID/RSV assays with full panels, so a percent positive for other viruses cannot be computed reliably.'
        : undefined,
  },
  // Influenza hospital surveillance (all MN hospitals, lab-confirmed)
  {
    key: 'flu-hosp-type',
    match: /hospitali[sz]ed influenza cases by type/i,
    program: 'influenza hospital surveillance',
    metrics: [],
    note: '',
    // Real layout: Season, MMWR Week, Type ("A (not subtyped)", "A H3", "A (H1N1) pdm09", "B (no genotype)", "Unknown"), Frequency.
    skip: 'Weekly hospitalizations split by influenza type/subtype; weekly totals come from "Hospitalized Influenza Cases by Season".',
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
    familyPrimary: true,
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
    family: 'flu-hosp-weekly',
    pendingSensitive: true,
    note: `Laboratory-confirmed influenza hospitalizations by MDH region of residence. ${PRELIM}`,
    // Real layout: Season, Region, Number of hospitalizations, Incidence rate (season totals, no weeks).
    headerSkip: (h) => (hasHeader(h, /week|date|mmwr/i) ? undefined : 'Season-to-date totals by region (no weekly breakdown).'),
  },
  { key: 'flu-hosp-age', match: /influenza hospitali[sz]ations and incidence by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  // Outpatient influenza-like illness (ILINet)
  { key: 'ili-age', match: /\(ili\) by age|ili by age|influenza[- ]like illness( \(ili\))? by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  {
    key: 'ili-region',
    match: /(\(ili\)|\bili|influenza[- ]like illness) by region/i,
    dataset: 'mdh-ili',
    program: 'ILINet outpatient surveillance',
    pathogens: ['ili'],
    defaultPathogen: 'ili',
    metrics: ['ili_pct'],
    bareMeans: 'ili_pct',
    family: 'ili',
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
    family: 'ili',
    familyPrimary: true,
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
    // Never matched by text: chosen for "RESP-NET by County" links on the archive page or with a past year range.
    match: /(?!)/,
    archiveOf: 'respnet-county',
    dataset: 'mdh-respnet-county',
    program: 'RESP-NET',
    pathogens: RESP3,
    metrics: ['hosp_rate'],
    bareMeans: 'hosp_rate',
    family: 'respnet-county',
    combinedName: 'COVID-19, flu and RSV',
    note: 'Weekly laboratory-confirmed hospitalizations per 100,000 Minnesotans (MDH RESP-NET).',
    countyNote: RESPNET_COUNTY_NOTE,
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
    note: `Weekly laboratory-confirmed hospitalizations per 100,000 Minnesotans (MDH RESP-NET). ${PRELIM}`,
    countyNote: RESPNET_COUNTY_NOTE,
  },
  { key: 'respnet-age', match: /resp-?net (data )?by age/i, program: '', metrics: [], note: '', skip: 'Age-stratified (not used).' },
  { key: 'respnet-race', match: /resp-?net (data )?by race/i, program: '', metrics: [], note: '', skip: 'Race/ethnicity-stratified (not used).' },
  {
    key: 'respnet-season',
    match: /respiratory virus[- ]associated hospitali[sz]ations|rates of respiratory virus|rates of covid-?19, influenza,? and rsv hospitali[sz]ations/i,
    dataset: 'mdh-respnet',
    program: 'RESP-NET',
    pathogens: RESP3,
    metrics: ['hosp_rate'],
    bareMeans: 'hosp_rate',
    family: 'respnet-state',
    familyPrimary: true,
    combinedName: 'COVID-19, flu and RSV',
    pendingSensitive: true,
    // RESP-NET covered only the 7-county metro before the 2023-24 season. The real file labels each row
    // ("7-co", "80-co", "statewide"); minDate only applies if a file has no geography column.
    minDate: '2023-10-01',
    note: `Weekly laboratory-confirmed hospitalizations per 100,000 people (MDH RESP-NET; statewide since the 2023-24 season, 7-county metro before). The combined rate counts a patient with more than one of these viruses under each. ${PRELIM}`,
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
    note: 'Acute respiratory illness outbreaks newly reported by K-12 schools (10% of students absent with respiratory symptoms on one day). MDH lists only weeks with reports; reported during the school year only.',
  },
  {
    key: 'ltc-covid-cases',
    match: /(long[- ]term|congregate) care.*covid|covid.*(long[- ]term|congregate) care|long[- ]term\/congregate care data|resident cases associated with/i,
    program: '',
    metrics: [],
    note: '',
    skip: 'Resident/staff COVID-19 case counts in long-term care (not mapped).',
  },
  {
    key: 'ltc-outbreaks',
    match: /outbreaks in long[- ]term care|long[- ]term care facilit.*outbreak/i,
    dataset: 'mdh-outbreaks',
    program: 'long-term care outbreak reports',
    pathogens: ['influenza', 'rsv', 'covid'],
    metrics: ['outbreaks'],
    bareMeans: 'outbreaks',
    variant: 'ltc',
    note: 'Influenza and RSV outbreaks newly reported by long-term care facilities (nursing homes and assisted living). MDH lists only weeks with reports; outbreaks reported as both influenza and RSV are not counted in either series.',
  },
  // Syndromic surveillance. Real files (UTF-16): "Week of Visit Admit Datetime", "COVID-19 Diagnosis (%)",
  // "Cough (%)", "Influenza-like illness (%)", "Shortness of Breath (%)", and by "Epi Field Staff Regions".
  {
    key: 'syndromic-region',
    match: /syndromic surveillance (data )?by region/i,
    program: 'syndromic surveillance',
    metrics: [],
    note: '',
    skip: 'Percent of hospital ADT visits (emergency and inpatient) with a diagnosis or symptom; not the same denominator as % of ED visits, so not mapped.',
  },
  {
    key: 'syndromic',
    match: /syndromic surveillance/i,
    program: 'syndromic surveillance',
    metrics: [],
    note: '',
    skip: 'Percent of hospital ADT visits (emergency and inpatient) with a diagnosis or symptom; not the same denominator as % of ED visits, so not mapped.',
  },
  // Wastewater. Real regions are MDH's Field Services districts (South district labelled "Southwest").
  // The detection-map file is not parsed into series, but its plant -> county list places the plants.
  { key: 'ww-detection', match: /detection map/i, program: '', metrics: [], note: '', skip: 'Per-site detection status (presence/absence), not a concentration; used only for each plant\'s county.' },
  {
    key: 'ww-regional',
    match: /regional wastewater|wastewater concentrations by region/i,
    dataset: 'mdh-wastewater',
    program: 'wastewater monitoring',
    pathogens: WW,
    metrics: ['wastewater_conc'],
    bareMeans: 'wastewater_conc',
    combine: 'mean',
    wastewater: true,
    family: 'ww-state',
    familyPrimary: true,
    // Checked on the 2026-10-07 file: each region's weekly value matches the population-weighted average
    // of that week's plant values, i.e. the download is weekly (MDH's charts may smooth it).
    note: 'Viral RNA in wastewater normalized to PMMoV (a marker of human waste): weekly average of the plants in the region, weighted by population served (MDH). Units are relative, so compare a place with its own history.',
  },
  {
    key: 'ww-site',
    match: /treatment plant site data|wastewater treatment plant|plant site data|wastewater concentrations by site/i,
    dataset: 'mdh-wastewater',
    program: 'wastewater monitoring',
    pathogens: WW,
    metrics: ['wastewater_conc'],
    bareMeans: 'wastewater_conc',
    combine: 'mean',
    allowSites: true,
    wastewater: true,
    note: 'Viral RNA in wastewater at this treatment plant, normalized to PMMoV; MDH averages the samples in each week. Units are relative, so compare a plant with its own history.',
  },
  {
    key: 'ww-hosp',
    match: /wastewater compared to hospitali[sz]ation|wastewater values compared to hospitali[sz]ation/i,
    dataset: 'mdh-wastewater',
    program: 'wastewater monitoring',
    pathogens: ['covid'],
    defaultPathogen: 'covid',
    metrics: ['wastewater_conc'],
    combine: 'mean',
    wastewater: true,
    family: 'ww-state',
    note: 'Statewide SARS-CoV-2 in wastewater normalized to PMMoV, weighted by population served (MDH).',
  },
]

/** Page-level fallback specs: only columns whose headers name both pathogen and measure are used. */
const PAGE_DEFAULTS: Record<string, Omit<LinkSpec, 'key' | 'match'>> = {
  '/diseases/flu/stats/lab.html': { dataset: 'mdh-lab', program: 'MLS lab survey', pathogens: FLU, metrics: ['test_positivity'], note: PRELIM },
  '/diseases/respiratory/stats/lab.html': { dataset: 'mdh-lab-mls', program: 'MLS lab survey', pathogens: MLS_PANEL, metrics: ['test_positivity'], note: PRELIM },
  '/diseases/flu/stats/hosp.html': { dataset: 'mdh-hosp', program: 'influenza hospital surveillance', pathogens: FLU, metrics: ['hosp_admissions', 'hosp_rate'], note: PRELIM, pendingSensitive: true, family: 'flu-hosp-weekly' },
  '/diseases/respiratory/stats/hosp.html': { dataset: 'mdh-respnet', program: 'RESP-NET', pathogens: RESP3, metrics: ['hosp_rate'], minDate: '2023-10-01', note: PRELIM, pendingSensitive: true, family: 'respnet-state' },
  '/diseases/flu/stats/out.html': { dataset: 'mdh-ili', program: 'ILINet outpatient surveillance', pathogens: ['ili'], metrics: ['ili_pct'], note: PRELIM, family: 'ili' },
  '/diseases/flu/stats/death.html': { dataset: 'mdh-deaths', program: 'influenza mortality surveillance', pathogens: FLU, metrics: ['deaths'], note: PRELIM, pendingSensitive: true },
  '/diseases/respiratory/stats/setting.html': { dataset: 'mdh-outbreaks', program: 'outbreak reports', pathogens: ['influenza', 'rsv', 'covid', 'respiratory-combined'], metrics: ['outbreaks'], note: PRELIM },
  '/diseases/respiratory/stats/tsys.html': { program: 'syndromic surveillance', metrics: [], note: '', skip: 'Syndromic page file without a recognized title; not mapped (see the syndromic specs).' },
  '/diseases/wastewater/stats/index.html': { dataset: 'mdh-wastewater', program: 'wastewater monitoring', pathogens: WW, metrics: ['wastewater_conc'], combine: 'mean', wastewater: true, note: 'Viral RNA in wastewater (MDH).' },
  '/diseases/flu/stats/index.html': {
    program: 'influenza surveillance', pathogens: FLU, metrics: ['test_positivity', 'hosp_admissions', 'ili_pct'], note: PRELIM,
    datasetByMetric: { test_positivity: 'mdh-lab', hosp_admissions: 'mdh-hosp', ili_pct: 'mdh-ili' },
  },
  '/diseases/respiratory/stats/index.html': {
    program: 'respiratory surveillance', pathogens: RESP3, metrics: ['test_positivity', 'hosp_rate'], note: PRELIM,
    datasetByMetric: { test_positivity: 'mdh-lab', hosp_rate: 'mdh-respnet' },
  },
}

/** First spec whose pattern matches the link label or text, else its heading. */
export function matchSpec(link: Pick<PageLink, 'label' | 'text' | 'heading'>): LinkSpec | undefined {
  const textual = LINK_SPECS.filter((s) => !s.archiveOf)
  return (
    textual.find((s) => s.match.test(link.label) || s.match.test(link.text)) ??
    (link.heading ? textual.find((s) => s.match.test(link.heading)) : undefined)
  )
}

/** A link names a past season ("RESP-NET by County, 2023-2025") when its year range ends before `year`. */
export function isPastSeasonLink(text: string, year: number): boolean {
  const m = /\b(20\d\d)\s*[-–]\s*(20\d\d|\d\d)\b/.exec(text)
  if (!m) return false
  const end = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])
  return end < year
}

/** The spec for a link on a page: the text match, swapped for its archive version on archive pages/past seasons. */
export function specForLink(link: Pick<PageLink, 'label' | 'text' | 'heading'>, pagePath: string, year: number): { spec?: LinkSpec; archive: boolean } {
  const archive = ARCHIVE_PAGES.has(pagePath) || isPastSeasonLink(`${link.label} ${link.text}`, year)
  const spec = matchSpec(link)
  if (spec && archive) {
    const arch = LINK_SPECS.find((s) => s.archiveOf === spec.key)
    if (arch) return { spec: arch, archive }
  }
  return { spec, archive }
}

const DATASET_BY_METRIC: Record<MetricKind, string> = {
  test_positivity: 'mdh-lab',
  detection_rate: 'mdh-lab',
  hosp_admissions: 'mdh-hosp',
  hosp_rate: 'mdh-respnet',
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

/**
 * Datasets. MDH influenza hospital surveillance ('mdh-hosp') and RESP-NET ('mdh-respnet',
 * 'mdh-respnet-county') are different programs and never share a dataset.
 */
export const DATASETS = [
  'mdh-lab', 'mdh-lab-mls', 'mdh-hosp', 'mdh-respnet', 'mdh-respnet-county', 'mdh-ili', 'mdh-outbreaks', 'mdh-wastewater', 'mdh-deaths',
  'mdh-syndromic', 'mdh-other',
]

/** Dataset and merge family for one normalized series from a spec. */
export function placement(spec: LinkSpec, n: Pick<NormalizedSeries, 'metric' | 'geo'>): { dataset: string; family?: string } {
  // RESP-NET by County also carries statewide (and possibly regional) rows: those belong with the
  // statewide RESP-NET series, never with influenza hospital surveillance.
  if (spec.dataset === 'mdh-respnet-county' && n.geo.type !== 'county') return { dataset: 'mdh-respnet', family: 'respnet-state' }
  const dataset = spec.datasetByMetric?.[n.metric] ?? spec.dataset ?? DATASET_BY_METRIC[n.metric]
  return { dataset, family: spec.family }
}

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
  wastewater_conc: 'wastewater concentration',
  ed_visit_pct: '% of emergency department visits',
  cases: 'reported cases',
  cases_ytd: 'cases reported so far this year',
}

/** True when the value columns say the wastewater values are normalized (PMMoV). */
const isNormalized = (n: Pick<NormalizedSeries, 'columns'>) => n.columns.some((c) => /normali[sz]|pmmov/i.test(c))

function seriesLabel(spec: LinkSpec, n: NormalizedSeries): string {
  const name = n.pathogen === 'respiratory-combined' && spec.combinedName ? spec.combinedName : (NAMES[n.pathogen] ?? n.pathogen)
  const v = n.variant === 'avg' ? ', smoothed' : n.variant === 'unweighted' ? ', unweighted' : ''
  let what = METRIC_LABEL[n.metric] ?? n.metric
  if (n.metric === 'wastewater_conc') what += isNormalized(n) ? ' (PMMoV-normalized)' : ' (units as published)'
  return `${name} — ${what}${v} (MDH ${spec.program})`
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
  /** Consecutive failures per host; a host is skipped for the rest of the run after HOST_FAILURE_LIMIT. */
  private failures = new Map<string, number>()
  readonly attempts: { url: string; result: string }[] = []
  constructor(private readonly deadline: number) {}

  async get(url: string, timeoutMs: number): Promise<{ buf: ArrayBuffer; url: string }> {
    const u = new URL(url)
    const hosts = MDH_HOSTS.includes(u.hostname) ? [u.hostname, ...MDH_HOSTS.filter((h) => h !== u.hostname)] : [u.hostname]
    const errs: string[] = []
    for (const host of hosts) {
      const left = this.deadline - Date.now()
      if (left < 5_000) {
        errs.push('run time budget reached')
        break
      }
      if ((this.failures.get(host) ?? 0) >= HOST_FAILURE_LIMIT) {
        errs.push(`${host}: skipped (unreachable earlier in this run)`)
        continue
      }
      const target = new URL(url)
      target.hostname = host
      try {
        const buf = await fetchBuffer(target.toString(), { timeoutMs: Math.min(timeoutMs, left), retries: 1 })
        this.failures.set(host, 0)
        this.attempts.push({ url: target.toString(), result: `ok ${buf.byteLength}B` })
        return { buf, url: target.toString() }
      } catch (e) {
        errs.push(`${host}: ${errMsg(e)}`)
        this.attempts.push({ url: target.toString(), result: errMsg(e) })
        if (!(e instanceof HttpError && e.status === 404)) this.failures.set(host, (this.failures.get(host) ?? 0) + 1)
      }
    }
    // "HTTP 404" from every host reads better as one message.
    const distinct = [...new Set(errs.map((e) => e.replace(/^[^:]+: /, '')))]
    throw new Error(distinct.length === 1 && errs.length > 1 ? `${distinct[0]} (all ${errs.length} MDH hosts)` : errs.join('; '))
  }
}

// ───────────────────────── Assembly ─────────────────────────

interface Built {
  series: Series
  family?: string
  /** Higher wins overlapping weeks within a family: archive 0, current 10, family primary +1. */
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
const sameValue = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == b : Math.abs(a - b) <= Math.max(1e-9, 1e-3 * Math.max(Math.abs(a), Math.abs(b)))

/** Adds built series by id. Same-family series merge (higher priority wins overlapping weeks, conflicts logged). */
export class SeriesBook {
  readonly byId = new Map<string, Built>()
  readonly collisions: string[] = []

  add(b: Built): void {
    const id = b.series.id
    const prev = this.byId.get(id)
    if (!prev) {
      this.byId.set(id, b)
      return
    }
    if (prev.family && prev.family === b.family) {
      // Ties keep the earlier file (callers add files in a fixed order, so the result never depends on timing).
      const [lo, hi] = b.priority > prev.priority ? [prev, b] : [b, prev]
      const hiMap = new Map<string, number | null>(hi.series.points)
      let differ = 0
      let example = ''
      for (const [d, v] of lo.series.points) {
        if (!hiMap.has(d) || sameValue(hiMap.get(d), v)) continue
        differ++
        if (!example) example = `${d}: ${hiMap.get(d)} vs ${v}`
      }
      if (differ) this.collisions.push(`${id}: ${differ} overlapping week(s) differ; kept ${hi.file} over ${lo.file} (e.g. ${example})`)
      const m = new Map<string, number | null>(lo.series.points)
      for (const [d, v] of hi.series.points) m.set(d, v)
      const merged: Series = { ...hi.series, points: [...m].sort(([a], [c]) => (a < c ? -1 : 1)) as Point[] }
      const last = merged.points[merged.points.length - 1]?.[0]
      if (!merged.official && lo.series.official?.asOf === last) merged.official = lo.series.official
      if (lo.file !== hi.file) merged.attrs = { ...(merged.attrs ?? {}), mdhFile: `${hi.file} + ${lo.file}` }
      if (!hi.series.provisionalFrom && lo.series.provisionalFrom) merged.provisionalFrom = lo.series.provisionalFrom
      this.byId.set(id, { ...hi, series: merged })
      return
    }
    const la = lastDateOf(prev.series)
    const lb = lastDateOf(b.series)
    const keepNew = lb > la || (lb === la && b.series.points.length > prev.series.points.length)
    this.collisions.push(`${id}: kept ${keepNew ? b.file : prev.file}, dropped ${keepNew ? prev.file : b.file}`)
    if (keepNew) this.byId.set(id, b)
  }
}

export function buildSeries(
  n: NormalizedSeries,
  spec: LinkSpec,
  ctx: { file: string; updated?: string; pending: boolean },
): Series {
  const { dataset } = placement(spec, n)
  const variant = [spec.variant, n.variant].filter(Boolean).join('-') || undefined
  const notes = [n.geo.type === 'county' && spec.countyNote ? spec.countyNote : spec.note]
  if (n.metric === 'wastewater_conc' && !isNormalized(n)) {
    notes[0] = `Viral RNA in wastewater (MDH; column "${n.columns[0] ?? '?'}", normalization not stated). Compare a place with its own history.`
  }
  if (n.computed) notes.push(`Percent positive computed as ${n.computed}.`)
  // MDH marks the latest one to two weeks "data pending".
  const last = n.points[n.points.length - 1]?.[0]
  const first = n.points[0]?.[0]
  const provisionalFrom = ctx.pending && spec.pendingSensitive && last ? [addDays(last, -7), first].sort().pop() : undefined
  const s = makeSeries({
    source: SOURCE,
    dataset,
    pathogen: n.pathogen,
    metric: n.metric,
    geo: n.geo,
    label: seriesLabel(spec, n),
    points: n.points,
    note: notes.filter(Boolean).join(' '),
    variant,
    provisionalFrom,
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
  parse?: NormalizeDiag
  seriesIds?: string[]
}

/**
 * Statewide year-to-date count ('cases_ytd'): one point dated to MDH's as-of (report) date, as the
 * contract defines for this metric. The analysis gives it no level or trend.
 */
export function ytdSeries(pathogen: PathogenId, year: number, total: number, asOf: string, attrs: Record<string, string>, what: string): Series {
  const s = makeSeries({
    source: SOURCE,
    dataset: 'mdh-other',
    pathogen,
    metric: 'cases_ytd',
    geo: STATE_GEO,
    label: `${NAMES[pathogen] ?? pathogen} — cases reported in ${year} so far (MDH)`,
    points: [[asOf, total]],
    note: `${what[0].toUpperCase()}${what.slice(1)} reported to MDH in ${year}, as of ${asOf}. Cumulative for the year, not weekly cases.`,
  })
  s.attrs = { ...attrs, asOf, year: String(year) }
  return s
}

/** Pertussis year-to-date cases per county (one point each at MDH's as-of date; map layer). */
export function pertussisCountySeries(
  counties: { fips: string; name: string; cases: number }[],
  year: number,
  asOf: string,
  total: number | undefined,
  file: string,
): Series[] {
  return counties.map((c) => {
    const s = makeSeries({
      source: SOURCE,
      dataset: 'mdh-other',
      pathogen: 'pertussis',
      metric: 'cases_ytd',
      geo: { type: 'county', code: c.fips, name: `${c.name} County` },
      label: `Whooping cough — cases reported in ${year} so far (MDH)`,
      points: [[asOf, c.cases]],
      note: `Confirmed and probable pertussis cases reported to MDH in ${year} by county of residence, as of ${asOf}. Cumulative for the year, not weekly.`,
    })
    s.attrs = { asOf, year: String(year), mdhFile: file }
    if (total != null) s.summary = `${c.name} County: ${c.cases} of ${total} Minnesota cases so far in ${year} (as of ${asOf}).`
    return s
  })
}

/** Plant name key shared by the detection-map and site files ("Duluth (WLSSD) WWTP*" -> "duluth wlssd wwtp"). */
const plantKey = (s: string) => s.toLowerCase().replace(/[*]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/** Plant -> MDH-listed county (and population) from the wastewater detection-map file. */
export function plantLookup(header: string[], rows: string[][]): Map<string, { counties: string[]; population?: number }> {
  const h = header.map((x) => x.toLowerCase())
  const plant = h.findIndex((x) => /treatment plant|\bplant\b|\bsite\b|\bwwtp\b/.test(x))
  const county = h.findIndex((x) => /\bcount(y|ies)\b/.test(x))
  const pop = h.findIndex((x) => /population/.test(x))
  const out = new Map<string, { counties: string[]; population?: number }>()
  if (plant < 0 || county < 0) return out
  for (const r of rows) {
    const name = (r[plant] ?? '').trim()
    const fips = countyList(r[county] ?? '')
    if (!name || !fips.length) continue
    const p = pop >= 0 ? Number((r[pop] ?? '').replace(/,/g, '')) : NaN
    out.set(plantKey(name), { counties: fips, population: Number.isFinite(p) && p > 0 ? p : undefined })
  }
  return out
}

/** "Percent of molecular laboratory tests positive: 1.10%" from the flu pages' key statistics. */
export function fluPositivityKeyStat(stats: string[]): number | undefined {
  for (const k of stats) {
    const m = /percent of (?:molecular )?(?:laboratory |lab )?tests? (?:that were |were )?positive:?\s*([\d.]+)\s*%/i.exec(k)
    if (m) return Number(m[1])
  }
  return undefined
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

/** Previous published series of a dataset (for carrying forward series whose file failed this run). */
async function previousSeries(rootDir: string, dataset: string): Promise<Series[]> {
  try {
    const f = JSON.parse(await readFile(path.join(rootDir, 'public', 'data', 'series', `${SOURCE}__${dataset}.json`), 'utf8')) as SeriesFile
    return Array.isArray(f.series) ? f.series : []
  } catch {
    return []
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
      "MDH's weekly respiratory surveillance, read from the CSV files on its statistics pages: share of lab tests positive for flu and RSV (Minnesota Laboratory System), weekly flu hospitalizations and deaths, RESP-NET hospitalization rates statewide, for the Twin Cities metro and Greater Minnesota, and by county (with MDH's own low/moderate/high risk level), outpatient visits for influenza-like illness, K-12 school and long-term care outbreaks, and wastewater levels by region and treatment plant. Also pertussis (whooping cough) and measles cases reported so far this year (pertussis also by county). These are reported and lab-confirmed cases only, so they undercount people who never see a doctor or get tested. Recent weeks are preliminary and are often revised upward.",
    geography: 'Minnesota statewide; Twin Cities metro and Greater Minnesota; MDH districts; counties (RESP-NET, pertussis); wastewater treatment plants',
    cadence: 'Weekly (Thursdays 11 a.m. CT, data through the previous Saturday); pertussis and measles as updated',
    attribution: 'Minnesota Department of Health',
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const log = ctx.log
    const t0 = Date.now()
    const fetcher = new MdhFetcher(t0 + RUN_BUDGET_MS)
    const errors: string[] = []
    const year = Number(ctx.now.slice(0, 4))
    // Last completed MMWR week: a sample from the current, unfinished week is never a weekly value.
    const maxDate = addDays(weekEndingSaturday(ctx.now.slice(0, 10)), -7)
    const normOpts = { historyStart: ctx.historyStart, maxDate, rootDir: ctx.rootDir }
    const fetchedOk = new Set<string>()

    // 1) Pages.
    const pertussis = pertussisPages(ctx.now)
    const pageList = [
      ...DATA_PAGES.map((p) => ({ path: p, kind: 'data' as const, year: 0 })),
      ...pertussis.map((p) => ({ path: p.path, kind: 'pertussis' as const, year: p.year })),
      { path: MEASLES_PAGE, kind: 'measles' as const, year },
    ]
    const pages = await mapLimit(pageList, 4, async (pg) => {
      const url = `https://${MDH_HOSTS[0]}${pg.path}`
      try {
        const { buf, url: got } = await fetcher.get(url, 30_000)
        const html = decodeText(buf)
        const info = parsePage(html, got)
        fetchedOk.add(basename(got))
        return { ...pg, url: got, info, bytes: buf.byteLength, error: undefined as string | undefined }
      } catch (e) {
        return { ...pg, url, info: undefined as PageInfo | undefined, bytes: 0, error: errMsg(e) }
      }
    })
    const pagesOk = pages.filter((p) => p.info)
    for (const p of pages) if (p.error) log.warn(`page ${p.path}: ${p.error}`)
    log.info(`pages: ${pagesOk.length}/${pages.length} fetched`)

    // 2) Links (dedupe by URL; prefer an occurrence whose text matches a spec, then non-index pages).
    type Occ = { link: PageLink; page: (typeof pages)[number]; spec?: LinkSpec; archive: boolean; order: number }
    const occs: Occ[] = []
    pages.forEach((p, order) => {
      if (p.kind !== 'data' || !p.info) return
      for (const link of p.info.links) occs.push({ link, page: p, ...specForLink(link, p.path, year), order })
    })
    const byUrl = new Map<string, Occ>()
    const rank = (o: Occ) => (o.spec ? 0 : 2) + (/\/index\.html$/.test(o.page.path) ? 1 : 0)
    for (const o of occs) {
      const k = new URL(o.link.url).pathname.toLowerCase()
      const prev = byUrl.get(k)
      if (!prev || rank(o) < rank(prev) || (rank(o) === rank(prev) && o.order < prev.order)) byUrl.set(k, o)
    }
    const links = [...byUrl.values()]

    // 3) Files. Downloads run in parallel; series are added afterwards in link order, so merges and
    //    collisions never depend on which download finished first.
    type FileResult = { fd: FileDiag; built: Built[]; spec?: LinkSpec; plants?: ReturnType<typeof plantLookup> }
    const results = await mapLimit(links, 4, async (o): Promise<FileResult> => {
      const fallback = PAGE_DEFAULTS[o.page.path]
      const spec: LinkSpec | undefined =
        o.spec ?? (fallback && !o.archive ? { key: `generic:${o.page.path}`, match: /(?!)/, ...fallback } : undefined)
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
        return { fd, built: [] }
      }
      if (!spec) {
        fd.reason = o.archive ? 'archive file with no matching spec' : 'no spec for this page'
        return { fd, built: [] }
      }
      try {
        const { buf, url } = await fetcher.get(o.link.url, 90_000)
        const file = basename(url)
        fetchedOk.add(file)
        fd.fetchedFrom = url !== o.link.url ? url : undefined
        fd.bytes = buf.byteLength
        const grid = csvToGrid(decodeText(buf))
        fd.headerRow = grid.headerRow || undefined
        fd.header = grid.header.slice(0, 60).map((h) => cut(h, 60))
        fd.sample = grid.rows.slice(0, 3).map((r) => r.slice(0, 60).map((c) => cut(c, 40)))
        fd.rows = grid.rows.length
        const skipWhy = spec.skip ?? spec.headerSkip?.(grid.header)
        if (skipWhy) {
          fd.status = 'skipped'
          fd.reason = skipWhy
          return { fd, built: [], spec, plants: spec.key === 'ww-detection' ? plantLookup(grid.header, grid.rows) : undefined }
        }
        const { series, diag } = normalizeTable(grid.header, grid.rows, spec, { ...normOpts, officialBy: `MDH ${spec.program}` })
        fd.parse = diag
        const built: Built[] = []
        const ids: string[] = []
        for (const n of series) {
          const s = buildSeries(n, spec, { file, updated: o.page.info?.updated, pending: !!o.page.info?.pendingNotice })
          built.push({ series: s, family: placement(spec, n).family, priority: (o.archive ? 0 : 10) + (spec.familyPrimary ? 1 : 0), file })
          ids.push(s.id)
        }
        fd.seriesIds = ids.slice(0, 12)
        fd.status = ids.length ? 'parsed' : 'unparsed'
        if (!ids.length) fd.reason = diag.unparsed.join('; ').slice(0, 400) || 'no series'
        if (diag.unparsed.length) log.warn(`${file} (${spec.key}): ${diag.unparsed.join('; ').slice(0, 300)}`)
        if (diag.warnings?.length) log.warn(`${file} (${spec.key}): ${diag.warnings.join('; ').slice(0, 300)}`)
        return { fd, built, spec }
      } catch (e) {
        fd.status = 'error'
        fd.reason = errMsg(e)
        errors.push(`${basename(o.link.url)}: ${fd.reason}`)
        return { fd, built: [], spec }
      }
    })
    const fileDiags = results.map((r) => r.fd)
    const book = new SeriesBook()
    const specsWithSeries = new Set<string>()
    for (const r of results) {
      for (const b of r.built) book.add(b)
      if (r.built.length && r.spec) specsWithSeries.add(r.spec.key)
    }

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
          book.add({
            series: buildSeries(n, spec, { file, updated: p.info!.updated, pending: p.info!.pendingNotice }),
            family: placement(spec, n).family,
            priority: (ARCHIVE_PAGES.has(p.path) ? 0 : 10) + (spec.familyPrimary ? 1 : 0),
            file,
          })
        }
        if (series.length) specsWithSeries.add(spec.key)
        tableDiags.push({ page: p.path, spec: spec.key, caption: t.caption || t.heading, series: series.length, unparsed: diag.unparsed })
      }
    }

    // 5) Wastewater plants: county (and population) as MDH lists them in the detection-map file.
    const plants = results.find((r) => r.plants?.size)?.plants
    let plantsPlaced = 0
    if (plants) {
      for (const b of book.byId.values()) {
        const g = b.series.geo
        if (g.type !== 'sewershed' || g.counties?.length) continue
        const info = plants.get(plantKey(g.name))
        if (!info) continue
        const exact = b.series.attrs?.coordBasis === 'site coordinates (MDH)'
        const coord = exact && g.coord ? g.coord : countiesCentroid(info.counties, ctx.rootDir)
        b.series.geo = { ...g, counties: info.counties, population: g.population ?? info.population, coord }
        const attrs: Record<string, string> = { ...(b.series.attrs ?? {}), countySource: 'plant county listed in the MDH detection-map file' }
        if (!exact) {
          if (coord) attrs.coordBasis = 'centroid of the plant county listed by MDH'
          else delete attrs.coordBasis
        }
        b.series.attrs = attrs
        plantsPlaced++
      }
    }

    // 6) Proportion cross-check: MDH's flu page states the latest percent positive; a series ~100x
    //    smaller is a proportion stored under a percent header and is not published.
    const fluPages = pagesOk.filter((p) => p.path.includes('/flu/stats/'))
    const fluKeyStat = fluPositivityKeyStat(fluPages.flatMap((p) => p.info!.keyStats))
    const fluUpdated = fluPages.map((p) => p.info!.updated).filter((d): d is string => !!d).sort().pop()
    const crossChecks: Record<string, unknown>[] = []
    const fluId = 'mdh:mdh-lab:influenza:test_positivity:state:27'
    const flu = book.byId.get(fluId)
    if (flu && fluKeyStat != null) {
      const last = [...flu.series.points].reverse().find((p) => p[1] != null)
      const v = last?.[1] ?? null
      // The key statistic describes the latest reported week, so compare only when the series reaches it.
      const comparable = !!last && (!fluUpdated || last[0] >= addDays(fluUpdated, -14))
      const asProportion = comparable && v != null && v <= 1 && fluKeyStat >= 0.5 && Math.abs(v * 100 - fluKeyStat) <= 0.05 * fluKeyStat
      crossChecks.push({
        series: fluId,
        latest: last ?? null,
        pageKeyStat: `${fluKeyStat}%`,
        pageUpdated: fluUpdated,
        agrees: comparable ? v != null && Math.abs(v - fluKeyStat) <= Math.max(0.05, 0.02 * fluKeyStat) : 'not comparable (series ends before the page week)',
        asProportion,
      })
      if (asProportion) {
        book.byId.delete(fluId)
        errors.push(`${flu.file}: influenza positivity looks like a proportion (latest ${v} vs page ${fluKeyStat}%); not published`)
      }
    }

    // 7) Watch-list pages: year-to-date counts (pertussis statewide + by county, measles statewide).
    const other: Series[] = []
    const watch: Record<string, unknown> = {}
    const pertPage = pages.find((p) => p.kind === 'pertussis' && p.info && p.year === pertussis[0].year) ??
      pages.find((p) => p.kind === 'pertussis' && p.info)
    if (pertPage?.info) {
      try {
        const pp = parsePertussisPage(pertPage.info, pertPage.year)
        const file = pertPage.path.split('/').pop()!
        watch.pertussis = { page: pertPage.path, updated: pertPage.info.updated, ...pp, counties: pp.counties.slice(0, 15), countyRows: pp.counties.length }
        if (pp.asOf && pp.counties.length) other.push(...pertussisCountySeries(pp.counties, pp.year, pp.asOf, pp.total, file))
        if (pp.total != null && pp.asOf) {
          const top = pp.counties.slice(0, 5).map((c) => `${c.name} ${c.cases}`).join(', ')
          other.push(
            ytdSeries('pertussis', pp.year, pp.total, pp.asOf, { totalBasis: pp.totalBasis ?? '', ...(top ? { topCounties: top } : {}), mdhFile: file }, 'confirmed and probable pertussis cases'),
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
          other.push(ytdSeries('measles', mp.year, mp.cases, mp.asOf, { basis: cut(mp.basis ?? '', 160), mdhFile: 'stats.html' }, 'confirmed measles cases'))
        } else errors.push(`measles: ${mp.problem ?? 'no as-of date'}`)
      } catch (e) {
        errors.push(`measles: ${errMsg(e)}`)
      }
    } else watch.measles = { error: measPage?.error }
    for (const s of other) book.add({ series: s, priority: 10, file: s.attrs?.mdhFile ?? '' })

    // 8) Datasets, carrying forward previously published series whose file could not be fetched this
    //    run (the orchestrator rewrites a dataset file from scratch, so they would otherwise vanish).
    //    Only for real fetch failures: the file's download or page failed, or a data page failed and the
    //    file was not linked from any page that loaded. A file MDH simply stopped linking is not carried.
    const erroredFiles = new Set(fileDiags.filter((f) => f.status === 'error').map((f) => basename(f.url)))
    const linkedFiles = new Set(fileDiags.map((f) => basename(f.url)))
    const failedPages = new Set(pages.filter((p) => !p.info).map((p) => p.path.split('/').pop()!))
    const dataPageFailed = pages.some((p) => p.kind === 'data' && !p.info)
    const fetchFailed = (files: string[]) =>
      files.some((f) => erroredFiles.has(f) || failedPages.has(f)) || (dataPageFailed && files.every((f) => !linkedFiles.has(f) && !fetchedOk.has(f)))
    const all = [...book.byId.values()].map((b) => b.series)
    const byDataset = new Map<string, Series[]>(DATASETS.map((d) => [d, []]))
    for (const s of all) {
      if (!byDataset.has(s.dataset)) byDataset.set(s.dataset, [])
      byDataset.get(s.dataset)!.push(s)
    }
    const carried: string[] = []
    const keepAfter = addDays(maxDate, -56)
    for (const [dataset, list] of byDataset) {
      if (!list.length) continue
      const have = new Set(list.map((s) => s.id))
      for (const prev of await previousSeries(ctx.rootDir, dataset)) {
        const files = (prev.attrs?.mdhFile ?? '').split(' + ').map((f) => f.replace(/#table$/, '')).filter(Boolean)
        if (have.has(prev.id) || !files.length || files.some((f) => fetchedOk.has(f)) || !fetchFailed(files)) continue
        if (lastDateOf(prev) < keepAfter) continue
        list.push({ ...prev, attrs: { ...(prev.attrs ?? {}), mdhCarriedForward: `file not fetched on ${ctx.now.slice(0, 10)}` } })
        carried.push(prev.id)
      }
    }
    for (const list of byDataset.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1))

    // 9) Diagnostics + message.
    const csv = fileDiags.filter((f) => f.ext === 'csv')
    const count = (st: FileDiag['status']) => csv.filter((f) => f.status === st).length
    const finalAll = [...byDataset.values()].flat()
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
      series: finalAll.length,
      carriedForward: carried.length,
      plantsPlacedFromMdhCounty: plantsPlaced,
      latest: latestDate(finalAll) ?? null,
      maxDate,
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
      crossChecks,
      collisions: book.collisions.slice(0, 30),
      carriedForward: carried.slice(0, 30),
      errors: errors.slice(0, 30),
      fetchAttempts: pagesOk.length ? undefined : fetcher.attempts.slice(0, 20),
    }
    await writeDiagnostics(ctx, diagnostics, log)

    let message: string
    if (!pagesOk.length) {
      const sample = pages.find((p) => p.error)?.error ?? 'unknown error'
      message = `MDH pages unreachable (${pages.length} tried on ${MDH_HOSTS.join(', ')}): ${sample}`
    } else {
      const ytd = other.filter((s) => s.geo.type === 'state').map((s) => `${s.pathogen} ${s.points[0][1]} as of ${s.points[0][0]}`)
      message =
        `${pagesOk.length}/${pages.length} MDH pages fetched; ${summary.csvFound} CSV links found, ${summary.csvParsed} parsed into ${all.length - other.length} series` +
        (summary.csvUnparsed ? `, ${summary.csvUnparsed} not yet parseable` : '') +
        (summary.csvSkipped ? `, ${summary.csvSkipped} skipped by design` : '') +
        (summary.csvErrors ? `, ${summary.csvErrors} failed to download` : '') +
        (summary.pdf || summary.xlsx ? `; ${summary.pdf} PDF / ${summary.xlsx} XLSX recorded` : '') +
        (carried.length ? `; ${carried.length} series carried forward from the last run` : '') +
        `; year to date: ${ytd.join(', ') || 'none'}.`
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
