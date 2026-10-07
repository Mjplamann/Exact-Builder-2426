// Date helpers for charts that must stay light: no ECharts and no React, so Sparkline (and anything
// else drawn without ECharts) can import them without pulling the chart library into its chunk.

const DAY_MS = 86_400_000

/** "2026-09-26" → UTC midnight milliseconds. */
export function msFromIso(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** UTC milliseconds → "2026-09-26" (rounded to the nearest day). */
export function isoFromMs(ms: number): string {
  return new Date(Math.round(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10)
}
