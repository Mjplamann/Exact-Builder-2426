// Small helpers shared by the overview (pulse) components.
import type { SignalSummary, ActivityLevel, GeoRef, Manifest, MetricKind, PathogenId, PathogenPulse, PulseFile, Unit } from '../../../shared/types'
import { aboutOneIn, formatValue, metricMeaning, plural } from '../../lib/format'
import { HEADLINE_PATHOGENS } from '../../lib/freshness'
import { toHash, type AppState, type View } from '../../lib/state'
import { pathogenName } from '../../content'

/** What one "visit" or "test" is called for natural-frequency phrasing. */
const DENOMINATOR: Partial<Record<MetricKind, string>> = {
  ed_visit_pct: 'ER visits',
  detection_rate: 'panel tests',
  test_positivity: 'lab tests',
  ili_pct: 'clinic visits',
}

/** Moved to lib/format (shared by every view); re-exported for existing imports. */
export { friendlyRound } from '../../lib/format'

/**
 * Natural-frequency phrase for a percentage: 0.26% of ER visits → "about 1 in 400 ER visits".
 * Returns undefined for non-percent metrics, zero, or missing values.
 */
export function naturalFrequency(value: number | null | undefined, metric: MetricKind, unit: Unit): string | undefined {
  if (unit !== '%' || value == null) return undefined
  const phrase = aboutOneIn(value)
  if (!phrase) return undefined
  return `${phrase} ${DENOMINATOR[metric] ?? 'of those counted'}`
}

/** Geographies larger than Minnesota whose numbers must not be presented as Minnesota's own. */
export function isWiderThanState(geo: GeoRef | undefined): boolean {
  return !!geo && (geo.type === 'hhs-region' || geo.type === 'census-region' || geo.type === 'national')
}

const HHS_STATES: Record<string, number> = { HHS1: 6, HHS2: 4, HHS3: 6, HHS4: 8, HHS5: 6, HHS6: 5, HHS7: 4, HHS8: 6, HHS9: 8, HHS10: 4 }

/**
 * Short chip text and an in-sentence phrase for a multi-state geography:
 *   HHS5 → { chip: "HHS Region 5 · 6 states", where: "MN and 5 nearby states" }.
 */
export function regionLabel(geo: GeoRef): { chip: string; where: string } | undefined {
  if (geo.type === 'hhs-region') {
    const n = HHS_STATES[geo.code]
    const num = geo.code.replace(/^HHS/i, '')
    return {
      chip: `HHS Region ${num}${n ? ` · ${n} states` : ''}`,
      where: n ? `MN and ${n - 1} nearby states` : `HHS Region ${num}`,
    }
  }
  if (geo.type === 'census-region') {
    const midwest = /midwest/i.test(geo.code) || /midwest/i.test(geo.name)
    return midwest ? { chip: 'Midwest · 12 states', where: 'MN and 11 other Midwest states' } : { chip: geo.name, where: geo.name }
  }
  if (geo.type === 'national') return { chip: 'United States', where: 'the US' }
  return undefined
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

/** Year-to-date case count for a case-count signal: its own value, a sibling cases_ytd signal, or attrs.ytd. */
function yearToDate(s: SignalSummary, p?: PathogenPulse): { value: number; prev?: number; year: string } | undefined {
  const year = (s.attrs?.year ?? s.latestDate.slice(0, 4)) as string
  if (s.metric === 'cases_ytd') return { value: s.latestValue, year }
  const sibling = p?.signals.find((x) => x.metric === 'cases_ytd' && x.geo.type === s.geo.type && x.geo.code === s.geo.code)
  if (sibling) return { value: sibling.latestValue, year: (sibling.attrs?.year ?? sibling.latestDate.slice(0, 4)) as string }
  const ytd = Number(s.attrs?.ytd)
  if (s.attrs?.ytd != null && Number.isFinite(ytd)) {
    const prev = Number(s.attrs?.ytdPrevYear)
    return { value: ytd, prev: s.attrs?.ytdPrevYear != null && Number.isFinite(prev) ? prev : undefined, year: s.latestDate.slice(0, 4) }
  }
  return undefined
}

/** Case counts (weekly or year-to-date) are better read as a running total than as a weekly blip. */
export const isCaseCount = (s: SignalSummary | undefined): boolean => !!s && (s.metric === 'cases' || s.metric === 'cases_ytd')

/**
 * The headline figure for a watch card. Raw wastewater concentrations mean little to most readers,
 * so wastewater measures are shown relative to their own usual level; detection counts as "N of M";
 * case counts as the year-to-date total; regional lab data says plainly that it covers several states.
 */
export function cardFigure(s: SignalSummary, name: string, p?: PathogenPulse): { figure: string; caption: string } {
  const what = s.label.split(' — ')[0]
  if (isCaseCount(s)) {
    const ytd = yearToDate(s, p)
    if (ytd) {
      const where = s.geo.type === 'state' ? 'in Minnesota ' : ''
      return {
        figure: formatValue(ytd.value, 'count'),
        caption: `case${plural(ytd.value)} reported ${where}so far in ${ytd.year}${
          ytd.prev != null ? ` (${formatValue(ytd.prev, 'count')} by this time last year)` : ''
        }`,
      }
    }
  }
  if (s.metric === 'ww_detections') {
    const tested = s.attrs?.plantsTestedLatestWeek ?? s.attrs?.sitesTested
    return {
      figure: tested ? `${formatValue(s.latestValue, s.unit)} of ${tested}` : formatValue(s.latestValue, s.unit),
      caption: `Minnesota wastewater sites detected ${name} in the latest week`,
    }
  }
  if (s.metric === 'wastewater_conc' || (s.metric === 'wastewater_level' && !s.attrs?.sites)) {
    const scope = s.attrs?.plants ? `median of ${s.attrs.plants} Minnesota plants` : s.geo.name
    if (s.latestValue === 0) return { figure: 'None', caption: `${what} found in wastewater this week (${scope})` }
    if (s.vsTypical != null) {
      return { figure: `${s.vsTypical < 10 ? s.vsTypical.toFixed(1) : Math.round(s.vsTypical)}×`, caption: `its usual wastewater level — ${what} (${scope})` }
    }
    if (s.percentile != null && s.percentile >= 50) {
      return { figure: `Top ${Math.max(1, 100 - s.percentile)}%`, caption: `of weeks in the past 3 years — ${what} in wastewater (${scope})` }
    }
    return { figure: 'Below usual', caption: `${what} in wastewater (${scope})` }
  }
  const region = isWiderThanState(s.geo) ? regionLabel(s.geo) : undefined
  if (region && (s.metric === 'test_positivity' || s.metric === 'detection_rate')) {
    const tests = s.metric === 'test_positivity' ? 'lab tests' : 'multi-germ panel tests'
    return { figure: formatValue(s.latestValue, s.unit), caption: `of ${tests} in ${region.where} came back positive` }
  }
  const rest = meaningAfterValue(s.metric, s.latestValue, s.unit, name)
  return { figure: formatValue(s.latestValue, s.unit), caption: region ? `${rest} (${region.where})` : rest }
}

/** Outlook text from the pipeline is a full sentence. */
export function outlookSentence(p: PathogenPulse): string | undefined {
  const t = p.outlook?.text?.trim()
  if (!t) return undefined
  return t
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

export { HEADLINE_PATHOGENS, headlineDates } from '../../lib/freshness'

/**
 * The flu, COVID-19 or RSV summary that sets the statewide level (its level equals the statewide level; the
 * highest score wins ties), so "How is this level set?" quotes the basis that actually produced it.
 */
export function statewideDriver(pulse: PulseFile): PathogenPulse | undefined {
  return pulse.pathogens
    .filter((p) => HEADLINE_PATHOGENS.includes(p.pathogen) && p.level === pulse.statewide.level && p.primary)
    .sort((a, b) => b.score - a.score)[0]
}

/** Latest "as of" week across all pathogen summaries (any source, including wastewater and snapshots). */
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
