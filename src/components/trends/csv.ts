// Client-side CSV export of the charted series (RFC 4180 quoting + spreadsheet-formula guard).
import type { Forecast, Series } from '../../../shared/types'
import { geoLabel } from './model'

type Cell = string | number | null | undefined

/** Quote a cell when needed; neutralize text that a spreadsheet would run as a formula. */
export function csvCell(v: Cell): string {
  if (v == null) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Cell[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const HEADER = [
  'week_ending', 'type', 'series_id', 'measure', 'geography', 'age_group', 'source', 'metric', 'unit', 'value',
  'lo50', 'hi50', 'lo95', 'hi95', 'provisional', 'model',
]

/**
 * Long-format rows: one per observed week (after `after`, up to and including `end`) per series, then one per forecast
 * target week ("projection" rows carry the median as value plus the 50% and 95% ranges).
 */
export function chartedCsv(
  series: Series[],
  forecasts: Forecast[],
  window: { after?: string; end?: string },
  sourceName: (id: string) => string,
): string {
  const rows: Cell[][] = [HEADER]
  for (const s of series) {
    for (const [d, v] of s.points) {
      if ((window.after && d <= window.after) || (window.end && d > window.end)) continue
      rows.push([
        d, 'observed', s.id, s.label, geoLabel(s.geo), s.age ?? 'all ages', sourceName(s.source), s.metric, s.unit, v,
        null, null, null, null, s.provisionalFrom && d >= s.provisionalFrom ? 'yes' : 'no', null,
      ])
    }
  }
  for (const f of forecasts) {
    const s = series.find((x) => x.id === f.seriesId)
    for (const p of f.points) {
      rows.push([
        p.date, 'projection', f.seriesId, s?.label ?? f.seriesId, geoLabel(f.geo), s?.age ?? 'all ages', sourceName(f.source),
        f.metric, s?.unit ?? '', p.median, p.lo50, p.hi50, p.lo95, p.hi95, 'n/a', f.model,
      ])
    }
  }
  return toCsv(rows)
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  // BOM so Excel opens UTF-8 (em dashes, accents) correctly.
  const blob = new Blob(['﻿', text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilePart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
