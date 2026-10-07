// Theme + formatting helpers shared by every chart.
//
// Colors are never hard-coded: charts read the design tokens (CSS custom properties on :root) at
// render time and re-render when the theme changes (data-theme on <html> or the OS preference).
import { useEffect, useState } from 'react'
import type { ActivityLevel, MetricKind, Unit } from '../../../shared/types'
import { isoFromMs, msFromIso } from './time'

export { isoFromMs, msFromIso }

/** Read a CSS custom property (theme token) from :root. */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const VAR_RE = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/

/** Resolve "var(--token)" (or "var(--token, fallback)") to a concrete color; other strings pass through. */
export function resolveColor(color: string): string {
  const m = VAR_RE.exec(color.trim())
  if (!m) return color
  return cssVar(m[1]) || (m[2] ? resolveColor(m[2]) : 'gray')
}

/** Apply an alpha to a hex / rgb() color. Unknown formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const c = resolveColor(color)
  let r: number, g: number, b: number
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1]
    r = parseInt(h.slice(0, 2), 16)
    g = parseInt(h.slice(2, 4), 16)
    b = parseInt(h.slice(4, 6), 16)
  } else {
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c)
    if (!rgb) return c
    ;[r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** True for a dark color (relative luminance below 0.2), e.g. the dark-theme chart surface. */
export function isDarkColor(color: string): boolean {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(withAlpha(color, 1))
  if (!m) return false
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(Number(m[1])) + 0.7152 * lin(Number(m[2])) + 0.0722 * lin(Number(m[3])) < 0.2
}

/**
 * Level-safe categorical order (token slot numbers): blue, aqua, violet, magenta, green.
 *
 * The full categorical palette's orange (slot 2), amber (4) and red (8) sit almost on top of the
 * activity-level colors (--level-*), and every chart here is drawn next to level badges or threshold
 * lines, so those three slots are never used for lines. This order passes the dataviz palette
 * validator on adjacent pairs in both themes (light: worst CVD ΔE 17.6, normal 24.0; dark: CVD 13.0,
 * normal 19.7). Past five lines, series fold to gray.
 */
export const LEVEL_SAFE_SLOTS = [1, 3, 7, 5, 6] as const

/**
 * Line color for the n-th series (1-based) in the level-safe order, never cycled: past the fifth,
 * `var(--series-muted)`. Callers that pick colors for a chart should use this instead of a literal
 * `var(--series-N)` so lines never wear an activity-level color.
 */
export function seriesVar(slot: number): string {
  const n = LEVEL_SAFE_SLOTS[slot - 1]
  return n ? `var(--series-${n})` : 'var(--series-muted)'
}

/** The selected place in a place comparison (accent-blue line). */
export const SELECTED_PLACE_COLOR = 'var(--series-1)'
/** Minnesota (or any context line) when another place is selected. */
export const CONTEXT_PLACE_COLOR = 'var(--series-muted)'

export const LEVEL_TOKEN: Record<ActivityLevel, string> = {
  minimal: '--level-minimal',
  low: '--level-low',
  moderate: '--level-moderate',
  high: '--level-high',
  'very-high': '--level-very-high',
  unknown: '--level-unknown',
}

export interface ChartTokens {
  surface1: string
  surface2: string
  ink1: string
  ink2: string
  ink3: string
  muted: string
  grid: string
  axis: string
  border: string
  seriesMuted: string
  font: string
}

export function readTokens(): ChartTokens {
  return {
    surface1: cssVar('--surface-1') || 'white',
    surface2: cssVar('--surface-2') || 'whitesmoke',
    ink1: cssVar('--ink-1') || 'black',
    ink2: cssVar('--ink-2') || 'dimgray',
    ink3: cssVar('--ink-3') || 'gray',
    muted: cssVar('--muted') || 'gray',
    grid: cssVar('--grid') || 'gainsboro',
    axis: cssVar('--axis') || 'silver',
    border: cssVar('--border') || 'rgba(0, 0, 0, 0.1)',
    seriesMuted: cssVar('--series-muted') || 'silver',
    font: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  }
}

/**
 * A number that changes whenever the active theme changes, so charts that bake token values into
 * their options can recompute them. Watches data-theme/class on <html> and the OS color scheme.
 */
export function useThemeKey(): number {
  const [key, setKey] = useState(0)
  useEffect(() => {
    const bump = () => setKey((k) => k + 1)
    const mo = new MutationObserver(bump)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener('change', bump)
    return () => {
      mo.disconnect()
      mq?.removeEventListener('change', bump)
    }
  }, [])
  return key
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ───────────────────────── number helpers ─────────────────────────

/** A clean tick step (1, 2, 2.5, 5 × 10^n) near `raw`. */
export function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return n * pow
}

/** Axis maximum + interval so ticks land on round numbers with a little headroom. */
export function niceScale(max: number, ticks = 4): { max: number; interval: number } {
  const m = max > 0 && Number.isFinite(max) ? max * 1.04 : 1
  const interval = niceStep(m / ticks)
  return { max: Math.ceil(m / interval - 1e-9) * interval, interval }
}

function trimNumber(v: number): string {
  return Number(v.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 3 })
}

/** Y-axis tick label by unit: "2.5%", "1.2K", "0.5". */
export function axisTickLabel(v: number, unit: Unit): string {
  if (unit === 'count') {
    return Math.abs(v) >= 1000
      ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
      : trimNumber(v)
  }
  return unit === '%' ? `${trimNumber(v)}%` : trimNumber(v)
}

/** Short axis title describing what the y-values mean. */
export function axisTitle(metric: MetricKind, unit: Unit): string {
  switch (metric) {
    case 'ed_visit_pct':
      return '% of emergency department visits'
    case 'test_positivity':
      return '% of tests positive'
    case 'detection_rate':
      return '% of panel tests detecting it'
    case 'ili_pct':
      return '% of clinic visits'
    case 'hosp_admissions':
      return 'Hospital admissions per week'
    case 'hosp_rate':
      return 'Hospitalizations per 100,000 people, weekly'
    case 'cases':
      return 'Reported cases per week'
    case 'cases_ytd':
      return 'Cases reported so far this year'
    case 'outbreaks':
      return 'Reported outbreaks'
    case 'deaths':
      return 'Deaths per week'
    case 'ww_detections':
      return 'Wastewater sites with a detection'
    case 'rt':
      return 'Rt (new infections per infection)'
    case 'wastewater_level':
      return 'Wastewater activity level'
    case 'wastewater_conc':
      return 'Wastewater concentration (normalized)'
  }
  return unit === '%' ? 'Percent' : unit === 'per100k' ? 'Per 100,000 people' : 'Value'
}

/** Escape text that goes into tooltip HTML (series names come from data). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** "2024-25" → "2024–25". */
export function seasonLabel(season: string): string {
  return season.replace('-', '–')
}

/** Plain-language name for a forecast's publisher. */
export function forecastSourceLabel(source: string): string {
  return source === 'mn-pulse' ? 'MN Pulse projection' : 'CDC ensemble forecast'
}

/** Longer description for "how to read" disclosures. */
export function forecastSourceDescription(source: string): string {
  switch (source) {
    case 'mn-pulse':
      return "MN Pulse's own statistical projection, based on this measure's recent trend and past seasons."
    case 'cdc-flusight':
      return "CDC FluSight ensemble — CDC's combination of many independent teams' flu forecasts."
    case 'cdc-covidhub':
      return "CDC COVID-19 Forecast Hub ensemble — CDC's combination of many independent teams' forecasts."
    case 'cdc-rsvhub':
      return "CDC RSV Forecast Hub ensemble — a combination of many independent teams' RSV forecasts."
    default:
      return "A CDC ensemble that combines many independent teams' forecasts."
  }
}
