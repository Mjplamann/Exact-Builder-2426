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
const MIX_RE = /^color-mix\(\s*in\s+oklab\s*,(.+)\)$/i

/**
 * Resolve "var(--token)" (or "var(--token, fallback)") to a concrete color; other strings pass through.
 * "color-mix(in oklab, <color> P%, <color>)" (the form ordinalColor() writes, tokens allowed inside) is mixed
 * here too, so one CSS string colors both HTML swatches (natively) and canvas charts.
 */
export function resolveColor(color: string): string {
  const c = color.trim()
  const mix = MIX_RE.exec(c)
  if (mix) return resolveMix(mix[1]) ?? 'gray'
  const m = VAR_RE.exec(c)
  if (!m) return color
  return cssVar(m[1]) || (m[2] ? resolveColor(m[2]) : 'gray')
}

/** Split "a, b(c, d), e" at top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(s.slice(start).trim())
  return out
}

function resolveMix(args: string): string | undefined {
  const parts = splitTop(args)
  if (parts.length !== 2) return undefined
  const stops = parts.map((p) => {
    const m = /^(.*?)\s+([\d.]+)%$/.exec(p)
    return m ? { color: m[1], pct: Number(m[2]) } : { color: p, pct: undefined as number | undefined }
  })
  let [p1, p2] = [stops[0].pct, stops[1].pct]
  if (p1 == null && p2 == null) p1 = p2 = 50
  else if (p1 == null) p1 = 100 - p2!
  else if (p2 == null) p2 = 100 - p1
  const sum = p1 + p2!
  if (!(sum > 0)) return undefined
  const a = rgbOf(resolveColor(stops[0].color))
  const b = rgbOf(resolveColor(stops[1].color))
  if (!a || !b) return undefined
  const t = p2! / sum
  const la = oklabFromRgb(a)
  const lb = oklabFromRgb(b)
  return hexFromOklab([0, 1, 2].map((k) => la[k] + (lb[k] - la[k]) * t) as [number, number, number])
}

function rgbOf(color: string): [number, number, number] | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : undefined
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

function oklabFromRgb([R, G, B]: [number, number, number]): [number, number, number] {
  const [r, g, b] = [R, G, B].map((v) => toLinear(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function hexFromOklab([L, a, b]: [number, number, number]): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, '0')).join('')}`
}

/**
 * The i-th of n steps (0-based) of a one-hue ordinal ramp for ordered categories such as age bands, as a CSS
 * color: an OKLab mix between two --seq-* tokens, so the steps have even lightness gaps in both themes.
 * The default range (--seq-300 → --seq-700) passes the dataviz ordinal checks for up to 6 steps in light and
 * dark (monotone lightness, adjacent ΔL ≥ 0.06, light end ≥ 2:1 on the surface, single hue). In light mode
 * step 0 is the lightest; the dark theme's --seq-* tokens run the other way, so step 0 is always the
 * lowest-contrast end. Never orange or amber, so ordered groups never read as activity levels.
 */
export function ordinalColor(i: number, n: number, from = 300, to = 700): string {
  const t = n <= 1 ? 1 : Math.min(1, Math.max(0, i / (n - 1)))
  const pct = Math.round(t * 100)
  if (pct <= 0) return `var(--seq-${from})`
  if (pct >= 100) return `var(--seq-${to})`
  return `color-mix(in oklab, var(--seq-${from}) ${100 - pct}%, var(--seq-${to}))`
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
      return 'New cases reported per week'
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
