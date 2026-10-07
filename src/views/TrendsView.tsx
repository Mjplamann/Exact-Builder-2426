// Trends & projections: explore any tracked illness × measure over time, compare places and seasons,
// and see short-term projections with honest uncertainty and backtest accuracy.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MetricKind, PathogenId, Series } from '../../shared/types'
import { addDays } from '../../shared/mmwr'
import { getProfile, pathogenName } from '../content'
import { useDashboard } from '../lib/dashboard'
import type { DashboardData } from '../lib/data'
import { formatDate } from '../lib/format'
import { forecastsFor, preferredForecast } from '../lib/series'
import { RANGE_WEEKS, useAppState, type TimeRange } from '../lib/state'
import { FilterBar } from '../components/layout/FilterBar'
import { TrendChart, type TrendSeriesInput } from '../components/charts/TrendChart'
import { Callout, Card, EmptyState } from '../components/ui'
import { LabeledSelect, MetricTabs, PathogenSelect, Segmented, Toggle } from '../components/trends/Controls'
import { AboutMeasure } from '../components/trends/AboutMeasure'
import { ProjectionDetails } from '../components/trends/ProjectionDetails'
import { SignalsTable } from '../components/trends/SignalsTable'
import { LatestSummary } from '../components/trends/LatestSummary'
import { chartedCsv, downloadText, safeFilePart } from '../components/trends/csv'
import {
  DEFAULT_PATHOGEN, METRIC_TAB, agesFor, forecastSourceName, geoColor, geoLabel, lastObs, metricsFor, pathogenGroups, resolveSelection,
  sentenceName, signalRows, sourceInfo, summarizeSeries,
} from '../components/trends/model'

const RANGE_TEXT: Record<TimeRange, string> = {
  '3m': 'the last 3 months',
  '6m': 'the last 6 months',
  '1y': 'the last year',
  '2y': 'the last 2 years',
  '5y': 'all available weeks',
}

const COMPARISON_GEOS = new Set(['national', 'hhs-region', 'census-region'])

export default function TrendsView() {
  const { data } = useDashboard()
  if (!data) return null
  return <TrendsExplorer data={data} />
}

function TrendsExplorer({ data }: { data: DashboardData }) {
  const { state, update } = useAppState()
  const all = data.series
  const now = data.manifest.generatedAt
  const chartRef = useRef<HTMLHeadingElement>(null)

  // ── Illness ──
  const groups = useMemo(() => pathogenGroups(all), [all])
  const available = useMemo(() => new Set(groups.flatMap((g) => g.options.map((o) => o.id))), [groups])
  const [pathogenPref, setPathogenPref] = useState<PathogenId | undefined>(state.pathogenId)
  useEffect(() => {
    if (state.pathogenId) setPathogenPref(state.pathogenId)
  }, [state.pathogenId])
  const fallbackPathogen = available.has(DEFAULT_PATHOGEN) ? DEFAULT_PATHOGEN : groups[0]?.options[0]?.id
  const pathogen = pathogenPref && available.has(pathogenPref) ? pathogenPref : fallbackPathogen
  const missingRequest = pathogenPref && !available.has(pathogenPref) ? pathogenPref : undefined
  const who = pathogen ? pathogenName(pathogen) : ''
  /** Mid-sentence form, e.g. "flu" (but "COVID-19"). */
  const whoText = pathogen ? sentenceName(pathogen) : ''

  // ── Measure ──
  const metrics = useMemo(() => (pathogen ? metricsFor(all, pathogen) : []), [all, pathogen])
  const pulseEntry = data.pulse.pathogens.find((p) => p.pathogen === pathogen)
  const [metricPref, setMetricPref] = useState<MetricKind>()
  const primaryMetric = pulseEntry?.primary?.metric
  const metric: MetricKind | undefined =
    metricPref && metrics.includes(metricPref) ? metricPref : primaryMetric && metrics.includes(primaryMetric) ? primaryMetric : metrics[0]

  // ── Age band (only when age-specific series exist) ──
  const ages = useMemo(() => (pathogen && metric ? agesFor(all, pathogen, metric) : []), [all, pathogen, metric])
  const hasAllAges = useMemo(
    () => !!pathogen && !!metric && all.some((s) => s.pathogen === pathogen && s.metric === metric && !s.age),
    [all, pathogen, metric],
  )
  const [agePref, setAgePref] = useState('')
  const age = ages.includes(agePref) ? agePref : hasAllAges ? '' : (ages[0] ?? '')

  // ── Options ──
  const [sourcePref, setSourcePref] = useState<string>()
  const [modelPref, setModelPref] = useState<string>()
  const [compareSeasons, setCompareSeasons] = useState(false)
  const [showProjections, setShowProjections] = useState(true)
  const [showCompare, setShowCompare] = useState(false)

  const sel = useMemo(
    () =>
      pathogen && metric
        ? resolveSelection(all, { pathogen, metric, age: age || undefined, geo: state.geo, sourceId: sourcePref })
        : undefined,
    [all, pathogen, metric, age, state.geo, sourcePref],
  )
  const primary = sel?.primary

  // ── Forecasts for the main line ──
  const allForecasts = data.forecasts.forecasts
  const primaryForecasts = useMemo(() => {
    if (!primary) return []
    // CDC ensembles first, then our projection.
    return [...forecastsFor(allForecasts, primary)].sort((a, b) => Number(a.source === 'mn-pulse') - Number(b.source === 'mn-pulse'))
  }, [allForecasts, primary])
  const forecast = primaryForecasts.find((f) => f.id === modelPref) ?? (primary ? preferredForecast(allForecasts, primary) : undefined)

  // ── What goes on the chart ──
  const lineName = (s: Series) => `${geoLabel(s.geo)}${s.age ? ` (ages ${s.age})` : ''}`
  const chartInputs: TrendSeriesInput[] = useMemo(() => {
    if (!primary || !sel) return []
    const out: TrendSeriesInput[] = [{ series: primary, name: lineName(primary), color: geoColor(primary.geo) }]
    if (!compareSeasons) {
      if (sel.state) out.push({ series: sel.state, name: lineName(sel.state), color: geoColor(sel.state.geo), muted: true })
      if (showCompare) for (const r of sel.regional) out.push({ series: r, name: lineName(r), color: geoColor(r.geo), muted: true })
    }
    return out
  }, [primary, sel, compareSeasons, showCompare])
  const chartForecasts = useMemo(() => (showProjections && forecast ? [forecast] : []), [showProjections, forecast])
  const charted = useMemo(() => new Set(chartInputs.map((c) => c.series.id)), [chartInputs])

  // ── Summaries ──
  const primaryRow = useMemo(() => (primary ? summarizeSeries(primary, data.pulse, data.manifest, now) : undefined), [primary, data, now])
  const rows = useMemo(
    () => (pathogen ? signalRows(all, pathogen, state.geo, data.pulse, data.manifest, now) : []),
    [all, pathogen, state.geo, data, now],
  )
  const profile = pathogen ? getProfile(pathogen) : undefined

  // County fallback: which measures *do* have data for the chosen county?
  const localMetrics = useMemo(() => {
    if (!pathogen || state.geo.type === 'state') return []
    const set = new Set(all.filter((s) => s.pathogen === pathogen && s.geo.type === state.geo.type && s.geo.code === state.geo.code).map((s) => s.metric))
    return metrics.filter((m) => set.has(m) && m !== metric)
  }, [all, pathogen, state.geo, metrics, metric])
  const requestedPlace =
    state.geo.type === 'county' ? geoLabel({ type: 'county', code: state.geo.code, name: state.geo.code }) : state.geo.type === 'mdh-region' ? state.geo.code : 'Minnesota'

  // ── Actions ──
  const choosePathogen = (id: PathogenId) => {
    setPathogenPref(id)
    setSourcePref(undefined)
    setModelPref(undefined)
    update({ pathogenId: id })
  }

  const pickSeries = (s: Series) => {
    if (s.pathogen !== pathogen) choosePathogen(s.pathogen)
    setMetricPref(s.metric)
    setAgePref(s.age ?? '')
    if (COMPARISON_GEOS.has(s.geo.type)) {
      setShowCompare(true)
      setCompareSeasons(false)
      setSourcePref(undefined)
    } else {
      setSourcePref(s.id)
    }
    requestAnimationFrame(() => {
      chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      chartRef.current?.focus({ preventScroll: true })
    })
  }

  const download = () => {
    if (!primary) return
    const end = chartInputs.map((c) => lastObs(c.series)?.[0] ?? '').reduce((a, b) => (b > a ? b : a), '')
    const weeks = RANGE_WEEKS[compareSeasons ? '5y' : state.range]
    const csv = chartedCsv(
      chartInputs.map((c) => c.series),
      compareSeasons ? [] : chartForecasts,
      { after: end ? addDays(end, -7 * weeks) : undefined, end: end || undefined },
      (id) => sourceInfo(data.manifest, id)?.name ?? id,
    )
    const place = state.geo.type === 'state' ? 'minnesota' : state.geo.code
    downloadText(`mn-pulse_${safeFilePart(who)}_${safeFilePart(METRIC_TAB[primary.metric].label)}_${safeFilePart(place)}_${now.slice(0, 10)}.csv`, csv)
  }

  // ── Render ──
  const heading = (
    <header className="mb-5">
      <h1 className="text-2xl font-bold tracking-tight text-ink-1 sm:text-3xl">Trends &amp; projections</h1>
      <p className="mt-1 max-w-3xl text-ink-2">
        See how each illness has changed week by week, how this season compares with past ones and the rest of the country,
        and where it may head over the next few weeks.
      </p>
    </header>
  )

  if (!pathogen || !metric) {
    return (
      <div>
        {heading}
        <EmptyState title="No trend data is available yet">
          The data pipeline has not published any weekly series. Check the Sources page for the status of each data feed.
        </EmptyState>
      </div>
    )
  }

  const tab = METRIC_TAB[metric]
  const title = `${who}: ${tab.title}`
  const stale = primaryRow?.stale && primaryRow.latestDate
  const ariaLabel = primary
    ? `Line chart of ${whoText} ${tab.title} (${tab.unitText}) in ${lineName(primary)} over ${compareSeasons ? 'recent seasons, aligned by week of season' : RANGE_TEXT[state.range]}` +
      `${chartForecasts.length ? ', with a projection for the next few weeks' : ''}` +
      `${chartInputs.length > 1 ? `, compared with ${chartInputs.slice(1).map((c) => c.name).join(', ')}` : ''}.`
    : ''

  return (
    <div>
      {heading}

      {/* Filters: one row above everything they scope */}
      <div className="mb-4 rounded-2xl border border-line bg-surface-1 p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <PathogenSelect groups={groups} value={pathogen} onChange={choosePathogen} />
          {ages.length > 0 && (
            <LabeledSelect label="Age group" value={age} onChange={setAgePref} id="trends-age">
              {hasAllAges && <option value="">All ages</option>}
              {ages.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </LabeledSelect>
          )}
          <FilterBar showAudience={false} />
        </div>
        <div role="group" aria-label="Chart options" className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3">
          <Toggle checked={compareSeasons} onChange={setCompareSeasons} label="Compare seasons" />
          <Toggle checked={showProjections} onChange={setShowProjections} label="Show projections" />
          <Toggle
            checked={showCompare && !compareSeasons}
            onChange={setShowCompare}
            disabled={compareSeasons}
            label="Show U.S./regional comparison"
          />
        </div>
      </div>

      {missingRequest && (
        <div className="mb-4">
          <Callout title={`No trend data for ${pathogenName(missingRequest)} yet`}>
            None of our sources publish weekly numbers for {sentenceName(missingRequest)} right now, so this page shows {whoText}{' '}
            instead.
          </Callout>
        </div>
      )}

      <Card className="mb-4" aria-labelledby="trend-title">
        <MetricTabs metrics={metrics} value={metric} onChange={(m) => setMetricPref(m)} panelId="trend-panel" />
        <div id="trend-panel" role="tabpanel" aria-labelledby={`tab-${metric}`} className="mt-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="trend-title" ref={chartRef} tabIndex={-1} className="text-lg font-semibold tracking-tight text-ink-1 outline-none">
                {title}
              </h2>
              <p className="mt-0.5 text-sm text-ink-2">
                {tab.unitText} · {primary ? lineName(primary) : requestedPlace} · weekly
              </p>
            </div>
            {sel && sel.alternatives.length > 1 && primary && (
              <LabeledSelect label="Data source" value={primary.id} onChange={setSourcePref} id="trends-source">
                {sel.alternatives.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sourceInfo(data.manifest, s.source)?.name ?? s.source}
                  </option>
                ))}
              </LabeledSelect>
            )}
          </div>

          {primaryRow && (
            <div className="mb-4">
              <LatestSummary row={primaryRow} who={whoText} />
            </div>
          )}

          <div className="mb-3 space-y-2">
            {sel?.localMissing && (
              <Callout title={`No ${tab.title} data for ${requestedPlace}`}>
                {primary ? `Showing ${geoLabel(primary.geo)} instead.` : ''}{' '}
                {localMetrics.length > 0 ? (
                  <>
                    {requestedPlace} does have:{' '}
                    {localMetrics.map((m, i) => (
                      <span key={m}>
                        {i > 0 && ', '}
                        <button type="button" onClick={() => setMetricPref(m)} className="font-medium text-accent underline underline-offset-2">
                          {METRIC_TAB[m].label}
                        </button>
                      </span>
                    ))}
                    .
                  </>
                ) : (
                  `County-level numbers for ${whoText} are not published by our sources yet.`
                )}
              </Callout>
            )}
            {sel?.geoNote && <Callout>{sel.geoNote}</Callout>}
            {stale && (
              <Callout tone="warn" title="Not updated recently">
                The latest number is from the week ending {formatDate(primaryRow.latestDate, true)}. This measure may be paused for
                the off-season, or the source may be delayed.
              </Callout>
            )}
            {showCompare && !compareSeasons && sel && sel.regional.length === 0 && primary && (
              <p className="text-xs text-ink-3">No U.S. or regional numbers in the same units are published for this measure.</p>
            )}
            {compareSeasons && (sel?.state || (showCompare && sel?.regional.length)) && (
              <p className="text-xs text-ink-3">Comparison lines are hidden while comparing seasons.</p>
            )}
            {showProjections && !forecast && primary && (
              <p className="text-xs text-ink-3">No projection is available for this measure.</p>
            )}
            {showProjections && forecast && compareSeasons && (
              <p className="text-xs text-ink-3">Projections appear in the regular view. Turn off “Compare seasons” to see them.</p>
            )}
          </div>

          {primary && showProjections && !compareSeasons && primaryForecasts.length > 1 && forecast && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span>Projection model</span>
              <Segmented
                label="Projection model"
                options={primaryForecasts.map((f) => ({ id: f.id, label: forecastSourceName(f) }))}
                value={forecast.id}
                onChange={setModelPref}
              />
            </div>
          )}
          {primary ? (
            <TrendChart
              series={chartInputs}
              forecasts={chartForecasts}
              range={state.range}
              compareSeasons={compareSeasons}
              height={340}
              ariaLabel={ariaLabel}
            />
          ) : sel?.countyOnly ? (
            <EmptyState title="This measure is published by county only">
              Choose a county under “Where” to see {whoText} {tab.title} for that county.
            </EmptyState>
          ) : (
            <EmptyState title="No data for this combination">
              Try another measure{age ? ' or age group' : ''}, or choose “All of Minnesota”.
            </EmptyState>
          )}

        </div>
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {primary ? (
          <AboutMeasure
            series={primary}
            row={primaryRow}
            source={sourceInfo(data.manifest, primary.source)}
            who={whoText}
            reading={profile?.readingTheNumbers}
          />
        ) : (
          <Card aria-labelledby="about-measure">
            <h2 id="about-measure" className="mb-2 text-lg font-semibold tracking-tight text-ink-1">
              About this measure
            </h2>
            <p className="text-sm text-ink-2">Choose a measure with data to see what it means and where it comes from.</p>
          </Card>
        )}
        <ProjectionDetails
          series={primary}
          forecasts={primaryForecasts}
          selected={forecast}
          onSelect={setModelPref}
          who={whoText}
          shownOnChart={showProjections}
        />
      </div>

      <SignalsTable rows={rows} charted={charted} who={who} onPick={pickSeries} onDownload={download} canDownload={!!primary} />
    </div>
  )
}
