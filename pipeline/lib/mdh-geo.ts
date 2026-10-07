// Geography helpers for the MDH source: region-scheme detection, region/county/site GeoRefs and
// sewershed coordinates.
//
// MDH publishes regional data under more than one scheme, and a county is assigned differently
// depending on the scheme:
//   * 8 SCHSAC / health-care-coalition regions (Central, Metro, Northeast, Northwest, South Central,
//     Southeast, Southwest, West Central): geo type 'mdh-region'.
//   * 7 Field Services epidemiology districts (South Central and Southwest merged into one "South"
//     district, and several counties shifted): geo type 'mdh-district'.
//   * Twin Cities metro (7 counties) vs Greater Minnesota. RESP-NET labels these "7-co" and "80-co".
//   * A fallback 'wastewater' scheme (South Central present, no West Central) with no counties attached.
//     The real MDH wastewater files (CI run 2026-10-07) use the Field Services districts, with the
//     combined South district labelled "Southwest": every plant's region matched its county's district.
// The scheme is detected from the set of region labels in each file and never assumed.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { geoCentroid } from 'd3-geo'
import type { GeoRef } from '../../shared/types.ts'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS, countyByName, type MnCounty } from '../../shared/geo/mnCounties.ts'
import { STATE_GEO } from './series.ts'

export type RegionToken =
  | 'State'
  | 'Metro'
  | 'Greater Minnesota'
  | 'Northwest'
  | 'Northeast'
  | 'Central'
  | 'West Central'
  | 'South Central'
  | 'Southwest'
  | 'Southeast'
  /** Combined Southwest/South Central district. */
  | 'South'

export type RegionScheme = 'schsac' | 'district' | 'wastewater' | 'metro-greater'

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Map a region label as MDH writes it to a canonical token; null when it is not a region label. */
export function regionToken(raw: string): RegionToken | null {
  let s = squash(raw)
  if (!s) return null
  if (/^(state|statewide|minnesota|mn|total|all|overall|all regions|state total|statewide total|minnesota total|mn total)$/.test(s))
    return 'State'
  if (/^(greater (mn|minnesota)|non ?metro|outstate( mn| minnesota)?|outside (the )?metro)( region| area)?$/.test(s))
    return 'Greater Minnesota'
  // RESP-NET geography labels: "7-co" (7-county Twin Cities metro) and "80-co" (the other 80 counties).
  if (/^(7|seven) ?co(unty|unties)?( metro| area)?$/.test(s)) return 'Metro'
  if (/^(80|eighty) ?co(unty|unties)?( area)?$/.test(s)) return 'Greater Minnesota'
  if (/^(the )?(twin cities )?((7|seven) county )?metro(politan)?( area| region| district| twin cities)?$/.test(s)) return 'Metro'
  if (/^twin cities( metro| area)?$/.test(s)) return 'Metro'
  if (/^(twin cities )?metro(politan)? (7|seven) county( area| region| metro)?$/.test(s)) return 'Metro'
  s = s
    .replace(/\b(region|regions|district|districts|hcc|health care coalition|healthcare coalition|area|zone|of minnesota|minnesota|mn)\b/g, ' ')
    .replace(/\bnorth west\b/g, 'northwest')
    .replace(/\bnorth east\b/g, 'northeast')
    .replace(/\bsouth west\b/g, 'southwest')
    .replace(/\bsouth east\b/g, 'southeast')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^(southwest (and )?south central|south central (and )?southwest|south|southern)$/.test(s)) return 'South'
  const table: Record<string, RegionToken> = {
    northwest: 'Northwest',
    northeast: 'Northeast',
    central: 'Central',
    'west central': 'West Central',
    'south central': 'South Central',
    southwest: 'Southwest',
    southeast: 'Southeast',
    metro: 'Metro',
  }
  return table[s] ?? null
}

/**
 * Detect which regional scheme a set of region labels belongs to (null when unclear).
 * `wastewater`: the file is a wastewater file, so a South-Central-without-West-Central label set is the
 * plant-based fallback scheme; any other file with a subset of the 8 SCHSAC labels is SCHSAC.
 */
export function detectRegionScheme(labels: Iterable<string>, opts: { wastewater?: boolean } = {}): RegionScheme | null {
  const t = new Set<RegionToken>()
  for (const l of labels) {
    const tok = regionToken(l)
    if (tok && tok !== 'State') t.add(tok)
  }
  if (t.size === 0) return null
  // The 7-county metro is the same in every scheme, so "Metro" (+ statewide) alone is unambiguous.
  if (t.size === 1 && t.has('Metro')) return 'metro-greater'
  if (t.has('Greater Minnesota')) return [...t].every((x) => x === 'Metro' || x === 'Greater Minnesota') ? 'metro-greater' : null
  const wc = t.has('West Central')
  const sc = t.has('South Central')
  const sw = t.has('Southwest')
  if (t.has('South') && !sc && !sw) return t.size >= 3 ? 'district' : null
  if (wc && sc && sw) return 'schsac'
  if (wc && sw && !sc) return t.size >= 4 ? 'district' : null
  if (!wc && sc) return t.size >= 3 ? (opts.wastewater ? 'wastewater' : 'schsac') : null
  return null
}

const sumPop = (cs: MnCounty[]) => cs.reduce((n, c) => n + c.pop.total, 0)
const slug = (s: string) => squash(s).replace(/ /g, '-')

/** GeoRef for a region label under a detected scheme; null when the label does not belong to it. */
export function regionGeo(raw: string, scheme: RegionScheme): GeoRef | null {
  const tok = regionToken(raw)
  if (!tok) return null
  if (tok === 'State') return STATE_GEO
  switch (scheme) {
    case 'schsac': {
      if (tok === 'South' || tok === 'Greater Minnesota') return null
      const cs = MN_COUNTIES.filter((c) => c.schsacRegion === tok)
      return { type: 'mdh-region', code: tok, name: `${tok} region`, counties: cs.map((c) => c.fips), population: sumPop(cs) }
    }
    case 'district': {
      if (tok === 'South Central' || tok === 'Greater Minnesota') return null
      const d = tok === 'Southwest' || tok === 'South' ? 'South' : tok
      const cs = MN_COUNTIES.filter((c) => c.fieldDistrict === d)
      const name = d === 'South' ? 'South (Southwest/South Central) district' : `${d} district`
      return { type: 'mdh-district', code: d, name, counties: cs.map((c) => c.fips), population: sumPop(cs) }
    }
    case 'wastewater': {
      if (tok === 'South' || tok === 'Greater Minnesota') return null
      // Plant-based wastewater regions: county membership is not published, so none are attached.
      return { type: 'mdh-region', code: `ww-${slug(tok)}`, name: `${tok} (MDH wastewater region)` }
    }
    case 'metro-greater': {
      if (tok === 'Metro') {
        const cs = MN_COUNTIES.filter((c) => c.schsacRegion === 'Metro')
        return { type: 'mdh-region', code: 'Metro', name: 'Twin Cities metro (7 counties)', counties: cs.map((c) => c.fips), population: sumPop(cs) }
      }
      if (tok === 'Greater Minnesota') {
        const cs = MN_COUNTIES.filter((c) => c.schsacRegion !== 'Metro')
        return { type: 'mdh-region', code: 'Greater Minnesota', name: 'Greater Minnesota', counties: cs.map((c) => c.fips), population: sumPop(cs) }
      }
      return null
    }
  }
}

const STATEWIDE_WORDS = /^(total|statewide|minnesota|state|mn|all|overall|all counties|state total|statewide total|minnesota total)$/

/** County GeoRef from a county name or 5-digit FIPS; STATE_GEO for statewide totals; null otherwise. */
export function countyGeo(raw: string): GeoRef | null {
  const s = raw.trim()
  if (!s) return null
  if (STATEWIDE_WORDS.test(squash(s))) return STATE_GEO
  let c: MnCounty | undefined
  if (/^27\d{3}$/.test(s)) c = MN_COUNTY_BY_FIPS[s]
  else if (/^\d{1,3}$/.test(s)) c = MN_COUNTY_BY_FIPS[`27${s.padStart(3, '0')}`]
  else c = countyByName(s)
  return c ? { type: 'county', code: c.fips, name: `${c.name} County` } : null
}

/** Parse a list of county names ("Blue Earth, Nicollet" / "Anoka; Hennepin") into FIPS codes. */
export function countyList(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split(/[,;/|]+|\band\b/)) {
    const c = countyByName(part.trim())
    if (c && !out.includes(c.fips)) out.push(c.fips)
  }
  return out
}

// ───────────────────────── Sewershed coordinates ─────────────────────────

/**
 * Host cities of Minnesota wastewater treatment plants and the county each lies in (public
 * geography, not surveillance data). Used only to place a plant on the map when no MDH file gives its
 * county or coordinates: the point is that county's centroid, flagged with attrs.coordBasis, and the
 * county is NOT written to geo.counties (it is where the plant is, not the area it serves).
 * Metropolitan Council plants serve many counties, so they are deliberately absent.
 */
const PLANT_CITY_COUNTY: Record<string, string> = {
  'albert lea': 'Freeborn',
  alexandria: 'Douglas',
  austin: 'Mower',
  bemidji: 'Beltrami',
  brainerd: 'Crow Wing',
  buffalo: 'Wright',
  chisholm: 'St. Louis',
  cloquet: 'Carlton',
  'detroit lakes': 'Becker',
  duluth: 'St. Louis',
  'elk river': 'Sherburne',
  faribault: 'Rice',
  'fergus falls': 'Otter Tail',
  glencoe: 'McLeod',
  'grand rapids': 'Itasca',
  hibbing: 'St. Louis',
  hinckley: 'Pine',
  hutchinson: 'McLeod',
  lafayette: 'Nicollet',
  lanesboro: 'Fillmore',
  'le sueur': 'Le Sueur',
  'little falls': 'Morrison',
  mankato: 'Blue Earth',
  marshall: 'Lyon',
  moorhead: 'Clay',
  mora: 'Kanabec',
  'new ulm': 'Brown',
  northfield: 'Rice',
  owatonna: 'Steele',
  'red wing': 'Goodhue',
  rochester: 'Olmsted',
  'st cloud': 'Stearns',
  spicer: 'Kandiyohi',
  'thief river falls': 'Pennington',
  willmar: 'Kandiyohi',
  winona: 'Winona',
  worthington: 'Nobles',
}

/** Plant-name words that are not part of the host city ("Mankato WWTP", "Duluth (WLSSD) WWTP*"). */
const PLANT_WORDS =
  /\b(wwtp|wwtf|wrf|wrrf|wpcp|wpcf|wastewater|waste water|treatment|plant|facility|water|reclamation|resource|recovery|pollution|control|sewage|sanitary|district|city|of|public|utilities|commission|mn|minnesota|wlssd|cirssd)\b/g

/** Normalized host-city key of a plant name, or '' when nothing is left. */
export function plantCityKey(siteName: string): string {
  return squash(siteName.replace(/\([^)]*\)/g, ' ').replace(/\*/g, ' '))
    .replace(/\bsaint\b/g, 'st')
    .replace(PLANT_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** County FIPS of a plant's host city, only when the plant name is exactly that city (plus plant words). */
export function plantCounty(siteName: string): string | undefined {
  const county = PLANT_CITY_COUNTY[plantCityKey(siteName)]
  return county ? countyByName(county)?.fips : undefined
}

/** Exposed for tests: every plant city must resolve to a real county. */
export const PLANT_CITIES = PLANT_CITY_COUNTY

let centroids: Map<string, [number, number]> | null | undefined

function countyCentroids(rootDir: string): Map<string, [number, number]> | null {
  if (centroids !== undefined) return centroids
  try {
    const gj = JSON.parse(readFileSync(path.join(rootDir, 'public', 'geo', 'mn-counties.geojson'), 'utf8')) as {
      features: { properties: { fips: string }; geometry: unknown }[]
    }
    centroids = new Map()
    for (const f of gj.features) {
      const [lon, lat] = geoCentroid(f as unknown as Parameters<typeof geoCentroid>[0])
      if (Number.isFinite(lon) && Number.isFinite(lat)) centroids.set(f.properties.fips, [lon, lat])
    }
  } catch {
    centroids = null
  }
  return centroids
}

/** Population-weighted centroid [lon, lat] of a set of counties (from public/geo/mn-counties.geojson). */
export function countiesCentroid(fips: string[], rootDir: string): [number, number] | undefined {
  const cents = countyCentroids(rootDir)
  if (!cents || !fips.length) return undefined
  let w = 0
  let lon = 0
  let lat = 0
  for (const f of fips) {
    const c = cents.get(f)
    if (!c) continue
    const pop = MN_COUNTY_BY_FIPS[f]?.pop.total ?? 1
    w += pop
    lon += c[0] * pop
    lat += c[1] * pop
  }
  if (!w) return undefined
  return [Math.round((lon / w) * 1e4) / 1e4, Math.round((lat / w) * 1e4) / 1e4]
}
