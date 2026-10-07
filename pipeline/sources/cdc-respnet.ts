// CDC RESP-NET — laboratory-confirmed respiratory virus hospitalization rates for Minnesota.
//
// RESP-NET (COVID-NET, FluSurv-NET, RSV-NET) is CDC's population-based hospitalization surveillance
// run with the Emerging Infections Program; Minnesota (MDH) is a site. Rates are hospitalizations
// per 100,000 residents of the site's catchment area, by week (week-ending Saturday).
//
// Datasets on data.cdc.gov (Socrata), each mirrored by PopHIVE/Ingest for outages:
//   * kvib-3txy  RESP-NET Rates and Clinical Data — all three networks plus "Combined". Minnesota
//                rows exist only for age/race/sex = Overall/All, rate_type 'Observed' (crude). The
//                'Age-Adjusted' rate_type exists only for the multi-site 'Overall' rows, so the
//                crude 'Observed' weekly rate is the only Minnesota rate and the one used here.
//   * 6jg4-xsqq  COVID-NET Rates and Clinical Data — Minnesota (state='MN') by age band.
//   * 29hc-w46k  RSV-NET Rates and Clinical Data — Minnesota (state='MN') by age band. Reported as
//                superseded by kvib-3txy from 2026-08-28 but still updated as of 2026-09-24; if it
//                goes stale or disappears, the module keeps working and says so.
// FluSurv-NET Minnesota rates by age are not on data.cdc.gov (CDC publishes them in FluView
// Interactive); kvib-3txy carries only the Minnesota Overall rate.
//
// Output datasets follow the upstream datasets, so the orchestrator's per-file preservation isolates
// failures (a failed upstream dataset leaves its last good file untouched):
//   respnet-mn            ← kvib-3txy (COVID/RSV may use the fresher 'All' rows of 6jg4/29hc)
//   respnet-mn-age-covid  ← 6jg4-xsqq
//   respnet-mn-age-rsv    ← 29hc-w46k
//
// Catchment break: the smallest non-zero weekly infant rate is one admission, so 100,000 / rate is the
// catchment's infant population. It is ~37k (7-county Twin Cities metro) through the 2023-24 season
// and ~62.5k (about statewide births) from the 2024-25 season, switching at week ending 2024-10-05
// (COVID 0-<1 yr minimum non-zero 2.7 → 1.6; RSV 0-<6 mo 5.5 → 3.1; ≥85 yr 1.8 → 0.9).
import type { AgeGroupId, Point, Series } from '../../shared/types.ts'
import { addDays } from '../../shared/mmwr.ts'
import { POPHIVE_MIRRORS, xzDecompress } from '../lib/cdcData.ts'
import { parseCsv, num } from '../lib/csv.ts'
import { fetchBuffer, fetchJson } from '../lib/http.ts'
import type { Logger } from '../lib/log.ts'
import { makeSeries, roundValue, STATE_GEO, toIsoDate, toWeekEnding } from '../lib/series.ts'
import { socrataUrl, soqlString, type SoqlQuery } from '../lib/socrata.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'

const SOURCE = 'cdc-respnet'
const DS_OVERALL = 'respnet-mn'
const DS_AGE_COVID = 'respnet-mn-age-covid'
const DS_AGE_RSV = 'respnet-mn-age-rsv'
const POPHIVE = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data'
/** First week of CDC's statewide Minnesota catchment (start of the 2024-25 season); see header. */
export const CATCHMENT_CHANGE = '2024-10-05'

// ───────────────────────────── Row normalization (exported for tests) ─────────────────────────────

export type NetworkId = 'COVID-NET' | 'FluSurv-NET' | 'RSV-NET' | 'Combined'

export const NETWORKS: Record<NetworkId, { pathogen: Series['pathogen']; name: string; what: string }> = {
  'COVID-NET': { pathogen: 'covid', name: 'COVID-19', what: 'COVID-19' },
  'FluSurv-NET': { pathogen: 'influenza', name: 'Flu', what: 'influenza' },
  'RSV-NET': { pathogen: 'rsv', name: 'RSV', what: 'RSV' },
  Combined: { pathogen: 'respiratory-combined', name: 'COVID-19, flu and RSV', what: 'COVID-19, influenza or RSV' },
}

/** A RESP-NET row in one shape regardless of which dataset (or mirror) it came from. */
export interface RespRow {
  network: string
  season: string
  dateType: string
  date: string
  age: string
  race: string
  sex: string
  state: string
  dataType: string
  estimateType: string
  rateType: string
  estimate: number | null
}

const pick = (r: Record<string, string>, keys: string[]): string => {
  for (const k of keys) {
    const v = r[k]
    if (v != null && v !== '') return String(v).trim()
  }
  return ''
}

/**
 * Map a raw row (Socrata API field names, or CSV display names if a mirror's rename map is missing)
 * to RespRow. COVID-NET uses agecat_label/race_label/sex_label; the others use age_category/race/sex.
 */
export function normalizeRow(r: Record<string, string>, defaultNetwork = ''): RespRow {
  return {
    network: pick(r, ['surveillance_network', 'Surveillance Network']) || defaultNetwork,
    season: pick(r, ['season', 'Season']),
    dateType: pick(r, ['date_type', 'Date Type']),
    date: pick(r, ['date', 'Date', '_weekenddate', 'week_ending_date']),
    age: pick(r, ['age_category', 'agecat_label', 'Age Category']),
    race: pick(r, ['race', 'race_label', 'Race']),
    sex: pick(r, ['sex', 'sex_label', 'Sex']),
    state: pick(r, ['state', 'State', 'site']),
    dataType: pick(r, ['data_type', 'Data Type']),
    estimateType: pick(r, ['estimate_type', 'Estimate Type']),
    rateType: pick(r, ['rate_type', 'Rate Type']),
    estimate: num(pick(r, ['estimate', 'Estimate'])),
  }
}

/** "All", "All Race/Ethnicities", "All Sexes", "Overall" — the un-stratified encodings CDC uses. */
export const isAllLabel = (v: string) => /^(all\b.*|overall)$/i.test(v.trim())
/** Un-stratified age: "Overall" (kvib-3txy), "All" / "All Ages" (6jg4-xsqq, 29hc-w46k). */
export const isOverallAge = (v: string) => /^(overall|all|all ages)$/i.test(v.trim())
export const isWeeklyRate = (v: string) => /^weekly rate$/i.test(v.trim())
/** Crude rate. 'Age-Adjusted' and 'Estimated' are different measures and are never mixed in. */
export const isCrudeRate = (v: string) => /^(observed|crude)$/i.test(v.trim())
/**
 * Unit guard: only 'Rate per 100,000' rows are rates. A blank value (column missing — reported as
 * schema drift) is tolerated; any other explicit estimate type (count, percent…) is rejected.
 */
export const isPer100k = (v: string) => v.trim() === '' || /^rate per 100,?000$/i.test(v.trim())
/** Weekly rows carry a week-ending date; season/monthly rows do not. Blank date_type is tolerated. */
export const isWeekDate = (dateType: string) => dateType === '' || /week/i.test(dateType)

export interface AgeBand {
  /** Stable id suffix (variant = `age-${slug}`), identical across datasets. */
  slug: string
  /** Dashboard audience group this band informs; unset when the band spans several groups. */
  group?: AgeGroupId
  order: number
}

// Age bands kept for the dashboard's audience groups. Other published bands (e.g. 6mo-<12 months,
// 1-<2 years, 18-29 years, 75-84 years, ≥85 years, ≥18 years) are skipped to keep output compact.
// '0-17 years (Children)' includes infants (who dominate pediatric RSV admissions), so it has no
// audience group: the 'children' group is ages 1-17 (covered by the 1-4 and 5-17 bands).
const AGE_BANDS: Record<string, AgeBand> = {
  '0-<6m': { slug: '0-6mo', group: 'infants', order: 0 },
  '0-<1y': { slug: '0-1y', group: 'infants', order: 1 },
  '1-4y': { slug: '1-4y', group: 'children', order: 2 },
  '5-17y': { slug: '5-17y', group: 'children', order: 3 },
  '0-17y': { slug: '0-17y', order: 4 },
  '18-49y': { slug: '18-49y', group: 'adults', order: 5 },
  '50-64y': { slug: '50-64y', group: 'older-adults', order: 6 },
  ge65y: { slug: '65plus', group: 'seniors', order: 7 },
  '65-74y': { slug: '65-74y', group: 'seniors', order: 8 },
  ge75y: { slug: '75plus', group: 'seniors', order: 9 },
}
const BAND_COUNT = Object.keys(AGE_BANDS).length

/** Canonical key for an age label: '≥65 years' / '65+ yr' → 'ge65y'; '0-<6 months' → '0-<6m'. */
export function ageKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .replace(/^(\d+)\+/, 'ge$1')
    .replace(/^(≥|>=)/, 'ge')
    .replace(/(years?|yrs?)$/, 'y')
    .replace(/(months?|mos?)$/, 'm')
}

export function ageBandOf(label: string): AgeBand | null {
  return AGE_BANDS[ageKey(label)] ?? null
}

/** Minnesota crude weekly rate (per 100,000) rows for un-stratified race and sex. */
export function selectWeekly(rows: RespRow[], states: string[]): RespRow[] {
  const want = new Set(states.map((s) => s.toLowerCase()))
  return rows.filter(
    (r) =>
      want.has(r.state.toLowerCase()) &&
      isWeeklyRate(r.dataType) &&
      isPer100k(r.estimateType) &&
      isCrudeRate(r.rateType) &&
      isWeekDate(r.dateType) &&
      isAllLabel(r.race) &&
      isAllLabel(r.sex),
  )
}

export interface WeeklyBuild {
  points: Point[]
  /** Weeks where two rows disagreed (the later season's row is kept). */
  conflicts: number
  /** Rows whose date was not a Saturday (possible schema drift). */
  nonSaturday: number
}

/** Collapse rows to weekly points keyed by week-ending Saturday, from historyStart on. */
export function weeklyPoints(rows: RespRow[], historyStart: string): WeeklyBuild {
  const byWeek = new Map<string, { v: number | null; season: string }>()
  let conflicts = 0
  let nonSaturday = 0
  for (const r of rows) {
    const iso = toIsoDate(r.date)
    const wk = iso ? toWeekEnding(iso) : null
    if (!iso || !wk) continue
    if (wk !== iso) nonSaturday++
    if (wk < historyStart) continue
    const v = r.estimate == null ? null : roundValue(r.estimate, 'hosp_rate')
    const prev = byWeek.get(wk)
    if (prev) {
      if (prev.v !== v) conflicts++
      if (r.season < prev.season) continue
    }
    byWeek.set(wk, { v, season: r.season })
  }
  const points: Point[] = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([d, x]) => [d, x.v])
  return { points, conflicts, nonSaturday }
}

const lastDate = (pts: Point[]) => (pts.length ? pts[pts.length - 1][0] : undefined)

/** The newest two weeks are incomplete; mark them only when the series is current with the dataset. */
export function provisionalFrom(points: Point[], datasetLatest: string | undefined): string | undefined {
  const last = lastDate(points)
  if (!last || !datasetLatest || last < addDays(datasetLatest, -14)) return undefined
  return addDays(last, -7)
}

// ───────────────────────────── Loading (live SODA → PopHIVE mirror) ─────────────────────────────

type SpecKey = 'overall' | 'covid' | 'rsv'

interface DatasetSpec {
  id: string
  label: string
  /** Network implied by the dataset when rows carry no surveillance_network column. */
  network?: NetworkId
  /** Output dataset for this upstream dataset's age-specific series. */
  ageDataset?: string
  query: SoqlQuery
  /** Mirror-row predicate equivalent to query.where (rows keyed by API field names). */
  filter: (r: Record<string, string>) => boolean
  /** Cheap line pre-filter for the large mirror CSVs before full CSV parsing. */
  lineHint: (line: string) => boolean
  expected: string[][]
}

const inList = (field: string, vals: string[]) => `${field} IN (${vals.map(soqlString).join(', ')})`
const ALL_RACE = ['All', 'All Race/Ethnicities']
const ALL_SEX = ['All', 'All Sexes']

const SPECS: Record<SpecKey, DatasetSpec> = {
  overall: {
    id: 'kvib-3txy',
    label: 'RESP-NET Rates and Clinical Data',
    query: { where: `state = 'Minnesota' AND data_type = 'Weekly Rate'` },
    filter: (r) => r.state === 'Minnesota' && r.data_type === 'Weekly Rate',
    lineHint: (l) => l.includes('Minnesota') && l.includes('Weekly Rate'),
    expected: [['surveillance_network'], ['date'], ['state'], ['data_type'], ['estimate_type'], ['rate_type'], ['estimate'], ['age_category'], ['race'], ['sex']],
  },
  covid: {
    id: '6jg4-xsqq',
    label: 'COVID-NET Rates and Clinical Data',
    network: 'COVID-NET',
    ageDataset: DS_AGE_COVID,
    query: {
      where: `state = 'MN' AND data_type = 'Weekly Rate' AND ${inList('race_label', ALL_RACE)} AND ${inList('sex_label', ALL_SEX)}`,
    },
    filter: (r) =>
      r.state === 'MN' && r.data_type === 'Weekly Rate' && ALL_RACE.includes(r.race_label) && ALL_SEX.includes(r.sex_label),
    lineHint: (l) => l.includes('MN') && l.includes('Weekly Rate'),
    expected: [['date'], ['state'], ['data_type'], ['estimate_type'], ['rate_type'], ['estimate'], ['agecat_label', 'age_category'], ['race_label', 'race'], ['sex_label', 'sex']],
  },
  rsv: {
    id: '29hc-w46k',
    label: 'RSV-NET Rates and Clinical Data',
    network: 'RSV-NET',
    ageDataset: DS_AGE_RSV,
    query: {
      where: `state = 'MN' AND data_type = 'Weekly Rate' AND ${inList('race', ALL_RACE)} AND ${inList('sex', ALL_SEX)}`,
    },
    filter: (r) => r.state === 'MN' && r.data_type === 'Weekly Rate' && ALL_RACE.includes(r.race) && ALL_SEX.includes(r.sex),
    lineHint: (l) => l.includes('MN') && l.includes('Weekly Rate'),
    expected: [['date'], ['state'], ['data_type'], ['estimate_type'], ['rate_type'], ['estimate'], ['age_category', 'agecat_label'], ['race', 'race_label'], ['sex', 'sex_label']],
  },
}

// Time budget: the three datasets load concurrently. Worst case per dataset is a hanging live API
// (2 × 60 s + 1 s backoff) followed by the mirror (2 × 150 s + 1 s) ≈ 7 min, inside timeoutMs (8 min).
const LIVE_FETCH = { timeoutMs: 60_000, retries: 1 }
const MIRROR_FETCH = { timeoutMs: 150_000, retries: 1 }
const PAGE_SIZE = 50_000

interface SocrataMeta {
  rowsUpdatedAt?: number
  columns?: { name: string; fieldName: string }[]
}

interface RowsResult {
  rows: Record<string, string>[]
  via: 'data.cdc.gov' | 'pophive-mirror'
  updatedAt?: string
}

const stringify = (r: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return out
}

const isoFromEpoch = (s?: number) => (s ? new Date(s * 1000).toISOString() : undefined)

/** Keep the header line plus the lines `keep` accepts, without splitting the whole file into an array. */
export function filterLines(text: string, keep: (line: string) => boolean): string {
  const nl = text.indexOf('\n')
  if (nl < 0) return text
  const out = [text.slice(0, nl)]
  for (let i = nl + 1; i < text.length; ) {
    let j = text.indexOf('\n', i)
    if (j < 0) j = text.length
    const line = text.slice(i, j)
    if (keep(line)) out.push(line)
    i = j + 1
  }
  return out.join('\n')
}

async function liveRows(spec: DatasetSpec): Promise<RowsResult> {
  const headers: Record<string, string> = {}
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN
  const rows: Record<string, string>[] = []
  for (let offset = 0; offset < 1_000_000; offset += PAGE_SIZE) {
    // A stable $order is required for deterministic paging.
    const url = socrataUrl(spec.id, { ...spec.query, order: ':id', limit: PAGE_SIZE, offset })
    const page = await fetchJson<Record<string, unknown>[]>(url, { headers, ...LIVE_FETCH })
    for (const r of page) rows.push(stringify(r))
    if (page.length < PAGE_SIZE) break
  }
  if (rows.length === 0) throw new Error('no rows returned')
  let updatedAt: string | undefined
  try {
    const meta = await fetchJson<SocrataMeta>(`https://data.cdc.gov/api/views/${spec.id}.json`, { timeoutMs: 30_000, retries: 0 })
    updatedAt = isoFromEpoch(meta.rowsUpdatedAt)
  } catch {
    /* metadata is optional */
  }
  return { rows, via: 'data.cdc.gov', updatedAt }
}

async function mirrorRows(spec: DatasetSpec): Promise<RowsResult> {
  const path = POPHIVE_MIRRORS[spec.id] ?? `respnet/raw/${spec.id}`
  const [meta, buf] = await Promise.all([
    fetchJson<SocrataMeta>(`${POPHIVE}/${path}.json`, MIRROR_FETCH),
    fetchBuffer(`${POPHIVE}/${path}.csv.xz`, MIRROR_FETCH),
  ])
  // Mirror headers are Socrata display names; the mirrored metadata maps them to API field names.
  const rename = new Map((meta.columns ?? []).map((c) => [c.name, c.fieldName]))
  // These CSVs are 17-71 MB (up to ~500k rows); pre-filter lines before full CSV parsing.
  const rows: Record<string, string>[] = []
  for (const raw of parseCsv(filterLines(xzDecompress(buf), spec.lineHint))) {
    const row: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) row[rename.get(k) ?? k] = v
    if (spec.filter(row)) rows.push(row)
  }
  return { rows, via: 'pophive-mirror', updatedAt: isoFromEpoch(meta.rowsUpdatedAt) }
}

/** data.cdc.gov first, then the PopHIVE mirror (same row shape after renaming). */
async function loadRows(spec: DatasetSpec, log: Logger): Promise<RowsResult> {
  try {
    return await liveRows(spec)
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    log.warn(`data.cdc.gov ${spec.id} unavailable (${reason.slice(0, 120)}); using PopHIVE mirror`)
    return mirrorRows(spec)
  }
}

function columnsOf(rows: Record<string, string>[]): string[] {
  const cols = new Set<string>()
  // SODA JSON omits null fields, so union over a sample of rows.
  for (const r of rows.slice(0, 2000)) for (const k of Object.keys(r)) cols.add(k)
  return [...cols].sort()
}

function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of xs) {
    const k = key(x) || '(blank)'
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

interface Loaded {
  spec: DatasetSpec
  rows: RespRow[]
  diag: Record<string, unknown>
}

async function loadDataset(spec: DatasetSpec, ctx: SourceContext, warnings: string[]): Promise<Loaded> {
  const res = await loadRows(spec, ctx.log)
  const columns = columnsOf(res.rows)
  const missing = spec.expected.filter((alts) => !alts.some((c) => columns.includes(c))).map((alts) => alts.join('|'))
  if (missing.length) {
    warnings.push(`${spec.id}: schema drift — expected column(s) missing: ${missing.join(', ')} (saw: ${columns.join(', ')})`)
  }
  const rows = res.rows.map((r) => normalizeRow(r, spec.network))
  const rateTypes = countBy(rows, (r) => r.rateType)
  if (rows.length && !rows.some((r) => isCrudeRate(r.rateType))) {
    warnings.push(`${spec.id}: no 'Observed' (crude) rate rows; rate types seen: ${Object.keys(rateTypes).join(', ')}`)
  }
  const estimateTypes = countBy(rows, (r) => r.estimateType)
  const badUnits = Object.keys(estimateTypes).filter((t) => t !== '(blank)' && !isPer100k(t))
  if (badUnits.length) {
    warnings.push(`${spec.id}: weekly rows with unexpected estimate_type ${badUnits.map((t) => `'${t}'`).join(', ')} were excluded (only 'Rate per 100,000' is used)`)
  }
  const dates = rows.map((r) => toIsoDate(r.date)).filter((d): d is string => !!d).sort()
  ctx.log.info(`${spec.id}: ${rows.length} MN weekly rows via ${res.via}, latest ${dates[dates.length - 1] ?? 'n/a'}`)
  return {
    spec,
    rows,
    diag: {
      dataset: spec.id,
      title: spec.label,
      via: res.via,
      updatedAt: res.updatedAt,
      rowsRead: res.rows.length,
      columns,
      rateTypes,
      estimateTypes,
      latestDate: dates[dates.length - 1],
      earliestDate: dates[0],
    },
  }
}

// ───────────────────────────── Series building ─────────────────────────────

const CATCHMENT = `CDC's Minnesota catchment was the 7-county Twin Cities metro through the 2023-24 season and roughly statewide from the 2024-25 season (week ending ${CATCHMENT_CHANGE}), as implied by the published infant rates; rates before and after that week cover different populations.`
const ROUNDING = 'CDC publishes rates to one decimal, so 0.0 means under 0.05 per 100,000, not necessarily zero admissions.'
const PROVISIONAL_NOTE = 'The newest two weeks are incomplete and are usually revised upward.'
const NETWORK_NOTE: Partial<Record<NetworkId, string>> = {
  'FluSurv-NET': 'FluSurv-NET did not report in some off-season weeks before 2025-26; those weeks have no point.',
  Combined:
    'In weeks when FluSurv-NET was not collecting (off-season weeks before 2025-26, such as the summers of 2021, 2022, 2023 and 2025), the combined rate covers COVID-19 and RSV only.',
}

export function overallSeries(network: NetworkId, points: Point[], datasetId: string, datasetLatest?: string): Series {
  const n = NETWORKS[network]
  const s = makeSeries({
    source: SOURCE,
    dataset: DS_OVERALL,
    pathogen: n.pathogen,
    metric: 'hosp_rate',
    geo: STATE_GEO,
    label: `${n.name} — lab-confirmed hospitalizations per 100,000 (RESP-NET, MN catchment)`,
    points,
    provisionalFrom: provisionalFrom(points, datasetLatest),
    note: [
      `Weekly laboratory-confirmed ${n.what}-associated hospitalizations per 100,000 residents of Minnesota's Emerging Infections Program catchment area (CDC ${network === 'Combined' ? 'RESP-NET combined' : network}, crude rate).`,
      CATCHMENT,
      NETWORK_NOTE[network],
      'Only patients who were tested are counted; untested and non-hospitalized illness is not included.',
      ROUNDING,
      PROVISIONAL_NOTE,
    ]
      .filter(Boolean)
      .join(' '),
  })
  s.attrs = { network, dataset: datasetId, rate: 'Observed (crude)', catchmentChange: CATCHMENT_CHANGE }
  return s
}

export function ageSeries(
  network: NetworkId,
  rawAge: string,
  band: AgeBand,
  points: Point[],
  datasetId: string,
  dataset: string,
  datasetLatest?: string,
): Series {
  const n = NETWORKS[network]
  const s = makeSeries({
    source: SOURCE,
    dataset,
    pathogen: n.pathogen,
    metric: 'hosp_rate',
    geo: STATE_GEO,
    age: rawAge,
    variant: `age-${band.slug}`,
    label: `${n.name} — hospitalizations per 100,000, ages ${rawAge} (RESP-NET, MN catchment)`,
    points,
    provisionalFrom: provisionalFrom(points, datasetLatest),
    note: `Weekly laboratory-confirmed ${n.what}-associated hospitalizations per 100,000 residents aged ${rawAge} in Minnesota's Emerging Infections Program catchment area (CDC ${network}, crude rate). ${CATCHMENT} Rates for one age group in one state rest on few patients and can jump week to week. ${ROUNDING} ${PROVISIONAL_NOTE}`,
  })
  s.attrs = { network, dataset: datasetId, catchmentChange: CATCHMENT_CHANGE }
  if (band.group) s.attrs.ageGroup = band.group
  return s
}

export interface Candidate {
  network: NetworkId
  datasetId: string
  rawAge?: string
  band?: AgeBand
  points: Point[]
  latest?: string
}

const isNetwork = (v: string): v is NetworkId => v in NETWORKS

/** Group a dataset's selected rows into per-(network, age) candidates. */
export function candidatesFrom(
  rows: RespRow[],
  datasetId: string,
  historyStart: string,
  stats: { conflicts: number; nonSaturday: number; unmappedNetworks: Set<string>; skippedAges: Set<string> },
): { overall: Candidate[]; byAge: Candidate[] } {
  const groups = new Map<string, RespRow[]>()
  for (const r of rows) {
    if (!isNetwork(r.network)) {
      stats.unmappedNetworks.add(r.network || '(blank)')
      continue
    }
    const k = `${r.network}|${isOverallAge(r.age) ? '' : r.age}`
    const g = groups.get(k) ?? []
    g.push(r)
    groups.set(k, g)
  }
  const overall: Candidate[] = []
  const byAge: Candidate[] = []
  for (const [k, g] of groups) {
    const [network, age] = k.split('|') as [NetworkId, string]
    const band = age ? ageBandOf(age) : null
    if (age && !band) {
      stats.skippedAges.add(age)
      continue
    }
    const built = weeklyPoints(g, historyStart)
    stats.conflicts += built.conflicts
    stats.nonSaturday += built.nonSaturday
    if (!built.points.length) continue
    const c: Candidate = { network, datasetId, points: built.points, latest: lastDate(built.points) }
    if (band) byAge.push({ ...c, rawAge: age, band })
    else overall.push(c)
  }
  byAge.sort((a, b) => a.band!.order - b.band!.order)
  return { overall, byAge }
}

/** Prefer the candidate with newer data; on a tie keep the first (higher-priority) one. */
export function pickFreshest(cands: Candidate[]): Candidate | undefined {
  let best: Candidate | undefined
  for (const c of cands) if (!best || (c.latest ?? '') > (best.latest ?? '')) best = c
  return best
}

// ───────────────────────────── Module ─────────────────────────────

export const cdcRespnet: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'CDC RESP-NET hospitalization surveillance',
    publisher: 'CDC — RESP-NET (COVID-NET, FluSurv-NET, RSV-NET) with the Minnesota Department of Health Emerging Infections Program',
    url: 'https://www.cdc.gov/resp-net/dashboard/index.html',
    description:
      'Weekly rates of laboratory-confirmed hospitalizations for COVID-19, influenza and RSV (and the three combined) per 100,000 residents of the Minnesota Emerging Infections Program catchment area, from CDC’s RESP-NET surveillance, which actively identifies catchment residents who are hospitalized with a positive test. COVID-19 and RSV rates are also shown by age group. The catchment was the 7-county Twin Cities metro through the 2023-24 season and roughly statewide from the 2024-25 season, so older and newer rates cover different populations. It does NOT count people who were not tested or not hospitalized, people outside the catchment, hospital capacity, or deaths; it is a crude (not age-adjusted) rate; influenza rates by age are not included here (CDC publishes them in FluView Interactive, not in these data.cdc.gov datasets); and the most recent weeks are incomplete.',
    geography: 'Minnesota (RESP-NET / Emerging Infections Program catchment area); statewide figure only, no county detail',
    cadence: 'Weekly (week ending Saturday; CDC posts updates about 1 week later)',
    attribution:
      'RESP-NET: Respiratory Virus Hospitalization Surveillance Network, Centers for Disease Control and Prevention (data.cdc.gov kvib-3txy, 6jg4-xsqq, 29hc-w46k)',
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const warnings: string[] = []
    const diagnostics: Record<string, unknown> = { historyStart: ctx.historyStart }
    const loaded: Partial<Record<SpecKey, Loaded>> = {}
    const keys = ['overall', 'covid', 'rsv'] as const

    // Load concurrently so a hanging endpoint cannot push the mirror fallbacks past the timeout.
    const settled = await Promise.allSettled(keys.map((k) => loadDataset(SPECS[k], ctx, warnings)))
    settled.forEach((r, i) => {
      const spec = SPECS[keys[i]]
      if (r.status === 'fulfilled') {
        loaded[keys[i]] = r.value
        diagnostics[spec.id] = r.value.diag
      } else {
        const msg = `${spec.id} (${spec.label}): ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`
        errors.push(msg)
        diagnostics[spec.id] = { dataset: spec.id, error: msg }
        ctx.log.warn(msg)
      }
    })

    const built: Partial<Record<SpecKey, { overall: Candidate[]; byAge: Candidate[]; latest?: string }>> = {}
    for (const key of keys) {
      const l = loaded[key]
      if (!l) continue
      const stats = { conflicts: 0, nonSaturday: 0, unmappedNetworks: new Set<string>(), skippedAges: new Set<string>() }
      const selected = selectWeekly(l.rows, ['Minnesota', 'MN'])
      const c = candidatesFrom(selected, l.spec.id, ctx.historyStart, stats)
      const latest = [...c.overall, ...c.byAge].map((x) => x.latest ?? '').sort().pop() || undefined
      built[key] = { ...c, latest }
      Object.assign(l.diag, {
        rowsSelected: selected.length,
        networks: countBy(selected, (r) => r.network),
        ageLabels: Object.keys(countBy(selected, (r) => r.age)).sort(),
        skippedAgeLabels: [...stats.skippedAges].sort(),
        latestWeek: latest,
      })
      if (stats.conflicts) warnings.push(`${l.spec.id}: ${stats.conflicts} week(s) had conflicting duplicate rows (newest season kept)`)
      if (stats.nonSaturday) warnings.push(`${l.spec.id}: ${stats.nonSaturday} row date(s) were not Saturdays (mapped to week-ending Saturday)`)
      if (stats.unmappedNetworks.size) warnings.push(`${l.spec.id}: unknown surveillance network(s) ${[...stats.unmappedNetworks].join(', ')}`)
      if (selected.length === 0 && l.rows.length > 0) {
        warnings.push(`${l.spec.id}: ${l.rows.length} rows read but none matched Minnesota crude weekly rate filters`)
      }
    }

    // respnet-mn is built only when kvib-3txy loaded, so a kvib failure keeps the last good file
    // (with all four networks) instead of overwriting it with a COVID/RSV-only subset. For COVID and
    // RSV the dedicated datasets' 'All' rows (verified identical to kvib-3txy) are used when fresher.
    const overall: Series[] = []
    const kvib = built.overall
    if (kvib) {
      if (kvib.byAge.length) {
        const nets = [...new Set(kvib.byAge.map((c) => c.network))].join(', ')
        warnings.push(`kvib-3txy now carries Minnesota age-specific rows (${nets}); they are not used yet`)
      }
      const datasetLatest = new Map<string, string | undefined>(
        keys.filter((k) => built[k]).map((k) => [SPECS[k].id, built[k]!.latest]),
      )
      for (const network of Object.keys(NETWORKS) as NetworkId[]) {
        const cands = [
          ...kvib.overall.filter((c) => c.network === network),
          ...(['covid', 'rsv'] as const).flatMap((k) => (built[k]?.overall ?? []).filter((c) => c.network === network)),
        ]
        const best = pickFreshest(cands)
        if (!kvib.overall.some((c) => c.network === network)) {
          warnings.push(`kvib-3txy: no Minnesota weekly rate for ${network}${best ? ` (using ${best.datasetId})` : ''}`)
        }
        if (!best) continue
        overall.push(overallSeries(network, best.points, best.datasetId, datasetLatest.get(best.datasetId)))
      }
    }

    // Age series: each dedicated dataset feeds only its own output dataset.
    const ageOut: Record<string, Series[]> = { [DS_AGE_COVID]: [], [DS_AGE_RSV]: [] }
    for (const key of ['covid', 'rsv'] as const) {
      const b = built[key]
      const spec = SPECS[key]
      if (!b) continue
      const own = b.byAge.filter((c) => c.network === spec.network)
      for (const c of own) ageOut[spec.ageDataset!].push(ageSeries(c.network, c.rawAge!, c.band!, c.points, spec.id, spec.ageDataset!, b.latest))
      if (own.length < BAND_COUNT) {
        const have = new Set(own.map((c) => c.band!.slug))
        const lacking = Object.values(AGE_BANDS).filter((x) => !have.has(x.slug)).map((x) => x.slug)
        warnings.push(`${spec.id}: age band(s) not found: ${lacking.join(', ')}`)
      }
      // RSV-NET 29hc-w46k (and COVID-NET 6jg4-xsqq) may be retired in favor of kvib-3txy: flag lag.
      const ref = kvib?.overall.find((c) => c.network === spec.network)?.latest
      if (b.latest && ref && b.latest < addDays(ref, -21)) {
        warnings.push(`${spec.id}: age-specific ${spec.network} data end ${b.latest} but kvib-3txy runs to ${ref} — the dataset may be superseded`)
      }
    }

    for (const w of warnings) ctx.log.warn(w)
    diagnostics.warnings = warnings
    diagnostics.series = {
      [DS_OVERALL]: overall.map((s) => ({ id: s.id, from: s.points[0]?.[0], to: lastDate(s.points), n: s.points.length, dataset: s.attrs?.dataset })),
      [DS_AGE_COVID]: ageOut[DS_AGE_COVID].length,
      [DS_AGE_RSV]: ageOut[DS_AGE_RSV].length,
    }
    const kept: string[] = []
    if (!loaded.overall) kept.push(DS_OVERALL)
    if (!loaded.covid) kept.push(DS_AGE_COVID)
    if (!loaded.rsv) kept.push(DS_AGE_RSV)
    const parts = [
      ...errors,
      ...(kept.length ? [`previous ${kept.join(', ')} data kept`] : []),
      ...(Object.values(loaded).some((l) => l?.diag.via === 'pophive-mirror') ? ['some data via PopHIVE mirror of data.cdc.gov'] : []),
    ]
    return {
      // An empty dataset is not written by the orchestrator, so its last good file is kept.
      datasets: [
        { source: SOURCE, dataset: DS_OVERALL, series: overall },
        { source: SOURCE, dataset: DS_AGE_COVID, series: ageOut[DS_AGE_COVID] },
        { source: SOURCE, dataset: DS_AGE_RSV, series: ageOut[DS_AGE_RSV] },
      ],
      message: errors.length ? `Partial refresh: ${parts.join('; ')}` : parts.length ? parts.join('; ') : undefined,
      diagnostics,
    }
  },
}
