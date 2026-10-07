// Display vocabulary and data-matching helpers for the illness library and illness detail pages.
import type {
  AgeGroupId, GeoRef, Manifest, MetricKind, PathogenCategory, PathogenId, PathogenPulse, PulseFile, Series, SignalSummary,
} from '../../../shared/types'
import type { GuidanceGroup, PathogenProfile, RiskTier, TreatmentOption } from '../../content/types'
import { pathogenName } from '../../content'
import { aboutOneIn, formatDate, formatValue, plural } from '../../lib/format'

export const CATEGORY_LABEL: Record<PathogenCategory, string> = {
  'respiratory-viral': 'Respiratory virus',
  'respiratory-bacterial': 'Respiratory bacteria',
  gastrointestinal: 'Stomach and gut',
  'vaccine-preventable': 'Vaccine-preventable',
  'vector-borne': 'Tick- and mosquito-borne',
  zoonotic: 'Spread from animals',
  syndrome: 'Combined illness measure',
}

/** Categories offered as filters in the library, in display order. */
export const CATEGORY_FILTERS: PathogenCategory[] = [
  'respiratory-viral',
  'respiratory-bacterial',
  'gastrointestinal',
  'vaccine-preventable',
  'vector-borne',
  'zoonotic',
]

export const KIND_LABEL: Record<PathogenProfile['kind'], string> = {
  virus: 'Virus',
  bacterium: 'Bacteria',
  parasite: 'Parasite',
  syndrome: 'Syndrome',
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]

export const RISK_ORDER: RiskTier[] = ['lower', 'moderate', 'higher', 'highest']
export const RISK_LABEL: Record<RiskTier, string> = {
  lower: 'Lower risk',
  moderate: 'Moderate risk',
  higher: 'Higher risk',
  highest: 'Highest risk',
}

export const GUIDANCE_GROUPS: GuidanceGroup[] = [
  'infants',
  'children',
  'adults',
  'older-adults',
  'seniors',
  'pregnant',
  'immunocompromised',
]

export const TREATMENT_TYPE_LABEL: Record<TreatmentOption['type'], string> = {
  antiviral: 'Antiviral',
  antibiotic: 'Antibiotic',
  antiparasitic: 'Antiparasitic',
  'monoclonal-antibody': 'Antibody treatment',
  supportive: 'Home care',
  other: 'Other',
}

/** Sub-type ids whose data belong on the parent profile's page. */
const SUBTYPES: Partial<Record<PathogenId, PathogenId[]>> = {
  influenza: ['influenza-a', 'influenza-b'],
}

/** The profile's own id plus any sub-type ids (e.g. influenza → influenza, influenza-a, influenza-b). */
export function relatedIds(id: PathogenId): PathogenId[] {
  return [id, ...(SUBTYPES[id] ?? [])]
}

/** The pulse entry for a profile: exact id first, otherwise the highest-scoring sub-type. */
export function pulseFor(pulse: PulseFile | undefined, id: PathogenId): PathogenPulse | undefined {
  if (!pulse) return undefined
  const exact = pulse.pathogens.find((p) => p.pathogen === id)
  if (exact) return exact
  const subs = SUBTYPES[id] ?? []
  return pulse.pathogens.filter((p) => subs.includes(p.pathogen)).sort((a, b) => b.score - a.score)[0]
}

/** Whether any published series covers this profile (or its sub-types). */
export function hasSeriesFor(series: Series[] | undefined, id: PathogenId): boolean {
  if (!series?.length) return false
  const ids = relatedIds(id)
  return series.some((s) => ids.includes(s.pathogen) && s.points.some((p) => p[1] != null))
}

/** Name used mid-sentence: "flu", "whooping cough", but "RSV", "COVID-19", "Lyme", "West Nile". */
export function inlineName(p: PathogenProfile): string {
  const s = p.shortName
  if (/[A-Z]{2}|\d|\./.test(s) || p.id === 'lyme' || p.id === 'west-nile') return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** Mid-sentence name for a series' own pathogen ("flu A" on the flu page, otherwise the page's name). */
export function seriesNoun(p: PathogenProfile, pathogen: PathogenId): string {
  const base = inlineName(p)
  if (pathogen === p.id) return base
  const sub = pathogenName(pathogen)
  return base.charAt(0) === base.charAt(0).toLowerCase() ? sub.charAt(0).toLowerCase() + sub.slice(1) : sub
}

/** Plain description of where a measure comes from, for sentences ("in Minnesota", "in the Midwest (…)"). */
export function wherePhrase(geo: Series['geo'], short = false): string {
  if (geo.type === 'state') return `in ${geo.name || 'Minnesota'}`
  if (geo.type === 'county') return `in ${geo.name.replace(/ County$/, '')} County`
  if (geo.type === 'hhs-region' && /5$/.test(geo.code))
    return short ? 'in Minnesota and 5 nearby states' : 'in HHS Region 5 (Minnesota, Wisconsin, Michigan, Illinois, Indiana and Ohio)'
  if (geo.type === 'census-region' && /midwest/i.test(geo.code + geo.name))
    return short ? 'in the Midwest' : 'in the Midwest (12 states including Minnesota)'
  if (geo.type === 'national') return 'nationwide'
  return `in ${geo.name || geo.code}`
}

/** Geographies larger than Minnesota, whose numbers must never be labelled as Minnesota's own. */
export function isWiderThanState(geo: Pick<GeoRef, 'type'> | undefined): boolean {
  return !!geo && (geo.type === 'hhs-region' || geo.type === 'census-region' || geo.type === 'national')
}

const HHS_STATES: Record<string, number> = { HHS1: 6, HHS2: 4, HHS3: 6, HHS4: 8, HHS5: 6, HHS6: 5, HHS7: 4, HHS8: 6, HHS9: 8, HHS10: 4 }

/**
 * Short title for a multi-state area, in the same vocabulary as wherePhrase():
 * HHS5 → "HHS Region 5 (MN + 5 nearby states)", Midwest → "Midwest (MN + 11 other states)", US → "United States".
 * Undefined for Minnesota and places inside it.
 */
export function regionTitle(geo: GeoRef | undefined): string | undefined {
  if (!geo || !isWiderThanState(geo)) return undefined
  if (geo.type === 'hhs-region') {
    const num = geo.code.replace(/^HHS/i, '')
    const n = HHS_STATES[geo.code.toUpperCase()]
    return n ? `HHS Region ${num} (MN + ${n - 1} nearby states)` : `HHS Region ${num}`
  }
  if (geo.type === 'census-region') {
    return /midwest/i.test(geo.code + geo.name) ? 'Midwest (MN + 11 other states)' : geo.name || geo.code
  }
  return 'United States'
}

/** Short publisher names for sentences ("From CDC NNDSS data: …"). */
const SOURCE_SHORT: Record<string, string> = {
  'cdc-nndss': 'CDC NNDSS',
  'cdc-nssp': 'CDC NSSP',
  'cdc-hubs': 'CDC',
  'cdc-nwss': 'CDC NWSS',
  'cdc-respnet': 'CDC RESP-NET',
  'cdc-fluview': 'CDC FluView',
  'cdc-nrevss': 'CDC NREVSS',
  'cdc-cfa-rt': 'CDC',
  mdh: 'MDH',
  wastewaterscan: 'WastewaterSCAN',
  biofire: 'BioFire',
}

/** Short publisher name; the CDC forecast hubs republish NSSP and NHSN, so those copies are named for the system. */
export function sourceShort(source: string, dataset?: string): string {
  if (source === 'cdc-hubs' && dataset) {
    if (/^nhsn/.test(dataset)) return 'CDC NHSN'
    if (/^nssp/.test(dataset)) return 'CDC NSSP'
  }
  return SOURCE_SHORT[source] ?? source
}

/**
 * MN Pulse's own plain-language fact about a series (Series.summary). Older data files carried this sentence
 * in `official` with an "MN Pulse …" author; it is read from there too so it is never shown as the publisher's words.
 */
export function summaryOf(s: Pick<Series, 'summary' | 'official'>): string | undefined {
  if (s.summary) return s.summary
  const off = s.official
  return off?.label && /^MN Pulse\b/.test(off.by ?? '') ? off.label : undefined
}

/** The publisher's own wording for the latest week, when it is really theirs (not an MN Pulse summary). */
export function publisherLabel(s: Pick<Series, 'official'>): string | undefined {
  const off = s.official
  if (!off?.label || /^MN Pulse\b/.test(off.by ?? '')) return undefined
  return off.label
}

const isoToText = (t: string) => t.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => formatDate(d, true))
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/**
 * The pipeline's level basis ("Compared with the past 3 years of this measure (54th percentile)") as a full
 * sentence for "How the level is set: …". Unknown wording falls back to "Set from …".
 */
export function basisSentence(basis: string | undefined): string | undefined {
  if (!basis) return undefined
  const b = isoToText(basis.trim().replace(/\.$/, ''))
  let m = /^Compared with the past (.+?) of this measure \((\d+)(?:st|nd|rd|th) percentile\)$/i.exec(b)
  if (m) {
    const p = Number(m[2])
    if (p >= 100) return `This week is the highest in the past ${m[1]} of this measure.`
    if (p <= 0) return `This week is as low as any week in the past ${m[1]} of this measure.`
    return `This week is higher than ${p}% of weeks in the past ${m[1]} of this measure.`
  }
  if (/^Not enough history/i.test(b)) return 'There isn’t enough history yet to compare this week with past years, so no level is set.'
  if (/^Year-to-date count/i.test(b)) return 'A running total for the year only goes up, so it doesn’t get an activity level.'
  if (/^Weekly reported cases/i.test(b)) return 'Too few weeks have reported cases to rate a level.'
  if (/^Rt shows/i.test(b)) return 'Rt shows the direction of spread, not the amount, so it has no activity level.'
  m = /^Not detected in the latest week(?: \((\d+) sites tested\))?$/i.exec(b)
  if (m) return m[1] ? `Not detected at any of the ${m[1]} sites tested in the latest week.` : 'Not detected in the latest week.'
  m = /^Detected in (\d+) of the last 3 weeks \((.+) this week\)$/i.exec(b)
  if (m) return `Detected in ${m[1]} of the last 3 weeks (${m[2]} this week); repeated detections raise the level.`
  m = /^Detected at (.+) this week$/i.exec(b)
  if (m) return `Detected at ${m[1]} this week.`
  m = /^Rated by the same admissions per 100,000 residents \((.+?)\): (.+)$/i.exec(b)
  if (m) return `Rated from the matching rate of ${m[1]} admissions per 100,000 residents, using ${lowerFirst(m[2])}.`
  m = /^(.+) category “(.+)”( \(none reported this week\))?$/.exec(b)
  if (m) return `${m[1]} rates this week “${m[2]}”${m[3] ? '; with none reported, it sits at the bottom of the scale' : ''}.`
  if (/^CDC .*(levels|cut-points)/i.test(b)) return `Uses ${b}.`
  return `Set from ${lowerFirst(b)}.`
}

/** Unit caption under a compact tile's figure. */
export const TILE_CAPTION: Record<MetricKind, string> = {
  detection_rate: 'of panel tests detected it',
  test_positivity: 'of lab tests positive',
  ed_visit_pct: 'of ER visits',
  ili_pct: 'of clinic visits',
  hosp_admissions: 'admitted in the week',
  hosp_rate: 'admissions per 100,000',
  wastewater_level: 'activity level',
  wastewater_conc: 'normalized concentration',
  cases: 'cases in the week',
  cases_ytd: 'cases so far this year',
  outbreaks: 'outbreaks in the week',
  deaths: 'deaths in the week',
  ww_detections: 'sites with a detection',
  rt: 'new infections per infection',
}

/** Case counts (weekly or year-to-date) get no activity level: they are read as a running total. */
export const isCaseMetric = (m: MetricKind | undefined): boolean => m === 'cases' || m === 'cases_ytd'

export interface YearToDate {
  value: number
  year: string
  /** Count by the same point last year, when the source gives one. */
  prev?: number
  /** Date the count applies to. */
  asOf: string
  source: string
  seriesId: string
}

/** Last date in a series, counting blank weeks (a table published with an empty cell is still published). */
const lastListed = (s: Series) => s.points[s.points.length - 1]?.[0]

/** Year-to-date count from a pulse signal: its own value (cases_ytd) or the series' attrs.ytd (NNDSS tables). */
export function yearToDateOf(sig: SignalSummary | undefined, series: Series[] | undefined): YearToDate | undefined {
  if (!sig || !isCaseMetric(sig.metric)) return undefined
  const s = series?.find((x) => x.id === sig.seriesId)
  if (sig.metric === 'cases_ytd') {
    return {
      value: sig.latestValue,
      year: String(sig.attrs?.year ?? sig.latestDate.slice(0, 4)),
      asOf: sig.latestDate,
      source: sig.source,
      seriesId: sig.seriesId,
    }
  }
  const attrs = s?.attrs ?? sig.attrs
  const ytd = Number(attrs?.ytd)
  if (attrs?.ytd == null || !Number.isFinite(ytd)) return undefined
  const prev = Number(attrs?.ytdPrevYear)
  const asOf = s?.official?.asOf ?? (s ? lastListed(s) : undefined) ?? sig.latestDate
  return {
    value: ytd,
    year: asOf.slice(0, 4),
    prev: attrs?.ytdPrevYear != null && Number.isFinite(prev) ? prev : undefined,
    asOf,
    source: sig.source,
    seriesId: sig.seriesId,
  }
}

/** "18 Minnesota cases in 2026" (the hero headline for case-count illnesses). */
export function ytdHeadline(y: YearToDate): string {
  return `${formatValue(y.value, 'count')} Minnesota case${plural(y.value)} in ${y.year}`
}

/** Human source name from the manifest, plus the dataset abbreviation in the series label ("NSSP"). */
export function sourceName(manifest: Manifest | undefined, s: { source: string; label?: string }): string {
  const src = manifest?.sources.find((x) => x.id === s.source)
  const abbr = s.label?.match(/\(([^()]+)\)\s*$/)?.[1]
  const name = src?.name ?? s.source
  return abbr && !name.includes(abbr) ? `${name} (${abbr})` : name
}

/** Plain explanation of what each measure counts (shown behind "What is this measure?"). */
export const MEASURE_EXPLAINER: Record<MetricKind, string> = {
  detection_rate:
    'The share of multi-pathogen panel tests (BioFire) that found this germ. These tests are mostly run on people sick enough to visit a hospital or emergency department, so the number shows how common the germ is among very sick patients, not in everyone.',
  test_positivity:
    'The share of laboratory tests that came back positive. Only people sick enough to see a clinician get tested, so this is not the share of all Minnesotans who are infected. A rising share means more of the illness is going around.',
  ed_visit_pct:
    'The share of all emergency department visits where the patient was diagnosed with this illness. It tends to rise early in a wave and counts visits, not everyone who is sick at home.',
  ili_pct: 'The share of clinic visits for fever with cough or sore throat (influenza-like illness).',
  hosp_admissions: 'The number of people newly admitted to a hospital with this illness in a week.',
  hosp_rate:
    'New hospital admissions in a week for every 100,000 residents. Using a rate makes places of different sizes comparable.',
  wastewater_level:
    'How much of the virus is showing up in sewage compared with the usual level at those treatment plants. Wastewater captures infections whether or not people get tested, and often rises a week or so before clinic visits.',
  wastewater_conc: 'The amount of the virus in sewage, adjusted for how much human waste is in each sample.',
  cases_ytd:
    'The total number of cases reported to public health so far this year. It only goes up during the year, so it shows how much has happened, not whether things are getting better or worse right now.',
  cases:
    'Cases reported to public health. Many mild cases are never tested or reported, so the true number is higher. Changes over time are more meaningful than the exact count.',
  outbreaks: 'Clusters of illness reported to public health (for example in a school, care facility or restaurant).',
  deaths: 'Deaths reported with this illness.',
  ww_detections: 'The number of wastewater samples or treatment plants where the germ was found that week.',
  rt: 'The average number of people each infected person passes the illness to. Above 1 means spread is growing; below 1 means it is shrinking.',
}

/** Short phrase describing the y-axis of a chart for this measure. */
export const MEASURE_AXIS: Record<MetricKind, string> = {
  detection_rate: 'Percent of panel tests that detected it',
  test_positivity: 'Percent of lab tests positive',
  ed_visit_pct: 'Percent of all emergency department visits',
  ili_pct: 'Percent of clinic visits',
  hosp_admissions: 'People admitted to the hospital each week',
  hosp_rate: 'Hospital admissions per 100,000 residents each week',
  wastewater_level: 'Wastewater activity level',
  wastewater_conc: 'Normalized wastewater concentration',
  cases: 'Reported cases each week',
  cases_ytd: 'Cases reported so far this year',
  outbreaks: 'Reported outbreaks each week',
  deaths: 'Reported deaths each week',
  ww_detections: 'Wastewater detections each week',
  rt: 'Reproduction number',
}

/** Display order of measures on the detail page (earliest/most-sensitive signals first). */
export const METRIC_ORDER: MetricKind[] = [
  'ed_visit_pct',
  'test_positivity',
  'detection_rate',
  'wastewater_level',
  'wastewater_conc',
  'ww_detections',
  'rt',
  'ili_pct',
  'hosp_rate',
  'hosp_admissions',
  'cases',
  'outbreaks',
  'deaths',
]

/**
 * Natural frequency for a percentage, using the one rounding rule shared across MN Pulse (lib/format aboutOneIn),
 * so 0.26% reads "about 1 in 400" here and on the Pulse page. "none" for zero; null for missing values.
 */
export function naturalFrequency(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0) return null
  if (pct === 0) return 'none'
  return aboutOneIn(pct) ?? null
}

// ── Age bands (age-specific series) ────────────────────────────────────────────

/** Canonical key for an age label: '≥65 years' → 'ge65y', '0-<6 months' → '0-<6m', '1-4 yr' → '1-4y'. */
export function ageKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .replace(/^(\d+)\+/, 'ge$1')
    .replace(/^(≥|>=)/, 'ge')
    .replace(/(years?|yrs?)$/, 'y')
    .replace(/(months?|mos?)$/, 'm')
}

const AGE_KEY_GROUP: Record<string, GuidanceGroup> = {
  '0-<6m': 'infants',
  '0-<1y': 'infants',
  '6m-<12m': 'infants',
  '1-4y': 'children',
  '5-17y': 'children',
  '0-17y': 'children',
  '0-4y': 'children',
  '5-11y': 'children',
  '12-17y': 'children',
  '18-49y': 'adults',
  '18-29y': 'adults',
  '30-39y': 'adults',
  '40-49y': 'adults',
  '50-64y': 'older-adults',
  ge65y: 'seniors',
  '65-74y': 'seniors',
  ge75y: 'seniors',
  '75-84y': 'seniors',
  ge85y: 'seniors',
}

/** Audience group an age-specific series informs (pipeline attrs first, then the label). */
export function ageGroupOf(s: Series): AgeGroupId | undefined {
  const attr = s.attrs?.ageGroup as AgeGroupId | undefined
  if (attr) return attr
  return s.age ? AGE_KEY_GROUP[ageKey(s.age)] : undefined
}

/** [lower, upper) bound in years parsed from an age label, for ordering. */
function ageBounds(label: string): [number, number] {
  const k = ageKey(label)
  const months = k.endsWith('m')
  const nums = (k.match(/\d+/g) ?? []).map(Number)
  const scale = months ? 1 / 12 : 1
  if (k.startsWith('ge')) return [(nums[0] ?? 0) * scale, Infinity]
  return [(nums[0] ?? 0) * scale, (nums[1] ?? nums[0] ?? 0) * scale]
}

const PREFERRED_AGE_SETS: string[][][] = [
  [['0-<1y'], ['0-<6m']],
  [['1-4y', '5-17y'], ['0-17y'], ['0-4y', '5-17y']],
  [['18-49y']],
  [['50-64y']],
  [['ge65y'], ['65-74y', 'ge75y']],
]

/**
 * Pick at most 6 non-overlapping age bands spanning all ages (e.g. <1, 1–4, 5–17, 18–49, 50–64, 65+),
 * ordered youngest first. Falls back to the youngest six when labels are unfamiliar.
 */
export function pickAgeBands(series: Series[]): Series[] {
  const byKey = new Map<string, Series>()
  for (const s of series) if (s.age) byKey.set(ageKey(s.age), s)
  const chosen: Series[] = []
  for (const options of PREFERRED_AGE_SETS) {
    const hit = options.find((keys) => keys.every((k) => byKey.has(k)))
    if (hit) chosen.push(...hit.map((k) => byKey.get(k)!))
  }
  const sorted = (xs: Series[]) =>
    [...xs].sort((a, b) => {
      const [la, ua] = ageBounds(a.age!)
      const [lb, ub] = ageBounds(b.age!)
      return la - lb || ua - ub
    })
  if (chosen.length >= 2) return sorted(chosen).slice(0, 6)
  return sorted(series.filter((s) => s.age)).slice(0, 6)
}

/** "Ages 0–4 years" from a raw age label. */
export function ageDisplay(label: string): string {
  const t = label.replace(/-/g, '–').replace(/\s+/g, ' ').trim()
  return /^ages?\b/i.test(t) ? t : `Ages ${t}`
}
