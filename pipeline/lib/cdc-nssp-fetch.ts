// Time-bounded data.cdc.gov (SODA) and PopHIVE-mirror loaders for the CDC NSSP source.
//
// The shared helpers (socrata.ts / cdcData.ts) give each live request 120 s and 3 retries, about 8 min
// when data.cdc.gov hangs instead of refusing. That is longer than a source's timeout, so the mirror
// would never be reached. These variants take an explicit per-request budget, and withDeadline() caps
// a whole sub-source so one slow host cannot sink the module.
import { POPHIVE_MIRRORS, xzDecompress, type CdcRowsResult } from './cdcData.ts'
import { parseCsv } from './csv.ts'
import { fetchBuffer, fetchJson } from './http.ts'
import type { Logger } from './log.ts'
import { socrataUrl, type SoqlQuery } from './socrata.ts'

const POPHIVE = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data'
const PAGE_SIZE = 50_000

export interface Budget {
  /** Per-attempt timeout (covers the response body too). */
  timeoutMs: number
  /** Extra attempts after the first (http.ts backs off 1 s, 2 s, ...). */
  retries: number
}

interface SocrataMeta {
  rowsUpdatedAt?: number
  columns?: { name: string; fieldName: string }[]
}

const stringify = (r: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return out
}

const isoFromEpoch = (s?: number) => (s ? new Date(s * 1000).toISOString() : undefined)
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Reject with "<label> timed out after Ns" if `p` has not settled within `ms`. */
export async function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  try {
    return await Promise.race([p, deadline])
  } finally {
    clearTimeout(timer)
  }
}

/** SODA query with paging and a per-request budget. Rows are returned with string values. */
export async function sodaRows(datasetId: string, q: SoqlQuery, budget: Budget): Promise<Record<string, string>[]> {
  const headers: Record<string, string> = {}
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN
  const rows: Record<string, string>[] = []
  for (let offset = 0; offset < 1_000_000; offset += PAGE_SIZE) {
    // A stable $order is required for deterministic paging.
    const url = socrataUrl(datasetId, { ...q, order: q.order ?? ':id', limit: PAGE_SIZE, offset })
    const page = await fetchJson<Record<string, unknown>[]>(url, { headers, ...budget })
    for (const r of page) rows.push(stringify(r))
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

/** Keep the header line plus lines `keep` accepts, without splitting the whole file into an array. */
function filterLines(text: string, keep: (line: string) => boolean): string {
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

export interface RowsOptions {
  /** Row predicate on API field names (applied to mirror rows; the live query filters server-side). */
  filter: (row: Record<string, string>) => boolean
  /** Cheap superset test on raw mirror CSV lines before parsing (e.g. line includes 'Minnesota'). */
  lineHint?: (line: string) => boolean
  live: Budget
  mirror: Budget
}

export interface BoundedRowsResult extends CdcRowsResult {
  /** Why data.cdc.gov was not used, when the mirror was. */
  liveError?: string
}

/**
 * data.cdc.gov first, then the PopHIVE mirror (same row shape after mapping display names to API field
 * names). When both fail the error names both reasons.
 */
export async function loadRowsBounded(
  datasetId: string,
  query: SoqlQuery,
  opts: RowsOptions,
  log: Logger,
): Promise<BoundedRowsResult> {
  let liveError: string
  try {
    const rows = await sodaRows(datasetId, query, opts.live)
    if (rows.length === 0) throw new Error('no rows returned')
    let updatedAt: string | undefined
    try {
      const meta = await fetchJson<SocrataMeta>(`https://data.cdc.gov/api/views/${datasetId}.json`, { timeoutMs: 30_000, retries: 0 })
      updatedAt = isoFromEpoch(meta.rowsUpdatedAt)
    } catch {
      /* metadata is optional */
    }
    return { rows, via: 'data.cdc.gov', updatedAt }
  } catch (e) {
    liveError = reasonOf(e).slice(0, 200)
  }
  const mirror = POPHIVE_MIRRORS[datasetId]
  if (!mirror) throw new Error(`data.cdc.gov: ${liveError}; no mirror is configured`)
  log.warn(`data.cdc.gov ${datasetId} unavailable (${liveError.slice(0, 120)}); using PopHIVE mirror`)
  try {
    const [meta, buf] = await Promise.all([
      fetchJson<SocrataMeta>(`${POPHIVE}/${mirror}.json`, opts.mirror),
      fetchBuffer(`${POPHIVE}/${mirror}.csv.xz`, opts.mirror),
    ])
    const rename = new Map((meta.columns ?? []).map((c) => [c.name, c.fieldName]))
    let text = xzDecompress(buf)
    if (opts.lineHint) text = filterLines(text, opts.lineHint)
    const rows: Record<string, string>[] = []
    for (const raw of parseCsv(text)) {
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) row[rename.get(k) ?? k] = v
      if (opts.filter(row)) rows.push(row)
    }
    return { rows, via: 'pophive-mirror', updatedAt: isoFromEpoch(meta.rowsUpdatedAt), liveError }
  } catch (e) {
    throw new Error(`data.cdc.gov: ${liveError}; PopHIVE mirror: ${reasonOf(e).slice(0, 200)}`)
  }
}
