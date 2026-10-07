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
  asOfBasis?: string
  total?: number
  totalBasis?: 'total row' | 'key statistic' | 'sum of a complete county table'
  counties: { fips: string; name: string; cases: number }[]
  /** Cases with county "Unknown" (counted in a complete-table sum, not mapped to a county). */
  unknownCounty?: number
  table?: { headers: string[]; rows: number; pairs: number }
  unmatched: string[]
  problem?: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Every County | Cases column pair in a table (MDH may lay a long county list out side by side). */
function findCountyTable(tables: PageTable[]): { t: PageTable; pairs: { nameIdx: number; valIdx: number }[] } | null {
  for (const t of tables) {
    const hs = t.headers.map(norm)
    const pairs: { nameIdx: number; valIdx: number }[] = []
    hs.forEach((h, nameIdx) => {
      if (!/\bcounty\b/.test(h)) return
      // The value column is the next header naming a count (before the next County header).
      for (let i = nameIdx + 1; i < hs.length && !/\bcounty\b/.test(hs[i]); i++) {
        if (/\b(cases?|count|number|total)\b/.test(hs[i]) && !/\b(rate|incidence|percent)\b/.test(hs[i])) {
          pairs.push({ nameIdx, valIdx: i })
          return
        }
      }
    })
    if (pairs.length) return { t, pairs }
  }
  return null
}

const MN_COUNTY_COUNT = 87

/**
 * Pertussis year-to-date cases by county. The statewide total is taken from an explicit Total row, a
 * key statistic ("186 cases"), or, only when the table lists all 87 counties, the sum of its rows
 * (including an "Unknown" county row). A partial county list never yields a total.
 */
export function parsePertussisPage(info: PageInfo, year: number): PertussisParse {
  const out: PertussisParse = { year, counties: [], unmatched: [] }
  const found = findCountyTable(info.tables)
  // As-of date: a phrase about cases near the table, else the page's "Updated" date.
  const caseAsOf = info.asOfPhrases.find((p) => /\b(cases?|counts?|reported|county)\b/i.test(p.context.split(/[.!?]\s/).pop() ?? ''))
  const tableAsOf = found ? /\bas of:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(`${found.t.caption} ${found.t.heading}`) : null
  if (tableAsOf) {
    const [mo, d, y] = tableAsOf[1].split('/')
    out.asOf = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    out.asOfBasis = 'table caption/heading'
  } else if (caseAsOf) {
    out.asOf = caseAsOf.date
    out.asOfBasis = `"...${caseAsOf.context.slice(-60)} as of"`
  } else if (info.updated) {
    out.asOf = info.updated
    out.asOfBasis = 'page Updated date'
  }
  if (!found) {
    out.problem = 'no table with a County column and a case-count column'
    return out
  }
  const { t, pairs } = found
  out.table = { headers: t.headers.slice(0, 12), rows: t.rows.length, pairs: pairs.length }
  let total: number | undefined
  let unknown = 0
  let unknownSeen = false
  const seen = new Set<string>()
  for (const r of t.rows) {
    for (const { nameIdx, valIdx } of pairs) {
      const name = (r[nameIdx] ?? '').trim()
      const v = num(r[valIdx])
      if (!name) continue
      if (/^(total|statewide|minnesota|state total|all counties)\b/i.test(name)) {
        if (v != null) total = v
        continue
      }
      if (/^(unknown|missing|not reported|other)\b/i.test(name)) {
        unknownSeen = true
        if (v != null) unknown += v
        continue
      }
      const c = countyByName(name)
      if (!c) {
        if (out.unmatched.length < 10) out.unmatched.push(name.slice(0, 40))
        continue
      }
      if (v != null && !seen.has(c.fips)) {
        seen.add(c.fips)
        out.counties.push({ fips: c.fips, name: c.name, cases: v })
      }
    }
  }
  if (unknownSeen) out.unknownCounty = unknown
  const keyStat = info.keyStats
    .map((k) => /\b(?:total(?: of)?\s+)?(\d{1,3}(?:,\d{3})*|\d+)\s+(?:confirmed(?: and probable)?\s+|reported\s+)?(?:pertussis\s+)?cases\b/i.exec(k))
    .find((m, i) => m && !/\b(19|20)\d\d\b/.test(m[1]) && /\b(total|statewide|minnesota|so far|year to date|ytd)\b/i.test(info.keyStats[i]))
  if (total != null) {
    out.total = total
    out.totalBasis = 'total row'
  } else if (keyStat) {
    out.total = Number(keyStat[1].replace(/,/g, ''))
    out.totalBasis = 'key statistic'
  } else if (out.counties.length === MN_COUNTY_COUNT && !out.unmatched.length) {
    out.total = out.counties.reduce((a, c) => a + c.cases, 0) + unknown
    out.totalBasis = 'sum of a complete county table'
  } else {
    out.problem = out.unmatched.length
      ? `rows not recognized as counties: ${out.unmatched.join(', ')}`
      : `no Total row and the county table is incomplete (${out.counties.length} of ${MN_COUNTY_COUNT} counties), so no statewide total`
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
    // Layout A: rows by year (Year | ... | Total cases). Prefer an explicit total column; the real MDH table
    // also has "Exposure outside U.S. (imported case)" and "Exposure within U.S." breakdown columns.
    const yIdx = hs.findIndex((h) => /^(year|calendar year)$/.test(h))
    if (yIdx >= 0) {
      const others = hs.map((h, i) => ({ h, i })).filter((x) => x.i !== yIdx)
      const col =
        others.find((x) => /^total( confirmed)?( measles)? cases?$|^total$|^cases?$|^confirmed cases?$|^total cases? confirmed$/.test(x.h)) ??
        others.find((x) => /\btotal\b/.test(x.h)) ??
        (others.length === 1 && /\b(cases?|confirmed|number)\b/.test(others[0].h) ? others[0] : undefined)
      const row = t.rows.find((r) => (r[yIdx] ?? '').trim().startsWith(y))
      const v = row && col ? num(row[col.i]) : null
      if (v != null) {
        out.cases = v
        out.basis = `table "${t.caption || t.heading || t.headers.join(' | ')}" row ${y}, column "${t.headers[col!.i]}"`.slice(0, 200)
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
