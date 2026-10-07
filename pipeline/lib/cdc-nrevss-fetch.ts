// Network helpers for the CDC NREVSS source (pipeline/sources/cdc-nrevss.ts).
//
// Same live-then-mirror strategy as lib/cdcData.ts `loadCdcRows`, but with bounded data.cdc.gov timeouts:
// socrataQuery uses a 120 s timeout with 3 retries (worst case ~8 min when data.cdc.gov hangs instead of
// refusing), which would exhaust the module's budget before the PopHIVE mirror is ever tried.
import { POPHIVE_MIRRORS, xzDecompress } from './cdcData.ts'
import { parseCsv } from './csv.ts'
import { fetchBuffer, fetchJson } from './http.ts'
import { socrataUrl } from './socrata.ts'
import type { Logger } from './log.ts'

const POPHIVE = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data'

/** data.cdc.gov request budget: 60 s × 3 attempts (+3 s backoff) ≈ 3 min worst case per page. */
export const LIVE_FETCH = { timeoutMs: 60_000, retries: 2 } as const
const PAGE = 50_000

export interface SocrataView {
  rowsUpdatedAt?: number
  columns?: { name: string; fieldName: string; description?: string }[]
}

export interface RowsResult {
  rows: Record<string, string>[]
  via: 'data.cdc.gov' | 'pophive-mirror'
  /** Metadata fetched alongside the rows (mirror path only). */
  meta?: SocrataView
}

export function stringifyRow(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return out
}

/** Paged SODA query against data.cdc.gov with the bounded request budget. */
export async function sodaRows(id: string, where?: string): Promise<Record<string, string>[]> {
  const headers: Record<string, string> = {}
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN
  const rows: Record<string, string>[] = []
  for (let offset = 0; offset < 1_000_000; offset += PAGE) {
    const url = socrataUrl(id, { where, order: ':id', limit: PAGE, offset })
    const page = await fetchJson<Record<string, unknown>[]>(url, { ...LIVE_FETCH, headers })
    for (const r of page) rows.push(stringifyRow(r))
    if (page.length < PAGE) break
  }
  return rows
}

/** Socrata view metadata (column descriptions, rowsUpdatedAt): data.cdc.gov, else the PopHIVE copy. */
export async function loadMeta(id: string): Promise<SocrataView | null> {
  try {
    return await fetchJson<SocrataView>(`https://data.cdc.gov/api/views/${id}.json`, { retries: 1, timeoutMs: 30_000 })
  } catch {
    const mirror = POPHIVE_MIRRORS[id]
    if (!mirror) return null
    try {
      return await fetchJson<SocrataView>(`${POPHIVE}/${mirror}.json`, { retries: 1, timeoutMs: 30_000 })
    } catch {
      return null
    }
  }
}

/** PopHIVE rows.csv mirror, with display-name headers renamed to API field names. */
async function mirrorRows(id: string, filter: (row: Record<string, string>) => boolean): Promise<RowsResult> {
  const mirror = POPHIVE_MIRRORS[id]
  if (!mirror) throw new Error('no mirror is configured')
  const [meta, buf] = await Promise.all([
    fetchJson<SocrataView>(`${POPHIVE}/${mirror}.json`, { retries: 2, timeoutMs: 60_000 }),
    fetchBuffer(`${POPHIVE}/${mirror}.csv.xz`, { retries: 2, timeoutMs: 180_000 }),
  ])
  const rename = new Map((meta.columns ?? []).map((c) => [c.name, c.fieldName]))
  const rows: Record<string, string>[] = []
  for (const raw of parseCsv(xzDecompress(buf))) {
    const row: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) row[rename.get(k) ?? k] = v
    if (filter(row)) rows.push(row)
  }
  return { rows, via: 'pophive-mirror', meta }
}

/**
 * data.cdc.gov SODA first (server-side `where`), PopHIVE GitHub mirror second (`filter` must be the
 * equivalent row predicate, keyed by API field names).
 */
export async function liveOrMirror(
  id: string,
  where: string,
  filter: (row: Record<string, string>) => boolean,
  log: Logger,
): Promise<RowsResult> {
  try {
    const rows = await sodaRows(id, where)
    if (!rows.length) throw new Error('no rows returned')
    return { rows, via: 'data.cdc.gov' }
  } catch (e) {
    const reason = errText(e)
    if (!POPHIVE_MIRRORS[id]) throw new Error(`data.cdc.gov ${id} failed (${reason}) and no mirror is configured`)
    log.warn(`data.cdc.gov ${id} unavailable (${reason.slice(0, 160)}); using PopHIVE mirror`)
    try {
      return await mirrorRows(id, filter)
    } catch (m) {
      throw new Error(`data.cdc.gov ${id} failed (${reason}); PopHIVE mirror failed (${errText(m)})`)
    }
  }
}

/**
 * Error text including the network cause (undici reports only "fetch failed" at the top level), with URL
 * query strings dropped so messages stay readable on the Sources page.
 */
export function errText(e: unknown): string {
  const strip = (t: string) => t.replace(/(https?:\/\/[^\s?]+)\?[^\s:)]*/g, '$1')
  if (!(e instanceof Error)) return strip(String(e))
  const cause = (e as Error & { cause?: unknown }).cause
  const c = cause instanceof Error ? cause.message : cause ? String(cause) : ''
  return strip(c && !e.message.includes(c) ? `${e.message} (${c})` : e.message)
}
