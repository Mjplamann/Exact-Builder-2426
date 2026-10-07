// Front-end helpers for working with normalized series.
import type { Forecast, GeoRef, MetricKind, PathogenId, Point, Series } from '../../shared/types'
import { addDays, seasonOf, weekOfSeason } from '../../shared/mmwr'
import { RANGE_WEEKS, type TimeRange } from './state'

export interface SeriesQuery {
  pathogen?: PathogenId | PathogenId[]
  metric?: MetricKind | MetricKind[]
  geoType?: GeoRef['type'] | GeoRef['type'][]
  geoCode?: string
  source?: string
  /** true = only age-specific series; false (default) = only all-ages series. */
  age?: boolean
}

const asArr = <T,>(v: T | T[] | undefined): T[] | undefined => (v == null ? undefined : Array.isArray(v) ? v : [v])

export function findSeries(all: Series[], q: SeriesQuery): Series[] {
  const pathogens = asArr(q.pathogen)
  const metrics = asArr(q.metric)
  const geoTypes = asArr(q.geoType)
  return all.filter(
    (s) =>
      (!pathogens || pathogens.includes(s.pathogen)) &&
      (!metrics || metrics.includes(s.metric)) &&
      (!geoTypes || geoTypes.includes(s.geo.type)) &&
      (!q.geoCode || s.geo.code === q.geoCode) &&
      (!q.source || s.source === q.source) &&
      (q.age ? !!s.age : !s.age),
  )
}

export function lastPoint(points: Point[]): [string, number] | null {
  for (let i = points.length - 1; i >= 0; i--) if (points[i][1] != null) return [points[i][0], points[i][1] as number]
  return null
}

/** Keep points within the selected time range, ending at the series' last date (or `end`). */
export function clipToRange(points: Point[], range: TimeRange, end?: string): Point[] {
  if (!points.length) return points
  const last = end ?? points[points.length - 1][0]
  const start = addDays(last, -7 * RANGE_WEEKS[range])
  return points.filter(([d]) => d > start && d <= last)
}

export interface SeasonLine {
  season: string
  /** [weekOfSeason, value] */
  points: [number, number | null][]
}

/** Split a series into respiratory seasons aligned by week-of-season (MMWR week 40 = 0). */
export function bySeason(points: Point[], maxSeasons = 5): SeasonLine[] {
  const map = new Map<string, [number, number | null][]>()
  for (const [d, v] of points) {
    const s = seasonOf(d)
    if (!map.has(s)) map.set(s, [])
    map.get(s)!.push([weekOfSeason(d), v])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-maxSeasons)
    .map(([season, pts]) => ({ season, points: pts }))
}

export function forecastsFor(forecasts: Forecast[], series: Series): Forecast[] {
  return forecasts.filter((f) => f.seriesId === series.id)
}

/** Prefer the CDC ensemble over our projection when both exist. */
export function preferredForecast(forecasts: Forecast[], series: Series): Forecast | undefined {
  const fs = forecastsFor(forecasts, series)
  return fs.find((f) => f.source !== 'mn-pulse') ?? fs[0]
}
