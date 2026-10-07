// Weekly trend chart: calendar time axis (with forecasts, provisional weeks and official activity
// levels) or a season-over-season comparison. Every chart has a table twin and a keyboard-readable
// crosshair tooltip. Colors come from theme tokens and re-resolve when the theme changes.
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import type {
  ActivityLevel, ActivityThresholds, Forecast, MetricKind, QuantileForecastPoint, Series, Unit,
} from '../../../shared/types'
import { seasonOf, seasonWeekEnding } from '../../../shared/mmwr'
import type { TimeRange } from '../../lib/state'
import { bySeason, clipToRange, lastPoint } from '../../lib/series'
import { formatDate, formatValue, LEVEL_LABEL, UNIT_SUFFIX } from '../../lib/format'
import { EmptyState } from '../ui'
import { EChart, type EChartsInstance } from './EChart'
import { DataTable, type DataTableColumn, type DataTableRow } from './DataTable'
import { ForecastCaption, ForecastKey, LineKey } from './ForecastLegend'
import {
  axisTickLabel, axisTitle, escapeHtml, forecastSourceDescription, forecastSourceLabel, isoFromMs, LEVEL_TOKEN,
  msFromIso, niceScale, prefersReducedMotion, readTokens, resolveColor, seasonLabel, seriesVar, useThemeKey,
  withAlpha, type ChartTokens,
} from './chartTheme'

export interface TrendSeriesInput {
  series: Series
  /** Override display name (defaults to series.label). */
  name?: string
  /** CSS color (defaults to categorical slot by index). */
  color?: string
  /** De-emphasize (e.g. U.S. comparison line). */
  muted?: boolean
}

export interface TrendChartProps {
  /** 1–6 series that share ONE unit (never mix units on one axis). */
  series: TrendSeriesInput[]
  /** Forecasts whose seriesId matches one of the series; drawn as a fan after its last point. */
  forecasts?: Forecast[]
  range?: TimeRange
  height?: number
  /** Accessible description of what the chart shows. */
  ariaLabel: string
  /** Draw official activity-level bands from series[0].thresholds when present (default true). */
  showThresholds?: boolean
  /** Overlay prior seasons aligned by week-of-season instead of a calendar time axis. */
  compareSeasons?: boolean
  /** Show a "View as table" toggle (default true). */
  allowTable?: boolean
  /** Start in table view instead of the chart (default 'chart'). */
  defaultView?: 'chart' | 'table'
}

// ───────────────────────── model ─────────────────────────

interface Entity {
  key: string
  name: string
  kind: 'obs' | 'forecast' | 'season'
  /** CSS color, possibly var(--token); resolved at render. */
  color: string
  muted?: boolean
  emphasized?: boolean
  opacity: number
  width: number
  /** Ordered [x-key, value] pairs: ISO dates (calendar) or week-of-season index strings. */
  points: [string, number | null][]
  values: Map<string, number | null>
  provisionalFrom?: string
  forecast?: Forecast
  fc?: Map<string, QuantileForecastPoint>
  anchor?: [string, number]
}

interface Model {
  mode: 'calendar' | 'season'
  unit: Unit
  metric: MetricKind
  entities: Entity[]
  xs: string[]
  thresholds?: ActivityThresholds
  /** Latest observed date across plotted series. */
  lastObserved?: string
  hasBothForecasts: boolean
  refSeason?: string
}

type ForecastPref = 'cdc' | 'mn-pulse'

const SEASON_OPACITY = [0.85, 0.62, 0.45, 0.33, 0.25, 0.2]

function buildCalendarModel(inputs: TrendSeriesInput[], forecasts: Forecast[], range: TimeRange, pref: ForecastPref): Model | null {
  if (!inputs.length) return null
  const unit = inputs[0].series.unit
  const same = inputs.filter((i) => i.series.unit === unit)
  const end = same.reduce((m, i) => {
    const d = i.series.points[i.series.points.length - 1]?.[0]
    return d && d > m ? d : m
  }, '')
  if (!end) return null

  const entities: Entity[] = []
  let slot = 0
  const colorOf = new Map<number, string>()
  same.forEach((input, i) => {
    const color = input.color ?? (input.muted ? 'var(--series-muted)' : seriesVar(++slot))
    colorOf.set(i, color)
    const pts = clipToRange(input.series.points, range, end)
    entities.push({
      key: `s${i}`,
      name: input.name ?? input.series.label,
      kind: 'obs',
      color,
      muted: input.muted,
      opacity: 1,
      width: 2,
      points: pts,
      values: new Map(pts),
      provisionalFrom: input.series.provisionalFrom,
    })
  })

  // Forecasts: at most one per series (CDC ensemble preferred unless the reader picks ours).
  let hasBoth = false
  const anyEmphasized = same.some((i) => !i.muted)
  const fcEntities: Entity[] = []
  same.forEach((input, i) => {
    if (input.muted && anyEmphasized) return
    const fs = forecasts.filter((f) => f.seriesId === input.series.id && f.points.length)
    const cdc = fs.find((f) => f.source !== 'mn-pulse')
    const mine = fs.find((f) => f.source === 'mn-pulse')
    if (cdc && mine) hasBoth = true
    const f = pref === 'mn-pulse' ? (mine ?? cdc) : (cdc ?? mine)
    if (!f) return
    const last = lastPoint(input.series.points)
    if (!last) return
    const fpts = f.points.filter((p) => p.date > last[0]).sort((a, b) => (a.date < b.date ? -1 : 1))
    if (!fpts.length) return
    fcEntities.push({
      key: `f${i}`,
      name: forecastSourceLabel(f.source),
      kind: 'forecast',
      color: colorOf.get(i)!,
      opacity: 1,
      width: 2,
      points: [],
      values: new Map(),
      forecast: f,
      fc: new Map(fpts.map((p) => [p.date, p])),
      anchor: last,
    })
  })
  if (fcEntities.length > 1) {
    for (const e of fcEntities) {
      const obs = entities.find((o) => o.key === `s${e.key.slice(1)}`)
      if (obs) e.name = `${obs.name} · ${e.name}`
    }
  }
  entities.push(...fcEntities)

  const xsSet = new Set<string>()
  for (const e of entities) {
    for (const [d] of e.points) xsSet.add(d)
    if (e.fc) for (const d of e.fc.keys()) xsSet.add(d)
  }
  const xs = [...xsSet].sort()
  const lastObserved = same.reduce((m, i) => {
    const lp = lastPoint(i.series.points)
    return lp && lp[0] > m ? lp[0] : m
  }, '')
  return {
    mode: 'calendar',
    unit,
    metric: same[0].series.metric,
    entities,
    xs,
    thresholds: same[0].series.thresholds,
    lastObserved: lastObserved || undefined,
    hasBothForecasts: hasBoth,
  }
}

function buildSeasonModel(inputs: TrendSeriesInput[], range: TimeRange): Model | null {
  const input = inputs[0]
  if (!input) return null
  const s = input.series
  const lines = bySeason(s.points, range === '5y' ? 6 : 4).filter((l) => l.points.some((p) => p[1] != null))
  if (!lines.length) return null
  const current = lines[lines.length - 1]
  const priors = lines.slice(0, -1).reverse()
  const thisSeason = seasonOf(new Date().toISOString().slice(0, 10))
  const mk = (l: (typeof lines)[number], k: number, isCurrent: boolean): Entity => {
    const pts = l.points.map(([w, v]) => [String(w), v] as [string, number | null])
    return {
      key: `season:${l.season}`,
      name: `${seasonLabel(l.season)}${isCurrent && l.season === thisSeason ? ' (this season)' : ''}`,
      kind: 'season',
      color: isCurrent ? (input.color ?? 'var(--series-1)') : 'var(--muted)',
      emphasized: isCurrent,
      opacity: isCurrent ? 1 : SEASON_OPACITY[k] ?? 0.2,
      width: isCurrent ? 2.5 : 2,
      points: pts,
      values: new Map(pts),
    }
  }
  const entities = [mk(current, 0, true), ...priors.map((l, k) => mk(l, k, false))]
  const maxWeek = Math.max(51, ...lines.flatMap((l) => l.points.map((p) => p[0])))
  const xs = Array.from({ length: maxWeek + 1 }, (_, i) => String(i))
  const lp = lastPoint(s.points)
  return {
    mode: 'season',
    unit: s.unit,
    metric: s.metric,
    entities,
    xs,
    thresholds: s.thresholds,
    lastObserved: lp?.[0],
    hasBothForecasts: false,
    refSeason: current.season,
  }
}

// ───────────────────────── option ─────────────────────────

const fmt = (v: number | null | undefined, unit: Unit) => (v == null ? '—' : `${formatValue(v, unit)}${UNIT_SUFFIX[unit]}`)

interface ThresholdPlan {
  shown: { level: ActivityLevel; value: number }[]
  /** First level whose cut-point lies above the plotted range. */
  above?: { level: ActivityLevel; value: number }
  all: { level: ActivityLevel; value: number }[]
}

function planThresholds(t: ActivityThresholds | undefined, dataMax: number): ThresholdPlan | undefined {
  if (!t) return undefined
  const all = (
    [
      ['low', t.low],
      ['moderate', t.moderate],
      ['high', t.high],
      ['very-high', t.veryHigh],
    ] as [ActivityLevel, number][]
  )
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .map(([level, value]) => ({ level, value }))
  if (!all.length) return undefined
  const shown = all.filter((c) => c.value <= dataMax)
  const next = all.find((c) => c.value > dataMax)
  // Show the next level up when it fits without flattening the data (keeps "how far from Moderate?" visible).
  if (next && next.value <= Math.max(dataMax, 1e-9) * 2.5) shown.push(next)
  const above = all.find((c) => !shown.includes(c) && c.value > dataMax)
  return { shown, above, all }
}

function lineKeySvg(color: string, opacity: number, dashed: boolean): string {
  return `<svg width="14" height="6" style="flex:none"><line x1="1" x2="13" y1="3" y2="3" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2" stroke-linecap="round"${
    dashed ? ' stroke-dasharray="3 2"' : ''
  }/></svg>`
}

function tooltipRow(T: ChartTokens, key: string, value: string, name: string, extra = ''): string {
  return `<div style="display:flex;align-items:center;gap:8px;margin-top:3px;white-space:nowrap">${key}<span style="font-weight:600;color:${T.ink1}">${escapeHtml(
    value,
  )}</span><span style="color:${T.ink2}">${escapeHtml(name)}</span>${extra ? `<span style="color:${T.ink3}">${escapeHtml(extra)}</span>` : ''}</div>`
}

interface BuiltChart {
  option: EChartsCoreOption
  plan?: ThresholdPlan
  hasProvisional: boolean
  visibleForecasts: Entity[]
}

function buildOption(model: Model, hidden: Set<string>, showThresholds: boolean, T: ChartTokens): BuiltChart {
  const { unit, metric } = model
  let visible = model.entities.filter((e) => !hidden.has(e.key))
  if (!visible.length) visible = model.entities
  const calendar = model.mode === 'calendar'
  const X = (k: string): number | string => (calendar ? msFromIso(k) : k)

  // y extent
  let dataMax = 0
  for (const e of visible) {
    for (const [, v] of e.points) if (v != null && v > dataMax) dataMax = v
    if (e.fc) for (const p of e.fc.values()) dataMax = Math.max(dataMax, p.hi95)
  }
  const plan = showThresholds ? planThresholds(model.thresholds, dataMax) : undefined
  let top = Math.max(dataMax, ...(plan?.shown.map((c) => c.value) ?? []))
  if (metric === 'rt') top = Math.max(top, 1.2)
  const scale = niceScale(top)

  const reduced = prefersReducedMotion()
  const series: Record<string, unknown>[] = []

  // Series 0: invisible helper spanning every x — carries reference lines/bands and keyboard focus.
  const markLineData: Record<string, unknown>[] = []
  const markAreaData: unknown[] = []
  if (plan) {
    plan.shown.forEach((c, i) => {
      const upper = Math.min(plan.shown[i + 1]?.value ?? scale.max, scale.max)
      markLineData.push({ yAxis: c.value, label: { formatter: LEVEL_LABEL[c.level] } })
      // A barely-there wash only for the top two levels, so "High" territory reads at a glance
      // without tinting the whole plot.
      if (upper > c.value && (c.level === 'high' || c.level === 'very-high')) {
        markAreaData.push([
          { yAxis: c.value, itemStyle: { color: withAlpha(resolveColor(`var(${LEVEL_TOKEN[c.level]})`), 0.05) } },
          { yAxis: upper },
        ])
      }
    })
  }
  if (metric === 'rt') {
    markLineData.push({
      yAxis: 1,
      label: { formatter: '1 = steady' },
      lineStyle: { type: 'solid', color: T.ink3, opacity: 0.6 },
    })
  }
  series.push({
    type: 'line',
    name: '__axis',
    data: model.xs.map((k) => (calendar ? [X(k), 0] : 0)),
    symbol: 'none',
    lineStyle: { opacity: 0, width: 0 },
    silent: true,
    animation: false,
    z: 1,
    markLine: markLineData.length
      ? {
          silent: true,
          symbol: 'none',
          animation: false,
          lineStyle: { color: T.muted, width: 1, type: [4, 3], opacity: 0.8 },
          label: { position: 'insideEndTop', color: T.ink3, fontSize: 10, fontFamily: T.font, distance: [2, 2] },
          emphasis: { disabled: true },
          data: markLineData,
        }
      : undefined,
    markArea: markAreaData.length ? { silent: true, animation: false, emphasis: { disabled: true }, data: markAreaData } : undefined,
  })

  let hasProvisional = false
  const visibleForecasts: Entity[] = []
  const drawOrder = [...visible].sort((a, b) => rank(a) - rank(b))
  for (const e of drawOrder) {
    const color = resolveColor(e.color)
    if (e.kind === 'forecast' && e.fc && e.anchor) {
      visibleForecasts.push(e)
      const fps = [...e.fc.values()]
      const xsF = [e.anchor[0], ...fps.map((p) => p.date)].map(X)
      const a = e.anchor[1]
      const lo95 = [a, ...fps.map((p) => Math.max(0, p.lo95))]
      const hi95 = [a, ...fps.map((p) => Math.max(0, p.hi95))]
      const lo50 = [a, ...fps.map((p) => Math.max(0, p.lo50))]
      const hi50 = [a, ...fps.map((p) => Math.max(0, p.hi50))]
      const med = [a, ...fps.map((p) => p.median)]
      const band = (stack: string, lo: number[], hi: number[], alpha: number) => [
        { type: 'line', name: `${e.key}:${stack}:lo`, stack: `${e.key}:${stack}`, data: xsF.map((x, i) => [x, lo[i]]), symbol: 'none', lineStyle: { opacity: 0, width: 0 }, silent: true, z: 2 },
        {
          type: 'line',
          name: `${e.key}:${stack}:hi`,
          stack: `${e.key}:${stack}`,
          data: xsF.map((x, i) => [x, Math.max(0, hi[i] - lo[i])]),
          symbol: 'none',
          lineStyle: { opacity: 0, width: 0 },
          areaStyle: { color: withAlpha(color, alpha), opacity: 1 },
          silent: true,
          z: 2,
        },
      ]
      series.push(...band('95', lo95, hi95, 0.09), ...band('50', lo50, hi50, 0.18))
      series.push({
        type: 'line',
        name: `${e.key}:median`,
        data: xsF.map((x, i) => [x, med[i]]),
        symbol: 'none',
        lineStyle: { color, width: 2, type: [5, 4], cap: 'round' },
        silent: true,
        z: 4,
      })
      continue
    }

    // Observed / season line.
    const pts = e.points
    let lastIdx = -1
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i][1] != null) { lastIdx = i; break }
    const toItem = (p: [string, number | null], i: number, endDot: boolean) => {
      const value = calendar ? [X(p[0]), p[1]] : p[1]
      return endDot && i === lastIdx
        ? { value, symbol: 'circle', symbolSize: 8, itemStyle: { color, opacity: e.opacity, borderColor: T.surface1, borderWidth: 2 } }
        : { value }
    }
    const common = {
      type: 'line',
      symbol: 'none',
      showSymbol: true,
      showAllSymbol: true,
      connectNulls: false,
      silent: true,
      emphasis: { disabled: true },
      z: e.emphasized || (!e.muted && e.kind === 'obs') ? 5 : 3,
    }
    const endDot = e.kind === 'obs' ? !e.muted : !!e.emphasized
    const style = { color, width: e.width, opacity: e.opacity, cap: 'round', join: 'round' }
    if (calendar) {
      const pf = e.provisionalFrom
      const firstProv = pf ? pts.findIndex((p) => p[0] >= pf) : -1
      if (firstProv >= 0) {
        hasProvisional = true
        const finalPart = pts.slice(0, Math.max(firstProv, 0))
        const provPart = pts.slice(Math.max(firstProv - 1, 0))
        series.push({ ...common, name: e.key, data: finalPart.map((p, i) => toItem(p, i, false)), lineStyle: style })
        series.push({
          ...common,
          name: `${e.key}:prov`,
          data: provPart.map((p, i) => toItem(p, i + Math.max(firstProv - 1, 0), endDot)),
          lineStyle: { ...style, type: [4, 3], opacity: e.opacity * 0.55 },
        })
        continue
      }
      series.push({ ...common, name: e.key, data: pts.map((p, i) => toItem(p, i, endDot)), lineStyle: style })
    } else {
      const byWeek = model.xs.map((k) => [k, e.values.get(k) ?? null] as [string, number | null])
      lastIdx = -1
      for (let i = byWeek.length - 1; i >= 0; i--) if (byWeek[i][1] != null) { lastIdx = i; break }
      series.push({ ...common, name: e.key, data: byWeek.map((p, i) => toItem(p, i, endDot)), lineStyle: style })
    }
  }

  // Tooltip: one readout listing every visible series at the hovered week.
  const formatter = (raw: unknown) => {
    const params = (Array.isArray(raw) ? raw : [raw]) as { axisValue: number | string }[]
    if (!params.length) return ''
    const av = params[0].axisValue
    const key = calendar ? isoFromMs(Number(av)) : String(av)
    let html = ''
    if (calendar) {
      html += `<div style="color:${T.ink3};font-size:11px">Week ending ${escapeHtml(formatDate(key, true))}</div>`
    } else {
      const idx = Number(key)
      html += `<div style="color:${T.ink3};font-size:11px">Season week ${idx + 1} · week ending around ${escapeHtml(
        formatDate(seasonWeekEnding(model.refSeason!, idx)),
      )}</div>`
    }
    for (const e of visible) {
      const color = resolveColor(e.color)
      if (e.kind === 'forecast') {
        const p = e.fc?.get(key)
        if (!p) continue
        html += tooltipRow(T, lineKeySvg(color, 1, true), fmt(p.median, unit), e.name)
        html += `<div style="color:${T.ink3};font-size:11px;margin-left:22px">95% range ${escapeHtml(
          `${formatValue(Math.max(0, p.lo95), unit)}–${fmt(p.hi95, unit)}`,
        )}</div>`
        continue
      }
      if (!e.values.has(key)) continue
      const v = e.values.get(key) ?? null
      const prov = !!(e.provisionalFrom && key >= e.provisionalFrom)
      html += tooltipRow(T, lineKeySvg(color, e.opacity, prov), v == null ? 'Not reported' : fmt(v, unit), e.name, prov ? 'provisional' : '')
    }
    return `<div style="font-family:${T.font};font-size:12px;line-height:1.35">${html}</div>`
  }

  const axisLabel = { color: T.ink3, fontSize: 11, fontFamily: T.font }
  let xAxis: Record<string, unknown>
  if (calendar) {
    xAxis = {
      type: 'time',
      min: X(model.xs[0]),
      max: X(model.xs[model.xs.length - 1]),
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabel, hideOverlap: true, formatter: { year: '{yyyy}', month: '{MMM}', day: '{MMM} {d}' } },
      axisPointer: { snap: true },
    }
  } else {
    const ref = model.refSeason!
    const monthOf = (i: number) => seasonWeekEnding(ref, i).slice(5, 7)
    const starts = new Set<number>()
    model.xs.forEach((_, i) => {
      if (i === 0 || monthOf(i) !== monthOf(i - 1)) starts.add(i)
    })
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    xAxis = {
      type: 'category',
      data: model.xs,
      boundaryGap: false,
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        interval: (i: number) => starts.has(i),
        formatter: (v: string) => MONTHS[Number(monthOf(Number(v))) - 1],
      },
    }
  }

  const option: EChartsCoreOption = {
    useUTC: true,
    animation: !reduced,
    animationDuration: 300,
    animationDurationUpdate: 200,
    textStyle: { fontFamily: T.font },
    grid: { left: 2, right: 10, top: 26, bottom: 2, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis,
    yAxis: {
      type: 'value',
      min: 0,
      max: scale.max,
      interval: scale.interval,
      name: axisTitle(metric, unit),
      nameLocation: 'end',
      nameGap: 12,
      nameTextStyle: { color: T.ink3, fontSize: 11, fontFamily: T.font, align: 'left' },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, formatter: (v: number) => axisTickLabel(v, unit) },
      splitLine: { lineStyle: { color: T.grid, width: 1, type: 'solid' } },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      triggerOn: 'mousemove|click',
      axisPointer: { type: 'line', snap: true, lineStyle: { color: T.muted, width: 1, type: 'solid' }, label: { show: false } },
      backgroundColor: T.surface1,
      borderColor: T.border,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: T.ink1, fontSize: 12, fontFamily: T.font },
      extraCssText: 'border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.14);',
      formatter,
    },
    series,
  }
  return { option, plan, hasProvisional, visibleForecasts }
}

function rank(e: Entity): number {
  if (e.kind === 'forecast') return 1
  if (e.kind === 'season') return e.emphasized ? 9 : 5 - Math.min(4, e.opacity * 4)
  return e.muted ? 2 : 6
}

// ───────────────────────── component ─────────────────────────

export function TrendChart({
  series,
  forecasts = [],
  range = '1y',
  height = 300,
  ariaLabel,
  showThresholds = true,
  compareSeasons = false,
  allowTable = true,
  defaultView = 'chart',
}: TrendChartProps) {
  const themeKey = useThemeKey()
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [table, setTable] = useState(defaultView === 'table' && allowTable)
  const [pref, setPref] = useState<ForecastPref>('cdc')
  const tipIndex = useRef(-1)
  const tableId = `trend-table-${useId().replace(/:/g, '')}`

  const model = useMemo(
    () => (compareSeasons ? buildSeasonModel(series, range) : buildCalendarModel(series, forecasts, range, pref)),
    [series, forecasts, range, compareSeasons, pref],
  )
  const hasData = !!model && model.entities.some((e) => e.kind !== 'forecast' && e.points.some((p) => p[1] != null))

  const built = useMemo(
    () => (model && hasData ? buildOption(model, hidden, showThresholds, readTokens()) : null),
    // themeKey forces token re-read when the theme flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, hasData, hidden, showThresholds, themeKey],
  )

  const toggle = useCallback(
    (key: string) => {
      setHidden((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        // Never hide every line.
        const anyLine = model?.entities.some((e) => e.kind !== 'forecast' && !next.has(e.key))
        return anyLine ? next : prev
      })
    },
    [model],
  )

  const focusIndex = useCallback(() => {
    if (!model) return 0
    if (model.mode === 'calendar' && model.lastObserved) {
      const i = model.xs.indexOf(model.lastObserved)
      if (i >= 0) return i
    }
    if (model.mode === 'season') {
      const cur = model.entities.find((e) => e.emphasized)
      const last = cur?.points.filter((p) => p[1] != null).pop()
      if (last) return model.xs.indexOf(last[0])
    }
    return model.xs.length - 1
  }, [model])

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>, chart: EChartsInstance) => {
      if (!model) return
      const n = model.xs.length
      let i = tipIndex.current < 0 ? focusIndex() : tipIndex.current
      if (e.key === 'ArrowLeft') i = Math.max(0, i - 1)
      else if (e.key === 'ArrowRight') i = Math.min(n - 1, i + 1)
      else if (e.key === 'Home') i = 0
      else if (e.key === 'End') i = n - 1
      else if (e.key === 'Escape') {
        chart.dispatchAction({ type: 'hideTip' })
        return
      } else return
      e.preventDefault()
      tipIndex.current = i
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: i })
    },
    [model, focusIndex],
  )
  const onFocus = useCallback(
    (chart: EChartsInstance) => {
      tipIndex.current = focusIndex()
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: tipIndex.current })
    },
    [focusIndex],
  )
  const onBlur = useCallback((chart: EChartsInstance) => {
    tipIndex.current = -1
    chart.dispatchAction({ type: 'hideTip' })
  }, [])

  if (!model || !hasData || !built) {
    return (
      <div style={{ minHeight: Math.min(height, 220) }} className="flex flex-col justify-center" aria-label={ariaLabel} role="figure">
        <EmptyState title={series.length && model ? 'No data in this time range' : 'No data to chart yet'}>
          {series.length && model
            ? 'Nothing was reported for the selected weeks. Try a longer time range.'
            : 'This measure has not been reported yet. It will appear here once the source publishes it.'}
        </EmptyState>
      </div>
    )
  }

  const { unit, metric } = model
  const legendItems = model.entities
  const showLegend = legendItems.length >= 2
  const primary = model.entities.find((e) => e.kind !== 'forecast' && !e.muted && !hidden.has(e.key)) ?? model.entities[0]
  const primaryLast = primary.points.filter((p) => p[1] != null).pop()
  const label = `${ariaLabel}${
    primaryLast
      ? `. Latest${model.mode === 'season' ? ` (${primary.name})` : ''}: ${fmt(primaryLast[1], unit)}${
          model.mode === 'calendar' ? ` for the week ending ${formatDate(primaryLast[0], true)}` : ''
        }.`
      : ''
  } Use the table view for every value.`

  const { plan, hasProvisional, visibleForecasts } = built
  const visible = model.entities.filter((e) => !hidden.has(e.key))

  return (
    <figure className="m-0 min-w-0">
      {(showLegend || allowTable || model.hasBothForecasts) && (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {showLegend ? (
            <ul className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1" aria-label="Legend — select to show or hide a line">
              {legendItems.map((e) => {
                const on = !hidden.has(e.key)
                return (
                  <li key={e.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(e.key)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-ink-2 hover:bg-surface-2 ${
                        on ? '' : 'line-through opacity-50'
                      }`}
                      title={on ? `Hide ${e.name}` : `Show ${e.name}`}
                    >
                      {e.kind === 'forecast' ? <ForecastKey color={e.color} width={18} /> : <LineKey color={e.color} opacity={e.opacity} />}
                      <span className={e.emphasized ? 'font-semibold text-ink-1' : ''}>{e.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <span />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {model.hasBothForecasts && (
              <div role="radiogroup" aria-label="Forecast shown" className="flex items-center gap-1.5 text-xs text-ink-3">
                <span aria-hidden="true">Forecast:</span>
                <div className="flex overflow-hidden rounded-md border border-line">
                  {(
                    [
                      ['cdc', 'CDC ensemble'],
                      ['mn-pulse', 'MN Pulse'],
                    ] as [ForecastPref, string][]
                  ).map(([id, text]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={pref === id}
                      onClick={() => setPref(id)}
                      className={`px-2 py-1 text-xs ${pref === id ? 'bg-accent text-accent-ink' : 'bg-surface-1 text-ink-2 hover:bg-surface-2'}`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {allowTable && (
              <button
                type="button"
                onClick={() => setTable((t) => !t)}
                aria-expanded={table}
                aria-controls={tableId}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink-1"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
                  {table ? (
                    <path d="M1 10.5 4 6.5l2.5 2L11 2" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <>
                      <rect x="1" y="1.5" width="10" height="9" rx="1.5" />
                      <path d="M1 4.5h10M1 7.5h10M4.5 4.5v6" />
                    </>
                  )}
                </svg>
                {table ? 'View as chart' : 'View as table'}
              </button>
            )}
          </div>
        </div>
      )}

      {table ? (
        <TrendTable id={tableId} model={model} visible={visible} maxHeight={height} />
      ) : (
        <EChart
          option={built.option}
          height={height}
          ariaLabel={label}
          focusable
          title="Use the left and right arrow keys to read weekly values"
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      )}

      <figcaption className="mt-2 space-y-1.5">
        {visibleForecasts.length > 0 && !table && (
          <ForecastCaption sources={visibleForecasts.map((f) => f.forecast!.source)} color={visibleForecasts[0].color} />
        )}
        {hasProvisional && !table && (
          <p className="flex items-center gap-2 text-xs text-ink-2">
            <LineKey color={primary.color} dashed opacity={0.55} />
            <span>Provisional: the latest weeks are incomplete and likely to be revised.</span>
          </p>
        )}
        {plan && plan.shown.length > 0 && !table && (
          <p className="flex items-start gap-2 text-xs text-ink-2">
            <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true" className="mt-0.5 shrink-0">
              <line x1="1" x2="17" y1="5" y2="5" style={{ stroke: 'var(--muted)' }} strokeWidth="1" strokeDasharray="4 3" />
            </svg>
            <span>
              Dashed gray lines mark official activity levels ({plan.all.map((c) => `${LEVEL_LABEL[c.level]} from ${fmt(c.value, unit)}`).join(' · ')}).
            </span>
          </p>
        )}
        {plan?.above && !table && (
          <p className="text-xs text-ink-2">
            {plan.shown.length === 0 ? 'Official activity levels: ' : ''}
            The “{LEVEL_LABEL[plan.above.level]}” level starts at {fmt(plan.above.value, unit)}
            {plan.shown.length === 0 && plan.all[0] === plan.above ? ' — values shown here are all below it.' : ', above the range shown.'}
          </p>
        )}
        {metric === 'rt' && !table && (
          <p className="text-xs text-ink-2">Rt above 1 means infections are growing; below 1, shrinking.</p>
        )}
        <details className="group text-xs text-ink-2">
          <summary className="cursor-pointer select-none font-medium text-ink-2 hover:text-ink-1">How to read this chart</summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-4">
            {model.mode === 'calendar' ? (
              <li>
                Each point is one week (ending Saturday): {axisTitle(metric, unit).toLowerCase()}.
                {model.lastObserved ? ` Data through the week ending ${formatDate(model.lastObserved, true)}.` : ''}
              </li>
            ) : (
              <li>
                Each line is one respiratory season (October to September), lined up by week so you can compare this year with
                past years. The bold line is the most recent season.
              </li>
            )}
            {visibleForecasts.map((f) => (
              <li key={f.key}>
                <span className="font-medium text-ink-1">{forecastSourceLabel(f.forecast!.source)}</span> (issued{' '}
                {formatDate(f.forecast!.issuedAt.slice(0, 10), true)}): {forecastSourceDescription(f.forecast!.source)} The dashed line
                is the middle estimate; the true value is expected to land in the darker band about half the time and in the
                lighter band about 95% of the time. Forecasts are not certain — sudden changes can fall outside the range.
                {f.forecast!.note ? ` ${f.forecast!.note}` : ''}
              </li>
            ))}
            {plan && <li>Activity levels: {model.thresholds?.by}.</li>}
            {hasProvisional && <li>Recent weeks marked provisional usually rise or fall a little as late reports arrive.</li>}
            {model.mode === 'season' && <li>Forecasts are shown in the regular (calendar) view.</li>}
          </ul>
        </details>
      </figcaption>
    </figure>
  )
}

function TrendTable({ id, model, visible, maxHeight }: { id: string; model: Model; visible: Entity[]; maxHeight: number }) {
  const { unit } = model
  const cell = (v: number | null | undefined) => (v === undefined ? '' : v == null ? 'Not reported' : formatValue(v, unit))
  let columns: DataTableColumn[]
  let rows: DataTableRow[]
  if (model.mode === 'calendar') {
    const obs = visible.filter((e) => e.kind === 'obs')
    const fcs = visible.filter((e) => e.kind === 'forecast')
    columns = [
      { key: 'date', label: 'Week ending' },
      ...obs.map((e) => ({ key: e.key, label: e.name })),
      ...fcs.map((e) => ({
        key: e.key,
        label: (
          <>
            {e.name}
            <span className="block text-[11px] font-normal text-ink-3">middle (95% range)</span>
          </>
        ),
      })),
    ]
    rows = [...model.xs]
      .reverse()
      .map((d) => {
        const cells = [
          formatDate(d, true),
          ...obs.map((e) => {
            const v = e.values.get(d)
            const prov = e.provisionalFrom && d >= e.provisionalFrom && v != null
            return prov ? `${cell(v)} (provisional)` : cell(v)
          }),
          ...fcs.map((e) => {
            const p = e.fc?.get(d)
            return p ? `${formatValue(p.median, unit)} (${formatValue(Math.max(0, p.lo95), unit)}–${formatValue(p.hi95, unit)})` : ''
          }),
        ]
        return { key: d, cells, empty: cells.slice(1).every((c) => c === '') }
      })
      .filter((r) => !r.empty)
      .map(({ key, cells }) => ({ key, cells }))
  } else {
    columns = [{ key: 'week', label: 'Season week (approx. date)' }, ...visible.map((e) => ({ key: e.key, label: e.name }))]
    rows = model.xs
      .map((k) => {
        const cells = [
          `Week ${Number(k) + 1} · ${formatDate(seasonWeekEnding(model.refSeason!, Number(k)))}`,
          ...visible.map((e) => cell(e.values.get(k))),
        ]
        return { key: k, cells, empty: cells.slice(1).every((c) => c === '') }
      })
      .filter((r) => !r.empty)
      .map(({ key, cells }) => ({ key, cells }))
  }
  return (
    <DataTable
      id={id}
      caption={`${axisTitle(model.metric, unit)} by week`}
      columns={columns}
      rows={rows}
      maxHeight={maxHeight}
      footnote={`Values: ${axisTitle(model.metric, unit).toLowerCase()}.${model.mode === 'calendar' ? ' Newest week first.' : ''}`}
    />
  )
}
