// Side panel when no county is selected: how the current layer looks across Minnesota.
import type { ActivityLevel, CountyMetric, Manifest, MapLayer, PulseFile } from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { MN_COUNTIES } from '../../../shared/geo/mnCounties'
import { formatDate, formatValue, LEVEL_LABEL, LEVEL_VAR, UNIT_SUFFIX } from '../../lib/format'
import { LevelBadge, SourceTag, TrendPill } from '../ui'
import { HatchSwatch } from './MapLegend'
import { stateSignal } from './CountyPanel'
import { countyMetricsFor, countyName, countyNames, layerPhrase, levelRank, metricLevel, sitesFor, sourceName, TREND_PHRASE } from './mapData'

interface Props {
  pulse: PulseFile
  manifest?: Manifest
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

/** One horizontal part-to-whole bar: places by level, 2px surface gaps between segments. */
function LevelBar({ counts, noData, total, noun }: { counts: Record<ActivityLevel, number>; noData: number; total: number; noun: string }) {
  const segs = [
    ...[...LEVELS, 'unknown' as const].map((l) => ({ key: l, n: counts[l], fill: LEVEL_VAR[l], label: LEVEL_LABEL[l] })),
    { key: 'none', n: noData, fill: HATCH_BG, label: 'No data' },
  ].filter((s) => s.n > 0)
  const aria = segs.map((s) => `${s.label}: ${s.n}`).join(', ')
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`${noun} by level — ${aria}`}>
        {segs.map((s) => (
          <span key={s.key} className="h-full min-w-[3px]" style={{ flex: `${s.n} 0 0`, background: s.fill }} title={`${s.label}: ${s.n}`} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            {s.key === 'none' ? (
              <HatchSwatch size={12} />
            ) : (
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={{ background: s.fill }} />
            )}
            <span className="text-ink-1">{s.label}</span>
            <span className="tabular text-ink-3">{s.n}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only">Total {total}</p>
    </div>
  )
}

export function StatewidePanel({ pulse, manifest, layer, onSelectCounty }: Props) {
  if (!layer) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink-1">Across Minnesota</h2>
        <p className="text-sm text-ink-1">{pulse.statewide.headline}</p>
        <p className="text-sm text-ink-2">
          County and wastewater-plant layers will appear on the map as soon as they are published by their sources. Until then, select any
          county on the map (or from the “Where” menu) to see who lives there and which statewide signals apply.
        </p>
      </div>
    )
  }

  const source = sourceName(manifest, layer.source)
  const st = stateSignal(pulse, layer)

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
          {formatValue(st.latestValue, st.unit)}
          <span className="font-normal text-ink-2">{UNIT_SUFFIX[st.unit]}</span>
        </span>
        <LevelBadge level={st.level} size="sm" />
        <TrendPill trend={st.trend} compact />
      </div>
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

  return (
    <div className="flex flex-col gap-4">
      {header}
      {reporting.length ? (
        <>
          <p className="text-sm text-ink-1">
            {elevated > 0 ? (
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
            {rising > 0 && (
              <>
                {rising} {rising === 1 ? 'county is' : 'counties are'} rising.
              </>
            )}
          </p>
          <LevelBar counts={counts} noData={noData} total={total} noun="Counties" />
          {statewideLine}
          <section aria-labelledby="sw-top">
            <h3 id="sw-top" className="mb-1.5 text-sm font-semibold text-ink-1">
              Highest counties{latest ? ` · week ending ${formatDate(latest)}` : ''}
            </h3>
            <ol className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-line">
              {top.map(({ fips, metric }, i) => (
                <li key={fips}>
                  <button
                    type="button"
                    onClick={() => onSelectCounty(fips)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
                    aria-label={`${countyName(fips)} County: ${LEVEL_LABEL[metricLevel(metric)]}, ${formatValue(metric.value, layer.unit)}. Show details.`}
                  >
                    <span className="tabular w-4 text-xs text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink-1">{countyName(fips)}</span>
                    <span className="tabular text-sm text-ink-1">
                      {formatValue(metric.value, layer.unit)}
                      <span className="text-ink-2">{UNIT_SUFFIX[layer.unit]}</span>
                    </span>
                    <LevelBadge level={metricLevel(metric)} size="sm" />
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
