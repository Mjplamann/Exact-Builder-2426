// CDC National Syndromic Surveillance Program (NSSP) — Minnesota emergency department (ED) visits.
//
// Datasets (data.cdc.gov, Socrata):
//   * rdmq-nq56  weekly % of ED visits for COVID-19, influenza and RSV by state and county, with CDC's
//                trend category (Increasing / Decreasing / No Change / Sparse / Limited Data / Data
//                Unavailable). County rows repeat their Health Service Area (HSA) estimate. Weeks CDC marks
//                "Data Unavailable" carry a blank or a placeholder 0 (2022-10 → 2023-10); both become null.
//                Live SODA API first, PopHIVE GitHub mirror second (pipeline/lib/cdc-nssp-fetch.ts).
//   * vjzj-u7u8  daily % of ED visits by state for ARI (acute respiratory illness), COVID, Influenza,
//                RSV. We keep ARI only and average complete Sunday–Saturday weeks. Not mirrored.
//   * f3zz-zga5  CDC's official current ARI activity level by state (snapshot of the latest week only).
// Archive (raw.githubusercontent.com, pinned to a commit so it can never change under us):
//   * CDCgov/covid19-forecast-hub auxiliary-data/nssp-raw-data/latest.parquet — the NSSP file CDC shared
//     with forecasters, which also carried county/HSA ARI % and CDC's per-HSA activity classifications
//     (2022-10-01 → 2026-09-26). It is scheduled for removal from the hub on 2026-10-12. It provides
//     archived ARI history and is the last-resort fallback for rdmq-nq56 when data.cdc.gov and the
//     mirror both fail.
// Time budget: every sub-source has a per-request budget and a hard deadline (LIMITS) well inside
// timeoutMs, so a hanging host costs that sub-source only and the rest of the run is still published.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet'
import type { ActivityLevel, PathogenId, Point, Series, TrendDirection } from '../../shared/types.ts'
import { MN_COUNTY_BY_FIPS, countyByName } from '../../shared/geo/mnCounties.ts'
import { loadRowsBounded, sodaRows, withDeadline, type Budget } from '../lib/cdc-nssp-fetch.ts'
import { num } from '../lib/csv.ts'
import { fetchBuffer } from '../lib/http.ts'
import type { Logger } from '../lib/log.ts'
import { loadPrismThresholds, type PrismTable } from '../lib/prism.ts'
import { latestDate, makeSeries, roundValue, STATE_GEO, toIsoDate, toWeekEnding } from '../lib/series.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'

const SOURCE = 'cdc-nssp'
export const DATASETS = {
  /** rdmq-nq56: COVID-19 / flu / RSV, state + counties (76 of 87 have data). */
  ed: 'nssp-ed',
  /** vjzj-u7u8 (weekly mean of daily) + f3zz-zga5 official level: statewide ARI. */
  ariState: 'nssp-ari-state',
  /** Pinned hub parquet: archived statewide + county ARI through 2026-09-26. */
  archive: 'nssp-archive',
} as const

export type NsspKey = 'covid' | 'influenza' | 'rsv' | 'ari'
const RESP_KEYS: NsspKey[] = ['covid', 'influenza', 'rsv']

const PATHOGEN: Record<NsspKey, PathogenId> = {
  covid: 'covid',
  influenza: 'influenza',
  rsv: 'rsv',
  ari: 'respiratory-combined',
}
const NAME: Record<NsspKey, string> = {
  covid: 'COVID-19',
  influenza: 'Flu',
  rsv: 'RSV',
  ari: 'Respiratory illness (ARI)',
}
const DIAGNOSIS: Record<NsspKey, string> = {
  covid: 'COVID-19',
  influenza: 'influenza',
  rsv: 'RSV',
  ari: 'acute respiratory illness (any respiratory infection, including COVID-19, flu and RSV)',
}

export const RDMQ_REQUIRED = [
  'week_end', 'geography', 'county', 'fips', 'hsa', 'hsa_counties', 'hsa_nci_id',
  'percent_visits_covid', 'percent_visits_influenza', 'percent_visits_rsv',
  'ed_trends_covid', 'ed_trends_influenza', 'ed_trends_rsv',
]
export const DAILY_REQUIRED = ['date', 'geography', 'pathogen', 'percent_visits']
export const LEVEL_REQUIRED = ['week_end', 'geography', 'label']

/** Per-request budgets and per-sub-source deadlines (mutable only so tests can shorten them). */
export const LIMITS: {
  live: Budget
  mirror: Budget
  bestEffort: Budget
  archive: Budget
  rdmqDeadlineMs: number
  bestEffortDeadlineMs: number
  archiveDeadlineMs: number
  prismDeadlineMs: number
} = {
  // rdmq-nq56 worst case: hanging live API 2 × 90 s, then the mirror 2 × 150 s ≈ 8 min.
  live: { timeoutMs: 90_000, retries: 1 },
  mirror: { timeoutMs: 150_000, retries: 1 },
  // vjzj-u7u8 / f3zz-zga5 (data.cdc.gov only, no mirror): 2 × 60 s.
  bestEffort: { timeoutMs: 60_000, retries: 1 },
  archive: { timeoutMs: 180_000, retries: 1 },
  rdmqDeadlineMs: 9 * 60_000,
  bestEffortDeadlineMs: 3 * 60_000,
  archiveDeadlineMs: 7 * 60_000,
  prismDeadlineMs: 3 * 60_000,
}

const ARCHIVE_SHA = '43581db5e1778d69ac136a7c7f2386223b8a9b07'
export const ARCHIVE_URL = `https://raw.githubusercontent.com/CDCgov/covid19-forecast-hub/${ARCHIVE_SHA}/auxiliary-data/nssp-raw-data/latest.parquet`
export const ARCHIVE_COLUMNS = [
  'week_end', 'geography', 'county', 'fips', 'hsa', 'hsa_counties', 'hsa_nci_id',
  'percent_visits_ari', 'percent_visits_covid', 'percent_visits_influenza', 'percent_visits_rsv',
  'ed_trends_ari', 'ed_trends_covid', 'ed_trends_influenza', 'ed_trends_rsv',
  'ari_threshold_classification', 'covid_threshold_classification',
  'influenza_threshold_classification', 'rsv_threshold_classification',
]

// ───────────────────────────── publisher vocabularies ─────────────────────────────

const TREND: Record<string, TrendDirection> = { increasing: 'rising', decreasing: 'falling', 'no change': 'steady' }
/** CDC NSSP trend category → TrendDirection ("Sparse", "Limited Data", "Data Unavailable" → undefined). */
export function mapTrend(label: string | undefined): TrendDirection | undefined {
  return label ? TREND[label.trim().toLowerCase()] : undefined
}

const LEVEL: Record<string, ActivityLevel> = {
  minimal: 'minimal', // CDC wording before the 2025–26 season
  'very low': 'minimal',
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  'very high': 'very-high',
}
/** CDC respiratory activity level wording → ActivityLevel ("Data Unavailable" etc. → undefined). */
export function mapLevel(label: string | undefined): ActivityLevel | undefined {
  return label ? LEVEL[label.trim().toLowerCase()] : undefined
}

// ───────────────────────────── row normalization ─────────────────────────────

/** "27,053" (CSV export), "27053" (SODA JSON), "27053.0" → "27053"; anything else → null. */
export function parseFips(raw: unknown): string | null {
  if (raw == null) return null
  const m = /^(\d{1,5})(?:\.0+)?$/.exec(String(raw).replace(/[,\s]/g, ''))
  return m ? m[1].padStart(5, '0') : null
}

export interface NsspRow {
  /** MMWR week-ending Saturday. */
  week: string
  /** 'state' for county === 'All'; otherwise 5-digit county FIPS. */
  geo: 'state' | string
  values: Partial<Record<NsspKey, number | null>>
  trends: Partial<Record<NsspKey, string>>
  /** CDC activity classification per pathogen (only in the hub archive). */
  levels: Partial<Record<NsspKey, string>>
  /** Placeholder values dropped because CDC flagged the pathogen "Data Unavailable" that week. */
  unavailable: Partial<Record<NsspKey, number>>
  hsa: string
  hsaCounties: string
  hsaId: string
}

const clean = (v: string | undefined) => (v ?? '').trim()
const isUnavailable = (label: string | undefined) => label?.toLowerCase() === 'data unavailable'

/**
 * Normalize one rdmq-nq56 / archive row (keyed by SODA field names, values as strings).
 * Returns null for non-Minnesota rows, unparseable dates or unknown counties.
 * A value is null when blank or when CDC labels that pathogen "Data Unavailable" (trend or
 * classification): those rows carry a placeholder 0, e.g. Ramsey HSA 286 every week 2022-10-01 →
 * 2023-06-17, never a real measurement. Other zeros (with a trend such as "No Change") are kept.
 */
export function normalizeRow(raw: Record<string, string>, keys: NsspKey[]): NsspRow | null {
  if (clean(raw.geography) !== 'Minnesota') return null
  const week = toWeekEnding(clean(raw.week_end))
  if (!week) return null
  const county = clean(raw.county)
  let geo: string
  if (county.toLowerCase() === 'all') geo = 'state'
  else {
    const f = parseFips(raw.fips)
    const fips = f && MN_COUNTY_BY_FIPS[f] ? f : countyByName(county)?.fips
    if (!fips) return null
    geo = fips
  }
  const row: NsspRow = {
    week,
    geo,
    values: {},
    trends: {},
    levels: {},
    unavailable: {},
    hsa: clean(raw.hsa),
    hsaCounties: clean(raw.hsa_counties),
    hsaId: clean(raw.hsa_nci_id),
  }
  for (const k of keys) {
    const v = num(raw[`percent_visits_${k}`])
    const t = clean(raw[`ed_trends_${k}`])
    if (t) row.trends[k] = t
    const l = clean(raw[`${k}_threshold_classification`])
    if (l) row.levels[k] = l
    if (v != null && (isUnavailable(t) || isUnavailable(l))) {
      row.unavailable[k] = v
      row.values[k] = null
    } else row.values[k] = v == null ? null : roundValue(v, 'ed_visit_pct')
  }
  return row
}

/** Publisher classification for the latest week (verbatim label; mapped level/trend when recognized). */
export function officialFrom(row: NsspRow, key: NsspKey, by = 'CDC NSSP'): Series['official'] | undefined {
  const levelLabel = row.levels[key]
  const trendLabel = row.trends[key]
  const labels = [...new Set([levelLabel, trendLabel].filter((x): x is string => !!x))]
  if (!labels.length) return undefined
  const official: NonNullable<Series['official']> = { label: labels.join(' · '), asOf: row.week, by }
  const level = mapLevel(levelLabel)
  const trend = mapTrend(trendLabel)
  if (level) official.level = level
  if (trend) official.trend = trend
  return official
}

// ───────────────────────────── series building ─────────────────────────────

export interface BuildOptions {
  dataset: string
  historyStart: string
  thresholds?: PrismTable | null
  /** Where the rows came from, e.g. "data.cdc.gov rdmq-nq56". Stored in attrs.retrieved. */
  retrieved: string
  /** Archived snapshot: labels and notes say so. Value is the snapshot's last week. */
  archivedThrough?: string
  /** Points on/after this week are preliminary (set on series that reach it). */
  provisionalFrom?: string
}

const stripPopulation = <T extends { population?: number }>(t: T): Omit<T, 'population'> => {
  const { population: _p, ...rest } = t
  return rest
}

function noteFor(key: NsspKey, isState: boolean, opts: BuildOptions): string {
  const base = isState
    ? `Weekly share of all emergency department visits in Minnesota with a diagnosis of ${DIAGNOSIS[key]}, from hospitals reporting to CDC's National Syndromic Surveillance Program. Recent weeks can be revised as more data arrive.`
    : `Weekly share of emergency department visits for ${key === 'ari' ? 'acute respiratory illness' : DIAGNOSIS[key]}, reported by CDC for the county's Health Service Area (HSA): every county in the HSA shows the same value, so it is not a county-only measurement. Weeks CDC marks "Data Unavailable" are left blank. Recent weeks can be revised.`
  if (!opts.archivedThrough) return base
  return `${base} Archived: from the NSSP file CDC published with the COVID-19 Forecast Hub (data through week ending ${opts.archivedThrough}); not updated.`
}

/**
 * One Series per geography (state + each county) for one pathogen, from normalized rows.
 * Leading nulls are trimmed; geographies with no reported value at all are skipped.
 */
export function buildSeries(rows: NsspRow[], key: NsspKey, opts: BuildOptions): { series: Series[]; skipped: string[] } {
  const byGeo = new Map<string, Map<string, NsspRow>>()
  for (const r of rows) {
    if (!(key in r.values) || r.week < opts.historyStart) continue
    let weeks = byGeo.get(r.geo)
    if (!weeks) byGeo.set(r.geo, (weeks = new Map()))
    weeks.set(r.week, r) // one row per week; a duplicate (should not happen) keeps the last
  }
  const series: Series[] = []
  const skipped: string[] = []
  const archived = opts.archivedThrough ? ', archived' : ''
  for (const [geoCode, weeks] of [...byGeo].sort(([a], [b]) => (a === 'state' ? -1 : b === 'state' ? 1 : a < b ? -1 : 1))) {
    const ordered = [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1))
    let points: Point[] = ordered.map((r) => [r.week, r.values[key] ?? null])
    const first = points.findIndex(([, v]) => v != null)
    if (first === -1) {
      skipped.push(geoCode)
      continue
    }
    points = points.slice(first)
    const latest = ordered[ordered.length - 1]
    const isState = geoCode === 'state'
    const county = isState ? undefined : MN_COUNTY_BY_FIPS[geoCode]
    const s = makeSeries({
      source: SOURCE,
      dataset: opts.dataset,
      pathogen: PATHOGEN[key],
      metric: 'ed_visit_pct',
      geo: isState ? STATE_GEO : { type: 'county', code: geoCode, name: `${county!.name} County` },
      label: `${NAME[key]} — % of ED visits (NSSP${isState ? '' : ', HSA estimate'}${archived})`,
      points,
      note: noteFor(key, isState, opts),
      provisionalFrom: opts.provisionalFrom && points[points.length - 1][0] >= opts.provisionalFrom ? opts.provisionalFrom : undefined,
    })
    const official = officialFrom(latest, key)
    if (official) s.official = official
    const attrs: Record<string, string> = { retrieved: opts.retrieved }
    if (!isState) {
      const withHsa = [...ordered].reverse().find((r) => r.hsa && r.hsa.toLowerCase() !== 'all')
      if (withHsa) {
        attrs.hsa = withHsa.hsa
        attrs.hsaCounties = withHsa.hsaCounties
        if (withHsa.hsaId) attrs.hsaId = withHsa.hsaId
      }
    }
    s.attrs = attrs
    const t = isState ? opts.thresholds?.get(PATHOGEN[key]) : undefined
    if (t) s.thresholds = stripPopulation(t)
    series.push(s)
  }
  return { series, skipped }
}

// ───────────────────────────── daily → weekly (vjzj-u7u8) ─────────────────────────────

export interface DailyObs {
  date: string
  value: number | null
}

/**
 * Mean of daily percentages per Sunday–Saturday week. Only weeks with all 7 days reported are kept
 * (a partial week — e.g. the current one — would not be comparable). Checked against CDC's weekly
 * values: U.S. ARI week ending 2026-09-26, daily mean 9.669 vs weekly 9.68.
 */
export function weeklyMeanFromDaily(obs: DailyObs[], historyStart: string): { points: Point[]; incomplete: string[] } {
  const byDay = new Map<string, number>()
  for (const o of obs) {
    const d = toIsoDate(o.date)
    if (!d) continue
    if (o.value == null || !Number.isFinite(o.value)) byDay.delete(d)
    else byDay.set(d, o.value)
  }
  const weeks = new Map<string, number[]>()
  for (const [d, v] of byDay) {
    const wk = toWeekEnding(d)
    if (!wk || wk < historyStart) continue
    const arr = weeks.get(wk) ?? []
    arr.push(v)
    weeks.set(wk, arr)
  }
  const points: Point[] = []
  const incomplete: string[] = []
  for (const wk of [...weeks.keys()].sort()) {
    const vals = weeks.get(wk)!
    if (vals.length < 7) incomplete.push(wk)
    else points.push([wk, roundValue(vals.reduce((a, b) => a + b, 0) / vals.length, 'ed_visit_pct')])
  }
  return { points, incomplete }
}

/** Latest Minnesota row of f3zz-zga5 (CDC ARI activity level). */
export function parseAriLevel(rows: Record<string, string>[]): { week: string; label: string; level?: ActivityLevel } | null {
  let best: { week: string; label: string; level?: ActivityLevel } | null = null
  for (const r of rows) {
    if (clean(r.geography) !== 'Minnesota') continue
    const week = toWeekEnding(clean(r.week_end))
    const label = clean(r.label)
    if (!week || !label) continue
    if (!best || week > best.week) best = { week, label, level: mapLevel(label) }
  }
  return best
}

// ───────────────────────────── loaders ─────────────────────────────

/** Union of keys across rows (SODA JSON omits null fields, so one row is not enough). */
export function columnsSeen(rows: Record<string, unknown>[]): Set<string> {
  const cols = new Set<string>()
  for (const r of rows) for (const k of Object.keys(r)) cols.add(k)
  return cols
}

function checkColumns(name: string, cols: Set<string>, required: string[], log: Logger): string[] {
  const missing = required.filter((c) => !cols.has(c))
  if (missing.length) log.warn(`${name} schema drift: expected column(s) missing: ${missing.join(', ')} (saw: ${[...cols].join(', ')})`)
  return missing
}

function stringifyRow(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) {
    if (v == null) out[k] = ''
    else if (v instanceof Date) out[k] = v.toISOString().slice(0, 10)
    else out[k] = String(v)
  }
  return out
}

interface ArchiveData {
  rows: Record<string, string>[]
  columns: string[]
  cached: boolean
  totalRows: number
}

/** Download (or reuse the cached copy of) the pinned hub parquet and return its Minnesota rows. */
async function loadArchive(ctx: SourceContext): Promise<ArchiveData> {
  const cacheFile = path.resolve(ctx.rootDir, ctx.cacheDir, `cdc-nssp-archive-${ARCHIVE_SHA.slice(0, 12)}.parquet`)
  let buf: ArrayBuffer | null = null
  let cached = false
  try {
    const b = await readFile(cacheFile)
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    if (isParquet(ab)) {
      buf = ab
      cached = true
    }
  } catch {
    /* not cached yet */
  }
  if (!buf) {
    buf = await fetchBuffer(ARCHIVE_URL, LIMITS.archive)
    if (!isParquet(buf)) throw new Error('archive download is not a parquet file')
    try {
      await mkdir(path.dirname(cacheFile), { recursive: true })
      await writeFile(cacheFile, Buffer.from(buf))
    } catch {
      /* caching is optional */
    }
  }
  const metadata = parquetMetadata(buf)
  const columns = parquetSchema(metadata).children.map((c) => c.element.name)
  const missing = ARCHIVE_COLUMNS.filter((c) => !columns.includes(c))
  if (missing.length) ctx.log.warn(`hub NSSP archive schema drift: missing ${missing.join(', ')}`)
  const want = ARCHIVE_COLUMNS.filter((c) => columns.includes(c))
  // Read the geography column first, then decode only the slice of rows that holds Minnesota.
  const geos = (await parquetReadObjects({ file: buf, metadata, columns: ['geography'] })) as { geography?: unknown }[]
  let start = -1
  let end = -1
  for (let i = 0; i < geos.length; i++) {
    if (geos[i].geography === 'Minnesota') {
      if (start < 0) start = i
      end = i
    }
  }
  if (start < 0) throw new Error('archive has no Minnesota rows')
  const objs = (await parquetReadObjects({ file: buf, metadata, columns: want, rowStart: start, rowEnd: end + 1 })) as Record<string, unknown>[]
  const rows = objs.filter((r) => r.geography === 'Minnesota').map(stringifyRow)
  return { rows, columns, cached, totalRows: Number(metadata.num_rows) }
}

function isParquet(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false
  const u = new Uint8Array(buf)
  const magic = (o: number) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3])
  return magic(0) === 'PAR1' && magic(u.length - 4) === 'PAR1'
}

/** Latest observed week in a previously published dataset file, if any. */
async function previousLatest(ctx: SourceContext, dataset: string): Promise<string | undefined> {
  try {
    const file = path.join(ctx.rootDir, 'public', 'data', 'series', `${SOURCE}__${dataset}.json`)
    const sf = JSON.parse(await readFile(file, 'utf8')) as { series?: Series[] }
    return sf.series ? latestDate(sf.series) : undefined
  } catch {
    return undefined
  }
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

function latestWeek(rows: NsspRow[]): string | undefined {
  let max: string | undefined
  for (const r of rows) if (!max || r.week > max) max = r.week
  return max
}

/** Count of "Data Unavailable" placeholders dropped per pathogen, and how many were not 0. */
function unavailableStats(rows: NsspRow[], keys: NsspKey[]) {
  const dropped: Partial<Record<NsspKey, number>> = {}
  let nonZero = 0
  for (const r of rows) {
    for (const k of keys) {
      const v = r.unavailable[k]
      if (v == null) continue
      dropped[k] = (dropped[k] ?? 0) + 1
      if (v !== 0) nonZero++
    }
  }
  return { dropped, nonZero }
}

/**
 * The archived statewide ARI series duplicates the live vjzj-u7u8 series (same pathogen, metric and
 * place). Drop the archived one once the live series reaches at least the archive's last week, so the
 * frozen copy never wins a tie in the analysis.
 */
export function dropSupersededArchiveState(archive: Series[], live: Series | undefined): { series: Series[]; dropped: boolean } {
  const liveLatest = live ? latestDate([live]) : undefined
  const state = archive.find((s) => s.geo.type === 'state')
  const archLatest = state ? latestDate([state]) : undefined
  if (!state || !liveLatest || !archLatest || liveLatest < archLatest) return { series: archive, dropped: false }
  return { series: archive.filter((s) => s !== state), dropped: true }
}

const PRISM_PATHOGENS: PathogenId[] = ['covid', 'influenza', 'rsv', 'respiratory-combined']

// ───────────────────────────── module ─────────────────────────────

export const cdcNssp: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'CDC NSSP emergency department visits',
    publisher: 'CDC — National Syndromic Surveillance Program (NSSP)',
    url: 'https://data.cdc.gov/d/rdmq-nq56',
    description:
      'The share of all emergency department (ER) visits in Minnesota whose diagnosis is COVID-19, flu or RSV, each week, statewide and for every county, with CDC’s own trend call (increasing, decreasing or no change). Also the share of ER visits for any acute respiratory illness (ARI) statewide and CDC’s official Minnesota respiratory illness activity level. It shows how much these illnesses are sending people to the ER; it does not count infections, lab-confirmed cases or hospital admissions, and it only covers hospitals that send data to CDC. County numbers are CDC estimates for the county’s Health Service Area (a group of counties that share hospitals), so neighboring counties in the same area show the same value, and some areas have no data.',
    geography: 'Minnesota statewide and counties: 76 of 87 counties have data; county values are Health Service Area estimates',
    cadence: 'Weekly, Sunday–Saturday weeks (CDC posts preliminary data Wednesday and final data Friday)',
    attribution:
      'CDC National Syndromic Surveillance Program via data.cdc.gov (rdmq-nq56, vjzj-u7u8, f3zz-zga5); mirror: PopHIVE/Ingest (Yale School of Public Health); archive: CDC COVID-19 Forecast Hub',
  },
  // Above every LIMITS deadline (max 9 min) plus parsing, so the run always returns what it has.
  timeoutMs: 11 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const { log } = ctx
    const errors: string[] = []
    const notes: string[] = []
    const diagnostics: Record<string, unknown> = {}
    const histFloor = ctx.historyStart.slice(0, 10)

    const [prismR, rdmqR, archiveR, dailyR, levelR] = await Promise.allSettled([
      withDeadline(loadPrismThresholds(), LIMITS.prismDeadlineMs, 'PRISM thresholds'),
      withDeadline(
        loadRowsBounded(
          'rdmq-nq56',
          { where: `geography='Minnesota' AND week_end >= '${histFloor}T00:00:00.000'` },
          {
            filter: (row) => row.geography === 'Minnesota',
            lineHint: (line) => line.includes('Minnesota'),
            live: LIMITS.live,
            mirror: LIMITS.mirror,
          },
          log,
        ),
        LIMITS.rdmqDeadlineMs,
        'rdmq-nq56',
      ),
      withDeadline(loadArchive(ctx), LIMITS.archiveDeadlineMs, 'hub NSSP archive'),
      withDeadline(
        sodaRows('vjzj-u7u8', { select: 'date,geography,pathogen,percent_visits', where: "geography='Minnesota'" }, LIMITS.bestEffort),
        LIMITS.bestEffortDeadlineMs,
        'vjzj-u7u8',
      ),
      withDeadline(sodaRows('f3zz-zga5', { where: "geography='Minnesota'" }, LIMITS.bestEffort), LIMITS.bestEffortDeadlineMs, 'f3zz-zga5'),
    ])

    // loadPrismThresholds resolves with empty tables when no vintage loads, so check each pathogen.
    const prism = prismR.status === 'fulfilled' ? prismR.value : null
    const prismMissing = PRISM_PATHOGENS.filter((p) => !prism?.nssp.has(p))
    if (prismMissing.length) {
      const why = prismR.status === 'rejected' ? errText(prismR.reason) : 'not found in CDCgov/forecasttools'
      notes.push(`CDC PRISM thresholds unavailable for ${prismMissing.join(', ')} (${why}); those statewide series have no official cut-points`)
      log.warn(`PRISM thresholds unavailable for ${prismMissing.join(', ')}: ${why}`)
    }
    diagnostics.prism = { nsspVintage: prism?.nsspVintage, pathogens: prism ? [...prism.nssp.keys()] : [], missing: prismMissing }

    // Hub archive rows (used for archived ARI and as the rdmq-nq56 fallback).
    let archiveRows: NsspRow[] = []
    let archiveThrough: string | undefined
    if (archiveR.status === 'fulfilled') {
      archiveRows = archiveR.value.rows
        .map((r) => normalizeRow(r, ['ari', ...RESP_KEYS]))
        .filter((r): r is NsspRow => !!r)
      archiveThrough = latestWeek(archiveRows)
      diagnostics.archive = {
        dataUnavailableNulled: unavailableStats(archiveRows, ['ari', ...RESP_KEYS]),
        url: ARCHIVE_URL,
        cached: archiveR.value.cached,
        fileRows: archiveR.value.totalRows,
        minnesotaRows: archiveR.value.rows.length,
        usableRows: archiveRows.length,
        columns: archiveR.value.columns,
        latestWeek: archiveThrough,
      }
    } else {
      errors.push(`hub NSSP archive: ${errText(archiveR.reason)}`)
    }

    // ── nssp-ed: COVID-19 / flu / RSV, state + counties (rdmq-nq56) ──
    const ed: Series[] = []
    try {
      if (rdmqR.status === 'rejected') throw rdmqR.reason
      const { rows, via, updatedAt, liveError } = rdmqR.value
      const cols = columnsSeen(rows)
      const missing = checkColumns('rdmq-nq56', cols, RDMQ_REQUIRED, log)
      const norm = rows.map((r) => normalizeRow(r, RESP_KEYS)).filter((r): r is NsspRow => !!r)
      const retrieved = via === 'data.cdc.gov' ? 'data.cdc.gov rdmq-nq56' : 'PopHIVE mirror of data.cdc.gov rdmq-nq56'
      const unavailable = unavailableStats(norm, RESP_KEYS)
      if (unavailable.nonZero) log.warn(`rdmq-nq56: ${unavailable.nonZero} non-zero value(s) flagged "Data Unavailable" were published as null`)
      // NSSP backfills: the newest week is preliminary (CDC posts a preliminary build on Wednesday).
      const newest = latestWeek(norm)
      const skipped: Record<string, string[]> = {}
      for (const key of RESP_KEYS) {
        const out = buildSeries(norm, key, {
          dataset: DATASETS.ed,
          historyStart: histFloor,
          thresholds: prism?.nssp,
          retrieved,
          provisionalFrom: newest,
        })
        ed.push(...out.series)
        skipped[key] = out.skipped
      }
      const builds = [...new Set(rows.map((r) => r.buildnumber).filter(Boolean))].sort()
      diagnostics.rdmq = {
        via,
        liveError,
        updatedAt,
        rowsRead: rows.length,
        rowsUsable: norm.length,
        columnsSeen: [...cols],
        missingColumns: missing,
        latestWeek: newest,
        buildnumber: builds[builds.length - 1],
        dataUnavailableNulled: unavailable,
        series: ed.length,
        geosWithoutData: skipped,
      }
      if (via !== 'data.cdc.gov') notes.push('COVID-19/flu/RSV ED data via the PopHIVE mirror (data.cdc.gov unavailable)')
      if (!ed.length) throw new Error(`no usable series from ${rows.length} rows`)
    } catch (e) {
      errors.push(`rdmq-nq56: ${errText(e)}`)
      // Last resort: the archived hub file, unless the previously published data is at least as new.
      if (archiveRows.length) {
        const prev = await previousLatest(ctx, DATASETS.ed)
        if (prev && archiveThrough && prev >= archiveThrough) {
          notes.push(`kept previously published COVID-19/flu/RSV ED data (through ${prev}); archive is older`)
          diagnostics.rdmqFallback = { used: false, previousLatest: prev, archiveLatest: archiveThrough }
        } else {
          ed.length = 0
          for (const key of RESP_KEYS) {
            ed.push(
              ...buildSeries(archiveRows, key, {
                dataset: DATASETS.ed,
                historyStart: histFloor,
                thresholds: prism?.nssp,
                retrieved: 'CDC COVID-19 Forecast Hub NSSP archive',
                archivedThrough: archiveThrough,
              }).series,
            )
          }
          notes.push(`COVID-19/flu/RSV ED data from the archived hub file (through ${archiveThrough})`)
          diagnostics.rdmqFallback = { used: true, series: ed.length, archiveLatest: archiveThrough }
        }
      }
    }

    // ── nssp-ari-state: statewide ARI (vjzj-u7u8 weekly mean) + official level (f3zz-zga5) ──
    const ariState: Series[] = []
    try {
      if (dailyR.status === 'rejected') throw dailyR.reason
      const rows = dailyR.value.map(stringifyRow)
      const cols = columnsSeen(rows)
      const missing = checkColumns('vjzj-u7u8', cols, DAILY_REQUIRED, log)
      const pathogens = [...new Set(rows.map((r) => r.pathogen))]
      const ari = rows.filter((r) => clean(r.pathogen).toUpperCase() === 'ARI' && clean(r.geography) === 'Minnesota')
      if (!ari.length) throw new Error(`no Minnesota ARI rows (pathogens seen: ${pathogens.join(', ') || 'none'})`)
      const { points, incomplete } = weeklyMeanFromDaily(
        ari.map((r) => ({ date: r.date, value: num(r.percent_visits) })),
        histFloor,
      )
      if (!points.length) throw new Error('no complete weeks')
      const s = makeSeries({
        source: SOURCE,
        dataset: DATASETS.ariState,
        pathogen: 'respiratory-combined',
        metric: 'ed_visit_pct',
        geo: STATE_GEO,
        label: `${NAME.ari} — % of ED visits (NSSP)`,
        points,
        note: `Weekly average of CDC's daily share of emergency department visits in Minnesota with a diagnosis of ${DIAGNOSIS.ari} (data.cdc.gov vjzj-u7u8). Only weeks with all 7 days reported are shown. Recent weeks can be revised.`,
        provisionalFrom: points[points.length - 1][0],
      })
      s.attrs = { retrieved: 'data.cdc.gov vjzj-u7u8 (daily, averaged by week)' }
      const t = prism?.nssp.get('respiratory-combined')
      if (t) s.thresholds = stripPopulation(t)
      ariState.push(s)
      diagnostics.daily = {
        rowsRead: rows.length,
        ariRows: ari.length,
        columnsSeen: [...cols],
        missingColumns: missing,
        pathogens,
        latestDay: ari.map((r) => toIsoDate(r.date) ?? '').sort().pop(),
        latestWeek: points[points.length - 1][0],
        incompleteWeeks: incomplete,
      }
    } catch (e) {
      errors.push(`vjzj-u7u8 (daily ARI): ${errText(e)}`)
    }
    try {
      if (levelR.status === 'rejected') throw levelR.reason
      const rows = levelR.value.map(stringifyRow)
      const missing = checkColumns('f3zz-zga5', columnsSeen(rows), LEVEL_REQUIRED, log)
      const lvl = parseAriLevel(rows)
      if (!lvl) throw new Error(`no Minnesota row (${rows.length} rows)`)
      diagnostics.ariLevel = { ...lvl, rowsRead: rows.length, missingColumns: missing }
      if (!lvl.level) log.warn(`f3zz-zga5: unrecognized or unavailable level "${lvl.label}" for ${lvl.week}`)
      const official: NonNullable<Series['official']> = { label: lvl.label, asOf: lvl.week, by: 'CDC NSSP respiratory illness activity level' }
      if (lvl.level) official.level = lvl.level
      if (ariState[0]) ariState[0].official = official
      else notes.push(`CDC ARI activity level for ${lvl.week}: ${lvl.label} (no ARI series to attach it to)`)
    } catch (e) {
      errors.push(`f3zz-zga5 (ARI level): ${errText(e)}`)
    }

    // ── nssp-archive: archived statewide + county ARI (hub parquet) ──
    const archive: Series[] = []
    if (archiveRows.length) {
      const out = buildSeries(archiveRows, 'ari', {
        dataset: DATASETS.archive,
        historyStart: histFloor,
        thresholds: prism?.nssp,
        retrieved: 'CDC COVID-19 Forecast Hub NSSP archive',
        archivedThrough: archiveThrough,
      })
      const superseded = dropSupersededArchiveState(out.series, ariState[0])
      archive.push(...superseded.series)
      Object.assign(diagnostics.archive as object, {
        ariSeries: archive.length,
        ariGeosWithoutData: out.skipped,
        stateAriDroppedForLive: superseded.dropped,
      })
    }

    for (const err of errors) log.warn(err)
    const messageParts = [...notes, ...errors.map((e) => `failed: ${e}`)]
    return {
      datasets: [
        { source: SOURCE, dataset: DATASETS.ed, series: ed },
        { source: SOURCE, dataset: DATASETS.ariState, series: ariState },
        { source: SOURCE, dataset: DATASETS.archive, series: archive },
      ],
      message: messageParts.length ? messageParts.join('; ') : undefined,
      diagnostics,
    }
  },
}
