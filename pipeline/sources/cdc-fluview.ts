// CDC FluView for Minnesota: outpatient influenza-like illness (ILINet) and clinical-lab influenza
// test positivity (WHO/NREVSS clinical laboratories), statewide, weekly.
//
// Each sub-dataset tries these routes in order and stops at the first one with a current week
// (no more than FRESH_DAYS old). If none is current, it keeps the freshest result and says so.
//   1. Delphi Epidata V5 /viz/: JSON filtered to geo_value=mn. Delphi's own EpiVis app uses this
//      route; it is undocumented but cheap (one small request per sub-dataset).
//   2. Delphi Epidata V5 /snapshot/: documented CSV with every state, filtered here.
//   3. CDC FluView Interactive download (gis.cdc.gov): the primary publisher, a POST that returns
//      a zip of CSVs. Delphi's own acquisition code fetches it the same way.
//   4. Delphi Epidata V3 /fluview/ and /fluview_clinical/: the legacy API, being phased out.
//   5. ILINet only: PopHIVE (Yale) GitHub mirror of Delphi's FluView pull (raw/data.csv.xz).
// Anonymous Delphi limits are tight (60 requests/hour; 3/min on /snapshot/). Normally this module
// sends 2 Delphi requests per run. Set DELPHI_API_KEY to send a key: as a `token` header on V5,
// as a Bearer token on V3. The key never goes in a URL, so it never appears in logs.
//
// FluSurv-NET (Delphi `flusurv`) is deliberately left out. The CDC RESP-NET source already covers
// Minnesota's FluSurv-NET overall rate, and a second influenza/hosp_rate/state series would share
// a seriesKey with the NHSN admissions rate.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Point, Series, SeriesFile } from '../../shared/types.ts'
import { daysBetween, epiweekNumber, epiweekToDate, mmwrWeekEnding, seasonOf, seasonStartYear } from '../../shared/mmwr.ts'
import { fetchBuffer, fetchJson, fetchText, HttpError } from '../lib/http.ts'
import { parseCsv, num } from '../lib/csv.ts'
import { xzDecompress } from '../lib/cdcData.ts'
import { latestDate, makeSeries, roundValue, STATE_GEO, toWeekEnding } from '../lib/series.ts'
import { unzipEntries } from '../lib/cdc-fluview-zip.ts'
import type { Logger } from '../lib/log.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'

const SOURCE = 'cdc-fluview'
const DATASET = 'fluview-mn'
const V5 = 'https://delphi.cmu.edu/epidata/v5'
const V3 = 'https://api.delphi.cmu.edu/epidata'
const CDC = 'https://gis.cdc.gov/flu2'
const POPHIVE_ILI = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data/delphi_ili_fluview/raw/data.csv.xz'
/** CDC posts data on Friday for the week that ended the previous Saturday (6 days), so a normal week is 6–13 days old. */
const FRESH_DAYS = 20

// ───────────────────────── sub-dataset definitions ─────────────────────────

export type DatasetKey = 'ilinet' | 'clinical'
/** Canonical field names: the Delphi V5 signal names. */
export type Field =
  | 'ili'
  | 'num_ili'
  | 'num_patients'
  | 'num_providers'
  | 'total_specimens'
  | 'positive_a'
  | 'positive_b'
  | 'pct_positive'
  | 'pct_positive_a'
  | 'pct_positive_b'

const PERCENT_FIELDS = new Set<Field>(['ili', 'pct_positive', 'pct_positive_a', 'pct_positive_b'])

interface DatasetDef {
  label: string
  v5Source: string
  signals: Field[]
  /** The field a route must return for Minnesota to count as a success. */
  primary: Field
  v3Endpoint: string
  /** V3 field → canonical field. */
  v3Fields: Record<string, Field>
  /** Matches the CSV's name inside the CDC FluView zip. */
  cdcFile: RegExp
  /** CDC CSV header → canonical field. */
  cdcColumns: Record<string, Field>
}

export const DATASETS: Record<DatasetKey, DatasetDef> = {
  ilinet: {
    label: 'ILINet',
    v5Source: 'fluview_ilinet',
    signals: ['ili', 'num_ili', 'num_patients', 'num_providers'],
    primary: 'ili',
    v3Endpoint: 'fluview',
    // At state level V3 copies `ili` into `wili`; CDC computes no weighted ILI for single states.
    v3Fields: { ili: 'ili', num_ili: 'num_ili', num_patients: 'num_patients', num_providers: 'num_providers' },
    cdcFile: /(^|\/)ILINet\.csv$/i,
    cdcColumns: {
      '%UNWEIGHTED ILI': 'ili',
      ILITOTAL: 'num_ili',
      'TOTAL PATIENTS': 'num_patients',
      'NUM. OF PROVIDERS': 'num_providers',
    },
  },
  clinical: {
    label: 'Clinical labs',
    v5Source: 'fluview_resp_lab_clinical',
    signals: ['pct_positive', 'pct_positive_a', 'pct_positive_b', 'total_specimens', 'positive_a', 'positive_b'],
    primary: 'pct_positive',
    v3Endpoint: 'fluview_clinical',
    v3Fields: {
      total_specimens: 'total_specimens',
      total_a: 'positive_a',
      total_b: 'positive_b',
      percent_positive: 'pct_positive',
      percent_a: 'pct_positive_a',
      percent_b: 'pct_positive_b',
    },
    cdcFile: /(^|\/)WHO_NREVSS_Clinical_Labs\.csv$/i,
    cdcColumns: {
      'TOTAL SPECIMENS': 'total_specimens',
      'TOTAL A': 'positive_a',
      'TOTAL B': 'positive_b',
      'PERCENT POSITIVE': 'pct_positive',
      'PERCENT A': 'pct_positive_a',
      'PERCENT B': 'pct_positive_b',
    },
  },
}

export type Via = 'delphi-v5-viz' | 'delphi-v5-snapshot' | 'cdc-fluview-interactive' | 'delphi-v3' | 'pophive-mirror'

const VIA_LABEL: Record<Via, string> = {
  'delphi-v5-viz': 'CMU Delphi Epidata V5',
  'delphi-v5-snapshot': 'CMU Delphi Epidata V5 (snapshot)',
  'cdc-fluview-interactive': 'CDC FluView Interactive',
  'delphi-v3': 'CMU Delphi Epidata V3 (legacy)',
  'pophive-mirror': 'PopHIVE GitHub mirror of CMU Delphi Epidata',
}

// ───────────────────────── parsing (pure, unit-tested) ─────────────────────────

/** Week-ending Saturday → canonical field values for Minnesota. */
export type WeekTable = Map<string, Partial<Record<Field, number | null>>>

export interface Parsed {
  weeks: WeekTable
  rowsRead: number
  columns: string[]
  signals: string[]
  /** Newest publication/ingest time seen (V5 report_time, V3/PopHIVE release_date). */
  reportTime?: string
  warnings: string[]
}

class TableBuilder {
  weeks: WeekTable = new Map()
  signals = new Set<string>()
  warnings: string[] = []
  private conflicts = new Set<Field>()
  private outOfRange = 0
  reportTime?: string

  set(week: string, field: Field, value: number | null) {
    let v = value
    if (v != null && (v < 0 || (PERCENT_FIELDS.has(field) && v > 100))) {
      this.outOfRange++
      v = null
    }
    const row = this.weeks.get(week) ?? {}
    const prev = row[field]
    if (prev !== undefined && prev !== v) this.conflicts.add(field)
    row[field] = v
    this.weeks.set(week, row)
    this.signals.add(field)
  }

  seeReportTime(raw: unknown) {
    const s = raw == null ? '' : String(raw).trim()
    if (s && (!this.reportTime || s > this.reportTime)) this.reportTime = s
  }

  finish(rowsRead: number, columns: string[]): Parsed {
    // Two different values for one field in one week (for example age strata without an age key)
    // make the whole field ambiguous, so drop it rather than guess.
    for (const f of this.conflicts) {
      for (const row of this.weeks.values()) delete row[f]
      this.signals.delete(f)
      this.warnings.push(`dropped "${f}": conflicting values for the same week`)
    }
    if (this.outOfRange) this.warnings.push(`${this.outOfRange} out-of-range value(s) set to null`)
    return {
      weeks: this.weeks,
      rowsRead,
      columns,
      signals: [...this.signals].sort(),
      reportTime: this.reportTime,
      warnings: this.warnings,
    }
  }
}

const str = (v: unknown) => (v == null ? '' : String(v).trim())

/** Normalize a reference date to its week-ending Saturday (ISO date, YYYYMMDD, or YYYYWW epiweek). */
export function referenceWeek(raw: unknown): string | null {
  const s = str(raw)
  if (/^\d{8}$/.test(s)) return toWeekEnding(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`)
  if (/^\d{6}$/.test(s)) {
    const wk = Number(s.slice(4))
    return wk >= 1 && wk <= 53 ? epiweekToDate(Number(s)) : null
  }
  return s ? toWeekEnding(s) : null
}

function columnsOf(rows: Record<string, unknown>[]): string[] {
  const cols = new Set<string>()
  for (const r of rows.slice(0, 50)) for (const k of Object.keys(r)) cols.add(k)
  return [...cols]
}

const V5_REQUIRED = ['signal', 'reference_time', 'value']

/**
 * Delphi V5 rows (from /viz/ JSON or /snapshot/ CSV): keep Minnesota, state level, fill_method
 * "source" and age_group "all" whenever those columns are present.
 */
export function parseV5Rows(rows: Record<string, unknown>[], key: DatasetKey): Parsed {
  const def = DATASETS[key]
  const columns = columnsOf(rows)
  if (rows.length) {
    const missing = V5_REQUIRED.filter((c) => !columns.includes(c))
    if (missing.length) throw new Error(`Delphi V5 schema drift: missing column(s) ${missing.join(', ')} (saw ${columns.join(', ')})`)
  }
  const wanted = new Set<string>(def.signals)
  const b = new TableBuilder()
  for (const r of rows) {
    if (r.geo_value != null && str(r.geo_value).toLowerCase() !== 'mn') continue
    if (r.geo_type != null && str(r.geo_type) !== '' && str(r.geo_type) !== 'state') continue
    if (r.fill_method != null && str(r.fill_method) !== '' && str(r.fill_method) !== 'source') continue
    if (r.age_group != null && str(r.age_group) !== '' && str(r.age_group).toLowerCase() !== 'all') continue
    const signal = str(r.signal)
    if (!wanted.has(signal)) continue
    const week = referenceWeek(r.reference_time)
    if (!week) continue
    b.set(week, signal as Field, num(r.value))
    b.seeReportTime(r.report_time)
  }
  return b.finish(rows.length, columns)
}

/** Delphi V5 /viz/ responds with a JSON array of rows; tolerate an {epidata|data: [...]} wrapper. */
export function vizRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[]
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    for (const k of ['epidata', 'data', 'rows']) if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[]
    if (o.message) throw new Error(`Delphi V5 viz: ${String(o.message).slice(0, 200)}`)
  }
  throw new Error(`Delphi V5 viz: unexpected response ${JSON.stringify(body).slice(0, 160)}`)
}

/**
 * A CSV from the CDC FluView Interactive zip. The first line is a title or footnote and the header
 * starts with "REGION TYPE". State rows have REGION "Minnesota" plus YEAR/WEEK (MMWR); "X" means
 * not reported.
 */
export function parseCdcFluviewCsv(text: string, key: DatasetKey): Parsed {
  const def = DATASETS[key]
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const h = lines.findIndex((l) => /^"?REGION TYPE"?\s*,/i.test(l.trim()))
  if (h < 0) throw new Error('CDC FluView CSV: header row ("REGION TYPE,...") not found')
  const rows = parseCsv(lines.slice(h).join('\n'))
  const columns = columnsOf(rows)
  const required = ['REGION', 'YEAR', 'WEEK', ...Object.entries(def.cdcColumns).filter(([, f]) => f === def.primary).map(([c]) => c)]
  const missing = required.filter((c) => !columns.includes(c))
  if (missing.length) throw new Error(`CDC FluView schema drift: missing column(s) ${missing.join(', ')} (saw ${columns.join(', ')})`)
  const b = new TableBuilder()
  const absent = Object.keys(def.cdcColumns).filter((c) => !columns.includes(c))
  if (absent.length) b.warnings.push(`CDC FluView CSV lacks optional column(s) ${absent.join(', ')}`)
  for (const r of rows) {
    if (str(r.REGION).toLowerCase() !== 'minnesota') continue
    const year = num(r.YEAR)
    const wk = num(r.WEEK)
    if (year == null || wk == null || wk < 1 || wk > 53) continue
    const week = mmwrWeekEnding(year, wk)
    for (const [col, field] of Object.entries(def.cdcColumns)) if (col in r) b.set(week, field, num(r[col]))
  }
  return b.finish(rows.length, columns)
}

interface V3Response {
  result?: number
  message?: string
  epidata?: Record<string, unknown>[]
}

/** Delphi V3 /fluview/ or /fluview_clinical/ JSON. `epiweek` is an MMWR YYYYWW integer. */
export function parseV3(body: V3Response, key: DatasetKey): Parsed {
  const def = DATASETS[key]
  if (body.result !== 1 || !Array.isArray(body.epidata)) {
    throw new Error(`Delphi V3 ${def.v3Endpoint}: result ${body.result ?? '?'} (${body.message ?? 'no message'})`)
  }
  const rows = body.epidata
  const columns = columnsOf(rows)
  const primaryV3 = Object.entries(def.v3Fields).find(([, f]) => f === def.primary)![0]
  const missing = ['epiweek', primaryV3].filter((c) => !columns.includes(c))
  if (rows.length && missing.length) throw new Error(`Delphi V3 schema drift: missing ${missing.join(', ')} (saw ${columns.join(', ')})`)
  const b = new TableBuilder()
  for (const r of rows) {
    if (r.region != null && str(r.region).toLowerCase() !== 'mn') continue
    const week = referenceWeek(r.epiweek)
    if (!week) continue
    for (const [col, field] of Object.entries(def.v3Fields)) if (col in r) b.set(week, field, num(r[col]))
    b.seeReportTime(r.release_date)
  }
  return b.finish(rows.length, columns)
}

/**
 * PopHIVE's copy of Delphi's FluView pull (epidatr::pub_fluview). Columns: release_date, region,
 * issue, epiweek (the Sunday that starts the MMWR week), lag, num_ili, num_patients, num_providers,
 * num_age_0..5, wili, ili.
 */
export function parsePopHive(text: string): Parsed {
  const rows = parseCsv(text)
  const columns = columnsOf(rows)
  const missing = ['region', 'epiweek', 'ili'].filter((c) => !columns.includes(c))
  if (missing.length) throw new Error(`PopHIVE ILI mirror schema drift: missing ${missing.join(', ')} (saw ${columns.join(', ')})`)
  const b = new TableBuilder()
  for (const r of rows) {
    if (str(r.region).toLowerCase() !== 'mn') continue
    const week = referenceWeek(r.epiweek)
    if (!week) continue
    for (const f of DATASETS.ilinet.signals) if (f in r) b.set(week, f, num(r[f]))
    b.seeReportTime(r.release_date)
  }
  return b.finish(rows.length, columns)
}

/** Latest week with a non-null value for `field`. */
export function latestWeek(weeks: WeekTable, field: Field): string | undefined {
  let max: string | undefined
  for (const [wk, row] of weeks) if (row[field] != null && (!max || wk > max)) max = wk
  return max
}

// ───────────────────────── series ─────────────────────────

interface SeriesSpec {
  field: Field
  pathogen: Series['pathogen']
  metric: Series['metric']
  label: string
}

const SERIES_SPECS: Record<DatasetKey, SeriesSpec[]> = {
  ilinet: [{ field: 'ili', pathogen: 'ili', metric: 'ili_pct', label: 'Flu-like illness: % of outpatient visits (CDC ILINet)' }],
  clinical: [
    { field: 'pct_positive', pathogen: 'influenza', metric: 'test_positivity', label: 'Flu: % of clinical lab tests positive (CDC FluView)' },
    { field: 'pct_positive_a', pathogen: 'influenza-a', metric: 'test_positivity', label: 'Flu A: % of clinical lab tests positive (CDC FluView)' },
    { field: 'pct_positive_b', pathogen: 'influenza-b', metric: 'test_positivity', label: 'Flu B: % of clinical lab tests positive (CDC FluView)' },
  ],
}

const NOTES: Record<DatasetKey, string> = {
  ilinet:
    'The share of all patient visits to Minnesota ILINet sentinel outpatient providers (clinics, urgent care and some emergency departments) that were for influenza-like illness: a fever of 100°F (37.8°C) or higher plus a cough or sore throat, with no other known cause. It counts symptoms, not lab-confirmed flu, so COVID-19, RSV and other viruses add to it. This is an unweighted statewide percentage, and the mix of reporting providers changes over time. The latest 2–4 weeks are preliminary and often revised.',
  clinical:
    'The share of respiratory specimens tested for influenza at Minnesota clinical laboratories (hospital and commercial labs reporting to CDC through WHO/NREVSS) that were positive. Testing goes mostly to people sick enough to seek care, so this is not the share of Minnesotans infected. The latest 2–4 weeks are preliminary and often revised.',
}

const fmt = (v: number | null | undefined) => (v == null ? 'n/a' : Math.round(v).toLocaleString('en-US'))

export function buildSeries(key: DatasetKey, parsed: Parsed, via: Via, historyStart: string): Series[] {
  const out: Series[] = []
  const weeks = [...parsed.weeks.keys()].filter((d) => d >= historyStart).sort()
  for (const spec of SERIES_SPECS[key]) {
    const points: Point[] = []
    for (const d of weeks) {
      const v = parsed.weeks.get(d)![spec.field]
      if (v === undefined) continue
      points.push([d, v == null ? null : roundValue(v, spec.metric)])
    }
    const latest = latestWeek(parsed.weeks, spec.field)
    if (!points.length || !latest) continue
    const s = makeSeries({
      source: SOURCE,
      dataset: DATASET,
      pathogen: spec.pathogen,
      metric: spec.metric,
      geo: STATE_GEO,
      label: spec.label,
      points,
      // CDC revises the most recent weeks as late reports arrive.
      provisionalFrom: latest,
      note: NOTES[key],
    })
    const row = parsed.weeks.get(latest)!
    s.attrs =
      key === 'ilinet'
        ? {
            Network: 'CDC ILINet (outpatient sentinel providers)',
            'Reporting providers': fmt(row.num_providers),
            'Patient visits': fmt(row.num_patients),
            'ILI visits': fmt(row.num_ili),
            'Counts for week ending': latest,
            'Retrieved via': VIA_LABEL[via],
          }
        : {
            Network: 'CDC WHO/NREVSS clinical laboratories',
            'Specimens tested': fmt(row.total_specimens),
            'Positive for flu A': fmt(row.positive_a),
            'Positive for flu B': fmt(row.positive_b),
            'Counts for week ending': latest,
            'Retrieved via': VIA_LABEL[via],
          }
    out.push(s)
  }
  return out
}

// ───────────────────────── fetching ─────────────────────────

interface Fetched extends Parsed {
  via: Via
  url: string
}

function delphiHeaders(version: 'v5' | 'v3'): Record<string, string> {
  const key = process.env.DELPHI_API_KEY?.trim()
  if (!key) return {}
  return version === 'v5' ? { token: key } : { Authorization: `Bearer ${key}` }
}

async function fromV5Viz(key: DatasetKey): Promise<Fetched> {
  const def = DATASETS[key]
  const qs = new URLSearchParams({
    source: def.v5Source,
    signal: def.signals.join(','),
    geo_type: 'state',
    geo_value: 'mn',
    format: 'json',
  })
  const url = `${V5}/viz/?${qs}`
  const body = await fetchJson<unknown>(url, { headers: delphiHeaders('v5'), retries: 1, timeoutMs: 90_000 })
  return { via: 'delphi-v5-viz', url, ...parseV5Rows(vizRows(body), key) }
}

async function fromV5Snapshot(key: DatasetKey): Promise<Fetched> {
  const def = DATASETS[key]
  // /snapshot/ ignores geo filters and returns every state; Minnesota is picked out client-side.
  const qs = new URLSearchParams({ source: def.v5Source, signal: def.signals.join(','), geo_type: 'state', fill_method: 'source' })
  const url = `${V5}/snapshot/?${qs}`
  const text = await fetchText(url, { headers: delphiHeaders('v5'), retries: 1, timeoutMs: 180_000 })
  const head = text.trimStart().slice(0, 1)
  if (head === '{' || head === '[') throw new Error(`Delphi V5 snapshot returned JSON, not CSV: ${text.slice(0, 160)}`)
  return { via: 'delphi-v5-snapshot', url, ...parseV5Rows(parseCsv(text), key) }
}

async function fromV3(key: DatasetKey, historyStart: string, today: string): Promise<Fetched> {
  const def = DATASETS[key]
  const url = `${V3}/${def.v3Endpoint}/?regions=mn&epiweeks=${epiweekNumber(historyStart)}-${epiweekNumber(today)}`
  const body = await fetchJson<V3Response>(url, { headers: delphiHeaders('v3'), retries: 1, timeoutMs: 90_000 })
  return { via: 'delphi-v3', url, ...parseV3(body, key) }
}

async function fromPopHive(): Promise<Fetched> {
  const text = xzDecompress(await fetchBuffer(POPHIVE_ILI, { timeoutMs: 120_000 }))
  return { via: 'pophive-mirror', url: POPHIVE_ILI, ...parsePopHive(text) }
}

const UA = 'MN-Pulse/0.1 (+https://github.com/Mjplamann/Exact-Builder-2426; public-health dashboard)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function postForBuffer(url: string, body: unknown, timeoutMs = 180_000, retries = 1): Promise<ArrayBuffer> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://gis.cdc.gov',
          Referer: 'https://gis.cdc.gov/grasp/fluview/fluportaldashboard.html',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.arrayBuffer()
      const err = new HttpError(url, res.status, await res.text().catch(() => ''))
      if (res.status !== 429 && res.status < 500) throw err
      lastErr = err
    } catch (e) {
      if (e instanceof HttpError && e.status !== 429 && e.status < 500) throw e
      lastErr = e
    }
    if (attempt < retries) await sleep(2000 * 2 ** attempt)
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

interface CdcInitApp {
  seasons?: { seasonid?: number }[]
  regiontypes?: { description?: string; regiontypeid?: number }[]
  states?: Record<string, unknown>[]
}

/** CDC FluView season ids are the season's first year minus 1960 (2025-26 → 65). */
export function cdcSeasonIds(historyStart: string, today: string, available?: number[]): number[] {
  const first = seasonStartYear(seasonOf(historyStart)) - 1960
  const last = seasonStartYear(seasonOf(today)) - 1960
  const ids = available?.length ? available.filter((id) => id >= first && id <= last) : []
  if (ids.length) return [...new Set(ids)].sort((a, b) => a - b)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

interface CdcDownload {
  url: string
  files: Map<string, string>
}

/** One POST returns both the ILINet and the WHO/NREVSS clinical-lab CSVs (shared by both sub-datasets). */
async function downloadCdc(historyStart: string, today: string): Promise<CdcDownload> {
  const meta = await fetchJson<CdcInitApp>(`${CDC}/GetPhase02InitApp?appVersion=Public`, { retries: 1, timeoutMs: 60_000 })
  const regionTypeId = meta.regiontypes?.find((r) => r.description === 'State')?.regiontypeid ?? 5
  const states = meta.states ?? []
  const mn = states.find((s) => Object.values(s).some((v) => typeof v === 'string' && v.trim().toLowerCase() === 'minnesota'))
  const stateIds = mn?.stateid != null ? [Number(mn.stateid)] : states.map((s) => Number(s.stateid)).filter(Number.isFinite)
  const seasons = cdcSeasonIds(
    historyStart,
    today,
    (meta.seasons ?? []).map((s) => Number(s.seasonid)).filter(Number.isFinite),
  )
  const entry = (id: number) => ({ ID: id, Name: String(id) })
  const url = `${CDC}/PostPhase02DataDownload`
  const buf = await postForBuffer(url, {
    AppVersion: 'Public',
    DatasourceDT: [{ ID: 1, Name: 'ILINet' }, { ID: 0, Name: 'WHO_NREVSS' }],
    RegionTypeId: regionTypeId,
    SubRegionsDT: (stateIds.length ? stateIds : Array.from({ length: 59 }, (_, i) => i + 1)).map(entry),
    SeasonsDT: seasons.map(entry),
  })
  const files = new Map<string, string>()
  const decoder = new TextDecoder('utf-8')
  for (const [name, data] of unzipEntries(buf)) files.set(name, decoder.decode(data))
  return { url, files }
}

async function fromCdc(key: DatasetKey, cdc: () => Promise<CdcDownload>): Promise<Fetched> {
  const { url, files } = await cdc()
  const def = DATASETS[key]
  const name = [...files.keys()].find((n) => def.cdcFile.test(n))
  if (!name) throw new Error(`CDC FluView zip has no ${def.cdcFile.source} (files: ${[...files.keys()].join(', ')})`)
  return { via: 'cdc-fluview-interactive', url: `${url} → ${name}`, ...parseCdcFluviewCsv(files.get(name)!, key) }
}

interface Attempt {
  via: Via
  ok: boolean
  rows?: number
  latestWeek?: string
  error?: string
}

function errMsg(e: unknown): string {
  let s = e instanceof Error ? e.message : String(e)
  // Node's fetch reports network failures as "fetch failed" with the reason in `cause`.
  const cause = e instanceof Error ? (e.cause as { message?: string; code?: unknown } | undefined) : undefined
  if (cause) s += ` (${typeof cause.code === 'string' ? `${cause.code} ` : ''}${cause.message ?? String(cause)})`
  return s.replace(/\s+/g, ' ').slice(0, 300)
}

async function loadDataset(
  key: DatasetKey,
  ctx: SourceContext,
  log: Logger,
  cdc: () => Promise<CdcDownload>,
): Promise<{ chosen?: Fetched; attempts: Attempt[] }> {
  const def = DATASETS[key]
  const today = ctx.now.slice(0, 10)
  const routes: [Via, () => Promise<Fetched>][] = [
    ['delphi-v5-viz', () => fromV5Viz(key)],
    ['delphi-v5-snapshot', () => fromV5Snapshot(key)],
    ['cdc-fluview-interactive', () => fromCdc(key, cdc)],
    ['delphi-v3', () => fromV3(key, ctx.historyStart, today)],
  ]
  if (key === 'ilinet') routes.push(['pophive-mirror', fromPopHive])
  const attempts: Attempt[] = []
  let chosen: Fetched | undefined
  let chosenLatest: string | undefined
  for (const [via, run] of routes) {
    try {
      const r = await run()
      for (const w of r.warnings) log.warn(`${def.label} via ${via}: ${w}`)
      const latest = latestWeek(r.weeks, def.primary)
      if (!latest) throw new Error(`no Minnesota ${def.primary} values (${r.rowsRead} rows read; signals ${r.signals.join(', ') || 'none'})`)
      attempts.push({ via, ok: true, rows: r.rowsRead, latestWeek: latest })
      if (!chosenLatest || latest > chosenLatest) {
        chosen = r
        chosenLatest = latest
      }
      const age = daysBetween(latest, today)
      if (age <= FRESH_DAYS) {
        log.info(`${def.label}: ${via} OK, ${r.weeks.size} MN weeks, latest ${latest} (${age} days old)`)
        break
      }
      log.warn(`${def.label}: ${via} latest week ${latest} is ${age} days old; trying the next route`)
    } catch (e) {
      attempts.push({ via, ok: false, error: errMsg(e) })
      log.warn(`${def.label}: ${via} failed: ${errMsg(e)}`)
    }
  }
  return { chosen, attempts }
}

/** Previously published series for one sub-dataset, kept when its refresh fails. */
async function previousSeries(ctx: SourceContext, key: DatasetKey): Promise<Series[]> {
  try {
    const file = path.join(ctx.rootDir, 'public', 'data', 'series', `${SOURCE}__${DATASET}.json`)
    const prev = JSON.parse(await readFile(file, 'utf8')) as SeriesFile
    const metrics = new Set(SERIES_SPECS[key].map((s) => `${s.pathogen}|${s.metric}`))
    return (prev.series ?? []).filter((s) => metrics.has(`${s.pathogen}|${s.metric}`))
  } catch {
    return []
  }
}

// ───────────────────────── module ─────────────────────────

export const cdcFluview: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'CDC FluView (ILINet and clinical labs)',
    publisher: 'CDC FluView: ILINet and WHO/NREVSS clinical laboratories (via CMU Delphi Epidata)',
    url: 'https://gis.cdc.gov/grasp/fluview/fluportaldashboard.html',
    description:
      "Two weekly statewide flu measures from CDC's FluView surveillance. (1) Influenza-like illness (ILINet): the share of patient visits to Minnesota's volunteer sentinel outpatient providers that were for fever plus cough or sore throat. It tracks flu-like symptoms, not confirmed flu, so other respiratory viruses add to it. (2) Clinical lab positivity: the share of specimens that hospital and commercial labs in Minnesota tested for flu that came back positive, overall and for flu A and flu B. Neither measure counts how many Minnesotans are infected or hospitalized, and neither breaks results down by county. Recent weeks are revised as late reports arrive.",
    geography: 'Minnesota statewide',
    cadence: 'Weekly (data through Saturday, posted the following Friday); the latest weeks are revised',
    attribution:
      'CDC FluView: U.S. Outpatient Influenza-like Illness Surveillance Network (ILINet) and WHO/NREVSS clinical laboratories. Retrieved through the CMU Delphi Epidata API, with CDC FluView Interactive and the PopHIVE mirror as fallbacks. Public domain.',
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const log = ctx.log
    const today = ctx.now.slice(0, 10)
    let cdcPromise: Promise<CdcDownload> | undefined
    const cdc = () => (cdcPromise ??= downloadCdc(ctx.historyStart, today))

    const series: Series[] = []
    const notes: string[] = []
    const diagnostics: Record<string, unknown> = { keyConfigured: !!process.env.DELPHI_API_KEY, freshDays: FRESH_DAYS }
    let anyFailure = false

    for (const key of ['ilinet', 'clinical'] as DatasetKey[]) {
      const def = DATASETS[key]
      try {
        const { chosen, attempts } = await loadDataset(key, ctx, log, cdc)
        const failedBefore = attempts.filter((a) => !a.ok).map((a) => VIA_LABEL[a.via])
        if (!chosen) {
          anyFailure = true
          const kept = await previousSeries(ctx, key)
          series.push(...kept)
          const keptLatest = latestDate(kept)
          notes.push(
            `${def.label}: every route failed${kept.length ? `; kept previously published data through ${keptLatest}` : ''} (${attempts.map((a) => `${a.via}: ${a.error}`).join('; ')})`,
          )
          diagnostics[key] = { ok: false, attempts, keptPrevious: kept.length, keptLatest }
          continue
        }
        const built = buildSeries(key, chosen, chosen.via, ctx.historyStart)
        series.push(...built)
        const latest = latestWeek(chosen.weeks, def.primary)!
        const age = daysBetween(latest, today)
        let note = `${def.label} via ${VIA_LABEL[chosen.via]}`
        if (age > FRESH_DAYS) note += ` (newest week ${latest}, ${age} days old)`
        if (failedBefore.length) note += `; unavailable: ${failedBefore.join(', ')}`
        notes.push(note)
        const sortedWeeks = [...chosen.weeks.keys()].sort()
        diagnostics[key] = {
          ok: true,
          via: chosen.via,
          url: chosen.url,
          rowsRead: chosen.rowsRead,
          columns: chosen.columns.slice(0, 30),
          signals: chosen.signals,
          mnWeeks: chosen.weeks.size,
          firstWeek: sortedWeeks[0],
          latestWeek: latest,
          latestValue: chosen.weeks.get(latest)?.[def.primary],
          reportTime: chosen.reportTime,
          warnings: chosen.warnings,
          series: built.map((s) => ({ id: s.id, points: s.points.length, last: s.points[s.points.length - 1] })),
          attempts,
        }
      } catch (e) {
        anyFailure = true
        notes.push(`${def.label}: ${errMsg(e)}`)
        diagnostics[key] = { ok: false, error: errMsg(e) }
      }
    }
    for (const n of notes) log.info(n)
    return {
      datasets: [{ source: SOURCE, dataset: DATASET, series }],
      message: (anyFailure ? 'Partial refresh. ' : '') + notes.join('. ') + '.',
      diagnostics,
    }
  },
}
