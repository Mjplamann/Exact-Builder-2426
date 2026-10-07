// STUB — replaced by the charts implementation. Props are the stable contract other views use.
import type { Forecast, Series } from '../../../shared/types'
import type { TimeRange } from '../../lib/state'

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
}

export function TrendChart(props: TrendChartProps) {
  return <div style={{ height: props.height ?? 300 }} aria-label={props.ariaLabel} />
}
