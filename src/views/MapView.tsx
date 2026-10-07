// Map view: what's going around where. County choropleth + wastewater plants, with a side panel
// that explains the selected county (or the statewide picture when nothing is selected).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapLayer, PulseFile, Series } from '../../shared/types'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS } from '../../shared/geo/mnCounties'
import { CountyMap } from '../components/map/CountyMap'
import { COUNTY_PANEL_HEADING_ID, CountyDetails, CountyPanel } from '../components/map/CountyPanel'
import { LayerPicker, ModeToggle, SitesToggle } from '../components/map/LayerPicker'
import { StatewidePanel } from '../components/map/StatewidePanel'
import {
  countyMetricsFor, countyName, countyNames, defaultLayerId, formatLayerValue, HSA_NOTE, isHsaEstimate, isLevelless, isThreeStepScale,
  layerById, layerPhrase, layerPrograms, levelRank, levelScaleOf, metricLevel, sitesFor, sourceName, stateEdSeries, type MapMode,
} from '../components/map/mapData'
import { FilterBar } from '../components/layout/FilterBar'
import { Card, LevelBadge, SourceTag, TrendPill } from '../components/ui'
import { useDashboard } from '../lib/dashboard'
import { pathogenName } from '../content'
import { formatDate, UNIT_SUFFIX } from '../lib/format'
import { useAppState } from '../lib/state'

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
/** Below Tailwind's lg breakpoint the county panel sits under the map instead of beside it. */
const isNarrow = () => {
  try {
    return !window.matchMedia('(min-width: 1024px)').matches
  } catch {
    return false
  }
}

/** Move focus to the county panel heading and bring it into view (narrow screens, where it sits below the map). */
function focusPanelHeading() {
  const el = document.getElementById(COUNTY_PANEL_HEADING_ID)
  if (!el) return
  el.focus({ preventScroll: true })
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}

const PREF_KEY = 'mnpulse-map'

function readPrefs(): { layer?: string; mode?: MapMode; sites?: boolean } {
  try {
    return JSON.parse(sessionStorage.getItem(PREF_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function writePrefs(p: { layer?: string; mode?: MapMode; sites?: boolean }) {
  try {
    sessionStorage.setItem(PREF_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable */
  }
}

export default function MapView() {
  const { data } = useDashboard()
  const { state, update } = useAppState()
  const pulse = data?.pulse

  const prefs = useMemo(readPrefs, [])
  const [layerChoice, setLayerChoice] = useState<string | undefined>(() => (state.pathogenId ? undefined : prefs.layer))
  const [mode, setMode] = useState<MapMode>(prefs.mode ?? 'level')
  const [sitesOn, setSitesOn] = useState<boolean>(prefs.sites ?? true)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  // Set when a county is picked on the map (or its table) on a narrow screen: focus then moves to the panel heading.
  const focusPanelNext = useRef(false)
  const [announcement, setAnnouncement] = useState('')
  const prevSelected = useRef<string | null | undefined>(undefined)

  const layerId = useMemo(() => {
    if (!pulse) return undefined
    if (layerChoice && layerById(pulse, layerChoice)) return layerChoice
    return defaultLayerId(pulse, state.pathogenId)
  }, [pulse, layerChoice, state.pathogenId])

  useEffect(() => writePrefs({ layer: layerChoice, mode, sites: sitesOn }), [layerChoice, mode, sitesOn])

  const selected = state.geo.type === 'county' && MN_COUNTY_BY_FIPS[state.geo.code] ? state.geo.code : null

  // Announce selection changes from any control (map, table, "Where" menu), and on narrow screens move focus to the
  // panel after a pick on the map, once the panel has rendered.
  useEffect(() => {
    const prev = prevSelected.current
    prevSelected.current = selected
    if (prev === undefined || prev === selected) return
    setAnnouncement(
      selected ? `${countyName(selected)} County selected. Details updated in the panel.` : 'County selection cleared. Showing the statewide summary.',
    )
    if (selected && focusPanelNext.current) {
      focusPanelNext.current = false
      requestAnimationFrame(focusPanelHeading)
    }
  }, [selected])

  if (!pulse || !data) return null

  const layer = layerById(pulse, layerId)
  const hasSiteLayers = pulse.mapLayers.some((l) => l.kind === 'site')
  const showSites = layer?.kind === 'site' || (hasSiteLayers && sitesOn)
  const levelless = isLevelless(layer)

  const select = (fips: string | null) => update({ geo: fips ? { type: 'county', code: fips } : { type: 'state', code: '27' } })
  /** A pick on the map or its table (not the "Where" menu, which must keep focus while arrowing through options). */
  const selectFromMap = (fips: string | null) => {
    focusPanelNext.current = !!fips && isNarrow()
    select(fips)
  }
  /** Clear: hand focus to the cleared county on the map before the panel (and its Clear button) unmounts. */
  const clearSelection = () => {
    const fips = selected
    const path = fips ? mapWrapRef.current?.querySelector<SVGPathElement>(`path[data-fips="${fips}"]`) : null
    path?.focus()
    select(null)
  }
  const pickLayer = (id: string) => setLayerChoice(id)

  const programs = layer ? layerPrograms(pulse, layer).names : []
  const source = programs.length > 1 ? programs.join(' + ') : sourceName(data.manifest, layer?.source)
  const sample = layer ? sampleSeries(pulse, data.series, layer) : undefined
  const scale =
    layer?.kind === 'county' ? levelScaleOf(sample, undefined, layer.metric === 'ed_visit_pct' ? stateEdSeries(data.series, layer.pathogen) : undefined) : null

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-1 sm:text-3xl">Map: what’s going around where</h1>
        <p className="mt-1 max-w-3xl text-ink-2">
          See how illness activity compares across Minnesota’s counties and wastewater plants. Select a county for local details and what they
          mean for you.
        </p>
      </header>

      <FilterBar showRange={false} />

      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Map options">
        <LayerPicker pulse={pulse} value={layerId} onChange={pickLayer} />
        {layer && layer.kind !== 'site' && !levelless && <ModeToggle value={mode} onChange={setMode} />}
        {hasSiteLayers && layer?.kind !== 'site' && <SitesToggle checked={sitesOn} onChange={setSitesOn} />}
      </div>

      {/* Persistent live region: selection changes are announced without moving focus. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-7" aria-labelledby="map-title">
          <div className="mb-3">
            <h2 id="map-title" className="text-lg font-semibold tracking-tight text-ink-1">
              {layer ? layer.label : 'Minnesota counties'}
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">{mapExplainer(layer, levelless ? 'value' : mode, scale)}</p>
            {layer && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                {layer.latestDate && <span>Latest week ending {formatDate(layer.latestDate, true)}</span>}
                {source && <SourceTag>{source}</SourceTag>}
                {isHsaEstimate(layer, sample) && <span>{HSA_NOTE}</span>}
              </p>
            )}
          </div>

          <div ref={mapWrapRef}>
            <CountyMap
              pulse={pulse}
              layerId={layerId ?? ''}
              selected={selected}
              onSelect={selectFromMap}
              mode={levelless ? 'value' : mode}
              showSites={showSites}
              height={640}
            />
          </div>

          {selected && (
            <button
              type="button"
              onClick={focusPanelHeading}
              className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-sm text-ink-1 lg:hidden"
            >
              <span className="font-semibold">{countyName(selected)} County</span> selected — see details below{' '}
              <span aria-hidden="true">↓</span>
            </button>
          )}

          <MapTable pulse={pulse} layer={layer} onSelect={selectFromMap} />
        </Card>

        {selected ? (
          <Card className="min-w-0 lg:col-span-5" as="div">
            <CountyPanel
              pulse={pulse}
              series={data.series}
              manifest={data.manifest}
              fips={selected}
              layer={layer}
              audience={state.audience}
              onClose={clearSelection}
              onPickLayer={pickLayer}
            />
          </Card>
        ) : (
          <Card className="min-w-0 lg:col-span-5" as="aside" aria-label="Statewide summary">
            <StatewidePanel pulse={pulse} manifest={data.manifest} series={data.series} layer={layer} onSelectCounty={selectFromMap} />
          </Card>
        )}
      </div>

      {selected && (
        <Card as="div">
          <CountyDetails pulse={pulse} series={data.series} manifest={data.manifest} fips={selected} layer={layer} range={state.range} />
        </Card>
      )}

      <Card>
        <details className="group">
          <summary className="cursor-pointer list-none text-base font-semibold text-ink-1 [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 inline-block text-ink-3 transition-transform group-open:rotate-90" aria-hidden="true">
              ▸
            </span>
            What a map like this can and can’t tell you
          </summary>
          <div className="mt-3 grid gap-4 text-sm text-ink-2 sm:grid-cols-2">
            <Limit title="County values may cover a wider area">
              CDC’s emergency department data is reported for health service areas — groups of counties that share hospitals. {HSA_NOTE}, so
              neighboring counties can show the same number.
            </Limit>
            <Limit title="Small places, jumpy numbers">
              In counties with few residents, a handful of visits can swing a percentage. Counties with too few reports, or no participating
              facilities, show as “No data” rather than a guess.
            </Limit>
            <Limit title="Levels compare a place with its own past">
              “Very low” to “Very high” describes how this week compares with the same measure’s history (or official thresholds) — not your
              personal risk. Compare levels, not raw numbers, across different measures.
            </Limit>
            <Limit title="Wastewater covers people on city sewer">
              Each plant reflects the homes and businesses connected to it. Many rural Minnesotans use private septic systems, which are not
              tested. Some plant dots are placed at the center of the counties they serve when the exact location isn’t published.
            </Limit>
            <Limit title="Data run a week or more behind">
              Values are weekly (weeks end on Saturday) and are published several days later. The newest week can still be revised.
            </Limit>
            <Limit title="County lines aren’t walls">
              People work, shop and travel across counties. A low level where you live doesn’t rule out exposure — the statewide picture still
              matters.
            </Limit>
          </div>
        </details>
      </Card>
    </div>
  )
}

function Limit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-ink-1">{title}</h3>
      <p className="mt-0.5">{children}</p>
    </div>
  )
}

function mapExplainer(layer: MapLayer | undefined, mode: MapMode, scale: string | null): string {
  if (!layer) return 'Each shape is one of Minnesota’s 87 counties. Select one to see who lives there.'
  const phrase = layerPhrase(layer)
  if (isLevelless(layer))
    return `Counties are shaded by CDC’s latest ${pathogenName(layer.pathogen)} Rt estimate for their health service area. Above 1 means infections are likely growing; below 1, shrinking. Rt shows direction of spread, not how much illness there is.`
  if (layer.kind === 'site')
    return `Each dot is a wastewater treatment plant, colored by how its ${phrase} compare with that plant’s own baseline. Bigger dots serve more people.`
  if (mode === 'value')
    return `Counties are shaded by their latest ${phrase} (the scale below shows which shade means more), so you can compare places on the same measure.`
  if (isThreeStepScale(scale))
    return `Each county is colored by MDH’s weekly category for its ${phrase}: Low, Moderate or High (shown as “Very low” when none were reported).`
  if (scale?.startsWith('cuts:'))
    return `Each county is colored by where its latest ${phrase} fall on CDC’s activity cut-points for Minnesota — from very low to very high.`
  return `Each county is colored by how its latest ${phrase} compare with normal for that place — from very low to very high.`
}

/** Table twin of the map (every chart has a table view). */
function MapTable({ pulse, layer, onSelect }: { pulse: PulseFile; layer?: MapLayer; onSelect: (fips: string) => void }) {
  const rt = isLevelless(layer)
  if (!layer) return null
  if (layer.kind === 'site') {
    const rows = sitesFor(pulse, layer.id)
      .map((s) => ({ s, m: s.metrics[layer.id] }))
      .sort((a, b) => levelRank(metricLevel(b.m)) - levelRank(metricLevel(a.m)) || (b.m.value ?? -1) - (a.m.value ?? -1))
    if (!rows.length) return null
    return (
      <TableDetails summary={`View as table (${rows.length} plants)`} caption={`${layer.label} by treatment plant`}>
        <thead>
          <tr>
            <Th>Plant</Th>
            <Th>Level</Th>
            <Th right>Value</Th>
            <Th>Trend</Th>
            <Th>Week ending</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, m }) => (
            <tr key={s.id} className="border-t border-line">
              <RowTh>
                <span className="font-medium text-ink-1">{s.name}</span>
                {countyNames(s.counties, 3) && <span className="block font-normal text-ink-3">{countyNames(s.counties, 3)}</span>}
              </RowTh>
              <Td>
                <LevelBadge level={metricLevel(m)} size="sm" />
              </Td>
              <Td right>{formatLayerValue(m.value, layer)}</Td>
              <Td>{m.trend ? <TrendPill trend={m.trend} compact /> : '—'}</Td>
              <Td>{formatDate(m.date)}</Td>
            </tr>
          ))}
        </tbody>
      </TableDetails>
    )
  }
  const metrics = countyMetricsFor(pulse, layer.id)
  const rows = [...metrics.entries()]
    .filter(([, m]) => m.value != null)
    .sort(([, a], [, b]) => (b.value ?? 0) - (a.value ?? 0))
  if (!rows.length) return null
  const missing = MN_COUNTIES.length - rows.length
  return (
    <TableDetails
      summary={`View as table (${rows.length} counties)`}
      caption={`${layer.label} by county`}
      footnote={missing > 0 ? `${missing} counties have no data for this layer.` : undefined}
    >
      <thead>
        <tr>
          <Th>County</Th>
          {!rt && <Th>Level</Th>}
          <Th right>Value{UNIT_SUFFIX[layer.unit] ? ` (${UNIT_SUFFIX[layer.unit].trim()})` : ''}</Th>
          <Th>Trend</Th>
          <Th>Week ending</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([fips, m]) => (
          <tr key={fips} className="border-t border-line">
            <RowTh>
              <button type="button" className="font-medium text-ink-1 underline decoration-line-strong underline-offset-2 hover:text-accent" onClick={() => onSelect(fips)}>
                {countyName(fips)}
              </button>
            </RowTh>
            {!rt && (
              <Td>
                <LevelBadge level={metricLevel(m)} size="sm" />
              </Td>
            )}
            <Td right>{formatLayerValue(m.value, layer)}</Td>
            <Td>{m.trend ? <TrendPill trend={m.trend} compact /> : '—'}</Td>
            <Td>{formatDate(m.date)}</Td>
          </tr>
        ))}
      </tbody>
    </TableDetails>
  )
}

function TableDetails({ summary, caption, footnote, children }: { summary: string; caption: string; footnote?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-medium text-accent">{summary}</summary>
      <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-line">
        <table className="tabular w-full min-w-[30rem] text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
      {footnote && <p className="mt-1.5 text-xs text-ink-3">{footnote}</p>}
    </details>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={`sticky top-0 bg-surface-2 px-2.5 py-2 font-medium text-ink-2 ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  )
}

function RowTh({ children }: { children: React.ReactNode }) {
  return (
    <th scope="row" className="px-2.5 py-1.5 text-left align-middle font-normal text-ink-1">
      {children}
    </th>
  )
}

/** One series behind a layer, to check attributes such as the health service area. */
function sampleSeries(pulse: PulseFile, series: Series[], layer: MapLayer): Series | undefined {
  const rows = layer.kind === 'site' ? pulse.sites : pulse.counties
  for (const r of rows) {
    const m = r.metrics[layer.id]
    if (m) return series.find((s) => s.id === m.seriesId)
  }
  return undefined
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-2.5 py-1.5 align-middle text-ink-1 ${right ? 'text-right' : ''}`}>{children}</td>
}
