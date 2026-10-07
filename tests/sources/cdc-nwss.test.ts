import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DETECTION_SPECS, attachOfficialState, buildDetectionSeries, buildWvalSeries, checkCutpoints, countyAdjacency, countyCentroids, inMinnesota, median,
  normalizeSiteId, parseCountiesServed, parseFipsList, parseStateMap, parseWvalRows, servedCentroid, siteName,
  wvalLevel, wvalPathogen, wvalThresholds,
} from '../../pipeline/lib/cdc-nwss-parse.ts'

const HEADER = [
  'state_territory', 'counties_served', 'site', 'population_served', 'source', 'site_wval', 'site_wval_category',
  'date_included_in_wval', 'week_end', 'pathogen_target', 'date_updated',
] as const

// Real Minnesota rows from data.cdc.gov atcp-73re (PopHIVE mirror, date_updated 2026-10-02 11:03).
const WVAL_CSV_ROWS: string[][] = [
  ['Minnesota', 'Olmsted', 'ID:1017', '120000', 'WastewaterSCAN', '3.76', 'Low', '2023-01-13', '2026-09-26', 'Influenza A virus', '2026-10-02 11:03'],
  ['Minnesota', 'Olmsted', 'ID:1017', '121395', 'State_Territory, WastewaterSCAN', '1.42', 'Very Low', '2022-05-22', '2026-09-26', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Otter Tail', 'ID:1018', '14119', 'State_Territory', '56.35', 'Very High', '2025-09-09', '2026-09-26', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Anoka, Dakota, Hennepin, Ramsey, Washington', 'ID:1021', '1955095', 'State_Territory', '2.74', 'Low', '2022-05-24', '2026-09-26', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Washington', 'ID:1029', '114148', 'State_Territory', '5.04', 'Moderate', '2022-05-24', '2026-09-26', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Itasca', 'ID:2713', '11200', 'State_Territory', '31.57', 'Very High', '2026-09-28', '2026-09-26', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Dakota, Hennepin, Scott', 'ID:997', '255624', 'State_Territory', '6.29', 'Moderate', '2022-05-24', '2026-09-26', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Olmsted', 'ID:1017', '121395', 'State_Territory, WastewaterSCAN', '1.56', 'Very Low', '2022-05-22', '2026-09-19', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Anoka, Dakota, Hennepin, Ramsey, Washington', 'ID:1021', '1955095', 'State_Territory', '1.76', 'Very Low', '2022-05-24', '2026-09-19', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Washington', 'ID:1029', '114148', 'State_Territory', '4.21', 'Low', '2022-05-24', '2026-09-19', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Dakota, Hennepin, Scott', 'ID:997', '255624', 'State_Territory', '1', 'Very Low', '2022-05-24', '2026-09-19', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Otter Tail', 'ID:1018', '14119', 'State_Territory', '1', 'Very Low', '2025-09-09', '2026-09-19', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Carlton, Saint Louis', 'ID:1024', '130086', 'State_Territory', '1', 'Very Low', '2022-05-24', '2026-09-05', 'SARS-CoV-2', '2026-10-02 11:03'],
  ['Minnesota', 'Carlton, Saint Louis', 'ID:1024', '130086', 'State_Territory', '8', 'High', '2022-05-24', '2024-09-28', 'SARS-CoV-2', '2026-10-02 11:03'],
  // Site that stopped reporting in 2022.
  ['Minnesota', 'Koochiching', 'ID:1009', '6371', 'State_Territory', '12.59', 'Very High', '2022-05-23', '2022-12-17', 'SARS-CoV-2', '2026-10-02 11:03'],
  // RSV week 2026-02-07: ID:1008 is still in its WVAL start-up period (included 2026-03-18) with an extreme value.
  ['Minnesota', 'Kandiyohi', 'ID:1008', '21015', 'State_Territory', '77542.94', 'Very High', '2026-03-18', '2026-02-07', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Olmsted', 'ID:1017', '121395', 'State_Territory, WastewaterSCAN', '5.12', 'Moderate', '2023-01-13', '2026-02-07', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Anoka, Dakota, Hennepin, Ramsey, Washington', 'ID:1021', '1955095', 'State_Territory', '1', 'Very Low', '2025-09-09', '2026-02-07', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Benton, Sherburne, Stearns', 'ID:1028', '120961', 'State_Territory, WastewaterSCAN', '4.21', 'Moderate', '2023-06-12', '2026-02-07', 'RSV', '2026-10-02 11:03'],
  ['Minnesota', 'Blue Earth, Nicollet', 'ID:993', '70000', 'State_Territory, WastewaterSCAN', '3.95', 'Moderate', '2022-11-07', '2026-02-07', 'RSV', '2026-10-02 11:03'],
]
const wvalRaw = () => WVAL_CSV_ROWS.map((r) => Object.fromEntries(HEADER.map((h, i) => [h, r[i]])) as Record<string, string>)

const countyGeo = JSON.parse(readFileSync(join(process.cwd(), 'public/geo/mn-counties.geojson'), 'utf8'))
const centroids = countyCentroids(countyGeo)
const adjacency = countyAdjacency(countyGeo)

describe('cdc-nwss mapping helpers', () => {
  it('maps CDC pathogen targets and WVAL categories', () => {
    expect(wvalPathogen('SARS-CoV-2')).toBe('covid')
    expect(wvalPathogen('Influenza A virus')).toBe('influenza-a')
    expect(wvalPathogen('RSV')).toBe('rsv')
    expect(wvalPathogen('Measles')).toBeUndefined()
    expect(wvalLevel('Very Low')).toBe('minimal')
    expect(wvalLevel('Low')).toBe('low')
    expect(wvalLevel('Moderate')).toBe('moderate')
    expect(wvalLevel('High')).toBe('high')
    expect(wvalLevel('Very High')).toBe('very-high')
    expect(wvalLevel('No Data')).toBeUndefined()
  })

  it('converts CDC upper-bound cut-points to lower-bound thresholds', () => {
    expect(wvalThresholds('covid')).toMatchObject({ low: 2.6, moderate: 4.9, high: 7.9, veryHigh: 11.6 })
    expect(wvalThresholds('influenza-a')).toMatchObject({ low: 2.4, moderate: 5.5, high: 10.2, veryHigh: 15.6 })
    expect(wvalThresholds('rsv')).toMatchObject({ low: 1.7, moderate: 3.4, high: 5.4, veryHigh: 8.1 })
  })

  it('cut-points agree with CDC categories on real rows, tolerating rounding at the boundary', () => {
    const { rows } = parseWvalRows(wvalRaw())
    const check = checkCutpoints(rows.map((r) => ({ pathogen: r.pathogen, value: r.value, level: r.level! })))
    expect(check.covid).toMatchObject({ checked: 11, mismatches: 0 })
    expect(check.rsv).toMatchObject({ checked: 8, mismatches: 0 })
    // CDC rows with WVAL 2.6 are labelled both Very Low and Low (unrounded value decides) — both accepted.
    const edge = checkCutpoints([
      { pathogen: 'covid', value: 2.6, level: 'minimal' },
      { pathogen: 'covid', value: 2.6, level: 'low' },
      { pathogen: 'influenza-a', value: 5.55, level: 'moderate' },
    ])
    expect(edge.covid?.mismatches).toBe(0)
    expect(edge['influenza-a']?.mismatches).toBe(0)
    // A revised scale would show up as mismatches (Metro Plant 2.74 relabelled Moderate).
    expect(checkCutpoints([{ pathogen: 'covid', value: 2.74, level: 'moderate' }]).covid?.mismatches).toBe(1)
  })

  it('maps county names (Saint/Mc spellings) to FIPS', () => {
    expect(parseCountiesServed('Carlton, Saint Louis')).toEqual({ fips: ['27017', '27137'], unmatched: [] })
    expect(parseCountiesServed('Mcleod').fips).toEqual(['27085'])
    expect(parseCountiesServed('Anoka, Dakota, Hennepin, Ramsey, Washington').fips).toEqual(['27003', '27037', '27053', '27123', '27163'])
    expect(parseCountiesServed('Otter Tail, Nowhere').unmatched).toEqual(['Nowhere'])
    expect(parseFipsList('27145, 27141, 27009')).toEqual(['27009', '27141', '27145'])
    expect(normalizeSiteId('1021')).toBe('ID:1021')
    expect(normalizeSiteId('ID:993')).toBe('ID:993')
  })

  it('names sites', () => {
    expect(siteName('ID:1021', ['27003', '27037', '27053', '27123', '27163'])).toBe('Metro Plant (Anoka, Dakota, Hennepin, Ramsey, Washington)')
    expect(siteName('ID:1029', ['27163'])).toBe('Washington County wastewater site (ID:1029)')
    expect(siteName('ID:997', ['27037', '27053', '27139'])).toBe('Dakota, Hennepin & Scott counties wastewater site (ID:997)')
  })

  it('places sites at served-county centroids', () => {
    const metro = servedCentroid(['27003', '27037', '27053', '27123', '27163'], centroids)!
    expect(metro.method).toBe('weighted')
    expect(metro.coord[0]).toBeGreaterThan(-93.6)
    expect(metro.coord[0]).toBeLessThan(-92.9)
    expect(metro.coord[1]).toBeGreaterThan(44.8)
    expect(metro.coord[1]).toBeLessThan(45.2)
    // ID:1000 lists two non-adjacent counties (Dodge, Douglas): use the more populous county, not a midpoint.
    const odd = servedCentroid(['27039', '27041'], centroids)!
    expect(odd.method).toBe('largest-county')
    expect(odd.coord).toEqual(centroids.get('27041'))
    expect(inMinnesota(odd.coord)).toBe(true)
    // With adjacency: ID:1007 'Kandiyohi, Mille Lacs' is not contiguous; ID:1024 'Carlton, Saint Louis' and Metro are.
    expect(adjacency.get('27053')?.has('27037')).toBe(true) // Hennepin borders Dakota
    expect(servedCentroid(['27067', '27095'], centroids, adjacency)!.method).toBe('largest-county')
    expect(servedCentroid(['27017', '27137'], centroids, adjacency)!.method).toBe('weighted')
    expect(servedCentroid(['27003', '27037', '27053', '27123', '27163'], centroids, adjacency)!.method).toBe('weighted')
    expect(servedCentroid([], centroids)).toBeUndefined()
  })

  it('median', () => {
    expect(median([1, 1.42, 2.74, 5.04, 6.29])).toBe(2.74)
    expect(median([1, 2])).toBe(1.5)
    expect(median([])).toBeNull()
  })
})

describe('cdc-nwss WVAL series', () => {
  const { rows, rejected } = parseWvalRows(wvalRaw())
  const built = buildWvalSeries(rows, { historyStart: '2021-07-01', centroids, adjacency })

  it('parses every real row', () => {
    expect(rejected).toBe(0)
    expect(rows).toHaveLength(WVAL_CSV_ROWS.length)
  })

  it('builds per-site series with CDC categories as the official level', () => {
    const metro = built.sites.find((s) => s.id === 'cdc-nwss:nwss-wval:covid:wastewater_level:sewershed:ID:1021')!
    expect(metro.points).toEqual([['2026-09-19', 1.76], ['2026-09-26', 2.74]])
    expect(metro.official).toEqual({ level: 'low', label: 'Low', asOf: '2026-09-26', by: 'CDC NWSS WVAL' })
    expect(metro.geo).toMatchObject({ type: 'sewershed', code: 'ID:1021', population: 1955095, counties: ['27003', '27037', '27053', '27123', '27163'] })
    expect(metro.geo.coord).toHaveLength(2)
    expect(metro.unit).toBe('index')
    expect(metro.thresholds?.low).toBe(2.6)

    const otter = built.sites.find((s) => s.id === 'cdc-nwss:nwss-wval:rsv:wastewater_level:sewershed:ID:1018')!
    expect(otter.official?.level).toBe('very-high')
    expect(otter.points.at(-1)).toEqual(['2026-09-26', 56.35])
    // A WVAL of exactly 1 is flagged for every pathogen/source (here 1 of 2 weeks), with the index caveat.
    expect(otter.attrs?.weeksAtOne).toBe('50% of the last 2 weeks')
    expect(otter.note).toMatch(/at or below the site’s baseline/)
    expect(metro.attrs?.weeksAtOne).toBeUndefined()

    // WastewaterSCAN plant: known name and plant coordinates.
    const roch = built.sites.find((s) => s.id === 'cdc-nwss:nwss-wval:influenza-a:wastewater_level:sewershed:ID:1017')!
    expect(roch.geo.name).toBe('Rochester Water Reclamation Plant (Olmsted)')
    expect(roch.geo.coord).toEqual([-92.4717, 44.0048])
    expect(roch.attrs?.reportedBy).toBe('WastewaterSCAN')

    // Inactive site keeps its history; its official category applies to its last reported week.
    const duluth = built.sites.find((s) => s.geo.code === 'ID:1024')!
    expect(duluth.geo.counties).toEqual(['27017', '27137'])
    expect(duluth.points).toEqual([['2024-09-28', 8], ['2026-09-05', 1]])
    expect(duluth.official?.asOf).toBe('2026-09-05')
    expect(duluth.attrs?.status).toBeUndefined() // 3 weeks behind the newest COVID week: normal lag

    // Long-inactive site: history and its last CDC category kept, but marked as not reporting.
    const kooch = built.sites.find((s) => s.geo.code === 'ID:1009')!
    expect(kooch.official).toMatchObject({ level: 'very-high', asOf: '2022-12-17' })
    expect(kooch.attrs?.status).toBe('Not reporting since week ending 2022-12-17')
    expect(built.inactive).toContain('ID:1009 covid (2022-12-17)')
    expect(built.inactive.some((x) => x.startsWith('ID:1024'))).toBe(false)
  })

  it('flags WVAL start-up weeks and assigns no level when every value predates inclusion', () => {
    // ID:2713 (Itasca) RSV: included in WVAL from 2026-09-28, after its latest week (2026-09-26).
    const itasca = built.sites.find((s) => s.id === 'cdc-nwss:nwss-wval:rsv:wastewater_level:sewershed:ID:2713')!
    expect(itasca.points).toEqual([['2026-09-26', 31.57]]) // value kept, not altered
    expect(itasca.official).toBeUndefined()
    expect(itasca.thresholds).toBeUndefined()
    expect(itasca.attrs).toMatchObject({
      inWvalSince: '2026-09-28',
      preInclusionWeeks: '1',
      cdcCategory: 'Very High (before WVAL inclusion)',
      status: 'Not yet included in CDC WVAL (from 2026-09-28)',
    })
    expect(itasca.note).toMatch(/no activity level is assigned yet/)
    // ID:1008 RSV has only its start-up week in this fixture, so it is in the same state.
    expect(built.notYetIncluded).toEqual(['ID:1008 rsv', 'ID:2713 rsv'])
    const kandi = built.sites.find((s) => s.id === 'cdc-nwss:nwss-wval:rsv:wastewater_level:sewershed:ID:1008')!
    expect(kandi.points).toEqual([['2026-02-07', 77542.94]])
    expect(kandi.attrs?.preInclusionWeeks).toBe('1')
    // A site with later, included weeks keeps its level; the start-up weeks are only flagged.
    // (Second row = real ID:1008 RSV row for 2026-09-26: WVAL 1, Very Low, included 2026-03-18.)
    const later = buildWvalSeries(
      parseWvalRows([
        ...wvalRaw().filter((r) => r.site === 'ID:1008'),
        { ...wvalRaw().find((r) => r.site === 'ID:1008')!, site_wval: '1', site_wval_category: 'Very Low', week_end: '2026-09-26' },
      ]).rows,
      { historyStart: '2021-07-01', centroids },
    ).sites[0]
    expect(later.official?.level).toBe('minimal')
    expect(later.thresholds).toBeDefined()
    expect(later.attrs).toMatchObject({ preInclusionWeeks: '1' })
    expect(later.attrs?.status).toBeUndefined()
    expect(later.note).toMatch(/baseline start-up period/)
  })

  it('derives a statewide weekly median only for weeks with ≥3 reporting sites', () => {
    const covid = built.state.find((s) => s.pathogen === 'covid')!
    expect(covid.id).toBe('cdc-nwss:nwss-wval:covid:wastewater_level:state:27')
    // 2026-09-19: 1.56, 1.76, 4.21, 1 → median 1.66; 2026-09-26: 1.42, 2.74, 5.04, 6.29 → 3.89.
    // 2024-09-28 and 2026-09-05 have only one site in this fixture and are omitted.
    expect(covid.points).toEqual([['2026-09-19', 1.66], ['2026-09-26', 3.89]])
    expect(covid.attrs).toMatchObject({ sites: '4', sitesAtOne: '0/4' })
    expect(covid.thresholds).toMatchObject({ low: 2.6, moderate: 4.9, high: 7.9, veryHigh: 11.6, by: 'CDC NWSS WVAL cut-points (Aug 2026)' })
    expect(covid.label).toContain('median of 4 reporting sites, derived')
    expect(covid.official).toBeUndefined()
    expect(covid.note).toMatch(/0 of 4 in the latest week/)
  })

  it('leaves sites in their WVAL start-up period out of the statewide median', () => {
    const rsv = built.state.find((s) => s.pathogen === 'rsv')!
    // 2026-02-07: ID:1008 (77,542.94, pre-inclusion) excluded → median of 1, 3.95, 4.21, 5.12 = 4.08 (not 4.21).
    // 2026-09-19 / 2026-09-26 have fewer than 3 included RSV sites in this fixture and are omitted.
    expect(rsv.points).toEqual([['2026-02-07', 4.08]])
    expect(rsv.attrs).toMatchObject({ sites: '4', sitesAtOne: '1/4' })
    expect(built.stateDiag.rsv).toMatchObject({ preInclusionRowsExcluded: 2 })
  })
})

describe('cdc-nwss official state map', () => {
  it('attaches CDC\'s state category only when it matches the derived series\' latest week', () => {
    const { rows } = parseWvalRows(wvalRaw())
    const { state } = buildWvalSeries(rows, { historyStart: '2021-07-01', centroids })
    // Illustrative values (cdc.gov is unreachable from the dev sandbox); field names from the research notes.
    const warnings = attachOfficialState(state, [
      { pathogen: 'covid', category: 'Low', level: 'low', value: 2.9, sites: 27, week: '2026-09-26' },
      { pathogen: 'influenza-a', category: 'Very Low', level: 'minimal', value: 1, sites: 24, week: '2026-09-26' },
    ])
    const covid = state.find((s) => s.pathogen === 'covid')!
    expect(covid.official).toEqual({ level: 'low', label: 'Low', asOf: '2026-09-26', by: 'CDC NWSS WVAL (official Minnesota level)' })
    expect(covid.attrs).toMatchObject({ sites: '4', cdcStateWval: '2.9', cdcSites: '27' })
    expect(warnings).toEqual([]) // no derived influenza series in this fixture → nothing to attach to
    const stale = attachOfficialState(state, [{ pathogen: 'covid', category: 'High', level: 'high', value: 9, sites: 27, week: '2026-09-19' }])
    expect(stale[0]).toMatch(/for week 2026-09-19/)
    expect(covid.official?.level).toBe('low')
  })

  it('parses the BOM-prefixed CDC state JSON (documented field names)', () => {
    // Illustrative values with the documented field names; replace with a real row from the first CI run.
    const text =
      '﻿' +
      JSON.stringify([
        { 'State/Territory': 'Minnesota', 'State/Territory_WVAL_Category': 'Very Low', 'State/Territory_WVAL': '1.62', Number_of_Sites: '27', Week_End: '2026-09-26', Pathogen_Target: 'SARS-CoV-2' },
        { 'State/Territory': 'Wisconsin', 'State/Territory_WVAL_Category': 'Low', 'State/Territory_WVAL': '3.1', Number_of_Sites: '60', Week_End: '2026-09-26', Pathogen_Target: 'SARS-CoV-2' },
      ])
    expect(parseStateMap(text)).toEqual([
      { pathogen: 'covid', category: 'Very Low', level: 'minimal', value: 1.62, sites: 27, week: '2026-09-26' },
    ])
  })
})

describe('cdc-nwss emerging-pathogen detections', () => {
  // Real Minnesota rows from data.cdc.gov akvg-8vrb (measles; PopHIVE mirror, updated 2026-10-02).
  const row = (site: string, county_fips: string, counties_served: string, sample_collect_date: string, pcr_target_detect: string) => ({
    site, state_territory: 'mn', county_fips, counties_served, sample_collect_date, pcr_target: 'mev_wt', pcr_target_detect,
  })
  const measles = [
    row('1017', '27109', 'Olmsted', '2025-10-13', 'yes'),
    row('1003', '27049', 'Goodhue', '2025-10-13', 'no'),
    row('993', '27103, 27013', 'Blue Earth, Nicollet', '2025-10-13', 'no'),
    row('1028', '27145, 27141, 27009', 'Benton, Sherburne, Stearns', '2025-10-13', 'no'),
    row('1017', '27109', 'Olmsted', '2025-10-15', 'yes'),
    row('1017', '27109', 'Olmsted', '2025-10-22', 'yes'),
    row('1003', '27049', 'Goodhue', '2025-10-22', 'yes'),
    row('993', '27103, 27013', 'Blue Earth, Nicollet', '2025-10-22', 'no'),
    row('1028', '27145, 27141, 27009', 'Benton, Sherburne, Stearns', '2025-10-22', 'no'),
    row('1017', '27109', 'Olmsted', '2026-09-25', 'no'),
    row('1003', '27049', 'Goodhue', '2026-09-25', 'no'),
    row('1017', '27109', 'Olmsted', '2026-09-28', 'no'),
    row('993', '27103, 27013', 'Blue Earth, Nicollet', '2026-09-28', 'no'),
    row('1028', '27145, 27141, 27009', 'Benton, Sherburne, Stearns', '2026-09-28', 'no'),
  ]
  const spec = DETECTION_SPECS.find((s) => s.key === 'measles')!

  it('counts sites with ≥1 detection per MMWR week; weeks without samples are absent', () => {
    const { series, diag } = buildDetectionSeries(measles, spec, '2021-07-01')
    expect(series!.id).toBe('cdc-nwss:nwss-detections:measles:ww_detections:state:27')
    expect(series!.unit).toBe('count')
    expect(series!.points).toEqual([
      ['2025-10-18', 1],
      ['2025-10-25', 2],
      ['2026-09-26', 0],
      ['2026-10-03', 0],
    ])
    // Latest week (ending 2026-10-03) only has Monday's samples so far.
    expect(series!.provisionalFrom).toBe('2026-10-03')
    expect(series!.attrs).toEqual({ sitesTested: '3', lastDetection: '2025-10-22 \u2014 Goodhue (ID:1003); Olmsted (ID:1017)' })
    expect(diag).toMatchObject({ sites: 4, latestSample: '2026-09-28', lastDetection: '2025-10-22', firstSample: '2025-10-13' })
  })

  it('lists detecting sites for the latest week and respects historyStart', () => {
    const { series } = buildDetectionSeries(measles.slice(0, 9), spec, '2025-10-19')
    expect(series!.points).toEqual([['2025-10-25', 2]])
    expect(series!.attrs?.detectedAt).toBe('Goodhue (ID:1003); Olmsted (ID:1017)')
  })

  it('mpox counts hMPXV targets only (not the broader orthopoxvirus target)', () => {
    const mpox = DETECTION_SPECS.find((s) => s.key === 'mpox')!
    expect(mpox.targetOk('hmpxv')).toBe(true)
    expect(mpox.targetOk('hmpxv clade ii')).toBe(true)
    expect(mpox.targetOk('nvo')).toBe(false)
    expect(mpox.targetOk('mpxv clade ib')).toBe(true) // WastewaterSCAN-style spelling
    expect(mpox.targetOk('mpxv_dd14-16')).toBe(true)
    expect(mpox.targetOk('fluav a h5')).toBe(false)
    const h5 = DETECTION_SPECS.find((s) => s.key === 'h5')!
    expect(h5.targetOk('fluav a h5')).toBe(true)
    expect(h5.note).toMatch(/animal sources/)
  })
})
