// Pure parsing/mapping helpers for the CDC NWSS source (pipeline/sources/cdc-nwss.ts).
// Kept free of network access so they can be unit-tested against real rows.
//
// Datasets (data.cdc.gov):
//   atcp-73re — site-level Wastewater Viral Activity Level (WVAL) for SARS-CoV-2, influenza A and RSV.
//               Fields: state_territory ('Minnesota'), counties_served (county NAMES, comma-separated),
//               site ('ID:1021'), population_served, source, site_wval, site_wval_category,
//               date_included_in_wval, week_end (Saturday), pathogen_target, date_updated.
//   akvg-8vrb / mtpu-urpp / xpxn-rzgz — sample-level measles / H5 / mpox results.
//               Fields used: state_territory ('mn'), site (integer), county_fips, counties_served,
//               sample_collect_date, pcr_target, pcr_target_detect ('yes'/'no').
import { geoCentroid } from 'd3-geo'
import type { ActivityLevel, ActivityThresholds, GeoRef, PathogenId, Point, Series } from '../../shared/types.ts'
import { MN_COUNTY_BY_FIPS, countyByName } from '../../shared/geo/mnCounties.ts'
import { num } from './csv.ts'
import { makeSeries, STATE_GEO, toIsoDate, toWeekEnding } from './series.ts'

export const SOURCE_ID = 'cdc-nwss'

export type WvalPathogen = 'covid' | 'influenza-a' | 'rsv'

export const PATHOGEN_NAME: Record<WvalPathogen, string> = {
  covid: 'COVID-19',
  'influenza-a': 'Influenza A',
  rsv: 'RSV',
}

/** CDC pathogen_target wording → our pathogen id. */
export function wvalPathogen(target: string | undefined): WvalPathogen | undefined {
  const t = (target ?? '').trim().toLowerCase()
  if (!t) return undefined
  if (t.includes('sars-cov-2') || t.includes('sars cov 2') || t === 'covid-19' || t === 'covid') return 'covid'
  if (t.includes('influenza a') || t === 'flu a' || t === 'fluav') return 'influenza-a'
  if (t === 'rsv' || t.includes('respiratory syncytial')) return 'rsv'
  return undefined
}

const WVAL_CATEGORY: Record<string, ActivityLevel> = {
  'very low': 'minimal',
  low: 'low',
  moderate: 'moderate',
  high: 'high',
  'very high': 'very-high',
}

/** CDC WVAL category text ('Very Low' … 'Very High') → ActivityLevel; undefined for 'No Data' etc. */
export function wvalLevel(category: string | undefined): ActivityLevel | undefined {
  return WVAL_CATEGORY[(category ?? '').trim().toLowerCase().replace(/\s+/g, ' ')]
}

/**
 * CDC WVAL category cut-points after the 2026-08-14 method revision (re-applied to all history).
 * CDC publishes them as UPPER bounds: Very Low ≤ a, Low ≤ b, Moderate ≤ c, High ≤ d, Very High > d.
 * Re-checked at runtime against CDC's own site categories (see checkCutpoints).
 */
export const WVAL_CUTPOINTS: Record<WvalPathogen, [number, number, number, number]> = {
  covid: [2.6, 4.9, 7.9, 11.6],
  'influenza-a': [2.4, 5.5, 10.2, 15.6],
  rsv: [1.7, 3.4, 5.4, 8.1],
}

export const CUTPOINTS_BY = 'CDC NWSS WVAL cut-points (Aug 2026)'

/** Our thresholds are lower bounds of Low/Moderate/High/Very High — i.e. CDC's upper bounds shifted up one level. */
export function wvalThresholds(p: WvalPathogen): ActivityThresholds {
  const [low, moderate, high, veryHigh] = WVAL_CUTPOINTS[p]
  return { low, moderate, high, veryHigh, by: CUTPOINTS_BY }
}

const LEVEL_ORDER: ActivityLevel[] = ['minimal', 'low', 'moderate', 'high', 'very-high']

/**
 * Check the cut-points against CDC's own category for each row. Published values are rounded to
 * 2 decimals, so a value within ±0.005 of a cut-point may legitimately fall on either side.
 */
export function checkCutpoints(rows: { pathogen: WvalPathogen; value: number; level: ActivityLevel }[]) {
  const out: Partial<Record<WvalPathogen, { checked: number; mismatches: number; examples: string[] }>> = {}
  for (const r of rows) {
    const cuts = WVAL_CUTPOINTS[r.pathogen]
    const lo = LEVEL_ORDER.indexOf(r.level)
    if (lo < 0) continue
    const s = (out[r.pathogen] ??= { checked: 0, mismatches: 0, examples: [] })
    s.checked++
    // Category i holds values in (cuts[i-1], cuts[i]] (with rounding tolerance).
    const lower = lo === 0 ? -Infinity : cuts[lo - 1] - 0.005
    const upper = lo === 4 ? Infinity : cuts[lo] + 0.005
    if (!(r.value >= lower && r.value <= upper)) {
      s.mismatches++
      if (s.examples.length < 3) s.examples.push(`${r.value} labelled ${r.level}`)
    }
  }
  return out
}

/** Map CDC's comma-separated county names to MN county FIPS codes. */
export function parseCountiesServed(raw: string | undefined): { fips: string[]; unmatched: string[] } {
  const fips: string[] = []
  const unmatched: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const name = part.trim()
    if (!name) continue
    const c = countyByName(name)
    if (c) {
      if (!fips.includes(c.fips)) fips.push(c.fips)
    } else unmatched.push(name)
  }
  return { fips: fips.sort(), unmatched }
}

/** Parse a comma-separated FIPS list ('27145, 27141, 27009') into sorted 5-digit codes. */
export function parseFipsList(raw: string | undefined): string[] {
  const out = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const d = part.trim().replace(/\.0+$/, '')
    if (/^\d{4,5}$/.test(d)) out.add(d.padStart(5, '0'))
  }
  return [...out].sort()
}

/** Normalize a site id to CDC's WVAL form: 'ID:1021' (sample-level datasets use a bare integer). */
export function normalizeSiteId(raw: string | undefined): string | null {
  const m = /(\d+)/.exec((raw ?? '').trim())
  return m ? `ID:${Number(m[1])}` : null
}

/**
 * Treatment plants whose NWSS site id is confirmed by matching counties, population and the CDC H5 map
 * against WastewaterSCAN's plant list (coordinates: WastewaterSCAN plants.json, retrieved 2026-10-07)
 * or the Metropolitan Council's Metro Plant documentation (1.9 M people; no coordinate published here).
 */
export const KNOWN_SITES: Record<string, { name: string; coord?: [number, number] }> = {
  'ID:1021': { name: 'Metro Plant' },
  'ID:1017': { name: 'Rochester Water Reclamation Plant', coord: [-92.4717, 44.0048] },
  'ID:993': { name: 'Mankato Water Resource Recovery Facility', coord: [-93.984, 44.168] },
  'ID:1003': { name: 'Red Wing Wastewater Treatment Facility', coord: [-92.527, 44.5716] },
  'ID:1028': { name: 'St. Cloud Nutrient, Energy and Water Recovery Facility', coord: [-94.1211, 45.4741] },
}

const countyNames = (fips: string[]) => fips.map((f) => MN_COUNTY_BY_FIPS[f]?.name ?? f)

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** Display name for a site: a known plant name, else "<counties> wastewater site (ID:nnnn)". */
export function siteName(siteId: string, fips: string[], rawCounties = ''): string {
  const names = fips.length ? countyNames(fips) : rawCounties.split(',').map((s) => s.trim()).filter(Boolean)
  const known = KNOWN_SITES[siteId]
  if (known) return names.length ? `${known.name} (${names.join(', ')})` : known.name
  if (!names.length) return `Wastewater site ${siteId}`
  const where = names.length === 1 ? `${names[0]} County` : `${joinNames(names)} counties`
  return `${where} wastewater site (${siteId})`
}

// ─────────────────────────────── County centroids ───────────────────────────────

export type CentroidMap = Map<string, [number, number]>

interface CountyFeatureCollection {
  type: 'FeatureCollection'
  features: { type: 'Feature'; properties: { fips?: string; GEOID?: string }; geometry: unknown }[]
}

/** County centroids ([lon, lat]) from public/geo/mn-counties.geojson using d3-geo's spherical centroid. */
export function countyCentroids(geojson: CountyFeatureCollection): CentroidMap {
  const out: CentroidMap = new Map()
  for (const f of geojson.features ?? []) {
    const fips = String(f.properties?.fips ?? f.properties?.GEOID ?? '')
    if (!/^27\d{3}$/.test(fips)) continue
    const [lon, lat] = geoCentroid(f as Parameters<typeof geoCentroid>[0])
    if (Number.isFinite(lon) && Number.isFinite(lat)) out.set(fips, [round4(lon), round4(lat)])
  }
  return out
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4

export type AdjacencyMap = Map<string, Set<string>>

/** County adjacency from shared boundary vertices in the county GeoJSON. */
export function countyAdjacency(geojson: CountyFeatureCollection): AdjacencyMap {
  const byVertex = new Map<string, Set<string>>()
  const rings = (g: { type?: string; coordinates?: unknown }): number[][][] =>
    g?.type === 'Polygon' ? (g.coordinates as number[][][]) : g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]).flat() : []
  for (const f of geojson.features ?? []) {
    const fips = String(f.properties?.fips ?? f.properties?.GEOID ?? '')
    for (const ring of rings(f.geometry as { type?: string; coordinates?: unknown })) {
      for (const [x, y] of ring) {
        const k = `${x.toFixed(3)},${y.toFixed(3)}`
        const set = byVertex.get(k) ?? new Set<string>()
        set.add(fips)
        byVertex.set(k, set)
      }
    }
  }
  const adj: AdjacencyMap = new Map()
  for (const set of byVertex.values()) {
    if (set.size < 2) continue
    for (const a of set) for (const b of set) if (a !== b) (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
  }
  return adj
}

/** True when the counties form one contiguous block. */
function contiguous(fips: string[], adj: AdjacencyMap): boolean {
  if (fips.length < 2) return true
  const seen = new Set([fips[0]])
  const queue = [fips[0]]
  while (queue.length) {
    const cur = queue.pop()!
    for (const n of adj.get(cur) ?? []) {
      if (!fips.includes(n) || seen.has(n)) continue
      seen.add(n)
      queue.push(n)
    }
  }
  return seen.size === fips.length
}

/** Approximate great-circle distance in km. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180
  const x = (b[0] - a[0]) * rad * Math.cos(((a[1] + b[1]) / 2) * rad)
  const y = (b[1] - a[1]) * rad
  return Math.sqrt(x * x + y * y) * 6371
}

/**
 * Population-weighted centroid of the served counties' centroids. When the listed counties are not
 * contiguous (e.g. 'Dodge, Douglas', which suggests a data-entry issue) — or, without adjacency data,
 * far apart — use the most populous county's centroid instead of a meaningless midpoint.
 * Returns undefined when no county is known.
 */
export function servedCentroid(
  fips: string[],
  centroids: CentroidMap,
  adjacency?: AdjacencyMap,
): { coord: [number, number]; method: 'weighted' | 'largest-county' } | undefined {
  const pts = fips
    .map((f) => ({ c: centroids.get(f), w: MN_COUNTY_BY_FIPS[f]?.pop.total ?? 1 }))
    .filter((p): p is { c: [number, number]; w: number } => !!p.c)
  if (!pts.length) return undefined
  const W = pts.reduce((s, p) => s + p.w, 0)
  const coord: [number, number] = [
    round4(pts.reduce((s, p) => s + p.c[0] * p.w, 0) / W),
    round4(pts.reduce((s, p) => s + p.c[1] * p.w, 0) / W),
  ]
  const scattered = adjacency?.size
    ? !contiguous(fips.filter((f) => centroids.has(f)), adjacency)
    : Math.max(...pts.map((p) => distanceKm(p.c, coord))) > 100
  if (pts.length > 1 && scattered) {
    const largest = pts.reduce((a, b) => (b.w > a.w ? b : a))
    return { coord: largest.c, method: 'largest-county' }
  }
  return { coord, method: 'weighted' }
}

/** Minnesota bounding box check for coordinates from external files. */
export function inMinnesota([lon, lat]: [number, number]): boolean {
  return lon >= -97.3 && lon <= -89.4 && lat >= 43.4 && lat <= 49.5
}

// ─────────────────────────────── WVAL series ───────────────────────────────

export interface WvalRow {
  site: string
  pathogen: WvalPathogen
  week: string
  value: number
  category: string
  level?: ActivityLevel
  countiesRaw: string
  population: number | null
  source: string
  since: string
}

/** Normalize raw atcp-73re rows (API field names) to typed rows; returns rejects for diagnostics. */
export function parseWvalRows(raw: Record<string, string>[]): {
  rows: WvalRow[]
  rejected: number
  unknownTargets: string[]
  unknownCategories: string[]
} {
  const rows: WvalRow[] = []
  let rejected = 0
  const unknownTargets = new Set<string>()
  const unknownCategories = new Set<string>()
  for (const r of raw) {
    const pathogen = wvalPathogen(r.pathogen_target)
    const site = normalizeSiteId(r.site)
    const week = r.week_end ? toWeekEnding(r.week_end) : null
    const value = num(r.site_wval)
    if (!pathogen) {
      if (r.pathogen_target) unknownTargets.add(r.pathogen_target)
      rejected++
      continue
    }
    if (!site || !week || value == null) {
      rejected++
      continue
    }
    const category = (r.site_wval_category ?? '').trim()
    const level = wvalLevel(category)
    if (category && !level) unknownCategories.add(category)
    rows.push({
      site,
      pathogen,
      week,
      value,
      category,
      level,
      countiesRaw: (r.counties_served ?? '').trim(),
      population: num(r.population_served),
      source: (r.source ?? '').trim(),
      since: r.date_included_in_wval ? (toIsoDate(r.date_included_in_wval) ?? '') : '',
    })
  }
  return { rows, rejected, unknownTargets: [...unknownTargets], unknownCategories: [...unknownCategories] }
}

export function median(values: number[]): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = v.length >> 1
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

const round2 = (v: number) => Math.round(v * 100) / 100

/**
 * Median rounded half-up to 2 decimals, computed in integer hundredths so that e.g. (9.16 + 9.17) / 2
 * gives 9.17 rather than 9.16 from binary floating-point error. CDC publishes WVAL to 2 decimals.
 */
export function median2(values: number[]): number | null {
  const m = median(values.filter(Number.isFinite).map((v) => Math.round(v * 100)))
  return m == null ? null : Math.round(m) / 100
}

/** Minimum reporting sites for a derived statewide median. */
export const MIN_STATE_SITES = 3

export interface SiteLocation {
  coord: [number, number]
  /** How the coordinate was obtained (shown in attrs). */
  basis: string
}

export interface WvalBuildOptions {
  historyStart: string
  centroids: CentroidMap
  adjacency?: AdjacencyMap
  /** Optional per-site coordinates (e.g. CDC's jittered site map), keyed 'ID:nnnn'. */
  siteCoords?: Map<string, SiteLocation>
  /** Pathogens whose cut-points passed checkCutpoints (others get no thresholds). */
  thresholdsFor?: Set<WvalPathogen>
}

const SITE_NOTE =
  'CDC Wastewater Viral Activity Level (WVAL): this site’s viral level relative to its own baseline, so WVAL values and categories can be compared across sites (raw viral concentrations cannot). ' +
  'Reported to CDC NWSS by MDH and/or WastewaterSCAN.'

/** Sites whose last 52 weeks are mostly exactly 1. */
const FLOOR_NOTE =
  ' Most recent weeks are exactly 1, as are most influenza A and RSV site-weeks nationally (fewer for COVID-19): most likely at or below the site’s baseline. A jump from 1 is how the index behaves, not necessarily an error.'

/** Sites with rows dated before their WVAL inclusion date. */
const PRE_NOTE = ' The first weeks, before CDC included the site in WVAL, are a baseline start-up period and can be extreme.'

/** Days a site's last week may trail the newest week for its pathogen before it counts as not reporting. */
export const INACTIVE_DAYS = 28

/** Share of exact-1 values among the last `n` points. */
export function floorShare(points: Point[], n = 52): number {
  const recent = points.slice(-n).filter(([, v]) => v != null)
  if (!recent.length) return 0
  return recent.filter(([, v]) => v === 1).length / recent.length
}

/**
 * True for a row dated before the site's date_included_in_wval. In atcp-73re every site has exactly
 * 6 (COVID-19) or 10 (influenza A, RSV) such weeks — CDC's minimum data requirement before a site is
 * included in WVAL — and their values can be extreme (e.g. RSV 77,542.94 at ID:1008).
 */
export const isPreInclusion = (r: Pick<WvalRow, 'week' | 'since'>) => !!r.since && r.week < r.since

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Build per-site series and the derived statewide median series. */
export function buildWvalSeries(rows: WvalRow[], opts: WvalBuildOptions) {
  const unmatchedCounties = new Set<string>()
  const locationBasis: Record<string, string> = {}
  // Site metadata from its most recent row (ties → larger population).
  const meta = new Map<string, WvalRow>()
  for (const r of rows) {
    const prev = meta.get(r.site)
    if (!prev || r.week > prev.week || (r.week === prev.week && (r.population ?? 0) > (prev.population ?? 0))) meta.set(r.site, r)
  }
  const geoOf = new Map<string, GeoRef>()
  for (const [site, m] of meta) {
    const { fips, unmatched } = parseCountiesServed(m.countiesRaw)
    unmatched.forEach((u) => unmatchedCounties.add(u))
    const geo: GeoRef = { type: 'sewershed', code: site, name: siteName(site, fips, m.countiesRaw) }
    if (fips.length) geo.counties = fips
    if (m.population != null && m.population > 0) geo.population = Math.round(m.population)
    const known = KNOWN_SITES[site]?.coord
    const fromMap = opts.siteCoords?.get(site)
    const centroid = servedCentroid(fips, opts.centroids, opts.adjacency)
    if (known) {
      geo.coord = known
      locationBasis[site] = 'plant location (WastewaterSCAN)'
    } else if (fromMap) {
      geo.coord = fromMap.coord
      locationBasis[site] = fromMap.basis
    } else if (centroid) {
      geo.coord = centroid.coord
      locationBasis[site] =
        centroid.method === 'weighted' ? 'approximate: centroid of served counties' : 'approximate: centroid of largest served county'
    }
    geoOf.set(site, geo)
  }

  // Group rows by site × pathogen; newest week per pathogen (to spot sites that stopped reporting).
  const groups = new Map<string, WvalRow[]>()
  const newestWeek: Partial<Record<WvalPathogen, string>> = {}
  for (const r of rows) {
    if (r.week < opts.historyStart) continue
    const k = `${r.site}|${r.pathogen}`
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
    if (r.week > (newestWeek[r.pathogen] ?? '')) newestWeek[r.pathogen] = r.week
  }

  const sites: Series[] = []
  const inactive: string[] = []
  const notYetIncluded: string[] = []
  for (const [k, list] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [site, pathogen] = k.split('|') as [string, WvalPathogen]
    const byWeek = new Map<string, WvalRow>()
    for (const r of list) byWeek.set(r.week, r) // one row per site-week-pathogen in practice
    const sorted = [...byWeek.values()].sort((a, b) => (a.week < b.week ? -1 : 1))
    const points: Point[] = sorted.map((r) => [r.week, round2(r.value)])
    const last = sorted[sorted.length - 1]
    const geo = geoOf.get(site)!
    const floor = floorShare(points)
    const preWeeks = sorted.filter(isPreInclusion).length
    // Every value so far predates CDC's inclusion of the site in WVAL: publish the values but no level.
    const latestPre = isPreInclusion(last)
    const lagDays = daysBetween(last.week, newestWeek[pathogen] ?? last.week)
    const s = makeSeries({
      source: SOURCE_ID,
      dataset: 'nwss-wval',
      pathogen,
      metric: 'wastewater_level',
      geo,
      label: `${PATHOGEN_NAME[pathogen]} — wastewater viral activity level, ${KNOWN_SITES[site]?.name ?? geo.name}`,
      points,
      note:
        SITE_NOTE +
        (floor >= 0.5 ? FLOOR_NOTE : '') +
        (latestPre
          ? ` All values so far are from before CDC included this site in WVAL (${last.since}), so no activity level is assigned yet.`
          : preWeeks
            ? PRE_NOTE
            : ''),
    })
    if (last.level && !latestPre) {
      s.official = { level: last.level, label: last.category, asOf: last.week, by: 'CDC NWSS WVAL' }
    }
    if ((opts.thresholdsFor?.has(pathogen) ?? true) && !latestPre) s.thresholds = wvalThresholds(pathogen)
    const attrs: Record<string, string> = { site, reportedBy: reporterLabel(last.source) }
    if (locationBasis[site]) attrs.location = locationBasis[site]
    if (last.since) attrs.inWvalSince = last.since
    if (preWeeks) attrs.preInclusionWeeks = String(preWeeks)
    if (floor >= 0.5) attrs.weeksAtOne = `${Math.round(floor * 100)}% of the last ${Math.min(52, points.length)} weeks`
    if (latestPre) {
      if (last.category) attrs.cdcCategory = `${last.category} (before WVAL inclusion)`
      attrs.status = `Not yet included in CDC WVAL (from ${last.since})`
      notYetIncluded.push(`${site} ${pathogen}`)
    } else if (lagDays > INACTIVE_DAYS) {
      attrs.status = `Not reporting since week ending ${last.week}`
      inactive.push(`${site} ${pathogen} (${last.week})`)
    }
    s.attrs = attrs
    sites.push(s)
  }

  // Derived statewide median per pathogen, over sites past their WVAL start-up period.
  const state: Series[] = []
  const stateDiag: Record<string, unknown> = {}
  for (const pathogen of Object.keys(PATHOGEN_NAME) as WvalPathogen[]) {
    const byWeek = new Map<string, number[]>()
    let excludedPre = 0
    for (const r of rows) {
      if (r.pathogen !== pathogen || r.week < opts.historyStart) continue
      if (isPreInclusion(r)) {
        excludedPre++
        continue
      }
      const arr = byWeek.get(r.week) ?? []
      arr.push(r.value)
      byWeek.set(r.week, arr)
    }
    const weeks = [...byWeek.keys()].sort()
    const points: Point[] = []
    let skipped = 0
    for (const w of weeks) {
      const vals = byWeek.get(w)!
      if (vals.length < MIN_STATE_SITES) {
        skipped++
        continue
      }
      points.push([w, median2(vals)!])
    }
    if (!points.length) continue
    const latest = points[points.length - 1][0]
    const latestVals = byWeek.get(latest)!
    const n = latestVals.length
    const atOne = latestVals.filter((v) => v === 1).length
    const first = points[0][0]
    const nFirst = byWeek.get(first)!.length
    const s = makeSeries({
      source: SOURCE_ID,
      dataset: 'nwss-wval',
      pathogen,
      metric: 'wastewater_level',
      geo: STATE_GEO,
      label: `${PATHOGEN_NAME[pathogen]} — wastewater viral activity level, Minnesota (median of ${n} reporting sites, derived)`,
      points,
      note:
        `Derived by MN Pulse from CDC NWSS site data: each week's median Wastewater Viral Activity Level across the Minnesota sites reporting ${PATHOGEN_NAME[pathogen]} that week, ` +
        `leaving out sites still in their baseline start-up period (before CDC's WVAL inclusion date). This is similar to CDC's described approach for state levels (median of site WVALs), but CDC's own state value may differ. ` +
        `Weeks with fewer than ${MIN_STATE_SITES} reporting sites are omitted; ${nFirst} sites reported in the first week shown (${first}) and ${n} in the latest, so the mix of sites behind the median changes over time. ` +
        `A WVAL of exactly 1 is common (most likely at or below a site's baseline), so the median is 1 whenever most sites report 1 (${atOne} of ${n} in the latest week).`,
    })
    if (opts.thresholdsFor?.has(pathogen) ?? true) s.thresholds = wvalThresholds(pathogen)
    s.attrs = { sites: String(n), sitesAtOne: `${atOne}/${n}`, method: 'median of site WVALs (sites past WVAL start-up)' }
    state.push(s)
    stateDiag[pathogen] = { weeks: points.length, weeksSkippedFewSites: skipped, preInclusionRowsExcluded: excludedPre, latest, latestSites: n, latestSitesAtOne: atOne }
  }
  return { sites, state, unmatchedCounties: [...unmatchedCounties], stateDiag, locationBasis, inactive, notYetIncluded }
}

function reporterLabel(source: string): string {
  const parts = source.split(',').map((s) => s.trim()).filter(Boolean)
  const map: Record<string, string> = {
    state_territory: 'MDH',
    wastewaterscan: 'WastewaterSCAN',
    cdc_biobot: 'CDC/Biobot',
    cdc_verily: 'CDC/Verily',
  }
  return parts.map((p) => map[p.toLowerCase()] ?? p).join(' + ') || 'unknown'
}

// ─────────────────────────────── CDC state map (official) ───────────────────────────────

export interface OfficialStateWval {
  pathogen: WvalPathogen
  category: string
  level?: ActivityLevel
  value: number | null
  sites: number | null
  week: string | null
}

/**
 * Parse NWSSWVALStateMap.json (array of objects; text may start with a UTF-8 BOM). Only Minnesota rows
 * are returned. Field names: 'State/Territory', 'State/Territory_WVAL_Category', 'State/Territory_WVAL',
 * 'Number_of_Sites', 'Week_End', 'Pathogen_Target'.
 */
export function parseStateMap(text: string, state = 'Minnesota'): OfficialStateWval[] {
  const data: unknown = JSON.parse(text.replace(/^﻿/, ''))
  const rows = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown[] })?.data) ? (data as { data: unknown[] }).data : null
  if (!rows) throw new Error('NWSSWVALStateMap.json is not an array')
  const out: OfficialStateWval[] = []
  for (const raw of rows as Record<string, unknown>[]) {
    const st = String(raw['State/Territory'] ?? raw.State ?? '').trim().toLowerCase()
    if (st !== state.toLowerCase() && st !== 'mn') continue
    const pathogen = wvalPathogen(String(raw.Pathogen_Target ?? ''))
    if (!pathogen) continue
    const category = String(raw['State/Territory_WVAL_Category'] ?? '').trim()
    const weekRaw = String(raw.Week_End ?? '').trim()
    out.push({
      pathogen,
      category,
      level: wvalLevel(category),
      value: num(raw['State/Territory_WVAL']),
      sites: num(raw.Number_of_Sites),
      week: weekRaw ? toWeekEnding(weekRaw) : null,
    })
  }
  return out
}

/**
 * Attach CDC's official Minnesota category to the derived statewide series when it refers to the
 * same week as the series' latest point. Returns warnings for categories that could not be attached.
 */
export function attachOfficialState(state: Series[], official: OfficialStateWval[]): string[] {
  const warnings: string[] = []
  for (const o of official) {
    const s = state.find((x) => x.pathogen === o.pathogen)
    if (!s || !o.week) continue
    const last = s.points[s.points.length - 1]?.[0]
    if (!o.level) {
      warnings.push(`CDC state WVAL category for ${o.pathogen} not recognized: "${o.category}"`)
      continue
    }
    if (o.week !== last) {
      warnings.push(`CDC state WVAL for ${o.pathogen} is for week ${o.week}, derived series ends ${last}; official level not attached`)
      continue
    }
    s.official = { level: o.level, label: o.category, asOf: o.week, by: 'CDC NWSS WVAL (official Minnesota level)' }
    s.attrs = {
      ...s.attrs,
      ...(o.value != null ? { cdcStateWval: String(o.value) } : {}),
      ...(o.sites != null ? { cdcSites: String(o.sites) } : {}),
    }
  }
  return warnings
}

/** Parse NWSSWVALSiteMap.json into jittered site coordinates for Minnesota sites. */
export function parseSiteMap(text: string, state = 'Minnesota'): Map<string, SiteLocation> {
  const data: unknown = JSON.parse(text.replace(/^﻿/, ''))
  const out = new Map<string, SiteLocation>()
  if (!Array.isArray(data)) return out
  for (const raw of data as Record<string, unknown>[]) {
    const st = String(raw['State/Territory'] ?? '').trim().toLowerCase()
    if (st !== state.toLowerCase() && st !== 'mn') continue
    const site = normalizeSiteId(String(raw.Site ?? ''))
    const lat = num(raw.Latitude_jitter ?? raw.Latitude)
    const lon = num(raw.Longitude_jitter ?? raw.Longitude)
    if (!site || lat == null || lon == null) continue
    const coord: [number, number] = [round4(lon), round4(lat)]
    if (inMinnesota(coord)) out.set(site, { coord, basis: 'approximate: CDC site map (jittered)' })
  }
  return out
}

// ─────────────────────────────── Emerging-pathogen detections ───────────────────────────────

export interface DetectionSpec {
  key: 'measles' | 'h5' | 'mpox'
  datasetId: string
  pathogen: PathogenId
  name: string
  /** Which pcr_target values count for this pathogen. */
  targetOk: (target: string) => boolean
  note: string
}

const COMMON_DETECT_NOTE =
  'Number of Minnesota wastewater sites with at least one sample testing positive during the week (CDC NWSS sample-level data). ' +
  'Weeks with samples but no detections are 0; weeks without samples have no value. A non-detect does not rule out cases in the community.'

export const DETECTION_SPECS: DetectionSpec[] = [
  {
    key: 'measles',
    datasetId: 'akvg-8vrb',
    pathogen: 'measles',
    name: 'Measles',
    targetOk: (t) => t === '' || t.startsWith('mev'),
    note: `${COMMON_DETECT_NOTE} The assay targets wild-type measles virus (pcr_target mev_wt).`,
  },
  {
    key: 'h5',
    datasetId: 'mtpu-urpp',
    pathogen: 'h5n1',
    name: 'H5 avian influenza',
    targetOk: (t) => t === '' || t.includes('h5'),
    note: `${COMMON_DETECT_NOTE} The test detects influenza A subtype H5 (not specifically H5N1). H5 in wastewater can come from animal sources such as birds, dairy cattle or milk products, so a detection does not confirm human infection.`,
  },
  {
    key: 'mpox',
    datasetId: 'xpxn-rzgz',
    pathogen: 'mpox',
    name: 'Mpox',
    // Documented: 'hmpxv' (all clades), 'hmpxv clade i', 'hmpxv clade ii' (not seen in data here); also accept
    // 'mpxv …' spellings (WastewaterSCAN names its assays 'MPXV Clade Ib' / 'MPXV G2R'). 'nvo' (non-variola
    // orthopoxvirus) is not mpox-specific and is excluded.
    targetOk: (t) => t !== 'nvo' && /(^|[^a-z])h?mpxv|mpox/.test(t),
    note: `${COMMON_DETECT_NOTE} Counts detections of any mpox virus clade (pcr_target hmpxv, clade I or clade II); the broader non-variola orthopoxvirus target is excluded.`,
  },
]

export function buildDetectionSeries(raw: Record<string, string>[], spec: DetectionSpec, historyStart: string) {
  const weeks = new Map<string, { tested: Set<string>; detected: Set<string> }>()
  const targets: Record<string, number> = {}
  const siteCounties = new Map<string, string>()
  let skippedDetect = 0
  let skippedTarget = 0
  let maxSample = ''
  let lastDetection = ''
  const lastDetectionSites = new Set<string>()
  let firstSample = ''
  for (const r of raw) {
    const target = (r.pcr_target ?? '').trim().toLowerCase()
    targets[target || '(blank)'] = (targets[target || '(blank)'] ?? 0) + 1
    if (!spec.targetOk(target)) {
      skippedTarget++
      continue
    }
    const detect = (r.pcr_target_detect ?? '').trim().toLowerCase()
    if (detect !== 'yes' && detect !== 'no') {
      skippedDetect++
      continue
    }
    const site = normalizeSiteId(r.site)
    const date = r.sample_collect_date ? toIsoDate(r.sample_collect_date) : null
    const week = date ? toWeekEnding(date) : null
    if (!site || !date || !week) continue
    if (!siteCounties.has(site)) {
      const fips = parseFipsList(r.county_fips)
      siteCounties.set(site, fips.length ? fips.map((f) => MN_COUNTY_BY_FIPS[f]?.name ?? f).join(', ') : (r.counties_served ?? '').trim())
    }
    if (date > maxSample) maxSample = date
    if (!firstSample || date < firstSample) firstSample = date
    if (detect === 'yes' && date >= lastDetection) {
      if (date > lastDetection) lastDetectionSites.clear()
      lastDetection = date
      lastDetectionSites.add(site)
    }
    if (week < historyStart) continue
    const w = weeks.get(week) ?? { tested: new Set(), detected: new Set() }
    w.tested.add(site)
    if (detect === 'yes') w.detected.add(site)
    weeks.set(week, w)
  }
  const diag = {
    rowsForPathogen: raw.length,
    targets,
    skippedTarget,
    skippedDetect,
    sites: siteCounties.size,
    firstSample: firstSample || null,
    latestSample: maxSample || null,
    lastDetection: lastDetection || null,
  }
  const sorted = [...weeks.keys()].sort()
  if (!sorted.length) return { series: undefined, diag }
  const points: Point[] = sorted.map((w) => [w, weeks.get(w)!.detected.size])
  const latest = sorted[sorted.length - 1]
  const lw = weeks.get(latest)!
  const s = makeSeries({
    source: SOURCE_ID,
    dataset: 'nwss-detections',
    pathogen: spec.pathogen,
    metric: 'ww_detections',
    geo: STATE_GEO,
    label: `${spec.name} — Minnesota wastewater sites with a detection (CDC NWSS)`,
    points,
    // The newest week is still filling in when its Saturday is after the last sample collected.
    provisionalFrom: latest > maxSample ? latest : undefined,
    note: spec.note,
  })
  const label = (id: string) => (siteCounties.get(id) ? `${siteCounties.get(id)} (${id})` : id)
  const attrs: Record<string, string> = {
    sitesTested: String(lw.tested.size),
    lastDetection: lastDetection
      ? `${lastDetection} — ${[...lastDetectionSites].sort().map(label).join('; ')}`
      : `none since testing began ${firstSample}`,
  }
  if (lw.detected.size) attrs.detectedAt = [...lw.detected].sort().map(label).join('; ')
  s.attrs = attrs
  return { series: s, diag }
}
