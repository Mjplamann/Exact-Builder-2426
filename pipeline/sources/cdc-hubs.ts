// CDC respiratory forecast hubs (GitHub) — Minnesota target data + CDC ensemble forecasts.
//
// The FluSight, COVID-19 and RSV forecast hubs publish the official weekly "target data" that CDC
// uses to score forecasts:
//   * wk inc <x> hosp            — NHSN new laboratory-confirmed hospital admissions (count)
//   * wk inc <x> prop ed visits  — NSSP proportion of emergency department visits (0–1)
// Files keep every reporting vintage ("as_of"); we take the newest vintage for each week.
// Ensemble forecasts are published every Wednesday with a Saturday reference_date.
import { parquetReadObjects } from 'hyparquet'
import type { Forecast, GeoRef, MetricKind, PathogenId, Point, QuantileForecastPoint, Series } from '../../shared/types.ts'
import { addDays, weekEndingSaturday } from '../../shared/mmwr.ts'
import { fetchBuffer, fetchText, fetchTextOrNull } from '../lib/http.ts'
import { parseCsv, num } from '../lib/csv.ts'
import { makeSeries, roundValue, STATE_GEO } from '../lib/series.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'
import { loadPrismThresholds } from '../lib/prism.ts'

const RAW = 'https://raw.githubusercontent.com'
const US_GEO: GeoRef = { type: 'national', code: 'US', name: 'United States' }
const LOCATIONS: Record<string, GeoRef> = { '27': STATE_GEO, US: US_GEO }

interface Hub {
  pathogen: PathogenId
  name: string
  repo: string
  timeSeries: string
  ensemble: string
  forecastSource: string
  targets: Record<string, MetricKind>
}

const HUBS: Hub[] = [
  {
    pathogen: 'influenza',
    name: 'Flu',
    repo: 'cdcepi/FluSight-forecast-hub',
    timeSeries: 'target-data/time-series.csv',
    ensemble: 'FluSight-ensemble',
    forecastSource: 'cdc-flusight',
    targets: { 'wk inc flu hosp': 'hosp_admissions', 'wk inc flu prop ed visits': 'ed_visit_pct' },
  },
  {
    pathogen: 'covid',
    name: 'COVID-19',
    repo: 'CDCgov/covid19-forecast-hub',
    timeSeries: 'target-data/time-series.parquet',
    ensemble: 'CovidHub-ensemble',
    forecastSource: 'cdc-covidhub',
    targets: { 'wk inc covid hosp': 'hosp_admissions', 'wk inc covid prop ed visits': 'ed_visit_pct' },
  },
  {
    pathogen: 'rsv',
    name: 'RSV',
    repo: 'CDCgov/rsv-forecast-hub',
    timeSeries: 'target-data/time-series.parquet',
    ensemble: 'RSVHub-ensemble',
    forecastSource: 'cdc-rsvhub',
    targets: { 'wk inc rsv hosp': 'hosp_admissions', 'wk inc rsv prop ed visits': 'ed_visit_pct' },
  },
]

interface Obs {
  target: string
  date: string
  location: string
  asOf: string
  value: number | null
}

const isoOf = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).slice(0, 10)
}

async function readTimeSeries(hub: Hub): Promise<Obs[]> {
  const url = `${RAW}/${hub.repo}/main/${hub.timeSeries}`
  const out: Obs[] = []
  if (hub.timeSeries.endsWith('.parquet')) {
    const buf = await fetchBuffer(url, { timeoutMs: 180_000 })
    const rows = (await parquetReadObjects({ file: buf })) as Record<string, unknown>[]
    for (const r of rows) {
      const location = String(r.location)
      if (!(location in LOCATIONS)) continue
      out.push({ target: String(r.target), date: isoOf(r.target_end_date), location, asOf: isoOf(r.as_of), value: num(r.observation) })
    }
  } else {
    const text = await fetchText(url, { timeoutMs: 300_000 })
    // Large file (~85 MB): filter lines before full CSV parsing.
    const lines = text.split('\n')
    const header = lines[0]
    const keep = lines.filter((l, i) => i > 0 && (l.includes(',"27",') || l.includes(',"US",')))
    for (const r of parseCsv([header, ...keep].join('\n'))) {
      out.push({ target: r.target, date: r.target_end_date, location: r.location, asOf: r.as_of, value: num(r.observation) })
    }
  }
  return out
}

function latestVintage(obs: Obs[]): Map<string, Obs> {
  const best = new Map<string, Obs>()
  for (const o of obs) {
    const key = `${o.target}|${o.location}|${o.date}`
    const prev = best.get(key)
    if (!prev || o.asOf > prev.asOf) best.set(key, o)
  }
  return best
}

const scale = (metric: MetricKind, v: number) => (metric === 'ed_visit_pct' ? v * 100 : v)

function stripPop<T extends { population?: number }>(t: T): Omit<T, 'population'> {
  const { population: _p, ...rest } = t
  return rest
}

async function readEnsemble(hub: Hub, now: string, ctx: SourceContext): Promise<Forecast[]> {
  // Reference dates are Saturdays; try the current week back to 3 weeks.
  const thisSat = weekEndingSaturday(now.slice(0, 10))
  for (let k = 0; k <= 3; k++) {
    const ref = addDays(thisSat, -7 * k)
    const url = `${RAW}/${hub.repo}/main/model-output/${hub.ensemble}/${ref}-${hub.ensemble}.csv`
    const text = await fetchTextOrNull(url, { retries: 1 })
    if (!text) continue
    const rows = parseCsv(text).filter((r) => r.location in LOCATIONS && r.output_type === 'quantile')
    const forecasts: Forecast[] = []
    for (const [target, metric] of Object.entries(hub.targets)) {
      for (const loc of Object.keys(LOCATIONS)) {
        const sub = rows.filter((r) => r.target === target && r.location === loc && Number(r.horizon) >= 0)
        if (!sub.length) continue
        const byDate = new Map<string, Map<string, number>>()
        const horizonOf = new Map<string, number>()
        for (const r of sub) {
          if (!byDate.has(r.target_end_date)) byDate.set(r.target_end_date, new Map())
          byDate.get(r.target_end_date)!.set(String(Number(r.output_type_id)), Number(r.value))
          horizonOf.set(r.target_end_date, Number(r.horizon))
        }
        const points: QuantileForecastPoint[] = []
        for (const [date, q] of [...byDate].sort(([a], [b]) => (a < b ? -1 : 1))) {
          const get = (level: string) => {
            const v = q.get(level)
            return v == null ? NaN : Math.round(scale(metric, v) * 1000) / 1000
          }
          const p: QuantileForecastPoint = {
            date,
            horizon: horizonOf.get(date)!,
            median: get('0.5'),
            lo50: get('0.25'),
            hi50: get('0.75'),
            lo80: get('0.1'),
            hi80: get('0.9'),
            lo95: get('0.025'),
            hi95: get('0.975'),
          }
          if ([p.median, p.lo50, p.hi50, p.lo95, p.hi95].every(Number.isFinite)) points.push(p)
        }
        if (!points.length) continue
        const geo = LOCATIONS[loc]
        forecasts.push({
          id: `cdc-hubs:${hub.ensemble}:${metric}:${geo.code}`,
          source: hub.forecastSource,
          model: hub.ensemble,
          seriesId: seriesIdFor(hub, metric, geo),
          pathogen: hub.pathogen,
          metric,
          geo,
          referenceDate: ref,
          issuedAt: addDays(ref, -3),
          points,
          method: `CDC ${hub.ensemble}: quantile ensemble of models submitted to the ${hub.name} forecast hub.`,
        })
      }
    }
    ctx.log.info(`${hub.ensemble}: reference ${ref}, ${forecasts.length} MN/US forecast(s)`)
    return forecasts
  }
  ctx.log.info(`${hub.ensemble}: no ensemble in the last 4 weeks (hub off-season)`)
  return []
}

function seriesIdFor(hub: Hub, metric: MetricKind, geo: GeoRef) {
  const dataset = metric === 'hosp_admissions' ? 'nhsn-admissions' : 'nssp-ed-state'
  return makeSeries({ source: 'cdc-hubs', dataset, pathogen: hub.pathogen, metric, geo, label: '', points: [] }).id
}

const LABELS: Record<MetricKind, string> = {
  hosp_admissions: 'new hospital admissions per week (NHSN)',
  ed_visit_pct: '% of emergency department visits (NSSP)',
} as Record<MetricKind, string>

export const cdcHubs: SourceModule = {
  meta: {
    id: 'cdc-hubs',
    name: 'CDC respiratory forecast hubs',
    publisher: 'CDC — FluSight, COVID-19 and RSV Forecast Hubs',
    url: 'https://github.com/cdcepi/FluSight-forecast-hub',
    description:
      'Official weekly Minnesota and U.S. target data used by CDC forecasting: laboratory-confirmed hospital admissions reported to NHSN, and the share of emergency department visits for flu, COVID-19 and RSV from the National Syndromic Surveillance Program (NSSP). Also CDC ensemble forecasts 0–3 weeks ahead.',
    geography: 'Minnesota statewide; United States for comparison',
    cadence: 'Weekly (data through Saturday, posted Wednesday)',
    attribution: 'CDC NHSN and NSSP via the CDC FluSight, COVID-19 and RSV Forecast Hubs',
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const hosp: Series[] = []
    const ed: Series[] = []
    const forecasts: Forecast[] = []
    const diagnostics: Record<string, unknown> = {}
    const errors: string[] = []
    const prism = await loadPrismThresholds().catch(() => null)
    diagnostics.prism = { nssp: prism?.nsspVintage, nhsn: prism?.nhsnVintage }
    for (const hub of HUBS) {
      try {
        const obs = latestVintage(await readTimeSeries(hub))
        for (const [target, metric] of Object.entries(hub.targets)) {
          for (const [loc, geo] of Object.entries(LOCATIONS)) {
            const pts: Point[] = [...obs.values()]
              .filter((o) => o.target === target && o.location === loc && o.date >= ctx.historyStart)
              .sort((a, b) => (a.date < b.date ? -1 : 1))
              .map((o) => [o.date, o.value == null ? null : roundValue(scale(metric, o.value), metric)])
            if (!pts.length) continue
            const thresholds =
              loc === '27' ? (metric === 'ed_visit_pct' ? prism?.nssp.get(hub.pathogen) : undefined) : undefined
            const series = makeSeries({
              source: 'cdc-hubs',
              dataset: metric === 'hosp_admissions' ? 'nhsn-admissions' : 'nssp-ed-state',
              pathogen: hub.pathogen,
              metric,
              geo,
              label: `${hub.name} — ${LABELS[metric]}`,
              points: pts,
              note:
                metric === 'hosp_admissions'
                  ? 'Hospitals report to NHSN weekly; the most recent week is often revised.'
                  : 'Share of all ED visits with a diagnosis of this illness (NSSP).',
            })
            if (thresholds) series.thresholds = stripPop(thresholds)
            ;(metric === 'hosp_admissions' ? hosp : ed).push(series)
            // Minnesota admissions per 100k, using the same population CDC used to set its NHSN thresholds.
            const nhsnT = prism?.nhsn.get(hub.pathogen)
            if (metric === 'hosp_admissions' && loc === '27' && nhsnT?.population) {
              const pop = nhsnT.population
              const rate = makeSeries({
                source: 'cdc-hubs',
                dataset: 'nhsn-admissions',
                pathogen: hub.pathogen,
                metric: 'hosp_rate',
                geo,
                label: `${hub.name} — hospital admissions per 100,000 residents (NHSN)`,
                points: pts.map(([d, v]) => [d, v == null ? null : roundValue((v / pop) * 1e5, 'hosp_rate')]),
                note: `Weekly NHSN admissions divided by Minnesota's population (${pop.toLocaleString('en-US')}).`,
              })
              rate.thresholds = stripPop(nhsnT)
              hosp.push(rate)
            }
          }
        }
        diagnostics[hub.repo] = { observations: obs.size }
      } catch (e) {
        errors.push(`${hub.repo} target data: ${e instanceof Error ? e.message : e}`)
      }
      try {
        forecasts.push(...(await readEnsemble(hub, ctx.now, ctx)))
      } catch (e) {
        errors.push(`${hub.ensemble}: ${e instanceof Error ? e.message : e}`)
      }
    }
    for (const err of errors) ctx.log.warn(err)
    return {
      datasets: [
        { source: 'cdc-hubs', dataset: 'nhsn-admissions', series: hosp },
        { source: 'cdc-hubs', dataset: 'nssp-ed-state', series: ed },
      ],
      forecasts,
      message: errors.length ? `Partial refresh: ${errors.join('; ')}` : undefined,
      diagnostics,
    }
  },
}
