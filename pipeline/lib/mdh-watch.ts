// Parsers for MDH "watch list" HTML pages whose numbers are year-to-date counts in HTML tables:
//   * pertussis/stats/statsYY.html — confirmed + probable cases by county of residence, "as of" a date;
//   * measles/stats.html — confirmed cases by year.
// These are cumulative counts, not weekly incidence; the source module stores them as one dated point.
import { countyByName } from '../../shared/geo/mnCounties.ts'
import { num } from './csv.ts'
import type { PageInfo, PageTable } from './mdh-crawl.ts'

export interface PertussisParse {
  year: number
  asOf?: string
  total?: number
  totalBasis?: 'total row' | 'sum of county rows'
  counties: { fips: string; name: string; cases: number }[]
  table?: { headers: string[]; rows: number }
  unmatched: string[]
  problem?: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function findCountyTable(tables: PageTable[]): { t: PageTable; nameIdx: number; valIdx: number } | null {
  for (const t of tables) {
    const hs = t.headers.map(norm)
    const nameIdx = hs.findIndex((h) => /\bcounty\b/.test(h))
    if (nameIdx < 0) continue
    let valIdx = hs.findIndex((h, i) => i !== nameIdx && /\b(cases?|count|number|total)\b/.test(h) && !/\b(rate|incidence|percent)\b/.test(h))
    if (valIdx < 0) valIdx = hs.findIndex((_h, i) => i !== nameIdx && t.rows.filter((r) => num(r[i]) != null).length >= t.rows.length * 0.6)
    if (valIdx < 0) continue
    return { t, nameIdx, valIdx }
  }
  return null
}

export function parsePertussisPage(info: PageInfo, year: number): PertussisParse {
  const out: PertussisParse = { year, asOf: info.asOf ?? info.updated, counties: [], unmatched: [] }
  const found = findCountyTable(info.tables)
  if (!found) {
    out.problem = 'no table with a County column and a case-count column'
    return out
  }
  const { t, nameIdx, valIdx } = found
  out.table = { headers: t.headers.slice(0, 12), rows: t.rows.length }
  let total: number | undefined
  for (const r of t.rows) {
    const name = (r[nameIdx] ?? '').trim()
    const v = num(r[valIdx])
    if (!name) continue
    if (/^(total|statewide|minnesota|state total|all counties)\b/i.test(name)) {
      if (v != null) total = v
      continue
    }
    const c = countyByName(name)
    if (!c) {
      if (out.unmatched.length < 10) out.unmatched.push(name.slice(0, 40))
      continue
    }
    if (v != null) out.counties.push({ fips: c.fips, name: c.name, cases: v })
  }
  if (total != null) {
    out.total = total
    out.totalBasis = 'total row'
  } else if (out.counties.length && !out.unmatched.length) {
    out.total = out.counties.reduce((a, c) => a + c.cases, 0)
    out.totalBasis = 'sum of county rows'
  } else if (out.unmatched.length) {
    out.problem = `rows not recognized as counties: ${out.unmatched.join(', ')}`
  }
  out.counties.sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name))
  return out
}

export interface MeaslesParse {
  year: number
  cases?: number
  basis?: string
  asOf?: string
  problem?: string
}

/** Current-year confirmed measles cases from a "by year" table, or a strict "Cases in 2026: 18" phrase. */
export function parseMeaslesPage(info: PageInfo, year: number): MeaslesParse {
  const out: MeaslesParse = { year, asOf: info.updated ?? info.asOf }
  const y = String(year)
  for (const t of info.tables) {
    const hs = t.headers.map(norm)
    // Layout A: rows by year (Year | Cases ...).
    const yIdx = hs.findIndex((h) => /^(year|calendar year)$/.test(h))
    if (yIdx >= 0) {
      const cIdx = hs.findIndex((h, i) => i !== yIdx && /\b(cases?|confirmed|total|number)\b/.test(h))
      const row = t.rows.find((r) => (r[yIdx] ?? '').trim().startsWith(y))
      const v = row && cIdx >= 0 ? num(row[cIdx]) : null
      if (v != null) {
        out.cases = v
        out.basis = `table "${t.caption || t.heading || t.headers.join(' | ')}" row ${y}`.slice(0, 160)
        return out
      }
    }
    // Layout B: years as columns, a "Total"/"Cases" row.
    const colIdx = t.headers.findIndex((h) => h.trim().startsWith(y))
    if (colIdx >= 0) {
      const row =
        t.rows.find((r) => /^(total|total cases|confirmed cases|cases|all cases)\b/i.test((r[0] ?? '').trim())) ??
        (t.rows.length === 1 ? t.rows[0] : undefined)
      const v = row ? num(row[colIdx]) : null
      if (v != null) {
        out.cases = v
        out.basis = `table "${t.caption || t.heading || 'cases by year'}" column ${y}`.slice(0, 160)
        return out
      }
    }
  }
  for (const s of info.keyStats) {
    const m =
      new RegExp(`\\b(?:total\\s+)?(?:confirmed\\s+)?(?:measles\\s+)?cases\\s+(?:in\\s+|for\\s+)?${y}(?:\\s+to date)?\\s*:\\s*(\\d{1,4})\\b`, 'i').exec(s) ??
      new RegExp(`\\b${y}\\s+(?:total\\s+)?(?:confirmed\\s+)?cases\\s*:\\s*(\\d{1,4})\\b`, 'i').exec(s) ??
      new RegExp(`\\b${y}\\s*:\\s*(\\d{1,4})\\s+(?:confirmed\\s+)?(?:measles\\s+)?cases\\b`, 'i').exec(s)
    if (m) {
      out.cases = Number(m[1])
      out.basis = `text "${s.slice(0, 120)}"`
      return out
    }
  }
  out.problem = `no ${y} case count found in tables or key statistics`
  return out
}
