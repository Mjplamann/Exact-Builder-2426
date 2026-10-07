// Panels for one selected county.
//   CountyPanel  — beside the map: plain-language summary and every measure published for the county.
//   CountyDetails — full width below the map: county-vs-Minnesota trend, wastewater plants serving it, who lives there.
// Levels from different publishers sit on different scales (MDH RESP-NET has three steps, CDC's have five), so
// measures are ranked by their position within their own scale, and a county is compared with Minnesota only
// when both are rated on the same scale.
import { useMemo } from 'react'
import type { AgeGroupId, CountyMetric, Manifest, MapLayer, PulseFile, Series } from '../../../shared/types'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS, type CountyPopulation } from '../../../shared/geo/mnCounties'
import { getProfile, pathogenName } from '../../content'
import { formatDate, formatValue, LEVEL_LABEL, UNIT_SUFFIX } from '../../lib/format'
import type { TimeRange } from '../../lib/state'
import { TrendChart, type TrendSeriesInput } from '../charts/TrendChart'
import { AUDIENCES } from '../layout/FilterBar'
import { EmptyState, LevelBadge, SourceTag, TrendPill } from '../ui'
import {
  formatLayerValue, groupTitle, HSA_NOTE, historyPercentile, isHsaEstimate, isLevelless, isThreeStepScale, layerPhrase, levelRank,
  levelScaleOf, metricLevel, scalePosition, sourceName, stateEdSeries, stateSeriesFor, stateSignal, TREND_PHRASE,
} from './mapData'
import { StatewideSignals } from './StatewidePanel'

export const COUNTY_PANEL_HEADING_ID = 'county-panel-title'

interface Row {
  layer: MapLayer
  metric: CountyMetric
  series?: Series
  /** Scale the level is on (null = no level, e.g. Rt). */
  scale: string | null
  /** 0–1 position within that scale; null when there is no rated level. */
  pos: number | null
  /** Percentile of the latest value within the county's own ~3-year history (tie-breaker). */
  pct?: number
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

const RT_NOTE = 'Rt shows direction of spread, not amount'
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isRising = (m: CountyMetric) => m.trend === 'rising' || m.trend === 'rising-fast'
const isFalling = (m: CountyMetric) => m.trend === 'falling' || m.trend === 'falling-fast'

function andList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function actionSentence(maxLevel: number, anyRising: boolean): string {
  if (maxLevel >= 3)
    return 'Activity is elevated. Stay home when sick, wash hands often, consider a mask in crowded indoor places, and check that vaccines are up to date — especially if you or people close to you are at higher risk.'
  if (maxLevel === 2) return 'Activity is noticeable. It is a good time to get up to date on vaccines and to stay home when sick.'
  if (maxLevel >= 0 && anyRising) return 'Activity is still low but rising — a good time to get recommended vaccines before it climbs.'
  if (maxLevel >= 0) return 'Activity is low. Everyday habits like handwashing and staying home when sick are enough for most people.'
  return 'There is not enough history yet to rate the activity level here.'
}

/** Every county layer published for this county, with its scale, ranked highest-on-its-own-scale first (Rt last). */
function useCountyRows(pulse: PulseFile, series: Series[], fips: string) {
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s] as const)), [series])
  const rows = useMemo(() => {
    const metrics = pulse.counties.find((c) => c.fips === fips)?.metrics ?? {}
    const out: Row[] = []
    for (const l of pulse.mapLayers) {
      const m = l.kind === 'county' ? metrics[l.id] : undefined
      if (!m) continue
      const s = seriesById.get(m.seriesId)
      const scale = isLevelless(l) ? null : levelScaleOf(s, m.date, l.metric === 'ed_visit_pct' ? stateEdSeries(series, l.pathogen) : undefined)
      const pos = m.value == null ? null : scalePosition(metricLevel(m), scale)
      out.push({ layer: l, metric: m, series: s, scale, pos, pct: historyPercentile(s, m.date, m.value) })
    }
    return out.sort(
      (a, b) =>
        (b.pos ?? -1) - (a.pos ?? -1) ||
        Number(isLevelless(a.layer)) - Number(isLevelless(b.layer)) ||
        (b.pct ?? -1) - (a.pct ?? -1) ||
        groupTitle(a.layer).localeCompare(groupTitle(b.layer)) ||
        pathogenName(a.layer.pathogen).localeCompare(pathogenName(b.layer.pathogen)),
    )
  }, [pulse, series, seriesById, fips])
  return { rows, seriesById }
}

interface PanelProps {
  pulse: PulseFile
  series: Series[]
  manifest?: Manifest
  fips: string
  /** Layer currently drawn on the map. */
  layer?: MapLayer
  audience: AgeGroupId
  onClose: () => void
  onPickLayer: (layerId: string) => void
}

export function CountyPanel({ pulse, series, manifest, fips, layer, audience, onClose, onPickLayer }: PanelProps) {
  const county = MN_COUNTY_BY_FIPS[fips]
  const { rows, seriesById } = useCountyRows(pulse, series, fips)
  const plants = useMemo(() => pulse.sites.filter((s) => s.counties?.includes(fips)), [pulse, fips])

  if (!county) return <EmptyState title="Unknown county">The selected county code ({fips}) is not a Minnesota county.</EmptyState>

  const name = `${county.name} County`

  // ── "What this means here" ──
  const summary: string[] = []
  const withValue = rows.filter((r) => r.metric.value != null)
  const rtRows = withValue.filter((r) => isLevelless(r.layer))
  const leveled = withValue.filter((r) => !isLevelless(r.layer))
  const rated = leveled.filter((r) => r.pos != null)
  if (!withValue.length) {
    summary.push(
      plants.length
        ? `No county-level illness data is published for ${name} yet; the wastewater plants below are the closest local signal.`
        : `No county-level illness data is published for ${name} yet, so the statewide picture is the best guide: ${pulse.statewide.headline}`,
    )
  } else {
    const top = rated[0]
    if (!top) {
      summary.push(
        leveled.length
          ? `${capitalize(layerPhrase(leveled[0].layer))} are reported here, but there is not enough history to rate the level.`
          : `Only CDC’s Rt estimates are published for ${name}. They show the direction of spread, not how much illness there is.`,
      )
    } else {
      const lvl = metricLevel(top.metric)
      const trend = top.metric.trend ?? 'unknown'
      const atFloor = rated.length > 1 && top.pos === 0
      if (rated.length === 1) {
        summary.push(`${capitalize(layerPhrase(top.layer))} are ${LEVEL_LABEL[lvl].toLowerCase()} here and ${TREND_PHRASE[trend]}.`)
      } else if (atFloor) {
        const mdhFloor = rated.some((r) => isThreeStepScale(r.scale) && metricLevel(r.metric) === 'low')
        summary.push(
          `All ${rated.length} measures with a level here are at the bottom of their scales${mdhFloor ? ' (MDH’s hospitalization scale starts at “Low”)' : ''}.`,
        )
      } else {
        summary.push(
          `Of the measures reported here, ${layerPhrase(top.layer)} are highest on their own scale: ${LEVEL_LABEL[lvl].toLowerCase()} and ${TREND_PHRASE[trend]}.`,
        )
      }

      // Compare with Minnesota only when both are rated on the same scale (e.g. MDH county vs MDH statewide).
      const st = stateSignal(pulse, top.layer, seriesById)
      const stScale = st
        ? levelScaleOf(seriesById.get(st.seriesId), st.latestDate, st.metric === 'ed_visit_pct' ? stateEdSeries(series, top.layer.pathogen) : undefined)
        : null
      const stPos = st && stScale && stScale === top.scale ? scalePosition(st.level, stScale) : null
      if (st && stPos != null && top.pos != null) {
        const d = top.pos - stPos
        const stTxt = LEVEL_LABEL[st.level].toLowerCase()
        if (atFloor) {
          if (d < 0) summary.push(`Minnesota overall is higher for ${layerPhrase(top.layer)} (${stTxt}).`)
        } else {
          summary.push(
            d > 0.01
              ? `That is higher than Minnesota overall (${stTxt}).`
              : d < -0.01
                ? `That is lower than Minnesota overall (${stTxt}).`
                : `That is about the same as Minnesota overall (${stTxt}).`,
          )
        }
      }

      // Small counties: a per-100,000 rate can rest on one or two patients (MDH's own caveat), so say so.
      if (top.layer.metric === 'hosp_rate' && top.layer.unit === 'per100k' && (top.metric.value ?? 0) > 0 && county.pop.total < 50_000 && (top.pos ?? 0) > 0) {
        const n = Math.max(1, Math.round(((top.metric.value ?? 0) * county.pop.total) / 100_000))
        summary.push(
          `In a county of ${formatValue(county.pop.total, 'count')} people, that rate is roughly ${n} hospitalization${n === 1 ? '' : 's'} in a week, so one or two patients can change the level.`,
        )
      }

      const rising = leveled.filter((r) => (atFloor || r !== top) && isRising(r.metric))
      if (rising.length) {
        summary.push(`${atFloor ? 'Rising here' : 'Also rising here'}: ${rising.slice(0, 3).map((r) => layerPhrase(r.layer)).join(', ')}${rising.length > 3 ? ` and ${rising.length - 3} more` : ''}.`)
      }
    }

    const growing = rtRows.filter((r) => isRising(r.metric)).map((r) => pathogenName(r.layer.pathogen))
    const shrinking = rtRows.filter((r) => isFalling(r.metric)).map((r) => pathogenName(r.layer.pathogen))
    if (growing.length || shrinking.length) {
      const parts = [
        growing.length ? `${andList(growing)} ${growing.length === 1 ? 'is' : 'are'} likely growing` : '',
        shrinking.length ? `${andList(shrinking)} ${shrinking.length === 1 ? 'is' : 'are'} likely shrinking` : '',
      ].filter(Boolean)
      summary.push(`CDC’s Rt estimates for this area say ${parts.join(', while ')} — a sign of where things are heading, not how much illness there is.`)
    }

    if (rated.length || leveled.length) {
      const maxLevel = Math.max(-1, ...rated.map((r) => levelRank(metricLevel(r.metric))))
      const anyRising = withValue.some((r) => isRising(r.metric))
      summary.push(actionSentence(maxLevel, anyRising))
    }
    const guide = rated[0] ?? leveled[0] ?? rtRows[0]
    if (audience !== 'all' && guide) {
      const g = getProfile(guide.layer.pathogen)?.ageGroups[audience as Exclude<AgeGroupId, 'all'>]
      const who = AUDIENCES.find((a) => a.id === audience)?.label ?? audience
      if (g?.actions[0]) summary.push(`For ${who.toLowerCase()} and ${pathogenName(guide.layer.pathogen)}: ${g.actions[0]}`)
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby={COUNTY_PANEL_HEADING_ID}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">Selected county</p>
          <h2
            id={COUNTY_PANEL_HEADING_ID}
            tabIndex={-1}
            className="scroll-mt-[calc(var(--header-h,64px)+16px)] text-xl font-semibold tracking-tight text-ink-1 focus:outline-none focus-visible:outline-2"
          >
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
              {rows.map(({ layer: l, metric: m, series: s }) => {
                const active = layer?.id === l.id
                const rt = isLevelless(l)
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
                        <span className="tabular shrink-0 text-sm font-semibold text-ink-1">
                          {formatLayerValue(m.value, l)}
                          <span className="font-normal text-ink-2">{UNIT_SUFFIX[l.unit]}</span>
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                        {!rt && <LevelBadge level={metricLevel(m)} size="sm" />}
                        {m.trend && <TrendPill trend={m.trend} compact />}
                        <span>
                          wk ending {formatDate(m.date)}
                          {isHsaEstimate(l, s) ? ' · area estimate' : ''}
                        </span>
                        {active && <span className="ml-auto text-ink-2">Shown on map</span>}
                      </span>
                      {rt && <span className="text-xs text-ink-2">{RT_NOTE}.</span>}
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
          {rows.some((r) => isHsaEstimate(r.layer, r.series)) && (
            <p className="mt-1.5 text-xs text-ink-3">“Area estimate”: {HSA_NOTE.charAt(0).toLowerCase() + HSA_NOTE.slice(1)}, not this county alone.</p>
          )}
          {rows.some((r) => isThreeStepScale(r.scale)) && (
            <p className="mt-1 text-xs text-ink-3">MDH rates hospitalizations on its own three-step scale (Low, Moderate, High).</p>
          )}
        </section>
      )}
    </section>
  )
}

interface DetailsProps {
  pulse: PulseFile
  series: Series[]
  manifest?: Manifest
  fips: string
  layer?: MapLayer
  range: TimeRange
}

/** The longer county sections, laid out full width below the map so the map stays beside the summary. */
export function CountyDetails({ pulse, series, manifest, fips, layer, range }: DetailsProps) {
  const county = MN_COUNTY_BY_FIPS[fips]
  const plants = useMemo(() => pulse.sites.filter((s) => s.counties?.includes(fips)), [pulse, fips])
  const siteLayers = pulse.mapLayers.filter((l) => l.kind === 'site')
  if (!county) return null
  const name = `${county.name} County`
  const metricsByLayer = pulse.counties.find((c) => c.fips === fips)?.metrics ?? {}

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

  // Label a plant's measures by pathogen, adding the measure when one pathogen has two (NWSS level + concentration).
  const plantMeasureLabel = (ls: MapLayer[], l: MapLayer) =>
    ls.filter((x) => x.pathogen === l.pathogen).length > 1
      ? `${pathogenName(l.pathogen)} (${l.metric === 'wastewater_level' ? 'level' : 'concentration'})`
      : pathogenName(l.pathogen)

  return (
    <section aria-labelledby="county-more-title" className="flex flex-col gap-4">
      <h2 id="county-more-title" className="text-lg font-semibold tracking-tight text-ink-1">
        More about {name}
      </h2>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          {chartLayer && (
            <section aria-labelledby="county-trend">
              <h3 id="county-trend" className="text-sm font-semibold text-ink-1">
                {chartLayer.kind === 'site'
                  ? `${pathogenName(chartLayer.pathogen)} wastewater near ${county.name} vs. Minnesota`
                  : `${capitalize(layerPhrase(chartLayer))}: ${county.name} vs. Minnesota`}
              </h3>
              {chart ? (
                <>
                  {chart.note && <p className="mt-0.5 text-xs text-ink-3">{chart.note}</p>}
                  <div className="mt-2">
                    <TrendChart
                      series={chart.inputs}
                      range={range}
                      height={240}
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

        <section aria-labelledby="county-ww" className="min-w-0 lg:col-span-5">
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
                            <span>{plantMeasureLabel(ms, l)}</span>
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
      </div>
    </section>
  )
}
