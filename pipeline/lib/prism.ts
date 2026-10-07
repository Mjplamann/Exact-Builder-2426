// CDC respiratory activity-level cut-points ("PRISM") published in CDCgov/forecasttools.
// Lower bounds of Low / Moderate / High / Very High for each state:
//   nssp/<vintage>.tsv  — % of ED visits (COVID-19, Influenza, RSV, ARI)
//   nhsn/<vintage>.tsv  — new admissions per 100k (COVID-19, Influenza, RSV)
// The newest vintage is discovered from the repo's file list via raw.githubusercontent.com HEAD probes
// over recent dates is impractical, so a small set of known vintages is tried newest-first.
import type { ActivityThresholds, PathogenId } from '../../shared/types.ts'
import { fetchTextOrNull } from './http.ts'
import { parseCsv, num } from './csv.ts'

const BASE = 'https://raw.githubusercontent.com/CDCgov/forecasttools/main/inst/extdata/prism_thresholds'
// Newest first. Add new vintages as CDC publishes them (also discovered via the GitHub API in CI).
const NSSP_VINTAGES = ['2026-09-04', '2025-11-23', '2024-10-06']
const NHSN_VINTAGES = ['2026-08-06']

const DISEASE: Record<string, PathogenId> = {
  'COVID-19': 'covid',
  COVID: 'covid',
  Influenza: 'influenza',
  RSV: 'rsv',
  ARI: 'respiratory-combined',
}

export type PrismTable = Map<PathogenId, ActivityThresholds & { population?: number }>

async function listVintages(kind: 'nssp' | 'nhsn', fallback: string[]): Promise<string[]> {
  // The GitHub contents API works in Actions (GITHUB_TOKEN raises limits); fall back to known vintages.
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
    const res = await fetch(
      `https://api.github.com/repos/CDCgov/forecasttools/contents/inst/extdata/prism_thresholds/${kind}`,
      { headers, signal: AbortSignal.timeout(20_000) },
    )
    if (res.ok) {
      const files = (await res.json()) as { name: string }[]
      const dates = files.map((f) => f.name.replace(/\.tsv$/, '')).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      if (dates.length) return dates.sort().reverse()
    }
  } catch {
    /* fall through */
  }
  return fallback
}

async function load(kind: 'nssp' | 'nhsn', state: string): Promise<{ table: PrismTable; vintage?: string }> {
  for (const vintage of await listVintages(kind, kind === 'nssp' ? NSSP_VINTAGES : NHSN_VINTAGES)) {
    const text = await fetchTextOrNull(`${BASE}/${kind}/${vintage}.tsv`, { retries: 1 })
    if (!text) continue
    const rows = parseCsv(text.replace(/\t/g, ','))
    const table: PrismTable = new Map()
    for (const r of rows) {
      if ((r.state_abb ?? '').toUpperCase() !== state) continue
      const pathogen = DISEASE[r.disease]
      if (!pathogen) continue
      const pick = (a: string, b: string) => num(r[a]) ?? num(r[b])
      const low = pick('perc_level_low', 'level_low')
      const moderate = pick('perc_level_moderate', 'level_moderate')
      const high = pick('perc_level_high', 'level_high')
      const veryHigh = pick('perc_level_very_high', 'level_very_high')
      if ([low, moderate, high, veryHigh].some((v) => v == null)) continue
      table.set(pathogen, {
        population: num(r.total_population) ?? undefined,
        low: low!,
        moderate: moderate!,
        high: high!,
        veryHigh: veryHigh!,
        by: `CDC respiratory activity levels for Minnesota (${kind === 'nssp' ? '% of ED visits' : 'admissions per 100k'}; thresholds ${vintage})`,
      })
    }
    if (table.size) return { table, vintage }
  }
  return { table: new Map() }
}

/** CDC PRISM thresholds for a state (default MN): ED % (nssp) and admissions per 100k (nhsn). */
export async function loadPrismThresholds(state = 'MN') {
  const [nssp, nhsn] = await Promise.all([load('nssp', state), load('nhsn', state)])
  return { nssp: nssp.table, nhsn: nhsn.table, nsspVintage: nssp.vintage, nhsnVintage: nhsn.vintage }
}
