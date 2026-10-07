// Side panel when no county is selected: how the current layer looks across Minnesota.
import { useMemo } from 'react'
import type { ActivityLevel, CountyMetric, Manifest, MapLayer, PulseFile, Series } from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { MN_COUNTIES } from '../../../shared/geo/mnCounties'
import { formatDate, isCumulative, LEVEL_INK_VAR, LEVEL_LABEL, LEVEL_VAR, metricMeaning, UNIT_SUFFIX } from '../../lib/format'
import { pathogenName } from '../../content'
import { LevelScale } from '../charts/LevelScale'
import { LevelBadge, SourceTag, TrendPill } from '../ui'
import { NoDataChip } from './MapLegend'
import {
  countyMetricsFor, countyName, countyNames, formatLayerValue, isLevelless, layerPhrase, layerPrograms, levelRank, metricLevel, sitesFor,
  sourceName, stateSignal, TREND_PHRASE,
} from './mapData'

interface Props {
  pulse: PulseFile
  manifest?: Manifest
  /** All loaded series (used to match the statewide twin of a layer by source). */
  series?: Series[]
  layer?: MapLayer
  onSelectCounty: (fips: string) => void
}

const ORDER: ActivityLevel[] = [...LEVELS].reverse()

/** CSS twin of the map's no-data hatch (45°, tone-on-tone). */
export const HATCH_BG =
  'repeating-linear-gradient(-45deg, var(--surface-3) 0 3px, color-mix(in srgb, var(--muted) 45%, var(--surface-3)) 3px 4px)'

function sortByLevelThenValue<T extends { metric: CountyMetric }>(a: T, b: T) {
  return levelRank(metricLevel(b.metric)) - levelRank(metricLevel(a.metric)) || (b.metric.value ?? -Infinity) - (a.metric.value ?? -Infinity)
}

/**
 * One horizontal part-to-whole bar: places by level, 2px surface gaps between segments, counts inside the
 * segments wide enough to hold them (all counts are also in the accessible name and the map legend). The
 * shared LevelScale chips below it are the color key.
 */
function LevelBar({ counts, noData, total, noun }: { counts: Record<ActivityLevel, number>; noData: number; total: number; noun: string }) {
  const segs = [
    ...[...LEVELS, 'unknown' as const].map((l) => ({ key: l, n: counts[l], fill: LEVEL_VAR[l], ink: LEVEL_INK_VAR[l], label: LEVEL_LABEL[l] })),
    { key: 'none', n: noData, fill: HATCH_BG, ink: 'var(--ink-1)', label: 'No data' },
  ].filter((s) => s.n > 0)
  const aria = segs.map((s) => `${s.label}: ${s.n}`).join(', ')
  return (
    <div>
      <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`${noun} by level — ${aria}. Total ${total}.`}>
        {segs.map((s) => (
          <span
            key={s.key}
            className="tabular flex h-full min-w-[3px] items-center justify-center text-[11px] leading-none font-semibold"
            style={{ flex: `${s.n} 0 0`, background: s.fill, color: s.ink }}
            title={`${s.label}: ${s.n}`}
          >
            {s.n / total >= 0.07 ? s.n : ''}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LevelScale variant="chips" showUnknown={counts.unknown > 0} className="contents" />
        {noData > 0 && <NoDataChip />}
      </div>
    </div>
  )
}

/** Statewide pathogen signals (real pulse data) — the fallback when no local data exists. */
export function StatewideSignals({ pulse, manifest, limit = 5, title = 'Statewide right now' }: { pulse: PulseFile; manifest?: Manifest; limit?: number; title?: string }) {
  const ps = [...pulse.pathogens].filter((p) => p.primary).sort((a, b) => b.score - a.score).slice(0, limit)
  if (!ps.length) return null
  return (
    <section aria-labelledby="sw-signals">
      <h3 id="sw-signals" className="mb-1.5 text-sm font-semibold text-ink-1">
        {title}
      </h3>
      <ul className="flex flex-col divide-y divide-[var(--border)] rounded-xl border border-line">
        {ps.map((p) => {
          const s = p.primary!
          return (
            <li key={p.pathogen} className="flex flex-col gap-1 px-3 py-2">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink-1">{pathogenName(p.pathogen)}</span>
                {/* A running total for the year never gets a level or a trend arrow. */}
                {!isCumulative(s.metric) && (
                  <span className="flex items-center gap-1.5">
                    <LevelBadge level={p.level} size="sm" />
                    <TrendPill trend={p.trend} compact />
                  </span>
                )}
              </span>
              <span className="text-xs text-ink-2">{capitalize(metricMeaning(s.metric, s.latestValue, s.unit).replace(/\bit\b/, pathogenName(p.pathogen)))}</span>
              <span className="text-xs text-ink-3">
                Minnesota, {isCumulative(s.metric) ? 'as of' : 'week ending'} {formatDate(s.latestDate, true)} · {sourceName(manifest, s.source)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function StatewidePanel({ pulse, manifest, series, layer, onSelectCounty }: Props) {
  const seriesById = useMemo(() => new Map((series ?? []).map((s) => [s.id, s] as const)), [series])
  if (!layer) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">Across Minnesota</p>
          <h2 className="text-lg font-semibold tracking-tight text-ink-1">No local layers yet</h2>
        </div>
        <p className="text-sm text-ink-1">{pulse.statewide.headline}</p>
        <StatewideSignals pulse={pulse} manifest={manifest} />
        <p className="text-sm text-ink-2">
          County and wastewater-plant layers will appear on the map as soon as their sources publish them. Until then, select any county on the
          map (or from the “Where” menu) to see who lives there.
        </p>
      </div>
    )
  }

  const programs = layerPrograms(pulse, layer).names
  const source = programs.length > 1 ? programs.join(' + ') : sourceName(manifest, layer.source)
  const st = stateSignal(pulse, layer, seriesById)
  const rt = isLevelless(layer)

  const header = (
    <div>
      <p className="text-xs font-medium tracking-wide text-ink-3 uppercase">Across Minnesota</p>
      <h2 className="text-lg font-semibold tracking-tight text-ink-1">{layer.label}</h2>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        {layer.latestDate && <span>Week ending {formatDate(layer.latestDate, true)}</span>}
        {source && <SourceTag>{source}</SourceTag>}
      </p>
    </div>
  )

  const statewideLine = st && (
    <div className="rounded-xl bg-surface-2 p-3 text-sm">
      <p className="text-xs font-medium text-ink-3">Minnesota overall</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink-1">
          {formatLayerValue(st.latestValue, st)}
          <span className="font-normal text-ink-2">{UNIT_SUFFIX[st.unit]}</span>
        </span>
        {!isLevelless(st) && <LevelBadge level={st.level} size="sm" />}
        <TrendPill trend={st.trend} compact />
      </div>
      {isLevelless(st) && <p className="mt-1 text-xs text-ink-2">Rt shows direction of spread, not amount.</p>}
      <p className="mt-1 text-xs text-ink-3">
        Week ending {formatDate(st.latestDate, true)} · {sourceName(manifest, st.source)}
      </p>
    </div>
  )

  if (layer.kind === 'site') {
    const sites = sitesFor(pulse, layer.id)
      .map((s) => ({ site: s, metric: s.metrics[layer.id] }))
      .sort(sortByLevelThenValue)
    const counts = Object.fromEntries([...LEVELS, 'unknown'].map((l) => [l, 0])) as Record<ActivityLevel, number>
    for (const s of sites) counts[metricLevel(s.metric)]++
    const elevated = counts.high + counts['very-high']
    return (
      <div className="flex flex-col gap-4">
        {header}
        {sites.length ? (
          <>
            <p className="text-sm text-ink-1">
              <span className="font-semibold">{elevated}</span> of {sites.length} reporting treatment plants show high or very high{' '}
              {layerPhrase(layer)}.
            </p>
            <LevelBar counts={counts} noData={0} total={sites.length} noun="Treatment plants" />
            {statewideLine}
            <section aria-labelledby="sw-top-sites">
              <h3 id="sw-top-sites" className="mb-1.5 text-sm font-semibold text-ink-1">
                Highest plants this week
              </h3>
              <ol className="flex flex-col divide-y divide-[var(--border)] rounded-xl border border-line">
                {sites.slice(0, 5).map(({ site, metric }) => (
                  <li key={site.id} className="flex flex-col gap-1 px-3 py-2">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-sm font-medium text-ink-1">{site.name}</span>
                      <LevelBadge level={metricLevel(metric)} size="sm" />
                    </span>
                    <span className="text-xs text-ink-3">
                      {countyNames(site.counties, 3) ? `Serves ${countyNames(site.counties, 3)} · ` : ''}wk ending {formatDate(metric.date)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        ) : (
          <p className="text-sm text-ink-2">No treatment plant data for this layer yet.</p>
        )}
        <p className="text-xs text-ink-3">Select a county on the map to see the plants that serve it.</p>
      </div>
    )
  }

  const metrics = countyMetricsFor(pulse, layer.id)
  const reporting = [...metrics.entries()].filter(([, m]) => m.value != null).map(([fips, metric]) => ({ fips, metric }))
  const counts = Object.fromEntries([...LEVELS, 'unknown'].map((l) => [l, 0])) as Record<ActivityLevel, number>
  for (const r of reporting) counts[metricLevel(r.metric)]++
  const total = MN_COUNTIES.length
  const noData = total - reporting.length
  const elevated = counts.high + counts['very-high']
  const top = [...reporting].sort(sortByLevelThenValue).slice(0, 5)
  const rising = reporting.filter((r) => r.metric.trend === 'rising' || r.metric.trend === 'rising-fast').length
  const latest = reporting.map((r) => r.metric.date).sort().pop()
  const topLevel = ORDER.find((l) => counts[l] > 0)
  const growing = reporting.filter((r) => (r.metric.value ?? 0) > 1 && r.metric.trend !== 'falling' && r.metric.trend !== 'falling-fast').length

  return (
    <div className="flex flex-col gap-4">
      {header}
      {reporting.length ? (
        <>
          <p className="text-sm text-ink-1">
            {rt ? (
              <>
                <span className="font-semibold">{growing}</span> of {reporting.length} counties with an estimate are likely growing (Rt above
                1). Rt shows the direction of spread, not how much illness there is.
              </>
            ) : elevated > 0 ? (
              <>
                <span className="font-semibold">{elevated}</span> of {total} counties are at high or very high activity for {layerPhrase(layer)}.
              </>
            ) : topLevel ? (
              <>
                No county is at high activity. The highest level anywhere is{' '}
                <span className="font-semibold">{LEVEL_LABEL[topLevel].toLowerCase()}</span>.
              </>
            ) : (
              <>Counties report {layerPhrase(layer)}, but there is not enough history to rate levels yet.</>
            )}{' '}
            {rising > 0 && !rt && (
              <>
                {rising} {rising === 1 ? 'county is' : 'counties are'} rising.
              </>
            )}
          </p>
          {!rt && <LevelBar counts={counts} noData={noData} total={total} noun="Counties" />}
          {statewideLine}
          <section aria-labelledby="sw-top">
            <h3 id="sw-top" className="mb-1.5 text-sm font-semibold text-ink-1">
              {rt ? 'Highest Rt estimates' : 'Highest counties'}{latest ? ` · week ending ${formatDate(latest)}` : ''}
            </h3>
            <ol className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-line">
              {top.map(({ fips, metric }, i) => (
                <li key={fips}>
                  <button
                    type="button"
                    onClick={() => onSelectCounty(fips)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                    aria-label={`${countyName(fips)} County: ${rt ? 'Rt' : LEVEL_LABEL[metricLevel(metric)]}, ${formatLayerValue(metric.value, layer)}. Show details.`}
                  >
                    <span className="tabular w-4 text-xs text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink-1">{countyName(fips)}</span>
                    <span className="tabular text-sm text-ink-1">
                      {formatLayerValue(metric.value, layer)}
                      <span className="text-ink-2">{UNIT_SUFFIX[layer.unit]}</span>
                    </span>
                    {rt ? metric.trend && <TrendPill trend={metric.trend} compact /> : <LevelBadge level={metricLevel(metric)} size="sm" />}
                  </button>
                </li>
              ))}
            </ol>
            {top[0]?.metric.trend && (
              <p className="mt-1.5 text-xs text-ink-3">
                In {countyName(top[0].fips)}, the highest, it is {TREND_PHRASE[top[0].metric.trend]}.
              </p>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-ink-2">No county has reported {layerPhrase(layer)} yet.</p>
      )}
      <p className="text-xs text-ink-3">Select a county on the map, or pick one from the “Where” menu, to see its details.</p>
    </div>
  )
}
