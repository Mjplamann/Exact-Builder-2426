import Papa from 'papaparse'

/** Parse CSV text with a header row into trimmed string records. */
export function parseCsv(text: string): Record<string, string>[] {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  })
  return res.data
}

/** Parse a numeric cell; returns null for blanks, suppression markers and non-numbers. */
export function num(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(/,/g, '').replace(/%$/, '')
  if (s === '' || /^(na|n\/a|null|nan|none|-|—|\*+|<\d+|suppressed)$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
