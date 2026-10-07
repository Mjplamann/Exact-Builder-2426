// Display vocabulary and data-matching helpers for the illness library and illness detail pages.
import type { AgeGroupId, Manifest, MetricKind, PathogenCategory, PathogenId, PathogenPulse, PulseFile, Series } from '../../../shared/types'
import type { GuidanceGroup, PathogenProfile, RiskTier, TreatmentOption } from '../../content/types'
import { pathogenName } from '../../content'

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
 * "about 1 in 390" style natural frequency for a percentage. Rounded to friendly numbers because the
 * underlying measure is itself an estimate. Returns null for missing values.
 */
export function naturalFrequency(pct: number | null | undefined): string | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0) return null
  if (pct === 0) return 'none'
  if (pct >= 50) return `about ${Math.min(10, Math.round(pct / 10))} in 10`
  const n = 100 / pct
  const nice = n < 20 ? Math.round(n) : n < 100 ? Math.round(n / 5) * 5 : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100
  return `about 1 in ${nice.toLocaleString('en-US')}`
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
