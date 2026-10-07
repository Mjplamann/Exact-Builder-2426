// Formatting helpers and display vocab shared across views.
import type { ActivityLevel, MetricKind, TrendDirection, Unit } from '../../shared/types'
import { LEVEL_LABEL, TREND_LABEL } from '../../shared/risk'

export { LEVEL_LABEL, TREND_LABEL }

/**
 * Small non-zero values keep two significant figures instead of rounding to "0" / "0.0", which reads as
 * "nothing" next to a Rising trend: 0.043 → "0.043", 0.4 → "0.4", 0.004 → "<0.01".
 */
function small(v: number): string | undefined {
  const a = Math.abs(v)
  if (a === 0 || a >= 1) return undefined
  if (a < 0.01) return v < 0 ? '>−0.01' : '<0.01'
  return String(Number(v.toPrecision(2)))
}

export function formatValue(v: number | null | undefined, unit: Unit, opts: { compact?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (unit === '%') {
    if (v > 0 && v < 0.01) return '<0.01%'
    return `${v < 1 && v > 0 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : v.toFixed(0)}%`
  }
  if (unit === 'per100k') return small(v) ?? `${v < 10 ? v.toFixed(1) : v.toFixed(0)}`
  if (unit === 'index') return small(v) ?? v.toFixed(1)
  if (unit === 'ratio') {
    if (v === 0) return '0'
    if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('en-US')
    return Number(v.toPrecision(3)).toLocaleString('en-US', { maximumSignificantDigits: 3 })
  }
  // Counts are whole numbers; a fractional count (e.g. an average) below 1 keeps two significant figures.
  const sm = small(v)
  if (sm) return sm
  if (opts.compact && Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
  }
  return Math.round(v).toLocaleString('en-US')
}

const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10]

/** Round a denominator to a friendly number: 385 → 400, 128 → 120, 12.5 → 13, 10,000 → 10,000. */
export function friendlyRound(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return n
  if (n < 20) return Math.max(1, Math.round(n))
  const mag = 10 ** Math.floor(Math.log10(n))
  let best = mag
  let bestDist = Infinity
  for (const k of NICE) {
    const v = k * mag
    const d = Math.abs(Math.log(n / v))
    if (d < bestDist) {
      bestDist = d
      best = v
    }
  }
  return Math.round(best)
}

/**
 * The one "natural frequency" phrasing used everywhere for a percentage: 0.26 → "about 1 in 400",
 * 32 → "about 1 in 3", 62 → "about 6 in 10". Returns undefined for zero, negative or missing values.
 * Lower-case "about" so it can sit mid-sentence; callers append the noun ("ER visits", "lab tests").
 */
export function aboutOneIn(pct: number): string | undefined {
  if (!Number.isFinite(pct) || pct <= 0) return undefined
  if (pct >= 45) return `about ${Math.min(10, Math.round(pct / 10))} in 10`
  return `about 1 in ${friendlyRound(100 / pct).toLocaleString('en-US')}`
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
  cases: 'Weekly new cases',
  cases_ytd: 'Cases so far this year',
  outbreaks: 'Outbreaks',
  deaths: 'Deaths',
  ww_detections: 'Wastewater detections',
  rt: 'Reproduction number (Rt)',
}

/**
 * Running totals (cases reported so far this year) only ever go up, so they never get a trend arrow, a 2-week
 * change or an activity level; they are read as "so far this year", as of a date.
 */
export const isCumulative = (metric: MetricKind | undefined): boolean => metric === 'cases_ytd'

/** "s" unless the value is exactly one. */
export const plural = (n: number | null | undefined): string => (n === 1 ? '' : 's')

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
      return `${v} ${value === 1 ? 'person' : 'people'} admitted to the hospital in a week`
    case 'hosp_rate':
      return `${v} hospitalizations per 100,000 residents in a week`
    case 'wastewater_level':
      return `wastewater viral activity level ${v}`
    case 'wastewater_conc':
      return `normalized wastewater concentration ${v}`
    case 'cases':
      return `${v} new case${plural(value)} reported`
    case 'cases_ytd':
      return `${v} case${plural(value)} reported so far this year`
    case 'outbreaks':
      return `${v} reported outbreak${plural(value)}`
    case 'deaths':
      return `${v} reported death${plural(value)}`
    case 'ww_detections':
      return `${v} wastewater site${plural(value)} with a detection`
    case 'rt':
      return `each infection leads to about ${v} more (Rt)`
  }
}
