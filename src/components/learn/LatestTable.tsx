// "In MN Pulse right now": the latest value of each matching series, with its week and source.
// Renders an empty state (never placeholder numbers) when nothing matching is loaded.
import { useState } from 'react'
import type { GeoType, Manifest, MetricKind, Series } from '../../../shared/types'
import { formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { lastPoint } from '../../lib/series'
import { EmptyState } from '../ui'

export interface LatestQuery {
  metrics: MetricKind[]
  geoTypes?: GeoType[]
  /** Restrict to these geo codes (e.g. ['27'] for Minnesota). */
  geoCodes?: string[]
  /** Include age-specific series (default false). */
  age?: boolean
}

export interface LatestRow {
  series: Series
  date: string
  value: number
}

export function latestRows(all: Series[], q: LatestQuery): LatestRow[] {
  const rows: LatestRow[] = []
  for (const s of all) {
    if (!q.metrics.includes(s.metric)) continue
    if (q.geoTypes && !q.geoTypes.includes(s.geo.type)) continue
    if (q.geoCodes && !q.geoCodes.includes(s.geo.code)) continue
    if (!q.age && s.age) continue
    const lp = lastPoint(s.points)
    if (!lp) continue
    rows.push({ series: s, date: lp[0], value: lp[1] })
  }
  // The same published number can arrive by two routes (e.g. NSSP via the CDC hubs and via
  // data.cdc.gov). Show it once, keeping the copy that carries the publisher's own label.
  const byKey = new Map<string, LatestRow>()
  for (const r of rows) {
    const s = r.series
    const key = [s.pathogen, s.metric, s.geo.type, s.geo.code, s.age ?? '', r.date, r.value].join('|')
    const prev = byKey.get(key)
    if (!prev || (!prev.series.official?.label && s.official?.label)) byKey.set(key, r)
  }
  return [...byKey.values()]
}

export function sourceName(manifest: Manifest, id: string): string {
  return manifest.sources.find((s) => s.id === id)?.name ?? id
}

export function LatestTable({
  rows,
  manifest,
  caption,
  emptyTitle,
  emptyText,
  sourceIds = [],
  limit = 6,
  sort = 'value',
}: {
  rows: LatestRow[]
  manifest: Manifest
  caption: string
  emptyTitle: string
  emptyText: string
  /** Sources that would supply these rows; their status message is shown when nothing is loaded. */
  sourceIds?: string[]
  limit?: number
  sort?: 'value' | 'none'
}) {
  const [showAll, setShowAll] = useState(false)
  if (!rows.length) {
    const statuses = manifest.sources.filter((s) => sourceIds.includes(s.id) && s.message)
    return (
      <div className="mt-5">
        <EmptyState title={emptyTitle}>
          <p>{emptyText}</p>
          {statuses.map((s) => (
            <p key={s.id} className="mt-1 text-xs text-ink-3">
              {s.name}: {s.message}
            </p>
          ))}
        </EmptyState>
      </div>
    )
  }
  const sorted = sort === 'value' ? [...rows].sort((a, b) => b.value - a.value) : rows
  const shown = showAll ? sorted : sorted.slice(0, limit)
  const hidden = sorted.length - shown.length
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface-1">
      <table className="w-full text-left text-sm">
        <caption className="border-b border-line bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-ink-2">
          {caption}
        </caption>
        <thead>
          <tr className="text-xs text-ink-3">
            <th scope="col" className="px-3 pt-2 pb-1 font-medium">
              Measure
            </th>
            <th scope="col" className="px-3 pt-2 pb-1 text-right font-medium">
              Latest week
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ series: s, date, value }) => {
            const prelim = !!s.provisionalFrom && date >= s.provisionalFrom
            const official = s.official?.label
            return (
              <tr key={s.id} className="border-t border-line align-top">
                <th scope="row" className="px-3 py-2 font-normal">
                  <span className="block text-ink-1">{s.label}</span>
                  <span className="block text-xs text-ink-3">
                    {s.geo.name}
                    {s.age ? ` · ages ${s.age}` : ''} · {sourceName(manifest, s.source)}
                  </span>
                </th>
                <td className="tabular px-3 py-2 text-right">
                  <span className="block font-semibold whitespace-nowrap text-ink-1">
                    {formatValue(value, s.unit)}
                    {UNIT_SUFFIX[s.unit]}
                  </span>
                  {official && <span className="block text-xs text-ink-2">{official}</span>}
                  <span className="block text-xs whitespace-nowrap text-ink-3">wk ending {formatDate(date, true)}</span>
                  {prelim && <span className="block text-xs text-ink-3">preliminary</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length > limit && (
        <div className="border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="text-sm font-medium text-accent hover:underline"
          >
            {showAll ? 'Show fewer' : `Show all ${sorted.length} (${hidden} more)`}
          </button>
        </div>
      )}
    </div>
  )
}
