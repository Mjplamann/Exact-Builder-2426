// Lightweight inline SVG sparkline (no ECharts): 2px line, gaps for missing weeks, end dot with a
// surface ring, optional faint area wash. Color defaults to currentColor so it inherits text color.
import { useId } from 'react'
import type { Point } from '../../../shared/types'
import { msFromIso } from './time'

export interface SparklineProps {
  points: Point[]
  width?: number
  height?: number
  /** Accessible label, e.g. "Flu ED visits, last 16 weeks". */
  label: string
  color?: string
  /** Draw a faint area wash under the line (default false). */
  area?: boolean
  /** Hide the end dot (default false). */
  hideDot?: boolean
  className?: string
}

const PAD = 4 // room for the end dot + ring

export function Sparkline({ points, width = 120, height = 32, label, color, area = false, hideDot = false, className }: SparklineProps) {
  const clipId = useId()
  const stroke = color ?? 'currentColor'
  const valid = points.filter((p): p is [string, number] => p[1] != null && Number.isFinite(p[1]))

  if (!valid.length) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: no data`} className={className}>
        <line
          x1={PAD}
          x2={width - PAD}
          y1={height / 2}
          y2={height / 2}
          style={{ stroke: 'var(--grid)' }}
          strokeWidth={1}
        />
      </svg>
    )
  }

  const t0 = msFromIso(points[0][0])
  const t1 = msFromIso(points[points.length - 1][0])
  const vals = valid.map((p) => p[1])
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  // Anchor at zero when values are all non-negative and close to it, so small wiggles don't look dramatic.
  if (lo >= 0 && lo < hi * 0.5) lo = 0
  if (hi === lo) {
    hi = lo + (Math.abs(lo) || 1)
    lo = lo - (hi - lo) * 0.5
  }
  const x = (iso: string) => (t1 === t0 ? width / 2 : PAD + ((msFromIso(iso) - t0) / (t1 - t0)) * (width - 2 * PAD))
  const y = (v: number) => height - PAD - ((v - lo) / (hi - lo)) * (height - 2 * PAD)

  // Split into contiguous runs at null values (gaps stay gaps).
  const runs: [number, number][][] = []
  let cur: [number, number][] = []
  for (const [d, v] of points) {
    if (v == null || !Number.isFinite(v)) {
      if (cur.length) runs.push(cur)
      cur = []
    } else cur.push([x(d), y(v)])
  }
  if (cur.length) runs.push(cur)

  const line = runs
    .map((r) => r.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(''))
    .join('')
  const base = y(lo)
  const areaPath = runs
    .filter((r) => r.length > 1)
    .map((r) => `M${r[0][0].toFixed(1)},${base.toFixed(1)}${r.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join('')}L${r[r.length - 1][0].toFixed(1)},${base.toFixed(1)}Z`)
    .join('')
  const [lastD, lastV] = valid[valid.length - 1]
  const lone = runs.filter((r) => r.length === 1)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={className}
      style={{ color: stroke === 'currentColor' ? undefined : stroke, overflow: 'visible' }}
    >
      <title>{label}</title>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {area && areaPath && <path d={areaPath} fill="currentColor" fillOpacity={0.1} stroke="none" />}
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {lone.map((r, i) => (
          <circle key={i} cx={r[0][0]} cy={r[0][1]} r={1.5} fill="currentColor" />
        ))}
      </g>
      {!hideDot && <circle cx={x(lastD)} cy={y(lastV)} r={3} fill="currentColor" style={{ stroke: 'var(--surface-1)' }} strokeWidth={1.5} />}
    </svg>
  )
}
