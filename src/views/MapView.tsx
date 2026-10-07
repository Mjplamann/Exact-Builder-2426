// Map view: what's going around where. County choropleth + wastewater plants, with a side panel
// that explains the selected county (or the statewide picture when nothing is selected).
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapLayer, PulseFile } from '../../shared/types'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS } from '../../shared/geo/mnCounties'
import { CountyMap } from '../components/map/CountyMap'
import { CountyPanel } from '../components/map/CountyPanel'
import { LayerPicker, ModeToggle, SitesToggle } from '../components/map/LayerPicker'
import { StatewidePanel } from '../components/map/StatewidePanel'
import {
  countyMetricsFor, countyName, countyNames, defaultLayerId, HSA_NOTE, isHsaEstimate, layerById, layerPhrase, levelRank, metricLevel,
  sitesFor, sourceName, type MapMode,
} from '../components/map/mapData'
import { FilterBar } from '../components/layout/FilterBar'
import { Card, LevelBadge, SourceTag, TrendPill } from '../components/ui'
import { useDashboard } from '../lib/dashboard'
import { formatDate, formatValue, LEVEL_LABEL, UNIT_SUFFIX } from '../lib/format'
import { useAppState } from '../lib/state'

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
  const panelRef = useRef<HTMLDivElement>(null)

  const layerId = useMemo(() => {
    if (!pulse) return undefined
    if (layerChoice && layerById(pulse, layerChoice)) return layerChoice
    return defaultLayerId(pulse, state.pathogenId)
  }, [pulse, layerChoice, state.pathogenId])

  useEffect(() => writePrefs({ layer: layerChoice, mode, sites: sitesOn }), [layerChoice, mode, sitesOn])

  if (!pulse || !data) return null

  const layer = layerById(pulse, layerId)
  const selected = state.geo.type === 'county' && MN_COUNTY_BY_FIPS[state.geo.code] ? state.geo.code : null
  const hasSiteLayers = pulse.mapLayers.some((l) => l.kind === 'site')
  const showSites = layer?.kind === 'site' || (hasSiteLayers && sitesOn)

  const select = (fips: string | null) => update({ geo: fips ? { type: 'county', code: fips } : { type: 'state', code: '27' } })
  const pickLayer = (id: string) => setLayerChoice(id)

  const source = sourceName(data.manifest, layer?.source)

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
        <LayerPicker layers={pulse.mapLayers} value={layerId} onChange={pickLayer} />
        {layer && layer.kind !== 'site' && <ModeToggle value={mode} onChange={setMode} />}
        {hasSiteLayers && layer?.kind !== 'site' && <SitesToggle checked={sitesOn} onChange={setSitesOn} />}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-7" aria-labelledby="map-title">
          <div className="mb-3">
            <h2 id="map-title" className="text-lg font-semibold tracking-tight text-ink-1">
              {layer ? layer.label : 'Minnesota counties'}
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">{mapExplainer(layer, mode)}</p>
            {layer && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                {layer.latestDate && <span>Latest week ending {formatDate(layer.latestDate, true)}</span>}
                {source && <SourceTag>{source}</SourceTag>}
                {isHsaEstimate(layer) && <span>{HSA_NOTE}</span>}
              </p>
            )}
          </div>

          <CountyMap pulse={pulse} layerId={layerId ?? ''} selected={selected} onSelect={select} mode={mode} showSites={showSites} height={640} />

          {selected && (
            <button
              type="button"
              onClick={() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="mt-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-sm text-ink-1 lg:hidden"
            >
              <span className="font-semibold">{countyName(selected)} County</span> selected — see details below ↓
            </button>
          )}

          <MapTable pulse={pulse} layer={layer} onSelect={select} />
        </Card>

        <div ref={panelRef} className="min-w-0 scroll-mt-24 lg:col-span-5">
          <Card as="aside" aria-label={selected ? `${countyName(selected)} County details` : 'Statewide summary'}>
            {selected ? (
              <CountyPanel
                pulse={pulse}
                series={data.series}
                manifest={data.manifest}
                fips={selected}
                layer={layer}
                audience={state.audience}
                range={state.range}
                onClose={() => select(null)}
                onPickLayer={pickLayer}
              />
            ) : (
              <StatewidePanel pulse={pulse} manifest={data.manifest} layer={layer} onSelectCounty={(f) => select(f)} />
            )}
          </Card>
        </div>
      </div>

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

function mapExplainer(layer: MapLayer | undefined, mode: MapMode): string {
  if (!layer) return 'Each shape is one of Minnesota’s 87 counties. Select one to see who lives there.'
  const phrase = layerPhrase(layer)
  if (layer.kind === 'site')
    return `Each dot is a wastewater treatment plant, colored by how its ${phrase} compare with that plant’s own baseline. Bigger dots serve more people.`
  if (mode === 'value')
    return `Counties are shaded by their latest ${phrase} (the scale below shows which shade means more), so you can compare places on the same measure.`
  return `Each county is colored by how its latest ${phrase} compare with normal for that place — from very low to very high.`
}

/** Table twin of the map (every chart has a table view). */
function MapTable({ pulse, layer, onSelect }: { pulse: PulseFile; layer?: MapLayer; onSelect: (fips: string) => void }) {
  if (!layer) return null
  if (layer.kind === 'site') {
    const rows = sitesFor(pulse, layer.id)
      .map((s) => ({ s, m: s.metrics[layer.id] }))
      .sort((a, b) => levelRank(metricLevel(b.m)) - levelRank(metricLevel(a.m)) || (b.m.value ?? -1) - (a.m.value ?? -1))
    if (!rows.length) return null
    return (
      <TableDetails summary={`View as table (${rows.length} plants)`}>
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
              <Td>
                <span className="font-medium text-ink-1">{s.name}</span>
                {countyNames(s.counties, 3) && <span className="block text-ink-3">{countyNames(s.counties, 3)}</span>}
              </Td>
              <Td>
                <LevelBadge level={metricLevel(m)} size="sm" />
              </Td>
              <Td right>{formatValue(m.value, layer.unit)}</Td>
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
    <TableDetails summary={`View as table (${rows.length} counties)`} footnote={missing > 0 ? `${missing} counties have no data for this layer.` : undefined}>
      <thead>
        <tr>
          <Th>County</Th>
          <Th>Level</Th>
          <Th right>Value{UNIT_SUFFIX[layer.unit] ? ` (${UNIT_SUFFIX[layer.unit].trim()})` : ''}</Th>
          <Th>Trend</Th>
          <Th>Week ending</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([fips, m]) => (
          <tr key={fips} className="border-t border-line">
            <Td>
              <button type="button" className="font-medium text-ink-1 underline decoration-line-strong underline-offset-2 hover:text-accent" onClick={() => onSelect(fips)}>
                {countyName(fips)}
              </button>
            </Td>
            <Td>
              <LevelBadge level={metricLevel(m)} size="sm" />
              <span className="sr-only">{LEVEL_LABEL[metricLevel(m)]}</span>
            </Td>
            <Td right>{formatValue(m.value, layer.unit)}</Td>
            <Td>{m.trend ? <TrendPill trend={m.trend} compact /> : '—'}</Td>
            <Td>{formatDate(m.date)}</Td>
          </tr>
        ))}
      </tbody>
    </TableDetails>
  )
}

function TableDetails({ summary, footnote, children }: { summary: string; footnote?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer text-sm font-medium text-accent">{summary}</summary>
      <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-line">
        <table className="tabular w-full min-w-[30rem] text-left text-xs">{children}</table>
      </div>
      {footnote && <p className="mt-1.5 text-xs text-ink-3">{footnote}</p>}
    </details>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`sticky top-0 bg-surface-2 px-2.5 py-2 font-medium text-ink-2 ${right ? 'text-right' : ''}`}>{children}</th>
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-2.5 py-1.5 align-middle text-ink-1 ${right ? 'text-right' : ''}`}>{children}</td>
}
