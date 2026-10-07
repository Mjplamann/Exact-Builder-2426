// Small helpers shared by the overview (pulse) components.
import type { ActivityLevel, Manifest, MetricKind, PathogenId, PathogenPulse, PulseFile, Unit } from '../../../shared/types'
import { formatValue, metricMeaning } from '../../lib/format'
import { toHash, type AppState, type View } from '../../lib/state'
import { pathogenName } from '../../content'

/** What one "visit" or "test" is called for natural-frequency phrasing. */
const DENOMINATOR: Partial<Record<MetricKind, string>> = {
  ed_visit_pct: 'ER visits',
  detection_rate: 'panel tests',
  test_positivity: 'lab tests',
  ili_pct: 'clinic visits',
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
 * Natural-frequency phrase for a percentage: 0.26% of ER visits → "about 1 in 400 ER visits".
 * Returns undefined for non-percent metrics, zero, or missing values.
 */
export function naturalFrequency(value: number | null | undefined, metric: MetricKind, unit: Unit): string | undefined {
  if (unit !== '%' || value == null || !Number.isFinite(value) || value <= 0) return undefined
  const what = DENOMINATOR[metric] ?? 'of those counted'
  if (value >= 45) return `about ${Math.round(value / 10)} in 10 ${what}`
  const n = friendlyRound(100 / value)
  return `about 1 in ${n.toLocaleString('en-US')} ${what}`
}

/**
 * metricMeaning() without its leading value, for use under a large stat:
 * "0.26% of all emergency department visits were for it" → "of all emergency department visits were for it".
 * Falls back to the full sentence when the value is not at the start.
 */
export function meaningAfterValue(metric: MetricKind, value: number | null | undefined, unit: Unit, name?: string): string {
  const full = metricMeaning(metric, value, unit)
  const v = formatValue(value, unit)
  let rest = full.startsWith(v) ? full.slice(v.length).trim() : full
  if (name) rest = rest.replace(/\bfor it\b/, `for ${name}`).replace(/\bdetected it\b/, `detected ${name}`)
  return rest
}

/** Outlook text from the pipeline starts with a verb ("is projected to…"); prefix the pathogen name. */
export function outlookSentence(p: PathogenPulse): string | undefined {
  const t = p.outlook?.text?.trim()
  if (!t) return undefined
  return /^[a-z]/.test(t) ? `${pathogenName(p.pathogen)} ${t}` : t
}

/** Human source name from the manifest (falls back to the id). */
export function sourceName(manifest: Manifest, id: string): string {
  return manifest.sources.find((s) => s.id === id)?.name ?? id
}

/** A real href for in-app navigation that keeps the current filters. */
export function hrefFor(state: AppState, view: View, pathogenId?: PathogenId): string {
  return toHash({ ...state, view, pathogenId })
}

/** Watch-list order: highest composite score first, then by name. */
export function rankPathogens(pulse: PulseFile): PathogenPulse[] {
  return [...pulse.pathogens].sort((a, b) => b.score - a.score || pathogenName(a.pathogen).localeCompare(pathogenName(b.pathogen)))
}

/** Latest "as of" week across the pathogen summaries. */
export function latestWeek(pulse: PulseFile): string | undefined {
  let best: string | undefined
  for (const p of pulse.pathogens) {
    const d = p.asOf ?? p.primary?.latestDate
    if (d && (!best || d > best)) best = d
  }
  return best
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** [12, 1, 2] → "Dec–Feb"; [3, 4, 5, 10, 11] → "Mar–May, Oct–Nov". Handles wrap-around runs. */
export function monthRanges(months: number[]): string {
  const set = new Set(months.filter((m) => m >= 1 && m <= 12))
  if (!set.size) return ''
  if (set.size === 12) return 'year-round'
  // Start each run at a month whose predecessor is not in the set.
  const runs: [number, number][] = []
  for (let m = 1; m <= 12; m++) {
    const prev = m === 1 ? 12 : m - 1
    if (!set.has(m) || set.has(prev)) continue
    let end = m
    for (;;) {
      const next = end === 12 ? 1 : end + 1
      if (!set.has(next)) break
      end = next
    }
    runs.push([m, end])
  }
  runs.sort((a, b) => a[0] - b[0])
  return runs.map(([a, b]) => (a === b ? MONTH_NAMES[a - 1] : `${MONTH_NAMES[a - 1]}–${MONTH_NAMES[b - 1]}`)).join(', ')
}

/** Plain-language description of what an activity level means for an average person. */
export const LEVEL_MEANING: Record<ActivityLevel, string> = {
  minimal: 'Very little is going around. Everyday habits are enough for most people.',
  low: 'Some illness is going around, but less than a typical busy season. A good time to get vaccinated.',
  moderate: 'Illness is spreading at a noticeable level. People at higher risk should take extra care.',
  high: 'A lot of illness is going around. Expect more sick contacts at work, school and home.',
  'very-high': 'Among the highest levels seen in recent years. Clinics and hospitals may be busy.',
  unknown: 'There isn’t enough recent data to say.',
}
