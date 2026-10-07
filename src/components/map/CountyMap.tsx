// SVG choropleth of Minnesota's 87 counties with optional wastewater-plant markers.
// Projection: Lambert conformal conic tuned for Minnesota, fitted to the container width.
// Colors: activity levels (always with a text label in tooltip/legend), or a quantized sequential ramp.
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo'
import { scaleSqrt } from 'd3-scale'
import type { CountyMetric, MapLayer, PulseFile, Series, SitePulse } from '../../../shared/types'
import { pathogenName } from '../../content'
import { useDashboard } from '../../lib/dashboard'
import { formatDate, formatValue, LEVEL_LABEL, LEVEL_VAR, METRIC_LABEL, metricMeaning, UNIT_SUFFIX } from '../../lib/format'
import { EmptyState, LevelBadge, TrendPill } from '../ui'
import {
  binIndex, countyMetricsFor, countyNames, HSA_NOTE, isHsaEstimate, layerById, makeBins, metricLevel, siteLayerFor, sitesFor,
  sourceName, type ValueBin,
} from './mapData'
import { LevelLegend, SiteLegend, ValueLegend } from './MapLegend'
import { MapTooltip } from './MapTooltip'
import { useCountiesGeo, useElementWidth } from './useCountiesGeo'

export interface CountyMapProps {
  pulse: PulseFile
  /** Map layer id from pulse.mapLayers (county or site layer). */
  layerId: string
  /** Selected county FIPS. */
  selected?: string | null
  onSelect?: (fips: string | null) => void
  /** Color counties by activity level (default) or by raw value. */
  mode?: 'level' | 'value'
  /** Overlay wastewater sites from pulse.sites. */
  showSites?: boolean
  /**
   * Maximum height in px. The map keeps Minnesota's shape: its height comes from the container
   * width, capped at this value (the map is then centered).
   */
  height?: number
  /** Compact = no legend/controls (used for the mini map on the overview). */
  compact?: boolean
}

type Hover = { kind: 'county' | 'site'; id: string; x: number; y: number } | null

interface CountyShape {
  fips: string
  name: string
  d: string
  c: [number, number]
}

interface SiteDot {
  site: SitePulse
  x: number
  y: number
  r: number
  metric: CountyMetric
}

const PAD = 4

/** "…were for it" → "…were for Flu". */
export function meaningFor(layer: MapLayer, value: number | null | undefined): string {
  const s = metricMeaning(layer.metric, value, layer.unit)
  return s.replace(/\bit\b/, pathogenName(layer.pathogen))
}

function hsaName(series: Series | undefined): string | undefined {
  if (!series?.attrs) return undefined
  const key = Object.keys(series.attrs).find((k) => /hsa|service.?area/i.test(k))
  return key ? series.attrs[key] : undefined
}

export function CountyMap({
  pulse,
  layerId,
  selected,
  onSelect,
  mode = 'level',
  showSites = false,
  height,
  compact = false,
}: CountyMapProps) {
  const { geo, error } = useCountiesGeo()
  const [wrapRef, width] = useElementWidth<HTMLDivElement>()
  const { data } = useDashboard()
  const uid = `cm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const hatchUrl = `url(#${uid}-hatch)`

  const [hover, setHover] = useState<Hover>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  const layer = layerById(pulse, layerId)
  const countyLayer = layer?.kind === 'county' ? layer : undefined
  const siteLayer = layer?.kind === 'site' || showSites ? siteLayerFor(pulse, layer) : undefined

  const metrics = useMemo(
    () => (countyLayer ? countyMetricsFor(pulse, countyLayer.id) : new Map<string, CountyMetric>()),
    [pulse, countyLayer],
  )
  const reporting = useMemo(() => [...metrics.values()].filter((m) => m.value != null), [metrics])
  const bins: ValueBin[] = useMemo(
    () => (mode === 'value' ? makeBins(reporting.map((m) => m.value as number)) : []),
    [mode, reporting],
  )

  const seriesById = useMemo(() => {
    const ids = new Set<string>()
    for (const m of metrics.values()) ids.add(m.seriesId)
    const out = new Map<string, Series>()
    for (const s of data?.series ?? []) if (ids.has(s.id)) out.set(s.id, s)
    return out
  }, [data, metrics])

  // ── Geometry ──
  const geom = useMemo(() => {
    if (!geo || width <= 0) return null
    const projection: GeoProjection = geoConicConformal().parallels([45, 49]).rotate([94.5, 0])
    projection.fitWidth(Math.max(1, width - 2 * PAD), geo)
    const b = geoPath(projection).bounds(geo)
    const natural = Math.ceil(b[1][1] - b[0][1] + 2 * PAD)
    const maxH = height ?? (compact ? 300 : Number.POSITIVE_INFINITY)
    const h = Math.max(140, Math.min(natural, maxH))
    projection.fitExtent(
      [
        [PAD, PAD],
        [width - PAD, h - PAD],
      ],
      geo,
    )
    const path = geoPath(projection)
    const counties: CountyShape[] = geo.features.map((f) => ({
      fips: String(f.properties?.fips ?? f.id),
      name: f.properties?.name ?? String(f.id),
      d: path(f) ?? '',
      c: path.centroid(f) as [number, number],
    }))
    return { projection, h, counties }
  }, [geo, width, height, compact])

  const siteList = useMemo(() => sitesFor(pulse, siteLayer?.id), [pulse, siteLayer])
  const dots: SiteDot[] = useMemo(() => {
    if (!geom || !siteLayer) return []
    const pops = siteList.map((s) => s.population).filter((p): p is number => p != null && p > 0)
    const lo = pops.length ? Math.min(...pops) : 1
    const hi = pops.length ? Math.max(...pops) : 1
    // 5–12px on a full-size map; scaled down on narrow (phone) and compact maps so dots don't pile up.
    const rMax = Math.max(compact ? 6 : 7, Math.min(compact ? 8 : 12, width / 50))
    const rMin = Math.max(compact ? 3 : 3.5, Math.min(5, rMax * 0.42))
    const r = scaleSqrt()
      .domain([lo, hi === lo ? lo + 1 : hi])
      .range([rMin, rMax])
      .clamp(true)
    const out: SiteDot[] = []
    for (const site of siteList) {
      if (!site.coord) continue
      const p = geom.projection(site.coord)
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue
      out.push({ site, x: p[0], y: p[1], r: site.population ? r(site.population) : rMin + 1, metric: site.metrics[siteLayer.id] })
    }
    // Big dots first so small ones stay on top.
    return out.sort((a, b) => b.r - a.r)
  }, [geom, siteLayer, siteList, compact, width])

  // ── Fill + labels ──
  function fillFor(fips: string): string {
    if (!countyLayer) return 'var(--surface-2)'
    const m = metrics.get(fips)
    if (!m || m.value == null) return hatchUrl
    if (mode === 'value') {
      const i = binIndex(bins, m.value)
      return i >= 0 ? bins[i].color : hatchUrl
    }
    return LEVEL_VAR[metricLevel(m)]
  }

  function countyAria(c: CountyShape): string {
    const base = `${c.name} County`
    if (!countyLayer) return `${base}. Select to see county details.`
    const m = metrics.get(c.fips)
    if (!m || m.value == null) return `${base}: no data for ${countyLayer.label}.`
    const v = `${formatValue(m.value, countyLayer.unit)}${UNIT_SUFFIX[countyLayer.unit]}`
    return `${base}: ${LEVEL_LABEL[metricLevel(m)]} activity, ${v}, week ending ${formatDate(m.date, true)}.`
  }

  // ── Interaction ──
  function localPoint(e: PointerEvent<Element>): [number, number] {
    const rect = wrapRef.current?.getBoundingClientRect()
    return rect ? [e.clientX - rect.left, e.clientY - rect.top] : [0, 0]
  }
  const onPointerMove = (kind: 'county' | 'site', id: string) => (e: PointerEvent<SVGElement>) => {
    if (e.pointerType === 'touch') return
    const [x, y] = localPoint(e)
    setHover({ kind, id, x, y })
  }
  const onPointerLeave = (id: string) => () => setHover((h) => (h?.id === id ? null : h))
  const onFocus = (kind: 'county' | 'site', id: string, x: number, y: number) => (e: React.FocusEvent<SVGElement>) => {
    let visible = true
    try {
      visible = e.currentTarget.matches(':focus-visible')
    } catch {
      /* older browsers */
    }
    if (!visible) return
    setFocusId(id)
    setHover({ kind, id, x, y })
  }
  const onBlur = (id: string) => () => {
    setFocusId((f) => (f === id ? null : f))
    setHover((h) => (h?.id === id ? null : h))
  }
  const onCountyKey = (fips: string) => (e: KeyboardEvent<SVGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(fips)
    } else if (e.key === 'Escape') {
      setHover(null)
      onSelect?.(null)
    }
  }

  const skipMap = () => document.getElementById(`${uid}-after`)?.focus()

  // ── Render ──
  if (error) {
    return (
      <EmptyState title="The county map could not be loaded">
        {error.message}. The numbers are still available in the panels and tables on this page.
      </EmptyState>
    )
  }

  const layerHasData = !!countyLayer && reporting.length > 0
  const siteHasData = !!siteLayer && dots.length > 0
  const showEmpty = !layer || (countyLayer && !layerHasData) || (layer.kind === 'site' && !siteHasData)
  const emptyText = !pulse.mapLayers.length
    ? 'County-level data has not been published yet. You can still select a county to see who lives there.'
    : !layer
      ? 'This map layer is not available in the latest data.'
      : `No ${layer.kind === 'site' ? 'treatment plant' : 'county'} data for ${layer.label} yet.`

  const selectedShape = selected ? geom?.counties.find((c) => c.fips === selected) : undefined
  const hoverShape = hover?.kind === 'county' ? geom?.counties.find((c) => c.fips === hover.id) : undefined
  const focusShape = focusId ? geom?.counties.find((c) => c.fips === focusId) : undefined
  const focusDot = focusId ? dots.find((d) => d.site.id === focusId) : undefined

  // Legend counts.
  const levelCounts: Partial<Record<string, number>> = {}
  let unknownCount = 0
  for (const m of reporting) {
    const l = metricLevel(m)
    levelCounts[l] = (levelCounts[l] ?? 0) + 1
    if (l === 'unknown') unknownCount++
  }
  const countyTotal = geom?.counties.length ?? 87
  const noDataCount = countyLayer ? countyTotal - reporting.length : 0
  const binCounts = bins.map((_, i) => reporting.filter((m) => binIndex(bins, m.value) === i).length)
  const siteLevelCounts: Partial<Record<string, number>> = {}
  let siteUnknown = 0
  for (const d of dots) {
    const l = metricLevel(d.metric)
    siteLevelCounts[l] = (siteLevelCounts[l] ?? 0) + 1
    if (l === 'unknown') siteUnknown++
  }

  const ariaMap = countyLayer
    ? `Map of Minnesota counties colored by ${mode === 'value' ? 'value' : 'activity level'} for ${countyLayer.label}.`
    : layer?.kind === 'site'
      ? `Map of Minnesota wastewater treatment plants colored by ${layer.label} level.`
      : 'Map of Minnesota counties.'

  return (
    <div className="min-w-0">
      {showEmpty && (
        <p className={`mb-2 rounded-lg border border-dashed border-line-strong bg-surface-2 text-ink-2 ${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'}`}>
          {emptyText}
        </p>
      )}
      {!compact && (
        <button
          type="button"
          onClick={skipMap}
          className="sr-only rounded-md bg-surface-1 px-2 py-1 text-sm text-accent focus:not-sr-only focus:mb-2 focus:inline-block"
        >
          Skip past the county map
        </button>
      )}
      <div ref={wrapRef} className="relative w-full" onPointerLeave={() => setHover((h) => (h && h.id !== focusId ? null : h))}>
        {!geom ? (
          <div
            className="flex items-center justify-center rounded-lg bg-surface-2 text-sm text-ink-3"
            style={{ height: Math.min(height ?? (compact ? 300 : 620), Math.max(200, width * 1.14) || 300) }}
          >
            Loading map…
          </div>
        ) : (
          <svg
            width={width}
            height={geom.h}
            viewBox={`0 0 ${width} ${geom.h}`}
            role="group"
            aria-label={ariaMap}
            className="block select-none"
            style={{ touchAction: 'manipulation' }}
          >
            <defs>
              <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" style={{ fill: 'var(--surface-3)' }} />
                <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: 'var(--muted)', strokeWidth: 1, opacity: 0.45 }} />
              </pattern>
            </defs>

            <g>
              {geom.counties.map((c) => (
                <path
                  key={c.fips}
                  d={c.d}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected === c.fips}
                  aria-label={countyAria(c)}
                  style={{ fill: fillFor(c.fips), stroke: 'var(--surface-1)', strokeWidth: 1, outline: 'none', cursor: onSelect ? 'pointer' : 'default' }}
                  strokeLinejoin="round"
                  onPointerMove={onPointerMove('county', c.fips)}
                  onPointerLeave={onPointerLeave(c.fips)}
                  onClick={() => onSelect?.(c.fips)}
                  onKeyDown={onCountyKey(c.fips)}
                  onFocus={onFocus('county', c.fips, c.c[0], c.c[1])}
                  onBlur={onBlur(c.fips)}
                />
              ))}
            </g>

            {/* Overlays drawn above all counties so outlines are never covered by neighbors. */}
            {selectedShape && (
              <g pointerEvents="none" aria-hidden="true">
                <path d={selectedShape.d} style={{ fill: 'none', stroke: 'var(--surface-1)', strokeWidth: 5 }} strokeLinejoin="round" />
                <path d={selectedShape.d} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5 }} strokeLinejoin="round" />
              </g>
            )}
            {hoverShape && hoverShape.fips !== focusShape?.fips && (
              <path
                d={hoverShape.d}
                pointerEvents="none"
                aria-hidden="true"
                style={{ fill: 'none', stroke: 'var(--ink-1)', strokeWidth: 1.5 }}
                strokeLinejoin="round"
              />
            )}
            {focusShape && (
              <g pointerEvents="none" aria-hidden="true">
                <path d={focusShape.d} style={{ fill: 'none', stroke: 'var(--surface-1)', strokeWidth: 4.5 }} strokeLinejoin="round" />
                <path d={focusShape.d} style={{ fill: 'none', stroke: 'var(--ink-1)', strokeWidth: 2.5 }} strokeLinejoin="round" />
              </g>
            )}

            {dots.length > 0 && (
              <g aria-label="Wastewater treatment plants" role="group">
                {dots.map((d) => {
                  const level = metricLevel(d.metric)
                  const served = countyNames(d.site.counties, 3)
                  return (
                    <g
                      key={d.site.id}
                      tabIndex={0}
                      role="img"
                      aria-label={`${d.site.name}${served ? `, serving ${served}` : ''}: ${LEVEL_LABEL[level]} wastewater level, week ending ${formatDate(d.metric.date, true)}.`}
                      style={{ outline: 'none' }}
                      onPointerMove={onPointerMove('site', d.site.id)}
                      onPointerLeave={onPointerLeave(d.site.id)}
                      onFocus={onFocus('site', d.site.id, d.x, d.y)}
                      onBlur={onBlur(d.site.id)}
                    >
                      <circle cx={d.x} cy={d.y} r={Math.max(d.r + 6, 12)} style={{ fill: 'transparent' }} />
                      <circle
                        cx={d.x}
                        cy={d.y}
                        r={d.r}
                        style={{ fill: LEVEL_VAR[level], stroke: 'var(--surface-1)', strokeWidth: 2 }}
                      />
                      {hover?.id === d.site.id && (
                        <circle cx={d.x} cy={d.y} r={d.r + 1.5} style={{ fill: 'none', stroke: 'var(--ink-1)', strokeWidth: 1.5 }} />
                      )}
                    </g>
                  )
                })}
              </g>
            )}
            {focusDot && (
              <circle
                cx={focusDot.x}
                cy={focusDot.y}
                r={focusDot.r + 4}
                pointerEvents="none"
                aria-hidden="true"
                style={{ fill: 'none', stroke: 'var(--ink-1)', strokeWidth: 2 }}
              />
            )}
          </svg>
        )}

        {geom && hover && (
          <MapTooltip x={hover.x} y={hover.y} bounds={{ width, height: geom.h }} compact={compact}>
            {hover.kind === 'county' ? (
              <CountyTip
                name={geom.counties.find((c) => c.fips === hover.id)?.name ?? hover.id}
                layer={countyLayer}
                metric={metrics.get(hover.id)}
                source={sourceName(data?.manifest, countyLayer?.source)}
                hsa={hsaName(seriesById.get(metrics.get(hover.id)?.seriesId ?? ''))}
                compact={compact}
                selectable={!!onSelect}
              />
            ) : (
              siteLayer && (
                <SiteTip
                  site={dots.find((d) => d.site.id === hover.id)?.site}
                  layer={siteLayer}
                  source={sourceName(data?.manifest, siteLayer.source)}
                  compact={compact}
                />
              )
            )}
          </MapTooltip>
        )}
      </div>

      {!compact && (
        <div className="mt-3 flex flex-col gap-3" id={`${uid}-after`} tabIndex={-1} style={{ outline: 'none' }}>
          {countyLayer && layerHasData && mode === 'level' && (
            <LevelLegend counts={levelCounts} noData={noDataCount} showUnknown={unknownCount > 0} title="Activity level (number of counties)" />
          )}
          {countyLayer && layerHasData && mode === 'value' && bins.length > 0 && (
            <ValueLegend
              bins={bins}
              unit={countyLayer.unit}
              counts={binCounts}
              noData={noDataCount}
              title={`${METRIC_LABEL[countyLayer.metric]}${countyLayer.unit === '%' ? ' (% of visits)' : UNIT_SUFFIX[countyLayer.unit] ? ` (${UNIT_SUFFIX[countyLayer.unit].trim()})` : ''}`}
            />
          )}
          {siteLayer && siteHasData && (
            <>
              {!(countyLayer && layerHasData && mode === 'level') && (
                <LevelLegend counts={siteLevelCounts} showUnknown={siteUnknown > 0} title="Wastewater level (number of plants)" />
              )}
              <SiteLegend layer={siteLayer} located={dots.length} unlocated={siteList.length - dots.length} />
            </>
          )}
          {countyLayer && isHsaEstimate(countyLayer) && layerHasData && (
            <p className="text-xs text-ink-3">{HSA_NOTE}: neighboring counties in the same area can show the same value.</p>
          )}
        </div>
      )}
    </div>
  )
}

function CountyTip({
  name,
  layer,
  metric,
  source,
  hsa,
  compact,
  selectable,
}: {
  name: string
  layer?: MapLayer
  metric?: CountyMetric
  source: string
  hsa?: string
  compact: boolean
  selectable: boolean
}) {
  const level = metricLevel(metric)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink-1">{name} County</p>
      {layer && metric && metric.value != null ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge level={level} size="sm" />
            {metric.trend && <TrendPill trend={metric.trend} compact />}
          </div>
          <p className="text-ink-1">
            <span className="font-semibold">{formatValue(metric.value, layer.unit)}</span>
            <span className="text-ink-2">{UNIT_SUFFIX[layer.unit]}</span>
            {!compact && <span className="block text-ink-2">{meaningFor(layer, metric.value)}</span>}
          </p>
          <p className="text-ink-3">
            Week ending {formatDate(metric.date, true)}
            {source && !compact ? ` · ${source}` : ''}
          </p>
          {!compact && isHsaEstimate(layer) && (
            <p className="text-ink-3">
              {HSA_NOTE}
              {hsa ? ` (${hsa})` : ''}.
            </p>
          )}
        </>
      ) : layer ? (
        <p className="text-ink-2">No data reported for {layer.label}.</p>
      ) : null}
      {selectable && !compact && <p className="text-ink-3">Select for county details</p>}
    </div>
  )
}

function SiteTip({ site, layer, source, compact }: { site?: SitePulse; layer: MapLayer; source: string; compact: boolean }) {
  if (!site) return null
  const m = site.metrics[layer.id]
  const level = metricLevel(m)
  const served = countyNames(site.counties, compact ? 2 : 4)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold text-ink-1">{site.name}</p>
      {served && <p className="text-ink-2">Serves: {served}</p>}
      {site.population != null && !compact && (
        <p className="text-ink-2">About {formatValue(site.population, 'count')} people connected</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <LevelBadge level={level} size="sm" />
        {m?.trend && <TrendPill trend={m.trend} compact />}
      </div>
      {m && m.value != null && !compact && <p className="text-ink-2">{meaningFor(layer, m.value)}</p>}
      {m && (
        <p className="text-ink-3">
          Week ending {formatDate(m.date, true)}
          {source && !compact ? ` · ${source}` : ''}
        </p>
      )}
    </div>
  )
}
