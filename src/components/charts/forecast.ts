// Where a forecast starts. Shared by the chart (to draw the fan) and the projection table (to label
// weeks ahead), so both always agree.
//
// A forecast is drawn from its own origin: the last observed week the model had when it was made
// (MN Pulse) or the last observed week up to the hub's reference week (CDC ensembles, whose reference
// week can be ahead of the data). Every forecast point after that origin is kept, so when newer weeks
// have been reported since, the fan overlays them instead of being re-anchored on the newest
// (often provisional) value.
import type { Forecast, Point, QuantileForecastPoint } from '../../../shared/types'

export interface ForecastOrigin {
  /** Week-ending date of the last observation the forecast starts from. */
  date: string
  value: number
}

/** Latest non-null observation dated on or before the forecast's reference date. */
export function forecastOrigin(points: Point[], f: Pick<Forecast, 'referenceDate'>): ForecastOrigin | null {
  const ref = f.referenceDate?.slice(0, 10)
  for (let i = points.length - 1; i >= 0; i--) {
    const [d, v] = points[i]
    if (v == null || !Number.isFinite(v)) continue
    if (!ref || d <= ref) return { date: d, value: v }
  }
  return null
}

/** Forecast points dated after the origin (all points when there is no origin), oldest first. */
export function pointsFromOrigin(f: Pick<Forecast, 'points'>, origin: ForecastOrigin | null): QuantileForecastPoint[] {
  return f.points.filter((p) => !origin || p.date > origin.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** Whole weeks from `from` to `to` (ISO dates). */
export function weeksBetween(from: string, to: string): number {
  const ms = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(to) - ms(from)) / (7 * 86_400_000))
}
