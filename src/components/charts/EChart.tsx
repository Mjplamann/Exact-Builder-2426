// Thin React wrapper around Apache ECharts (modular build) with theme-token awareness.
//
// Only what the app draws is registered (line series, grid, tooltip/axis pointer, mark lines and mark
// areas, SVG renderer). TrendChart loads this module lazily, so ECharts stays out of every chunk that
// only needs chart helpers (sparklines, maps, level legends).
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, SVGRenderer])

export type EChartsInstance = echarts.ECharts

export function EChart({
  option,
  height = 320,
  className = '',
  ariaLabel,
  onEvents,
  onKeyDown,
  onFocus,
  onBlur,
  focusable = false,
  title,
  ariaDescribedBy,
}: {
  option: EChartsCoreOption
  height?: number
  className?: string
  ariaLabel: string
  onEvents?: Record<string, (params: unknown) => void>
  /** Keyboard handler with access to the chart instance (e.g. arrow keys move the tooltip). */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>, chart: echarts.ECharts) => void
  onFocus?: (chart: echarts.ECharts) => void
  onBlur?: (chart: echarts.ECharts) => void
  /**
   * Put the chart in the tab order (pair with onKeyDown). A focusable chart is exposed as an
   * "interactive chart" application so screen readers pass the arrow keys through to it.
   */
  focusable?: boolean
  /** Native tooltip hint. Prefer ariaDescribedBy for instructions (a native tooltip competes with the chart's). */
  title?: string
  /** id of an element describing how to use the chart (e.g. keyboard instructions). */
  ariaDescribedBy?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current, undefined, { renderer: 'svg' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true })
  }, [option])

  useEffect(() => {
    const c = chart.current
    if (!c || !onEvents) return
    for (const [ev, fn] of Object.entries(onEvents)) c.on(ev, fn)
    return () => {
      for (const [ev, fn] of Object.entries(onEvents)) c.off(ev, fn)
    }
  }, [onEvents])

  return (
    <div
      ref={ref}
      role={focusable ? 'application' : 'img'}
      aria-roledescription={focusable ? 'interactive chart' : undefined}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      title={title}
      tabIndex={focusable ? 0 : undefined}
      onKeyDown={onKeyDown ? (e) => chart.current && onKeyDown(e, chart.current) : undefined}
      onFocus={onFocus ? () => chart.current && onFocus(chart.current) : undefined}
      onBlur={onBlur ? () => chart.current && onBlur(chart.current) : undefined}
      className={`rounded-md ${className}`}
      style={{ height, width: '100%' }}
    />
  )
}
