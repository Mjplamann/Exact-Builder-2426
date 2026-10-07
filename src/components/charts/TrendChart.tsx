// Weekly trend chart: calendar time axis (with forecasts, provisional weeks and official activity
// levels) or a season-over-season comparison. Every chart has a table twin and a keyboard-readable
// crosshair tooltip whose text is also announced to screen readers. Colors come from theme tokens and
// re-resolve when the theme changes. ECharts itself is loaded lazily (see EChart.tsx).
import {
  lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import type {
  ActivityLevel, ActivityThresholds, Forecast, MetricKind, QuantileForecastPoint, Series, Unit,
} from '../../../shared/types'
import { seasonOf, seasonWeekEnding } from '../../../shared/mmwr'
import type { TimeRange } from '../../lib/state'
import { bySeason, clipToRange, lastPoint } from '../../lib/series'
import { formatDate, formatValue, LEVEL_LABEL, UNIT_SUFFIX } from '../../lib/format'
import { EmptyState } from '../ui'
import type { EChartsInstance } from './EChart'
import { DataTable, type DataTableColumn, type DataTableRow } from './DataTable'
import { ForecastCaption, ForecastKey, LineKey } from './ForecastLegend'
import { SegmentedRadio } from './SegmentedRadio'
import { forecastOrigin, pointsFromOrigin, weeksBetween } from './forecast'
import {
  axisTickLabel, axisTitle, escapeHtml, forecastSourceDescription, forecastSourceLabel, isDarkColor, isoFromMs, LEVEL_TOKEN,
  msFromIso, niceScale, readTokens, resolveColor, seasonLabel, seriesVar, useThemeKey,
  withAlpha, type ChartTokens,
} from './chartTheme'

const EChart = lazy(() => import('./EChart').then((m) => ({ default: m.EChart })))

export interface TrendSeriesInput {
  series: Series
  /** Override display name (defaults to series.label). */
  name?: string
  /**
   * CSS color (defaults to the next level-safe categorical slot, see `seriesVar`). Pass `seriesVar(n)`
   * rather than a literal `var(--series-N)` so lines never wear an activity-level color.
   */
  color?: string
  /** De-emphasize (e.g. U.S. comparison line). */
  muted?: boolean
}

export interface TrendChartProps {
  /** 1–6 series that share ONE unit (never mix units on one axis). */
  series: TrendSeriesInput[]
  /** Forecasts whose seriesId matches one of the series; each is drawn as a fan from its own origin. */
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
  /**
   * 'all': few reported weeks or mostly gaps — every reported week gets a dot. 'nonzero': mostly zero
   * weeks — the non-zero weeks get a dot so the few cases stand out from the baseline.
   */
  sparse?: false | 'all' | 'nonzero'
  forecast?: Forecast
  fc?: Map<string, QuantileForecastPoint>
  /** Forecast origin drawn as the fan's first vertex (absent when it lies before the plotted range). */
  anchor?: [string, number]
  /** Forecast origin date (last observed week the model used). */
  originDate?: string
  /** Weeks of newer reported data after the forecast origin (the fan overlays them). */
  overlapWeeks?: number
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
  /** Calendar mode: the selected time range (3 months or less gets weekly ticks). */
  range?: TimeRange
}

type ForecastPref = 'cdc' | 'mn-pulse'

const NONE_HIDDEN: Set<string> = new Set()

const SEASON_OPACITY = [0.85, 0.62, 0.45, 0.33, 0.25, 0.2]

/** Too few points, or too many gaps, to read as a line: dots for every week; mostly zeros: dots for the rest. */
function isSparse(pts: [string, number | null][]): false | 'all' | 'nonzero' {
  if (!pts.length) return false
  let nonNull = 0
  let zero = 0
  for (const [, v] of pts) {
    if (v != null) nonNull++
    if (v === 0) zero++
  }
  if (nonNull < 8 || (pts.length - nonNull) / pts.length > 0.5) return 'all'
  if ((pts.length - nonNull + zero) / pts.length > 0.5 && zero < nonNull) return 'nonzero'
  return false
}

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
  same.forEach((input, i) => {
    const color = input.color ?? (input.muted ? 'var(--series-muted)' : seriesVar(++slot))
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
      sparse: isSparse(pts),
    })
  })

  // Forecasts: at most one per series (CDC ensemble preferred unless the reader picks ours), each drawn
  // from its own origin so a forecast made before the newest weeks overlays them instead of jumping.
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
    const origin = forecastOrigin(input.series.points, f)
    const fpts = pointsFromOrigin(f, origin)
    if (!fpts.length) return
    const shownFrom = entities[i].points[0]?.[0]
    const last = lastPoint(input.series.points)
    const overlap = origin && last ? weeksBetween(origin.date, last[0]) : 0
    fcEntities.push({
      key: `f${i}`,
      name: forecastSourceLabel(f.source),
      kind: 'forecast',
      color: entities[i].color,
      opacity: 1,
      width: 2,
      points: [],
      values: new Map(),
      forecast: f,
      fc: new Map(fpts.map((p) => [p.date, p])),
      anchor: origin && (!shownFrom || origin.date >= shownFrom) ? [origin.date, origin.value] : undefined,
      originDate: origin?.date,
      overlapWeeks: overlap > 0 ? overlap : 0,
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
    if (e.anchor) xsSet.add(e.anchor[0])
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
    range,
  }
}

function buildSeasonModel(inputs: TrendSeriesInput[], range: TimeRange): Model | null {
  const input = inputs[0]
  if (!input) return null
  const s = input.series
  const nonNull = (l: { points: [number, number | null][] }) => l.points.filter((p) => p[1] != null).length
  const all = bySeason(s.points, 12).filter((l) => nonNull(l) > 0)
  // Prior seasons need enough weeks to be a meaningful comparison (data that starts mid-season is dropped).
  const lines = all.filter((l, i) => i === all.length - 1 || nonNull(l) >= 8).slice(-(range === '5y' ? 6 : 4))
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
      sparse: isCurrent ? isSparse(pts) : false,
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

/** "0.13–0.63%" / "15–53" / "0.1–0.9 per 100k" (unit written once). */
function fmtRange(lo: number, hi: number, unit: Unit): string {
  const a = formatValue(Math.max(0, lo), unit).replace('%', '')
  return `${a}–${fmt(hi, unit)}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000
/** Space one x-axis label needs, including the gap to the next ("Sep" / "2026"; "Sep 26"). */
const MONTH_LABEL_PX = 40
const WEEK_LABEL_PX = 48
/** Height a threshold label needs (10px text + padding); closer lines lose their label. */
const REF_LABEL_PX = 14
const GRID_TOP = 26
/** Approximate height of the x-axis labels under the plot. */
const X_LABEL_PX = 22
/** Approximate width of the y-axis labels plus grid padding. */
const Y_LABEL_PX = 52

interface ThresholdPlan {
  shown: { level: ActivityLevel; value: number }[]
  /** First level whose cut-point lies above the plotted range. */
  above?: { level: ActivityLevel; value: number }
  all: { level: ActivityLevel; value: number }[]
  /** Shown lines whose label was dropped because the next line is too close. */
  unlabeled: ActivityLevel[]
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
  // Show the next level up only when it sits just above the data (keeps "how far from Moderate?" visible
  // without flattening the line against the bottom of the chart).
  if (next && dataMax > 0 && next.value <= dataMax * 1.5) shown.push(next)
  const above = all.find((c) => !shown.includes(c) && c.value > dataMax)
  return { shown, above, all, unlabeled: [] }
}

interface RefLine {
  value: number
  text: string
  level?: ActivityLevel
  show: boolean
  position: 'insideStartTop' | 'insideStartBottom'
}

/**
 * Lay out reference-line labels bottom-up at the left edge (they never cover the newest data or the
 * projection). A label goes above its line, or below it when the line is at the top of the plot; a line
 * whose label would overlap the previous one keeps its line but loses the label.
 */
function layoutRefLabels(lines: RefLine[], scaleMax: number, plotH: number): void {
  const ppu = plotH / scaleMax
  let prevTop = -Infinity
  for (const r of [...lines].sort((a, b) => a.value - b.value)) {
    const p = r.value * ppu
    const above = plotH - p >= REF_LABEL_PX + 2
    const box: [number, number] = above ? [p + 1, p + 1 + REF_LABEL_PX] : [p - 1 - REF_LABEL_PX, p - 1]
    if (box[0] < prevTop + 1) {
      r.show = false
      continue
    }
    r.show = true
    r.position = above ? 'insideStartTop' : 'insideStartBottom'
    prevTop = box[1]
  }
}

/**
 * Calendar x-axis ticks: month starts at one interval (1, 2, 3, 6 or 12 months, the smallest that fits),
 * labelled "Mar" with the year at January; ranges of about 3 months or less get weekly ticks "Sep 6",
 * aligned to the latest reported week.
 */
function calendarTicks(xs: string[], anchorIso: string | undefined, plotW: number, weekly: boolean): Map<number, string> {
  const labels = new Map<number, string>()
  if (!xs.length) return labels
  const minMs = msFromIso(xs[0])
  const maxMs = msFromIso(xs[xs.length - 1])
  if (weekly || (maxMs - minMs) / DAY_MS <= 100) {
    const n = xs.length
    const step = [1, 2, 4, 8].find((k) => Math.ceil(n / k) * WEEK_LABEL_PX <= plotW) ?? 8
    const ai = anchorIso ? xs.indexOf(anchorIso) : -1
    const base = ai >= 0 ? ai : n - 1
    xs.forEach((d, i) => {
      if ((base - i) % step === 0) labels.set(msFromIso(d), formatDate(d))
    })
    return labels
  }
  const starts: { ms: number; y: number; m: number }[] = []
  const first = new Date(minMs)
  let y = first.getUTCFullYear()
  let m = first.getUTCMonth()
  for (;;) {
    const ms = Date.UTC(y, m, 1)
    if (ms > maxMs) break
    if (ms >= minMs) starts.push({ ms, y, m })
    m++
    if (m === 12) {
      m = 0
      y++
    }
  }
  const step = [1, 2, 3, 6, 12].find((k) => starts.filter((s) => s.m % k === 0).length * MONTH_LABEL_PX <= plotW) ?? 12
  for (const s of starts) if (s.m % step === 0) labels.set(s.ms, s.m === 0 ? `{y|${s.y}}` : MONTHS[s.m])
  return labels
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

/** What the readout says at one x position (shared by the tooltip and the screen-reader announcement). */
interface ReadoutRow {
  entity: Entity
  value: string
  provisional?: boolean
  fc?: QuantileForecastPoint
}

function readoutHeader(model: Model, key: string): string {
  if (model.mode === 'calendar') return `Week ending ${formatDate(key, true)}`
  const idx = Number(key)
  return `Season week ${idx + 1} · week ending around ${formatDate(seasonWeekEnding(model.refSeason!, idx))}`
}

function readoutRows(model: Model, visible: Entity[], key: string): ReadoutRow[] {
  const rows: ReadoutRow[] = []
  for (const e of visible) {
    if (e.kind === 'forecast') {
      const p = e.fc?.get(key)
      if (p) rows.push({ entity: e, value: fmt(p.median, model.unit), fc: p })
      continue
    }
    if (!e.values.has(key)) continue
    const v = e.values.get(key) ?? null
    rows.push({
      entity: e,
      value: v == null ? 'Not reported' : fmt(v, model.unit),
      provisional: !!(e.provisionalFrom && key >= e.provisionalFrom && v != null),
    })
  }
  return rows
}

/** Plain-text readout for the live region: "Week ending Sep 26, 2026. Minnesota: 0.26% (provisional). …" */
function readoutText(model: Model, visible: Entity[], key: string): string {
  const rows = readoutRows(model, visible, key)
  const parts = rows.map((r) =>
    r.fc
      ? `${r.entity.name}: ${r.value}, likely ${fmtRange(r.fc.lo50, r.fc.hi50, model.unit)}, 95% range ${fmtRange(r.fc.lo95, r.fc.hi95, model.unit)}`
      : `${r.entity.name}: ${r.value}${r.provisional ? ' (provisional)' : ''}`,
  )
  return [readoutHeader(model, key), ...(parts.length ? parts : ['No values this week'])].join('. ') + '.'
}

interface BuiltChart {
  option: EChartsCoreOption
  plan?: ThresholdPlan
  hasProvisional: boolean
  visibleForecasts: Entity[]
  /** Forecasts whose 95% range runs above the top of the axis, with their highest upper bound. */
  clipped: { entity: Entity; hi95: number; date: string }[]
}

function buildOption(model: Model, visible: Entity[], showThresholds: boolean, T: ChartTokens, size: { width: number; height: number }): BuiltChart {
  const { unit, metric } = model
  const calendar = model.mode === 'calendar'
  const X = (k: string): number | string => (calendar ? msFromIso(k) : k)
  const plotH = Math.max(60, size.height - GRID_TOP - X_LABEL_PX)
  const plotW = Math.max(120, size.width - Y_LABEL_PX)

  // y extent: observed values plus each forecast's middle line and 50% band. The 95% band never sizes
  // the axis (it would flatten the data); it is clipped at the top with a "continues" cap instead.
  let dataMax = 0
  let hi95Max = 0
  for (const e of visible) {
    for (const [, v] of e.points) if (v != null && v > dataMax) dataMax = v
    if (e.fc) {
      for (const p of e.fc.values()) {
        dataMax = Math.max(dataMax, p.median, p.hi50)
        hi95Max = Math.max(hi95Max, p.hi95)
      }
    }
  }
  const plan = showThresholds ? planThresholds(model.thresholds, dataMax) : undefined
  let top = Math.max(dataMax, ...(plan?.shown.map((c) => c.value) ?? []))
  if (metric === 'rt') top = Math.max(top, 1.2)
  const scale = niceScale(top)

  const series: Record<string, unknown>[] = []

  // Series 0: invisible helper spanning every x — carries reference lines/bands and keyboard focus.
  const refs: RefLine[] = []
  const markAreaData: unknown[] = []
  if (plan) {
    plan.shown.forEach((c, i) => {
      const upper = Math.min(plan.shown[i + 1]?.value ?? scale.max, scale.max)
      refs.push({ value: c.value, text: LEVEL_LABEL[c.level], level: c.level, show: true, position: 'insideStartTop' })
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
  if (metric === 'rt') refs.push({ value: 1, text: '1 = steady', show: true, position: 'insideStartTop' })
  layoutRefLabels(refs, scale.max, plotH)
  if (plan) plan.unlabeled = refs.filter((r) => r.level && !r.show).map((r) => r.level!)
  const markLineData = refs.map((r) => ({
    yAxis: r.value,
    label: { show: r.show, position: r.position, formatter: r.text },
    ...(r.level ? {} : { lineStyle: { type: 'solid', color: T.ink3, opacity: 0.6 } }),
  }))
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
          label: {
            color: T.ink3,
            fontSize: 10,
            fontFamily: T.font,
            distance: [4, 2],
            backgroundColor: withAlpha(T.surface1, 0.85),
            padding: [1, 3],
            borderRadius: 3,
          },
          emphasis: { disabled: true },
          data: markLineData,
        }
      : undefined,
    markArea: markAreaData.length ? { silent: true, animation: false, emphasis: { disabled: true }, data: markAreaData } : undefined,
  })

  let hasProvisional = false
  const visibleForecasts: Entity[] = []
  const clipped: BuiltChart['clipped'] = []
  const drawOrder = [...visible].sort((a, b) => rank(a) - rank(b))
  for (const e of drawOrder) {
    const color = resolveColor(e.color)
    if (e.kind === 'forecast' && e.fc) {
      visibleForecasts.push(e)
      const fps = [...e.fc.values()]
      const anchor = e.anchor
      const xsF = [...(anchor ? [anchor[0]] : []), ...fps.map((p) => p.date)].map(X)
      const lead = (vals: number[]) => (anchor ? [anchor[1], ...vals] : vals)
      const lo95 = lead(fps.map((p) => Math.max(0, p.lo95)))
      const hi95 = lead(fps.map((p) => Math.max(0, p.hi95)))
      const lo50 = lead(fps.map((p) => Math.max(0, p.lo50)))
      const hi50 = lead(fps.map((p) => Math.max(0, p.hi50)))
      const med = lead(fps.map((p) => p.median))
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
      // 95% band faint, 50% band clearly stronger on top of it (both a step up on the dark surface, where a
      // low-alpha tint all but disappears).
      const dark = isDarkColor(T.surface1)
      series.push(...band('95', lo95, hi95, dark ? 0.14 : 0.07), ...band('50', lo50, hi50, dark ? 0.3 : 0.2))
      series.push({
        type: 'line',
        name: `${e.key}:median`,
        data: xsF.map((x, i) => [x, med[i]]),
        symbol: 'none',
        lineStyle: { color, width: 2, type: [5, 4], cap: 'round' },
        silent: true,
        z: 4,
      })
      // The 95% band is clipped at the top of the axis: small up-arrows mark the weeks where it continues.
      const over = fps.filter((p) => p.hi95 > scale.max)
      // Text label only where it has room: left of the first arrow, clear of the y-axis title at top left.
      const x0 = calendar && over.length ? msFromIso(model.xs[0]) : 0
      const x1 = calendar && over.length ? msFromIso(model.xs[model.xs.length - 1]) : 0
      const labelRoom = over.length && x1 > x0 ? ((msFromIso(over[0].date) - x0) / (x1 - x0)) * plotW : 0
      const showCapLabel = labelRoom > 380
      if (over.length) {
        const peak = over.reduce((a, b) => (b.hi95 > a.hi95 ? b : a))
        clipped.push({ entity: e, hi95: peak.hi95, date: peak.date })
        series.push({
          type: 'line',
          name: `${e.key}:cap`,
          data: over.map((p, i) => ({
            value: [X(p.date), scale.max],
            symbol: 'triangle',
            symbolSize: [7, 5],
            symbolOffset: [0, -4],
            itemStyle: { color, opacity: 0.8 },
            label:
              i === 0 && showCapLabel
                ? {
                    show: true,
                    position: 'left',
                    distance: 6,
                    offset: [0, -4],
                    formatter: '95% range continues',
                    color: T.ink3,
                    fontSize: 10,
                    fontFamily: T.font,
                    backgroundColor: withAlpha(T.surface1, 0.85),
                    padding: [1, 3],
                    borderRadius: 3,
                  }
                : undefined,
          })),
          symbol: 'none',
          showSymbol: true,
          showAllSymbol: true,
          lineStyle: { opacity: 0, width: 0 },
          clip: false,
          silent: true,
          emphasis: { disabled: true },
          z: 6,
        })
      }
      continue
    }

    // Observed / season line.
    const pts = e.points
    let lastIdx = -1
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i][1] != null) { lastIdx = i; break }
    /** A reported week with no reported neighbour on either side (a line can't show it). */
    const isolated = (arr: [string, number | null][], i: number) =>
      arr[i][1] != null && (i === 0 || arr[i - 1][1] == null) && (i === arr.length - 1 || arr[i + 1][1] == null)
    /** Item i of `arr`, which starts at index `offset` of the full line `full`. */
    const toItem = (arr: [string, number | null][], i: number, offset: number, endDot: boolean, full = arr) => {
      const p = arr[i]
      const value = calendar ? [X(p[0]), p[1]] : p[1]
      if (endDot && i + offset === lastIdx) {
        return { value, symbol: 'circle', symbolSize: 8, itemStyle: { color, opacity: e.opacity, borderColor: T.surface1, borderWidth: 2 } }
      }
      // Sparse series show every point; otherwise a lone week between gaps still gets a dot.
      const dot = e.sparse === 'all' || (e.sparse === 'nonzero' && p[1] !== 0) || isolated(full, i + offset)
      if (p[1] != null && dot) {
        return { value, symbol: 'circle', symbolSize: 5, itemStyle: { color, opacity: e.opacity } }
      }
      return { value }
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
        const provStart = Math.max(firstProv - 1, 0)
        const provPart = pts.slice(provStart)
        series.push({ ...common, name: e.key, data: finalPart.map((_, i) => toItem(finalPart, i, 0, false, pts)), lineStyle: style })
        series.push({
          ...common,
          name: `${e.key}:prov`,
          data: provPart.map((_, i) => toItem(provPart, i, provStart, endDot, pts)),
          lineStyle: { ...style, type: [4, 3], opacity: e.opacity * 0.55 },
        })
        continue
      }
      series.push({ ...common, name: e.key, data: pts.map((_, i) => toItem(pts, i, 0, endDot)), lineStyle: style })
    } else {
      const byWeek = model.xs.map((k) => [k, e.values.get(k) ?? null] as [string, number | null])
      lastIdx = -1
      for (let i = byWeek.length - 1; i >= 0; i--) if (byWeek[i][1] != null) { lastIdx = i; break }
      series.push({ ...common, name: e.key, data: byWeek.map((_, i) => toItem(byWeek, i, 0, endDot)), lineStyle: style })
    }
  }

  // Tooltip: one readout listing every visible series at the hovered week.
  const formatter = (raw: unknown) => {
    const params = (Array.isArray(raw) ? raw : [raw]) as { axisValue: number | string }[]
    if (!params.length) return ''
    const av = params[0].axisValue
    const key = calendar ? isoFromMs(Number(av)) : String(av)
    let html = `<div style="color:${T.ink3};font-size:11px">${escapeHtml(readoutHeader(model, key))}</div>`
    for (const r of readoutRows(model, visible, key)) {
      const color = resolveColor(r.entity.color)
      if (r.fc) {
        html += tooltipRow(T, lineKeySvg(color, 1, true), r.value, r.entity.name)
        html += `<div style="color:${T.ink3};font-size:11px;margin-left:22px">likely ${escapeHtml(fmtRange(r.fc.lo50, r.fc.hi50, unit))} · 95% range ${escapeHtml(
          fmtRange(r.fc.lo95, r.fc.hi95, unit),
        )}</div>`
        continue
      }
      html += tooltipRow(T, lineKeySvg(color, r.entity.opacity, !!r.provisional), r.value, r.entity.name, r.provisional ? 'provisional' : '')
    }
    return `<div style="font-family:${T.font};font-size:12px;line-height:1.35">${html}</div>`
  }

  const axisLabel = { color: T.ink3, fontSize: 11, fontFamily: T.font }
  let xAxis: Record<string, unknown>
  if (calendar) {
    const ticks = calendarTicks(model.xs, model.lastObserved, plotW, model.range === '3m')
    const values = [...ticks.keys()]
    xAxis = {
      type: 'time',
      min: X(model.xs[0]),
      max: X(model.xs[model.xs.length - 1]),
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: true, customValues: values, length: 3, lineStyle: { color: T.axis } },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        customValues: values,
        formatter: (v: number) => ticks.get(v) ?? '',
        rich: { y: { color: T.ink2, fontSize: 11, fontWeight: 600, fontFamily: T.font } },
      },
      axisPointer: { snap: true },
    }
  } else {
    const ref = model.refSeason!
    const monthOf = (i: number) => seasonWeekEnding(ref, i).slice(5, 7)
    const starts: number[] = []
    model.xs.forEach((_, i) => {
      if (i === 0 || monthOf(i) !== monthOf(i - 1)) starts.push(i)
    })
    const step = [1, 2, 3].find((k) => Math.ceil(starts.length / k) * MONTH_LABEL_PX <= plotW) ?? 3
    const shown = new Set(starts.filter((_, n) => n % step === 0))
    xAxis = {
      type: 'category',
      data: model.xs,
      boundaryGap: false,
      axisLine: { lineStyle: { color: T.axis } },
      axisTick: { show: true, length: 3, interval: (i: number) => shown.has(i), lineStyle: { color: T.axis } },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabel,
        hideOverlap: true,
        interval: (i: number) => shown.has(i),
        formatter: (v: string) => MONTHS[Number(monthOf(Number(v))) - 1],
      },
    }
  }

  const option: EChartsCoreOption = {
    useUTC: true,
    // No animation: charts redraw on filter/theme changes and should hold still (calm, no flashes).
    animation: false,
    textStyle: { fontFamily: T.font },
    grid: { left: 2, right: 10, top: GRID_TOP, bottom: 2, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
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
  return { option, plan, hasProvisional, visibleForecasts, clipped }
}

/** "MN Pulse projection" or, with several forecasts, "MN Pulse projection for Minnesota". */
function forecastPhrase(e: Entity): string {
  const src = forecastSourceLabel(e.forecast?.source ?? '')
  const i = e.name.lastIndexOf(' · ')
  return i > 0 ? `${src} for ${e.name.slice(0, i)}` : src
}

function rank(e: Entity): number {
  if (e.kind === 'forecast') return 1
  if (e.kind === 'season') return e.emphasized ? 9 : 5 - Math.min(4, e.opacity * 4)
  return e.muted ? 2 : 6
}

// ───────────────────────── component ─────────────────────────

/**
 * Stable ids for data objects. The data layer replaces every Series and Forecast object when data is
 * (re)loaded, so keying the memo on identity rebuilds the chart after "Reload data" even when only an
 * earlier week was revised, while fresh wrapper arrays from callers do not trigger a rebuild.
 */
const objectIds = new WeakMap<object, number>()
let nextObjectId = 0
function oid(o: object): number {
  let id = objectIds.get(o)
  if (id == null) {
    id = ++nextObjectId
    objectIds.set(o, id)
  }
  return id
}

/** Width of an element, rounded to 20px steps (enough to pick tick intervals without constant rebuilds). */
function useRoundedWidth(el: HTMLElement | null): number {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!el) return
    const measure = () => setW(Math.round(el.getBoundingClientRect().width / 20) * 20)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return w
}

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
  const uid = useId().replace(/:/g, '')
  const tableId = `trend-table-${uid}`
  const hintId = `trend-hint-${uid}`
  const [table, setTable] = useState(defaultView === 'table' && allowTable)
  const [pref, setPref] = useState<ForecastPref>('cdc')
  const [live, setLive] = useState('')
  const [figEl, setFigEl] = useState<HTMLElement | null>(null)
  const width = useRoundedWidth(figEl)
  const tipIndex = useRef(-1)

  // Content signature from object identity (see oid): callers often pass fresh wrapper arrays on every
  // render; rebuilding only when the data objects change keeps the chart from redrawing needlessly.
  const ids = series.map((i) => i.series.id)
  const idsKey = `${compareSeasons ? 'season' : 'cal'}|${ids.join('|')}`
  const sig = [
    idsKey,
    ...series.map((i) => `${oid(i.series)}:${i.name ?? ''}:${i.color ?? ''}:${i.muted ? 1 : 0}`),
    ...forecasts.filter((f) => ids.includes(f.seriesId)).map((f) => oid(f)),
  ].join(';')

  const [hiddenState, setHiddenState] = useState<{ key: string; set: Set<string> }>({ key: idsKey, set: new Set() })
  const hidden = hiddenState.key === idsKey ? hiddenState.set : NONE_HIDDEN

  const model = useMemo(
    () => (compareSeasons ? buildSeasonModel(series, range) : buildCalendarModel(series, forecasts, range, pref)),
    // `sig` captures the identity of `series` and `forecasts`
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig, range, compareSeasons, pref],
  )
  const hasData = !!model && model.entities.some((e) => e.kind !== 'forecast' && e.points.some((p) => p[1] != null))
  const visible = useMemo(() => {
    if (!model) return []
    // A forecast follows its line: hiding a line hides its fan too.
    const v = model.entities.filter((e) => !hidden.has(e.key) && !(e.kind === 'forecast' && hidden.has(`s${e.key.slice(1)}`)))
    return v.length ? v : model.entities
  }, [model, hidden])

  const built = useMemo(
    () => (model && hasData ? buildOption(model, visible, showThresholds, readTokens(), { width: width || 640, height }) : null),
    // themeKey forces token re-read when the theme flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, hasData, visible, showThresholds, themeKey, width, height],
  )

  /** Toggle one legend entry, or a group (all keys follow the first key's new state). */
  const toggle = useCallback(
    (keys: string[]) => {
      setHiddenState((prev) => {
        const next = new Set(prev.key === idsKey ? prev.set : [])
        const show = keys.some((k) => next.has(k)) && keys.every((k) => next.has(k))
        for (const k of keys) {
          if (show) next.delete(k)
          else next.add(k)
        }
        // Never hide every line.
        const anyLine = model?.entities.some((e) => e.kind !== 'forecast' && !next.has(e.key))
        return anyLine ? { key: idsKey, set: next } : prev
      })
    },
    [model, idsKey],
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

  const showAt = useCallback(
    (chart: EChartsInstance, i: number) => {
      if (!model) return
      tipIndex.current = i
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: i })
      setLive(readoutText(model, visible, model.xs[i]))
    },
    [model, visible],
  )

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
      showAt(chart, i)
    },
    [model, focusIndex, showAt],
  )
  const onFocus = useCallback((chart: EChartsInstance) => showAt(chart, focusIndex()), [focusIndex, showAt])
  const onBlur = useCallback((chart: EChartsInstance) => {
    tipIndex.current = -1
    chart.dispatchAction({ type: 'hideTip' })
    setLive('')
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
  // Legend: one entry per line; several forecasts collapse into a single "Forecasts" toggle (the tooltip,
  // caption and "How to read" still name each forecast's source).
  const fcAll = model.entities.filter((e) => e.kind === 'forecast')
  const legendItems: { keys: string[]; name: string; entity?: Entity; forecastGroup?: boolean }[] = [
    ...model.entities.filter((e) => e.kind !== 'forecast').map((e) => ({ keys: [e.key], name: e.name, entity: e })),
    ...(fcAll.length === 1
      ? [{ keys: [fcAll[0].key], name: fcAll[0].name, entity: fcAll[0] }]
      : fcAll.length > 1
        ? [{ keys: fcAll.map((e) => e.key), name: 'Forecasts', forecastGroup: true }]
        : []),
  ]
  const showLegend = legendItems.length >= 2
  const primary = model.entities.find((e) => e.kind !== 'forecast' && !e.muted && !hidden.has(e.key)) ?? model.entities[0]
  const primaryLast = primary.points.filter((p) => p[1] != null).pop()
  const label = `${ariaLabel.trim().replace(/[.\s]+$/, '')}${
    primaryLast
      ? `. Latest${model.mode === 'season' ? ` (${primary.name})` : ''}: ${fmt(primaryLast[1], unit)}${
          model.mode === 'calendar' ? ` for the week ending ${formatDate(primaryLast[0], true)}` : ''
        }.`
      : '.'
  } Use the table view for every value.`

  const { plan, hasProvisional, visibleForecasts, clipped } = built
  // One sentence per (publisher, cutoff, overlap) rather than one per line.
  const overlapNotes: { key: string; subject: string; plural: boolean; originDate: string; weeks: number }[] = []
  for (const f of visibleForecasts) {
    if (!f.overlapWeeks || !f.originDate) continue
    const key = `${f.forecast?.source}|${f.originDate}|${f.overlapWeeks}`
    const same = overlapNotes.find((n) => n.key === key)
    if (same) {
      same.plural = true
      same.subject = `${forecastSourceLabel(f.forecast?.source ?? '')}s`
    } else {
      overlapNotes.push({ key, subject: forecastPhrase(f), plural: false, originDate: f.originDate, weeks: f.overlapWeeks })
    }
  }

  return (
    <figure ref={setFigEl} className="m-0 min-w-0">
      <p id={hintId} className="sr-only">
        Focus the chart and use the left and right arrow keys to read values week by week; Home and End jump to the first and
        last week. The table view lists every value.
      </p>
      {(showLegend || allowTable || model.hasBothForecasts) && (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {showLegend ? (
            <ul className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1" aria-label="Legend — select to show or hide a line">
              {legendItems.map((item) => {
                const on = item.keys.some((k) => !hidden.has(k))
                const e = item.entity
                return (
                  <li key={item.keys.join(',')}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(item.keys)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-surface-2 ${
                        on ? 'text-ink-2' : 'text-ink-3 line-through'
                      }`}
                      title={on ? `Hide ${item.name}` : `Show ${item.name}`}
                    >
                      {/* Off: only the swatch fades; the text stays at full text contrast. */}
                      <span className={`inline-flex ${on ? '' : 'opacity-35'}`}>
                        {item.forecastGroup ? (
                          <ForecastKey color="var(--ink-3)" width={18} />
                        ) : e!.kind === 'forecast' ? (
                          <ForecastKey color={e!.color} width={18} />
                        ) : (
                          <LineKey color={e!.color} opacity={e!.opacity} />
                        )}
                      </span>
                      <span className={e?.emphasized && on ? 'font-semibold text-ink-1' : ''}>{item.name}</span>
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
              <div className="flex items-center gap-1.5 text-xs text-ink-3">
                <span aria-hidden="true">Forecast:</span>
                <SegmentedRadio
                  label="Forecast shown"
                  size="xs"
                  value={pref}
                  onChange={setPref}
                  options={[
                    { id: 'cdc', label: 'CDC', ariaLabel: forecastSourceLabel('cdc') },
                    { id: 'mn-pulse', label: 'MN Pulse', ariaLabel: forecastSourceLabel('mn-pulse') },
                  ]}
                />
              </div>
            )}
            {allowTable && (
              <button
                type="button"
                onClick={() => setTable((t) => !t)}
                aria-expanded={table}
                aria-controls={table ? tableId : undefined}
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
        <Suspense fallback={<div style={{ height }} className="rounded-md" aria-hidden="true" />}>
          <EChart
            option={built.option}
            height={height}
            ariaLabel={label}
            focusable
            ariaDescribedBy={hintId}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </Suspense>
      )}
      {/* Screen-reader readout of the keyboard crosshair (same content as the visual tooltip). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {table ? '' : live}
      </p>

      <figcaption className="mt-2 space-y-1.5">
        {visibleForecasts.length > 0 && !table && (
          <ForecastCaption
            sources={visibleForecasts.map((f) => f.forecast!.source)}
            color={visibleForecasts.length > 1 ? 'var(--ink-3)' : visibleForecasts[0].color}
          />
        )}
        {overlapNotes.length > 0 && (
          <p className="text-xs text-ink-2">
            {overlapNotes.map((n, i) => (
              <span key={n.key}>
                {i > 0 && ' '}
                The {n.subject} {n.plural ? 'were' : 'was'} made from data through the week ending {formatDate(n.originDate, true)}, so{' '}
                {n.plural ? 'they overlap' : 'it overlaps'} the {n.weeks === 1 ? 'newest reported week' : `${n.weeks} newest reported weeks`}.
              </span>
            ))}
          </p>
        )}
        {clipped.length > 0 && !table && (
          <p className="text-xs text-ink-2">
            {clipped.map((c, i) => (
              <span key={c.entity.key}>
                {i > 0 && ' '}
                The plausible (95%) range of the {forecastPhrase(c.entity)} runs above the top of the chart, up to{' '}
                {fmt(c.hi95, unit)} for the week ending {formatDate(c.date)} (marked ▲); the tooltip and table show it in full.
              </span>
            ))}
          </p>
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
              {plan.unlabeled.length > 0 &&
                ` Lines too close together to label: ${plan.unlabeled.map((l) => LEVEL_LABEL[l]).join(', ')}.`}
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
                {formatDate(f.forecast!.issuedAt.slice(0, 10), true)}
                {f.originDate ? `; starts from the week ending ${formatDate(f.originDate, true)}` : ''}):{' '}
                {forecastSourceDescription(f.forecast!.source)} The dashed line is the middle estimate; the true value is expected
                to land in the darker band about half the time and in the lighter band about 95% of the time. Forecasts are not
                certain — sudden changes can fall outside the range.
                {f.forecast!.note ? ` ${f.forecast!.note}` : ''}
              </li>
            ))}
            {plan && <li>Activity levels: {model.thresholds?.by}.</li>}
            {hasProvisional && <li>Recent weeks marked provisional usually rise or fall a little as late reports arrive.</li>}
            {model.entities.some((e) => e.sparse && e.kind !== 'forecast') && (
              <li>Dots mark individual weeks where this measure has few reported values; gaps are weeks with no report.</li>
            )}
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
            {e.name.replace('CDC ensemble forecast', 'CDC forecast')}
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
            return p ? (
              <>
                {formatValue(p.median, unit)}
                <span className="block text-[11px] text-ink-3">{fmtRange(p.lo95, p.hi95, unit)}</span>
              </>
            ) : (
              ''
            )
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
