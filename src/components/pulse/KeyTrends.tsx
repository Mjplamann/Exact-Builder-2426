// "Key trends": % of emergency department visits for flu, COVID-19 and RSV on ONE axis (same unit),
// with forecast fans. Statewide by default; a selected county's series are used when published.
import { useMemo, useState } from 'react'
import type { Forecast, PathogenId, Series } from '../../../shared/types'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import type { DashboardData } from '../../lib/data'
import { formatDate, formatValue } from '../../lib/format'
import { findSeries, lastPoint, preferredForecast } from '../../lib/series'
import { useAppState, type TimeRange } from '../../lib/state'
import { pathogenName } from '../../content'
import { TrendChart } from '../charts/TrendChart'
import { seriesVar } from '../charts/chartTheme'
import { EmptyState } from '../ui'
import { hrefFor, naturalFrequency, sourceName } from './util'

/** Fixed entity → level-safe color slot (color follows the illness, never its row number). */
const BIG_THREE: { id: PathogenId; color: string }[] = [
  { id: 'influenza', color: seriesVar(1) },
  { id: 'covid', color: seriesVar(2) },
  { id: 'rsv', color: seriesVar(3) },
]

const RANGE_TEXT: Record<TimeRange, string> = {
  '3m': 'past 3 months',
  '6m': 'past 6 months',
  '1y': 'past year',
  '2y': 'past 2 years',
  '5y': 'all available weeks',
}

/** One series per illness: prefer the pulse's own primary signal, else the freshest and longest. */
function pickOne(candidates: Series[], preferredId?: string): Series | undefined {
  if (!candidates.length) return undefined
  const pref = preferredId && candidates.find((s) => s.id === preferredId)
  if (pref) return pref
  return [...candidates].sort((a, b) => {
    const la = lastPoint(a.points)?.[0] ?? ''
    const lb = lastPoint(b.points)?.[0] ?? ''
    return la !== lb ? (la < lb ? 1 : -1) : b.points.length - a.points.length
  })[0]
}

export function KeyTrends({ data }: { data: DashboardData }) {
  const { state, go } = useAppState()
  const [compare, setCompare] = useState(false)
  const fips = state.geo.type === 'county' ? state.geo.code : undefined
  const countyName = fips ? MN_COUNTY_BY_FIPS[fips]?.name : undefined

  const { picked, isCounty } = useMemo(() => {
    const primaryIds = new Map(data.pulse.pathogens.map((p) => [p.pathogen, p.primary?.seriesId]))
    const choose = (geoType: 'state' | 'county', geoCode: string) =>
      BIG_THREE.map((b) => {
        const s = pickOne(
          findSeries(data.series, { pathogen: b.id, metric: 'ed_visit_pct', geoType, geoCode }).filter((x) => x.points.length > 0),
          primaryIds.get(b.id),
        )
        return s ? { ...b, series: s } : null
      }).filter((x): x is { id: PathogenId; color: string; series: Series } => x != null)
    const county = fips ? choose('county', fips) : []
    return county.length ? { picked: county, isCounty: true } : { picked: choose('state', '27'), isCounty: false }
  }, [data.series, data.pulse.pathogens, fips])

  const forecasts = useMemo(
    () => picked.map((p) => preferredForecast(data.forecasts.forecasts, p.series)).filter((f): f is Forecast => !!f),
    [picked, data.forecasts.forecasts],
  )

  const latestDates = [...new Set(picked.map((p) => lastPoint(p.series.points)?.[0]).filter((d): d is string => !!d))]
  const where = isCounty ? `${countyName} County (health service area)` : 'Minnesota'
  const names = picked.map((p) => pathogenName(p.id))
  const sources = [...new Set(picked.map((p) => sourceName(data.manifest, p.series.source)))]
  const forecastModels = [...new Set(forecasts.map((f) => (f.source === 'mn-pulse' ? 'MN Pulse projection' : f.model)))]

  return (
    <section className="card flex h-full flex-col p-5 sm:p-6" aria-labelledby="trends-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="trends-title" className="text-lg font-semibold tracking-tight text-ink-1">
            Key trends
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            Share of all emergency department visits in {where} for {names.length ? listify(names) : 'flu, COVID-19 and RSV'},{' '}
            {compare ? 'this season compared with past seasons' : RANGE_TEXT[state.range]}.
          </p>
        </div>
        {picked.length > 0 && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1 text-sm text-ink-2 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Compare seasons
          </label>
        )}
      </div>

      {fips && !isCounty && picked.length > 0 && (
        <p className="mt-2 text-xs text-ink-3">County trend lines aren’t published for {countyName} County, so this chart shows Minnesota statewide.</p>
      )}

      {picked.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Trend data isn’t available yet">
            Minnesota emergency department data for flu, COVID-19 and RSV will appear here once the source publishes.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <TrendChart
              series={picked.map((p) => ({ series: p.series, name: pathogenName(p.id), color: p.color }))}
              forecasts={compare ? [] : forecasts}
              range={state.range}
              compareSeasons={compare}
              showThresholds={false}
              height={300}
              ariaLabel={`Line chart: percent of emergency department visits in ${where} for ${listify(names)}${
                compare ? ', by week of season across recent seasons' : `, ${RANGE_TEXT[state.range]}, with forecast ranges`
              }.`}
            />
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3" aria-label="Latest values">
            {picked.map((p) => {
              const lp = lastPoint(p.series.points)
              const freq = lp ? naturalFrequency(lp[1], 'ed_visit_pct', '%') : undefined
              return (
                <li key={p.id} className="min-w-0 rounded-lg bg-surface-2 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-1">
                      <span aria-hidden="true" className="inline-block h-0.5 w-3.5 shrink-0 self-center rounded-full" style={{ background: p.color }} />
                      {pathogenName(p.id)}
                    </p>
                    <p className="shrink-0 text-lg font-semibold text-ink-1">{lp ? formatValue(lp[1], '%') : '—'}</p>
                  </div>
                  <p className="text-xs text-ink-3">
                    {freq ?? 'No recent value'}
                    {lp && latestDates.length > 1 && <> · wk ending {formatDate(lp[0])}</>}
                  </p>
                </li>
              )
            })}
          </ul>

          <p className="mt-3 text-xs text-ink-3">
            {latestDates.length === 1 && <>Latest week ending {formatDate(latestDates[0], true)}. </>}
            Counts how much illness is sending people to the ER, not how many people are infected. Recent weeks may be revised.
            {!compare && forecastModels.length > 0 && <> Forecasts: {listify(forecastModels)}.</>} Source: {sources.join(', ')}.
          </p>
        </>
      )}

      <div className="mt-auto pt-4">
        <a
          href={hrefFor(state, 'trends')}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            go('trends')
          }}
          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          Explore all trends →
        </a>
      </div>
    </section>
  )
}

function listify(xs: string[]): string {
  if (xs.length <= 1) return xs.join('')
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}
