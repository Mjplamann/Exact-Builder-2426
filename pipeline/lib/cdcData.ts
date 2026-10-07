// Load rows from a data.cdc.gov (Socrata) dataset, falling back to a public GitHub mirror.
//
// Primary: the SODA JSON API (fresh, server-side filtering).
// Fallback: PopHIVE (Yale School of Public Health) mirrors many CDC datasets as xz-compressed
// rows.csv exports in https://github.com/PopHIVE/Ingest, refreshed by scheduled jobs. data.cdc.gov
// has had multi-day 403/503 outages, so the mirror keeps the dashboard current when it is down.
// Mirror CSVs use Socrata *display* names as headers; the mirrored <id>.json metadata maps them to
// API field names so callers always see the same row shape.
import { execFileSync } from 'node:child_process'
import { fetchBuffer, fetchJson } from './http.ts'
import { parseCsv } from './csv.ts'
import { socrataQuery, type SoqlQuery } from './socrata.ts'
import type { Logger } from './log.ts'

const POPHIVE = 'https://raw.githubusercontent.com/PopHIVE/Ingest/main/data'

/** data.cdc.gov dataset id → PopHIVE mirror path (without extension). */
export const POPHIVE_MIRRORS: Record<string, string> = {
  'rdmq-nq56': 'nssp/raw/rdmq-nq56',
  'atcp-73re': 'wastewater/raw/atcp-73re',
  'akvg-8vrb': 'wastewater_measles/raw/akvg-8vrb',
  '3cxc-4k8q': 'NREVSS/raw/3cxc-4k8q',
  'kvib-3txy': 'respnet/raw/kvib-3txy',
  'x9gk-5huc': 'nnds/raw/x9gk-5huc',
  'ua7e-t2fy': 'nhsn_hospital_capacity/raw/ua7e-t2fy',
  '5dqz-y4ea': 'cdc_cfa_rt/raw/5dqz-y4ea',
}

export interface CdcRowsResult {
  rows: Record<string, string>[]
  via: 'data.cdc.gov' | 'pophive-mirror'
  /** Dataset last-updated time when known (ISO). */
  updatedAt?: string
}

interface SocrataMeta {
  rowsUpdatedAt?: number
  columns?: { name: string; fieldName: string }[]
}

export function xzDecompress(buf: ArrayBuffer): string {
  return execFileSync('xz', ['-dc'], { input: Buffer.from(buf), maxBuffer: 2 ** 31 - 1 }).toString('utf8')
}

/**
 * @param query   SoQL for the live API (filter server-side).
 * @param filter  Equivalent row predicate applied to mirror rows (keyed by API field names).
 */
export async function loadCdcRows(
  datasetId: string,
  query: SoqlQuery,
  filter: (row: Record<string, string>) => boolean,
  log: Logger,
): Promise<CdcRowsResult> {
  try {
    const rows = await socrataQuery<Record<string, string>>(datasetId, query)
    if (rows.length === 0) throw new Error('no rows returned')
    let updatedAt: string | undefined
    try {
      const meta = await fetchJson<SocrataMeta>(`https://data.cdc.gov/api/views/${datasetId}.json`, { retries: 1 })
      if (meta.rowsUpdatedAt) updatedAt = new Date(meta.rowsUpdatedAt * 1000).toISOString()
    } catch {
      /* metadata is optional */
    }
    return { rows: rows.map(stringify), via: 'data.cdc.gov', updatedAt }
  } catch (e) {
    const mirror = POPHIVE_MIRRORS[datasetId]
    const reason = e instanceof Error ? e.message : String(e)
    if (!mirror) throw new Error(`data.cdc.gov ${datasetId} failed (${reason}) and no mirror is configured`)
    log.warn(`data.cdc.gov ${datasetId} unavailable (${reason.slice(0, 120)}); using PopHIVE mirror`)
    const [meta, buf] = await Promise.all([
      fetchJson<SocrataMeta>(`${POPHIVE}/${mirror}.json`),
      fetchBuffer(`${POPHIVE}/${mirror}.csv.xz`, { timeoutMs: 300_000 }),
    ])
    const rename = new Map((meta.columns ?? []).map((c) => [c.name, c.fieldName]))
    const rows: Record<string, string>[] = []
    for (const raw of parseCsv(xzDecompress(buf))) {
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) row[rename.get(k) ?? k] = v
      if (filter(row)) rows.push(row)
    }
    return {
      rows,
      via: 'pophive-mirror',
      updatedAt: meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString() : undefined,
    }
  }
}

function stringify(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return out
}
