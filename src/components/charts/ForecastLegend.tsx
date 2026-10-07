// Legend keys + caption explaining how forecasts are drawn (dashed median, 50% and 95% bands).
import { forecastSourceLabel } from './chartTheme'

/** Small key: a 95% band, a 50% band and the dashed median, in the series color. */
export function ForecastKey({ color = 'var(--series-1)', width = 22 }: { color?: string; width?: number }) {
  return (
    <svg width={width} height="12" viewBox={`0 0 ${width} 12`} aria-hidden="true" className="shrink-0">
      {/* Same weights as the chart: faint 95% band, clearly darker 50% band stacked on it. */}
      <rect x="0" y="0" width={width} height="12" rx="2" style={{ fill: color }} fillOpacity={0.1} />
      <rect x="0" y="3" width={width} height="6" style={{ fill: color }} fillOpacity={0.24} />
      <line x1="1" x2={width - 1} y1="6" y2="6" style={{ stroke: color }} strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />
    </svg>
  )
}

/** Line key mirroring a plotted line (solid, dashed or provisional). */
export function LineKey({ color, dashed = false, opacity = 1, width = 18 }: { color: string; dashed?: boolean; opacity?: number; width?: number }) {
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        x2={width - 1}
        y1="5"
        y2="5"
        style={{ stroke: color }}
        strokeOpacity={opacity}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 3' : undefined}
      />
    </svg>
  )
}

/** One-line caption under a chart that shows forecasts. */
export function ForecastCaption({ sources, color }: { sources: string[]; color?: string }) {
  const names = [...new Set(sources.map(forecastSourceLabel))]
  if (!names.length) return null
  return (
    <p className="flex items-start gap-2 text-xs text-ink-2">
      <span className="mt-px">
        <ForecastKey color={color} />
      </span>
      <span>
        Dashed line: {names.join(' and ')} (middle estimate). Shaded: likely range (50%) and plausible range (95%).
      </span>
    </p>
  )
}
