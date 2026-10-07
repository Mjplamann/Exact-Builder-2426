// Thin React wrapper around Apache ECharts (modular build) with theme-token awareness.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, ScatterChart, HeatmapChart } from 'echarts/charts'
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent,
  VisualMapComponent, AriaComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  LineChart, BarChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  MarkLineComponent, MarkAreaComponent, VisualMapComponent, AriaComponent, SVGRenderer,
])

export { cssVar } from './chartTheme'
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
  /** Put the chart in the tab order (pair with onKeyDown). */
  focusable?: boolean
  /** Native tooltip hint, e.g. keyboard instructions. */
  title?: string
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
      role="img"
      aria-label={ariaLabel}
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
