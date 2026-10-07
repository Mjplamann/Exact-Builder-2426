// Helpers for building normalized Series objects.
import { METRIC_UNITS, type GeoRef, type MetricKind, type PathogenId, type Point, type Series } from '../../shared/types.ts'
import { parseISODate, toISODate, weekEndingSaturday } from '../../shared/mmwr.ts'

/** Normalize assorted date strings (ISO, ISO datetime, M/D/YYYY) to ISO YYYY-MM-DD. */
export function toIsoDate(raw: string): string | null {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : toISODate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())))
}

/** Normalize any date within a week to that week's MMWR week-ending Saturday. */
export function toWeekEnding(raw: string): string | null {
  const iso = toIsoDate(raw)
  if (!iso) return null
  try {
    parseISODate(iso)
  } catch {
    return null
  }
  return weekEndingSaturday(iso)
}

export function roundValue(v: number, metric: MetricKind): number {
  const digits = METRIC_UNITS[metric] === 'count' ? 0 : 3
  const f = 10 ** digits
  return Math.round(v * f) / f
}

/**
 * Collapse raw (date, value) pairs into sorted weekly points keyed by week-ending Saturday.
 * Multiple values in one week are combined with `combine` (default: last value wins).
 */
export function toWeeklyPoints(
  raw: Iterable<[string, number | null]>,
  metric: MetricKind,
  combine: 'last' | 'sum' | 'mean' | 'max' = 'last',
): Point[] {
  const buckets = new Map<string, number[]>()
  const nulls = new Set<string>()
  for (const [d, v] of raw) {
    const wk = toWeekEnding(d)
    if (!wk) continue
    if (v == null || !Number.isFinite(v)) {
      nulls.add(wk)
      continue
    }
    const arr = buckets.get(wk) ?? []
    arr.push(v)
    buckets.set(wk, arr)
  }
  const out: Point[] = []
  const weeks = new Set([...buckets.keys(), ...nulls])
  for (const wk of [...weeks].sort()) {
    const vals = buckets.get(wk)
    if (!vals?.length) {
      out.push([wk, null])
      continue
    }
    let v: number
    if (combine === 'sum') v = vals.reduce((a, b) => a + b, 0)
    else if (combine === 'mean') v = vals.reduce((a, b) => a + b, 0) / vals.length
    else if (combine === 'max') v = Math.max(...vals)
    else v = vals[vals.length - 1]
    out.push([wk, roundValue(v, metric)])
  }
  return out
}

export interface SeriesInit {
  source: string
  dataset: string
  pathogen: PathogenId
  metric: MetricKind
  geo: GeoRef
  label: string
  points: Point[]
  age?: string
  provisionalFrom?: string
  note?: string
  /** Extra id discriminator (e.g. an age band or sub-metric). */
  variant?: string
}

export function makeSeries(init: SeriesInit): Series {
  const id = [init.source, init.dataset, init.pathogen, init.metric, init.geo.type, init.geo.code, init.variant]
    .filter(Boolean)
    .join(':')
  const s: Series = {
    id,
    source: init.source,
    dataset: init.dataset,
    pathogen: init.pathogen,
    metric: init.metric,
    unit: METRIC_UNITS[init.metric],
    geo: init.geo,
    label: init.label,
    points: init.points,
  }
  if (init.age) s.age = init.age
  if (init.provisionalFrom) s.provisionalFrom = init.provisionalFrom
  if (init.note) s.note = init.note
  return s
}

/** Keep only points on/after a cutoff date. */
export function since(points: Point[], cutoff: string): Point[] {
  return points.filter(([d]) => d >= cutoff)
}

export function latestDate(series: Series[]): string | undefined {
  let max: string | undefined
  for (const s of series) {
    for (let i = s.points.length - 1; i >= 0; i--) {
      if (s.points[i][1] != null) {
        if (!max || s.points[i][0] > max) max = s.points[i][0]
        break
      }
    }
  }
  return max
}

export const STATE_GEO: GeoRef = { type: 'state', code: '27', name: 'Minnesota' }
