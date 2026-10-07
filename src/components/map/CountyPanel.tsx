// Side panel for one selected county: plain-language summary, every metric available for the
// county, a county-vs-Minnesota trend, wastewater plants serving it, and who lives there.
import { useMemo } from 'react'
import type { AgeGroupId, CountyMetric, MapLayer, PulseFile, Series } from '../../../shared/types'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS, type CountyPopulation } from '../../../shared/geo/mnCounties'
import { getProfile, pathogenName } from '../../content'
import { formatDate, formatValue, LEVEL_LABEL, UNIT_SUFFIX } from '../../lib/format'
import type { TimeRange } from '../../lib/state'
import { TrendChart, type TrendSeriesInput } from '../charts/TrendChart'
import { AUDIENCES } from '../layout/FilterBar'
import { EmptyState, LevelBadge, SourceTag, TrendPill } from '../ui'
import {
  groupTitle, HSA_NOTE, isHsaEstimate, layerPhrase, levelRank, metricLevel, sourceName, stateSeriesFor, stateSignal, TREND_PHRASE,
} from './mapData'
import type { Manifest } from '../../../shared/types'
import { StatewideSignals } from './StatewidePanel'

interface Props {
  pulse: PulseFile
  series: Series[]
  manifest?: Manifest
  fips: string
  /** Layer currently drawn on the map. */
  layer?: MapLayer
  audience: AgeGroupId
  range: TimeRange
  onClose: () => void
  onPickLayer: (layerId: string) => void
}

interface Row {
  layer: MapLayer
  metric: CountyMetric
}

const AGE_ROWS: { key: Exclude<keyof CountyPopulation, 'total'>; label: string }[] = [
  { key: 'under6mo', label: 'Under 6 months' },
  { key: 'age6moTo4', label: '6 months–4 years' },
  { key: 'age5to17', label: '5–17 years' },
  { key: 'age18to49', label: '18–49 years' },
  { key: 'age50to64', label: '50–64 years' },
  { key: 'age65plus', label: '65 and older' },
]

const STATE_POP = MN_COUNTIES.reduce(
  (acc, c) => {
    for (const r of AGE_ROWS) acc[r.key] += c.pop[r.key]
    acc.total += c.pop.total
    return acc
  },
  { total: 0, under6mo: 0, age6moTo4: 0, age5to17: 0, age18to49: 0, age50to64: 0, age65plus: 0 } as CountyPopulation,
)

function actionSentence(maxLevel: number, anyRising: boolean): string {
  if (maxLevel >= 3)
    return 'Activity is elevated. Stay home when sick, wash hands often, consider a mask in crowded indoor places, and check that vaccines are up to date — especially if you or people close to you are at higher risk.'
  if (maxLevel === 2) return 'Activity is noticeable. It is a good time to get up to date on vaccines and to stay home when sick.'
  if (maxLevel >= 0 && anyRising) return 'Activity is still low but rising — a good time to get recommended vaccines before it climbs.'
  if (maxLevel >= 0) return 'Activity is low. Everyday habits like handwashing and staying home when sick are enough for most people.'
  return 'There is not enough history yet to rate the activity level here.'
}

export function CountyPanel({ pulse, series, manifest, fips, layer, audience, range, onClose, onPickLayer }: Props) {
  const county = MN_COUNTY_BY_FIPS[fips]
  const metricsByLayer = useMemo(() => pulse.counties.find((c) => c.fips === fips)?.metrics ?? {}, [pulse, fips])

  const rows: Row[] = useMemo(
    () =>
      pulse.mapLayers
        .filter((l) => l.kind === 'county' && metricsByLayer[l.id])
        .map((l) => ({ layer: l, metric: metricsByLayer[l.id] }))
        .sort(
          (a, b) =>
            levelRank(metricLevel(b.metric)) - levelRank(metricLevel(a.metric)) ||
            groupTitle(a.layer).localeCompare(groupTitle(b.layer)) ||
            pathogenName(a.layer.pathogen).localeCompare(pathogenName(b.layer.pathogen)),
        ),
    [pulse, metricsByLayer],
  )

  const plants = useMemo(() => pulse.sites.filter((s) => s.counties?.includes(fips)), [pulse, fips])
  const siteLayers = pulse.mapLayers.filter((l) => l.kind === 'site')

  if (!county) return <EmptyState title="Unknown county">The selected county code ({fips}) is not a Minnesota county.</EmptyState>

  const name = `${county.name} County`

  // ── "What this means here" ──
  const summary: string[] = []
  const withValue = rows.filter((r) => r.metric.value != null)
  if (!withValue.length) {
    summary.push(
      plants.length
        ? `No county-level illness data is published for ${name} yet; the wastewater plants below are the closest local signal.`
        : `No county-level illness data is published for ${name} yet, so the statewide picture is the best guide: ${pulse.statewide.headline}`,
    )
  } else {
    const top = withValue[0]
    const lvl = metricLevel(top.metric)
    const trend = top.metric.trend ?? 'unknown'
    summary.push(
      lvl === 'unknown'
        ? `${layerPhrase(top.layer)} are reported here, but there is not enough history to rate the level.`
        : withValue.length > 1
          ? `Of the measures reported here, ${layerPhrase(top.layer)} are highest: ${LEVEL_LABEL[lvl].toLowerCase()} and ${TREND_PHRASE[trend]}.`
          : `${layerPhrase(top.layer)} are ${LEVEL_LABEL[lvl].toLowerCase()} here and ${TREND_PHRASE[trend]}.`,
    )
    const st = stateSignal(pulse, top.layer)
    if (st && st.level !== 'unknown' && lvl !== 'unknown') {
      const d = levelRank(lvl) - levelRank(st.level)
      summary.push(
        d > 0
          ? `That is higher than Minnesota overall (${LEVEL_LABEL[st.level].toLowerCase()}).`
          : d < 0
            ? `That is lower than Minnesota overall (${LEVEL_LABEL[st.level].toLowerCase()}).`
            : `That is about the same as Minnesota overall.`,
      )
    }
    const rising = withValue.filter((r) => r !== top && (r.metric.trend === 'rising' || r.metric.trend === 'rising-fast'))
    if (rising.length) summary.push(`Also rising here: ${rising.slice(0, 3).map((r) => layerPhrase(r.layer)).join(', ')}.`)
    const anyRising = withValue.some((r) => r.metric.trend === 'rising' || r.metric.trend === 'rising-fast')
    summary.push(actionSentence(levelRank(lvl), anyRising))
    if (audience !== 'all') {
      const g = getProfile(top.layer.pathogen)?.ageGroups[audience as Exclude<AgeGroupId, 'all'>]
      const who = AUDIENCES.find((a) => a.id === audience)?.label ?? audience
      if (g?.actions[0]) summary.push(`For ${who.toLowerCase()} and ${pathogenName(top.layer.pathogen)}: ${g.actions[0]}`)
    }
  }

  // ── Trend chart inputs ──
  const chartLayer = layer
  let chart: { inputs: TrendSeriesInput[]; note?: string } | null = null
  if (chartLayer) {
    const stateS = stateSeriesFor(series, chartLayer)
    const inputs: TrendSeriesInput[] = []
    let note: string | undefined
    if (chartLayer.kind === 'county') {
      const m = metricsByLayer[chartLayer.id]
      const cs = m ? series.find((s) => s.id === m.seriesId) : undefined
      if (cs) inputs.push({ series: cs, name })
      else note = `${name} has no ${layerPhrase(chartLayer)} data; showing Minnesota overall.`
    } else {
      const local = plants
        .filter((p) => p.metrics[chartLayer.id])
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .slice(0, 4)
      for (const p of local) {
        const s = series.find((x) => x.id === p.metrics[chartLayer.id].seriesId)
        if (s) inputs.push({ series: s, name: p.name })
      }
      if (!inputs.length) note = `No wastewater plant serving ${name} reports ${layerPhrase(chartLayer)}; showing Minnesota overall.`
    }
    if (stateS && (!inputs.length || stateS.unit === inputs[0].series.unit)) inputs.push({ series: stateS, name: 'Minnesota', muted: inputs.length > 0 })
    if (inputs.length) {
      const srcs = [...new Set(inputs.map((i) => i.series.source))]
      if (srcs.length > 1 && !note) note = `Sources: ${inputs.map((i) => `${i.name} — ${sourceName(manifest, i.series.source)}`).join('; ')}.`
      chart = { inputs, note }
    }
  }

  const pop = county.pop
  const maxShare = Math.max(...AGE_ROWS.map((r) => Math.max(pop[r.key] / pop.total, STATE_POP[r.key] / STATE_POP.total)))

  return (
    <div className="flex flex-col gap-4" aria-labelledby="county-panel-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">Selected county</p>
          <h2 id="county-panel-title" className="text-xl font-semibold tracking-tight text-ink-1">
            {name}
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            MDH {county.schsacRegion} region · {county.fieldDistrict} epidemiology district · {county.urban}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-sm text-ink-2 hover:bg-surface-2"
          aria-label={`Clear ${name} selection and show statewide summary`}
        >
          Clear
        </button>
      </div>

      <section aria-labelledby="county-means" className="rounded-xl bg-accent-soft p-3">
        <h3 id="county-means" className="text-sm font-semibold text-ink-1">
          What this means here
        </h3>
        <div className="mt-1 flex flex-col gap-1.5 text-sm text-ink-1">
          {summary.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </div>
      </section>

      {!withValue.length && <StatewideSignals pulse={pulse} manifest={manifest} limit={4} title="Statewide signals that apply here" />}

      {pulse.mapLayers.some((l) => l.kind === 'county') && (
      <section aria-labelledby="county-latest">
        <h3 id="county-latest" className="mb-1.5 text-sm font-semibold text-ink-1">
          Latest data for {county.name} County
        </h3>
        {rows.length ? (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-line">
            {rows.map(({ layer: l, metric: m }) => {
              const active = layer?.id === l.id
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => onPickLayer(l.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-surface-2 ${active ? 'bg-surface-2' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium text-ink-1">
                        {pathogenName(l.pathogen)} <span className="font-normal text-ink-2">· {groupTitle(l)}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-ink-1">
                        {formatValue(m.value, l.unit)}
                        <span className="font-normal text-ink-2">{UNIT_SUFFIX[l.unit]}</span>
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                      <LevelBadge level={metricLevel(m)} size="sm" />
                      {m.trend && <TrendPill trend={m.trend} compact />}
                      <span>wk ending {formatDate(m.date)}</span>
                      {active && <span className="ml-auto text-ink-2">Shown on map</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong p-3 text-sm text-ink-2">
            No county-level measures are published for {name} yet.
          </p>
        )}
        {rows.some((r) => isHsaEstimate(r.layer)) && <p className="mt-1.5 text-xs text-ink-3">{HSA_NOTE}, not this county alone.</p>}
      </section>
      )}

      {chartLayer && (
        <section aria-labelledby="county-trend">
          <h3 id="county-trend" className="text-sm font-semibold text-ink-1">
            {chartLayer.kind === 'site' ? `${pathogenName(chartLayer.pathogen)} wastewater near ${county.name} vs. Minnesota` : `${layerPhrase(chartLayer)}: ${county.name} vs. Minnesota`}
          </h3>
          {chart ? (
            <>
              {chart.note && <p className="mt-0.5 text-xs text-ink-3">{chart.note}</p>}
              <div className="mt-2">
                <TrendChart
                  series={chart.inputs}
                  range={range}
                  height={220}
                  showThresholds={false}
                  ariaLabel={`${chartLayer.label}: ${chart.inputs.map((i) => i.name).join(' compared with ')}, weekly`}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-2">No weekly series is available to chart for this county and measure yet.</p>
          )}
        </section>
      )}

      <section aria-labelledby="county-ww">
        <h3 id="county-ww" className="mb-1.5 text-sm font-semibold text-ink-1">
          Wastewater plants serving {county.name} County
        </h3>
        {plants.length ? (
          <ul className="flex flex-col gap-2">
            {plants.map((p) => {
              const ms = siteLayers.filter((l) => p.metrics[l.id])
              const latest = ms.map((l) => p.metrics[l.id].date).sort().pop()
              return (
                <li key={p.id} className="rounded-xl border border-line p-2.5">
                  <p className="text-sm font-medium text-ink-1">{p.name}</p>
                  <p className="text-xs text-ink-3">
                    {p.population != null ? `About ${formatValue(p.population, 'count', { compact: true })} people connected` : 'Population served not reported'}
                    {latest ? ` · wk ending ${formatDate(latest)}` : ''}
                  </p>
                  {ms.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
                      {ms.map((l) => (
                        <li key={l.id} className="flex items-center gap-1.5 text-xs text-ink-2">
                          <span>{pathogenName(l.pathogen)}</span>
                          <LevelBadge level={metricLevel(p.metrics[l.id])} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">
            {pulse.sites.length
              ? `None of the monitored plants list ${county.name} County in their service area. Many rural homes use private septic systems, which wastewater testing does not cover.`
              : 'Wastewater plant data has not been published yet.'}
          </p>
        )}
      </section>

      <section aria-labelledby="county-pop">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 id="county-pop" className="text-sm font-semibold text-ink-1">
            Who lives here
          </h3>
          <p className="text-xs text-ink-3">
            {formatValue(pop.total, 'count')} residents · <SourceTag>Census ACS 2018–2022</SourceTag>
          </p>
        </div>
        <ul className="flex flex-col gap-1.5" aria-label={`Age groups in ${name}`}>
          {AGE_ROWS.map((r) => {
            const share = pop[r.key] / pop.total
            const stShare = STATE_POP[r.key] / STATE_POP.total
            return (
              <li key={r.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[8.5rem_1fr_auto]">
                <span className="text-ink-2">{r.label}</span>
                <span className="relative h-3.5" aria-hidden="true">
                  <span className="absolute inset-y-[3px] left-0 rounded-r-[3px] bg-[var(--series-1)]" style={{ width: `${(share / maxShare) * 100}%` }} />
                  <span className="absolute inset-y-0 w-0.5 rounded-full bg-[var(--ink-2)]" style={{ left: `calc(${(stShare / maxShare) * 100}% - 1px)` }} />
                </span>
                <span className="tabular text-right text-ink-1">
                  {formatValue(pop[r.key], 'count')} <span className="text-ink-3">({(share * 100).toFixed(share < 0.01 ? 1 : 0)}%)</span>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
          <span aria-hidden="true" className="inline-block h-3 w-0.5 rounded-full bg-[var(--ink-2)]" /> Minnesota average share for each age group
        </p>
      </section>
    </div>
  )
}
