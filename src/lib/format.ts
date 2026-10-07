// Formatting helpers and display vocab shared across views.
import type { ActivityLevel, MetricKind, TrendDirection, Unit } from '../../shared/types'
import { LEVEL_LABEL, TREND_LABEL } from '../../shared/risk'

export { LEVEL_LABEL, TREND_LABEL }

export function formatValue(v: number | null | undefined, unit: Unit, opts: { compact?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (unit === '%') return `${v < 1 && v > 0 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)}%`
  if (unit === 'per100k') return `${v < 10 ? v.toFixed(1) : v.toFixed(0)}`
  if (unit === 'index') return v.toFixed(1)
  if (unit === 'ratio') return v < 0.01 ? v.toExponential(1) : v.toPrecision(2)
  if (opts.compact && Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
  }
  return Math.round(v).toLocaleString('en-US')
}

export const UNIT_SUFFIX: Record<Unit, string> = {
  '%': '',
  count: '',
  per100k: ' per 100k',
  index: '',
  ratio: '',
}

export function formatChange(change?: number): string {
  if (change == null || !Number.isFinite(change)) return ''
  const pct = Math.round(change * 100)
  if (pct === 0) return 'no change'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Sep 26" or "Sep 26, 2026". */
export function formatDate(iso: string | undefined, withYear = false): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short',
  })
}

export function daysAgo(iso: string | undefined, now = new Date()): number | undefined {
  if (!iso) return undefined
  return Math.floor((now.getTime() - new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).getTime()) / 86_400_000)
}

export const LEVEL_VAR: Record<ActivityLevel, string> = {
  minimal: 'var(--level-minimal)',
  low: 'var(--level-low)',
  moderate: 'var(--level-moderate)',
  high: 'var(--level-high)',
  'very-high': 'var(--level-very-high)',
  unknown: 'var(--level-unknown)',
}

export const LEVEL_INK_VAR: Record<ActivityLevel, string> = {
  minimal: 'var(--level-ink-minimal)',
  low: 'var(--level-ink-low)',
  moderate: 'var(--level-ink-moderate)',
  high: 'var(--level-ink-high)',
  'very-high': 'var(--level-ink-very-high)',
  unknown: 'var(--ink-1)',
}

/** Arrow glyph for trend direction (paired with a text label, never alone). */
export const TREND_ARROW: Record<TrendDirection, string> = {
  'rising-fast': '⇈',
  rising: '↑',
  steady: '→',
  falling: '↓',
  'falling-fast': '⇊',
  unknown: '·',
}

export const METRIC_LABEL: Record<MetricKind, string> = {
  detection_rate: 'BioFire detection rate',
  test_positivity: 'Lab test positivity',
  ed_visit_pct: 'Emergency department visits',
  ili_pct: 'Influenza-like illness visits',
  hosp_admissions: 'Hospital admissions',
  hosp_rate: 'Hospitalization rate',
  wastewater_level: 'Wastewater activity',
  wastewater_conc: 'Wastewater concentration',
  cases: 'Reported cases',
  outbreaks: 'Outbreaks',
  deaths: 'Deaths',
  ww_detections: 'Wastewater detections',
  rt: 'Reproduction number (Rt)',
}

/** One-line plain-language meaning of a metric value, e.g. for tooltips and cards. */
export function metricMeaning(metric: MetricKind, value: number | null | undefined, unit: Unit): string {
  const v = formatValue(value, unit)
  switch (metric) {
    case 'detection_rate':
      return `${v} of multi-pathogen panel tests on sick patients detected it`
    case 'test_positivity':
      return `${v} of lab tests came back positive`
    case 'ed_visit_pct':
      return `${v} of all emergency department visits were for it`
    case 'ili_pct':
      return `${v} of clinic visits were for flu-like illness`
    case 'hosp_admissions':
      return `${v} people admitted to the hospital in a week`
    case 'hosp_rate':
      return `${v} hospitalizations per 100,000 residents in a week`
    case 'wastewater_level':
      return `wastewater viral activity level ${v}`
    case 'wastewater_conc':
      return `normalized wastewater concentration ${v}`
    case 'cases':
      return `${v} reported cases`
    case 'outbreaks':
      return `${v} reported outbreaks`
    case 'deaths':
      return `${v} reported deaths`
    case 'ww_detections':
      return `${v} wastewater site${value === 1 ? '' : 's'} with a detection`
    case 'rt':
      return `each infection leads to about ${v} more (Rt)`
  }
}
