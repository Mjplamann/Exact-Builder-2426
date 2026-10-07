// Socrata SODA (data.cdc.gov) query helper with paging.
// Docs: https://dev.socrata.com/docs/queries/ — supports $select, $where, $order, $limit, $offset.
// An optional app token (SOCRATA_APP_TOKEN) raises rate limits; anonymous access works.
import { fetchJson } from './http.ts'

export interface SoqlQuery {
  select?: string
  where?: string
  order?: string
  group?: string
  /** Page size (default 50,000 — the SODA 2.1 maximum). */
  pageSize?: number
  /** Hard cap on total rows fetched. */
  maxRows?: number
}

export function socrataUrl(datasetId: string, q: SoqlQuery & { limit?: number; offset?: number }, domain = 'data.cdc.gov') {
  const params = new URLSearchParams()
  if (q.select) params.set('$select', q.select)
  if (q.where) params.set('$where', q.where)
  if (q.order) params.set('$order', q.order)
  if (q.group) params.set('$group', q.group)
  if (q.limit != null) params.set('$limit', String(q.limit))
  if (q.offset) params.set('$offset', String(q.offset))
  return `https://${domain}/resource/${datasetId}.json?${params.toString()}`
}

export async function socrataQuery<T = Record<string, string>>(
  datasetId: string,
  q: SoqlQuery = {},
  domain = 'data.cdc.gov',
): Promise<T[]> {
  const pageSize = q.pageSize ?? 50_000
  const maxRows = q.maxRows ?? 1_000_000
  const headers: Record<string, string> = {}
  if (process.env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN
  const rows: T[] = []
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    // A stable $order is required for deterministic paging.
    const url = socrataUrl(datasetId, { ...q, order: q.order ?? ':id', limit: pageSize, offset }, domain)
    const page = await fetchJson<T[]>(url, { headers, timeoutMs: 120_000 })
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

/** Escape a string literal for SoQL. */
export const soqlString = (s: string) => `'${s.replace(/'/g, "''")}'`
