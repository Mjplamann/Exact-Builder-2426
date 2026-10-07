// Compact county map on the overview. Defaults to the county ER-visit layer for flu, else the top watch-list
// pathogen's county layer, else the first county layer. Selecting a county sets the page-wide geography.
import type { MapLayer, PathogenId, PulseFile } from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { formatDate, formatValue } from '../../lib/format'
import { useAppState } from '../../lib/state'
import { CountyMap } from '../map/CountyMap'
import { LevelLegend } from '../map/MapLegend'
import { countyMetricsFor, isLevelless, metricLevel } from '../map/mapData'
import { LevelBadge } from '../ui'
import { COUNTY_SUMMARY_HEADING_ID } from './CountySummary'
import { hrefFor } from './util'

/** Scroll the county summary (in the hero, far above the map) into view and move focus to its heading. */
function focusCountySummary() {
  const el = document.getElementById(COUNTY_SUMMARY_HEADING_ID)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  el.focus({ preventScroll: true })
}

/** Counties with the highest level (then value) on a layer. HSA estimates can tie across neighbors. */
function topCounties(pulse: PulseFile, layerId: string, n = 5) {
  return pulse.counties
    .map((c) => ({ fips: c.fips, m: c.metrics[layerId] }))
    .filter((x) => x.m && x.m.value != null && MN_COUNTY_BY_FIPS[x.fips])
    .sort(
      (a, b) =>
        LEVELS.indexOf(b.m.level ?? 'unknown') - LEVELS.indexOf(a.m.level ?? 'unknown') || (b.m.value ?? 0) - (a.m.value ?? 0),
    )
    .slice(0, n)
}

export function pickDefaultLayer(pulse: PulseFile, top?: PathogenId): MapLayer | undefined {
  const county = pulse.mapLayers.filter((l) => l.kind === 'county')
  return (
    county.find((l) => l.id === 'ed:influenza') ??
    county.find((l) => l.pathogen === 'influenza' && l.metric === 'ed_visit_pct') ??
    (top ? county.find((l) => l.pathogen === top && l.metric === 'ed_visit_pct') ?? county.find((l) => l.pathogen === top) : undefined) ??
    county[0] ??
    pulse.mapLayers[0]
  )
}

export function MiniMap({ pulse, top }: { pulse: PulseFile; top?: PathogenId }) {
  const { state, update, go } = useAppState()
  const layer = pickDefaultLayer(pulse, top)
  const selected = state.geo.type === 'county' ? state.geo.code : null
  const selectedName = selected ? MN_COUNTY_BY_FIPS[selected]?.name : undefined
  const hottest = layer ? topCounties(pulse, layer.id) : []
  // Key entries match what the map draws: hatched counties ("No data") and grey ones ("Not enough data").
  const reporting = layer?.kind === 'county' ? [...countyMetricsFor(pulse, layer.id).values()].filter((m) => m.value != null) : []
  const noDataCount = layer?.kind === 'county' ? Object.keys(MN_COUNTY_BY_FIPS).length - reporting.length : 0
  const hasUnknown = reporting.some((m) => metricLevel(m) === 'unknown')

  const openMap = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    go('map')
  }

  if (!layer) {
    // No county or site layers published yet: a slim notice instead of an empty map frame.
    return (
      <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4 sm:p-6" aria-labelledby="minimap-title">
        <MapGlyph />
        <div className="min-w-0 flex-1">
          <h2 id="minimap-title" className="text-base font-semibold text-ink-1">
            County map: data isn’t available yet
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            County ER visits and wastewater sites will appear here once those sources publish. Until then, the numbers on this
            page are statewide.
          </p>
        </div>
        <a
          href={hrefFor(state, 'map')}
          onClick={openMap}
          className="self-start rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-1 hover:bg-surface-2 sm:self-center"
        >
          Open map
        </a>
      </section>
    )
  }

  return (
    <section className="card flex h-full flex-col p-5 sm:p-6" aria-labelledby="minimap-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="minimap-title" className="text-lg font-semibold tracking-tight text-ink-1">
            Across Minnesota
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {layer.label}
            {layer.latestDate && <> · week ending {formatDate(layer.latestDate, true)}</>}
          </p>
        </div>
        <a
          href={hrefFor(state, 'map')}
          onClick={openMap}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
        >
          Open map
        </a>
      </div>

      <div className="mt-3">
        <CountyMap
          pulse={pulse}
          layerId={layer.id}
          selected={selected}
          onSelect={(fips) => update({ geo: fips ? { type: 'county', code: fips } : { type: 'state', code: '27' } })}
          compact
          height={300}
        />
      </div>
      {layer.kind === 'county' && !isLevelless(layer) && (
        <div className="mt-3">
          <LevelLegend noData={noDataCount} showUnknown={hasUnknown} title="Map key: activity level" />
        </div>
      )}
      {selectedName ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={focusCountySummary}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-left text-sm font-medium text-ink-1 hover:bg-surface-3"
          >
            {selectedName} County selected — see its numbers <span aria-hidden="true">↑</span>
          </button>
          <span className="text-xs text-ink-3">Open the full map for other illnesses and wastewater sites.</span>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-3">
          Select a county to see its local numbers at the top of the page. Open the full map for other illnesses and
          wastewater sites.
        </p>
      )}
      {layer.kind === 'county' && hottest.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-sm font-medium text-ink-1">Highest this week</h3>
          {layer.metric === 'ed_visit_pct' && (
            <p className="mt-0.5 text-xs text-ink-3">
              Values are estimated for health service areas (groups of counties), so neighboring counties can share a value.
            </p>
          )}
          <ul className="mt-1.5 divide-y divide-line">
            {hottest.map(({ fips, m }) => (
              <li key={fips}>
                <button
                  type="button"
                  onClick={() => update({ geo: { type: 'county', code: fips } })}
                  aria-pressed={selected === fips}
                  className="flex w-full items-center justify-between gap-2 rounded py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate text-ink-1">{MN_COUNTY_BY_FIPS[fips].name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-ink-2">{formatValue(m.value, layer.unit)}</span>
                    {m.level && <LevelBadge level={m.level} size="sm" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function MapGlyph() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" className="text-ink-3">
      <path
        d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
