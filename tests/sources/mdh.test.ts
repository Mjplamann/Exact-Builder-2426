// Tests for the MDH source: page crawler, CSV normalizer, region schemes, watch-list pages and an
// offline end-to-end run with a stubbed fetch.
//
// FIXTURES: MDH pages are not reachable from the development sandbox. Fixtures marked REAL are copied
// from real MDH files: the headers and first rows recorded by the first CI run (2026-10-07,
// public/data/diagnostics/mdh.json), and rows from MDH's legacy COVID-19 hcounty.csv captured by MPR
// News (report date 2024-01-25). Fixtures marked ILLUSTRATIVE show a format only; their numbers are made up.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from '../../pipeline/lib/log'
import { parsePage } from '../../pipeline/lib/mdh-crawl'
import { mkdirSync, writeFileSync } from 'node:fs'
import { countyGeo, detectRegionScheme, PLANT_CITIES, plantCounty, regionGeo, regionToken } from '../../pipeline/lib/mdh-geo'
import {
  csvToGrid, decodeText, detectPathogens, headerRole, isAggregateSite, normalizeTable, parseDateCell, parseSeason, parseYearWeek,
  roundValue, seasonWeekEnding, type NormalizeSpec,
} from '../../pipeline/lib/mdh-normalize'
import { parseMeaslesPage, parsePertussisPage } from '../../pipeline/lib/mdh-watch'
import {
  buildSeries, fluPositivityKeyStat, isPastSeasonLink, LINK_SPECS, matchSpec, mdh, pertussisCountySeries, placement, plantLookup,
  SeriesBook, specForLink, ytdSeries,
} from '../../pipeline/sources/mdh'
import { MN_COUNTIES, countyByName } from '../../shared/geo/mnCounties'
import type { Series } from '../../shared/types'

const OPTS = { historyStart: '2021-07-01', maxDate: '2026-10-10', rootDir: process.cwd() }
const norm = (csv: string, spec: NormalizeSpec) => {
  const g = csvToGrid(csv)
  return normalizeTable(g.header, g.rows, spec, OPTS)
}
const specOf = (key: string) => {
  const s = LINK_SPECS.find((x) => x.key === key)
  if (!s) throw new Error(key)
  return s
}
const pick = (series: ReturnType<typeof norm>['series'], pathogen: string, code: string, metric?: string) =>
  series.find((s) => s.pathogen === pathogen && s.geo.code === code && (!metric || s.metric === metric))

describe('mdh text helpers', () => {
  it('detects pathogens in headers and cells', () => {
    expect(detectPathogens('Percent Positive (RSV)')).toEqual(['rsv'])
    expect(detectPathogens('flu_a_positive')).toEqual(['influenza-a'])
    expect(detectPathogens('Influenza A and B')).toEqual(['influenza'])
    expect(detectPathogens('Parainfluenza')).toEqual(['parainfluenza'])
    expect(detectPathogens('% ILI')).toEqual(['ili'])
    expect(detectPathogens('Influenza-like illness (ILI)')).toEqual(['ili'])
    expect(detectPathogens('SARS-CoV-2')).toEqual(['covid'])
    expect(detectPathogens('Rhinovirus/Enterovirus')).toEqual(['rhino-entero'])
    expect(detectPathogens('Human metapneumovirus')).toEqual(['hmpv'])
    expect(detectPathogens('Seasonal coronavirus')).toEqual(['seasonal-cov'])
    expect(detectPathogens('Coronavirus (seasonal)')).toEqual(['cov?'])
    expect(detectPathogens('Influenza and RSV outbreaks').sort()).toEqual(['influenza', 'rsv'])
    expect(detectPathogens('week_end')).toEqual([])
    expect(detectPathogens('Bordetella parapertussis')).toEqual(['untracked'])
    expect(detectPathogens('Bordetella pertussis')).toEqual(['pertussis'])
    expect(detectPathogens('Chlamydia pneumoniae')).toEqual(['chlamydia-pneumoniae'])
  })

  it('classifies column roles from headers', () => {
    expect(headerRole('Percent Positive')).toBe('positivity')
    expect(headerRole('pct_pos')).toBe('positivity')
    expect(headerRole('% ILI')).toBe('ili')
    expect(headerRole('ILI visits')).toBe('count')
    expect(headerRole('rate_per_100k')).toBe('rate')
    expect(headerRole('Hospitalizations')).toBe('hosp')
    expect(headerRole('Number of Outbreaks')).toBe('outbreaks')
    expect(headerRole('Total Tests')).toBe('tests')
    expect(headerRole('Positive Tests')).toBe('positives')
    expect(headerRole('case_count')).toBe('count')
    expect(headerRole('COVID-19')).toBe('bare')
    expect(headerRole('Total')).toBe('bare')
    expect(headerRole('week')).toBe('unknown')
    expect(headerRole('cumulative_rate')).toBe('skip')
    expect(headerRole('Number of labs reporting')).toBe('skip')
    expect(headerRole('pmmov_normalized')).toBe('conc')
  })

  it('parses MDH date conventions', () => {
    expect(parseDateCell('10/3/2026')).toBe('2026-10-03')
    expect(parseDateCell('01/13/2024')).toBe('2024-01-13')
    expect(parseDateCell('2026-10-03T00:00:00.000')).toBe('2026-10-03')
    expect(parseDateCell('Oct 3, 2026')).toBe('2026-10-03')
    expect(parseDateCell('Week ending 10/3/2026')).toBe('2026-10-03')
    expect(parseDateCell('9/27/2026 - 10/3/2026')).toBe('2026-09-27')
    expect(parseDateCell('2/30/2026')).toBeNull()
    expect(parseDateCell('202540')).toBeNull()
    expect(parseYearWeek('202402')).toEqual({ year: 2024, week: 2 })
    expect(parseYearWeek('2025-53')).toEqual({ year: 2025, week: 53 })
    expect(parseYearWeek('2024W53')).toBeNull() // 2024 has 52 MMWR weeks
    expect(parseSeason('2025-26')).toBe(2025)
    expect(parseSeason('2025-2026')).toBe(2025)
    expect(parseSeason('2025-27')).toBeNull()
    expect(seasonWeekEnding(2025, 40)).toBe('2025-10-04')
    expect(seasonWeekEnding(2025, 53)).toBe('2026-01-03')
    expect(seasonWeekEnding(2024, 53)).toBeNull()
    expect(seasonWeekEnding(2025, 39)).toBe('2026-10-03')
  })

  it('keeps wastewater ratios with significant figures', () => {
    expect(roundValue(0.000123456, 'wastewater_conc')).toBe(0.0001235)
    expect(roundValue(12.34567, 'test_positivity')).toBe(12.346)
    expect(roundValue(4.6, 'outbreaks')).toBe(5)
  })

  it('finds the header row below a title line and drops footnotes', () => {
    const g = csvToGrid(
      '"Weekly RSV positive tests, Minnesota",,,\nweek_end,positive,tested,percent_positive\n10/3/2026,20,2000,1.0\n"Data are preliminary.",,,\n',
    )
    expect(g.headerRow).toBe(1)
    expect(g.header).toEqual(['week_end', 'positive', 'tested', 'percent_positive'])
    expect(g.rows).toHaveLength(1)
  })
})

describe('mdh geography', () => {
  it('maps region labels and detects the scheme', () => {
    expect(regionToken('North West')).toBe('Northwest')
    expect(regionToken('South Central Region')).toBe('South Central')
    expect(regionToken('Twin Cities Metro')).toBe('Metro')
    expect(regionToken('Southwest/South Central')).toBe('South')
    expect(regionToken('Statewide')).toBe('State')
    expect(regionToken('Metro (7 county)')).toBe('Metro')
    expect(regionToken('Hennepin')).toBeNull()
    const schsac = ['Central', 'Metro', 'Northeast', 'Northwest', 'South Central', 'Southeast', 'Southwest', 'West Central']
    expect(detectRegionScheme(schsac)).toBe('schsac')
    expect(detectRegionScheme(['Metro', 'Northwest', 'Northeast', 'West Central', 'Central', 'Southwest/South Central', 'Southeast'])).toBe('district')
    // A SCHSAC subset without West Central is SCHSAC unless the file is a wastewater file.
    const noWc = ['Metro', 'Northwest', 'Northeast', 'Central', 'Southwest', 'South Central', 'Southeast']
    expect(detectRegionScheme(noWc)).toBe('schsac')
    expect(detectRegionScheme(noWc, { wastewater: true })).toBe('wastewater')
    expect(detectRegionScheme(['Twin Cities Metro', 'Greater Minnesota'])).toBe('metro-greater')
    // REAL labels: RESP-NET "7-co"/"80-co"/"statewide"; ILI "Metropolitan"/"Greater Minnesota".
    expect(detectRegionScheme(['7-co', 'statewide', '80-co'])).toBe('metro-greater')
    expect(detectRegionScheme(['7-co', 'statewide'])).toBe('metro-greater')
    expect(detectRegionScheme(['Metropolitan', 'Greater Minnesota'])).toBe('metro-greater')
    // REAL wastewater region labels (site file): Field Services districts with South labelled "Southwest".
    expect(detectRegionScheme(['Metropolitan', 'Central', 'Northeast', 'Southeast', 'Southwest', 'West Central'], { wastewater: true })).toBe('district')
    expect(detectRegionScheme(['Region 1', 'Region 2'])).toBeNull()
  })

  it('builds region GeoRefs with the right counties per scheme', () => {
    const sc = regionGeo('South Central', 'schsac')!
    expect(sc.type).toBe('mdh-region')
    expect(sc.counties).toHaveLength(11)
    const south = regionGeo('Southwest', 'district')!
    expect(south).toMatchObject({ type: 'mdh-district', code: 'South' })
    expect(south.counties).toHaveLength(18)
    expect(regionGeo('Central', 'wastewater')).toMatchObject({ type: 'mdh-region', code: 'ww-central' })
    expect(regionGeo('Central', 'wastewater')!.counties).toBeUndefined()
    expect(regionGeo('Greater Minnesota', 'metro-greater')!.counties).toHaveLength(80)
  })

  it('maps counties and plant cities', () => {
    expect(countyGeo('Hennepin County')).toEqual({ type: 'county', code: '27053', name: 'Hennepin County' })
    expect(countyGeo('St. Louis')?.code).toBe('27137')
    expect(countyGeo('27109')?.name).toBe('Olmsted County')
    expect(countyGeo('Total')?.type).toBe('state')
    for (const county of Object.values(PLANT_CITIES)) expect(countyByName(county), county).toBeDefined()
    // Exact host-city names only (REAL plant names from the 2026-10-07 site file).
    expect(plantCounty('Mankato WWTP')).toBe('27013')
    expect(plantCounty('St. Cloud WWTP')).toBe('27145')
    expect(plantCounty('Duluth (WLSSD) WWTP*')).toBe('27137')
    expect(plantCounty('Chisholm (CIRSSD) WWTP')).toBe('27137')
    expect(plantCounty('North Mankato')).toBeUndefined() // Nicollet, not Blue Earth
    expect(plantCounty('Buffalo Lake')).toBeUndefined() // Renville, not Wright
    // Metropolitan Council plants serve many counties: never guessed.
    for (const p of ['Metro WWTP', 'Blue Lake WWTP', 'Empire WWTP', 'Seneca WWTP', 'Eagles Point WWTP', 'Metro Plant (St. Paul)']) expect(plantCounty(p), p).toBeUndefined()
    expect(isAggregateSite('Statewide Weighted')).toBe(true)
    expect(isAggregateSite('Northeast')).toBe(true)
    expect(isAggregateSite('Northfield WWTP')).toBe(false)
  })
})

describe('mdh normalizer', () => {
  // REAL: rows from MDH's legacy COVID-19 hcounty.csv (snapshot of report 2024-01-25 via MPR News),
  // restored to MDH's original column names and m/d/yyyy dates.
  const HCOUNTY_REAL = `adm_date_mmwr,county,case_count,rate,mmwr_startdate,mmwr_enddate,pop_size,outcome
202402,Hennepin County,106,8.508,1/7/2024,1/13/2024,1245837,hospitalization
202402,Olmsted County,14,9.043,1/7/2024,1/13/2024,154809,hospitalization
202402,Wright County,8,5.951,1/7/2024,1/13/2024,134438,hospitalization
202402,Total,450,8.089,1/7/2024,1/13/2024,5563378,hospitalization
202403,Hennepin County,55,4.415,1/14/2024,1/20/2024,1245837,hospitalization
202403,Olmsted County,4,2.584,1/14/2024,1/20/2024,154809,hospitalization
202403,Wright County,5,3.719,1/14/2024,1/20/2024,134438,hospitalization
202403,Total,236,4.242,1/14/2024,1/20/2024,5563378,hospitalization
202402,Hennepin County,12,0.963,1/7/2024,1/13/2024,1245837,icu
202402,Total,55,0.989,1/7/2024,1/13/2024,5563378,icu
202403,Hennepin County,12,0.963,1/14/2024,1/20/2024,1245837,icu
202403,Total,44,0.791,1/14/2024,1/20/2024,5563378,icu`
  const covidHosp: NormalizeSpec = { pathogens: ['covid'], defaultPathogen: 'covid', metrics: ['hosp_rate', 'hosp_admissions'] }

  it('refuses a table with an unrecognized dimension (REAL legacy hcounty: hospitalization vs icu)', () => {
    const { series, diag } = norm(HCOUNTY_REAL, covidHosp)
    expect(series).toHaveLength(0)
    expect(diag.unparsed.join(' ')).toMatch(/unrecognized dimension column "outcome"/)
  })

  it('parses county rows, Total rows and MMWR weeks (REAL legacy hcounty, hospitalization rows)', () => {
    const csv = HCOUNTY_REAL.split('\n').filter((l) => !l.endsWith(',icu')).join('\n')
    const { series, diag } = norm(csv, covidHosp)
    expect(diag.geo.level).toBe('county')
    expect(pick(series, 'covid', '27053', 'hosp_rate')!.points).toEqual([['2024-01-13', 8.508], ['2024-01-20', 4.415]])
    expect(pick(series, 'covid', '27053', 'hosp_admissions')!.points).toEqual([['2024-01-13', 106], ['2024-01-20', 55]])
    expect(pick(series, 'covid', '27', 'hosp_rate')!.points).toEqual([['2024-01-13', 8.089], ['2024-01-20', 4.242]])
    expect(pick(series, 'covid', '27053')!.geo).toEqual({ type: 'county', code: '27053', name: 'Hennepin County' })
    expect(diag.dependentColumns).toEqual(['outcome'])
  })

  // ILLUSTRATIVE: RESP-NET weekly rates by season, long format with pre-statewide (metro-only) rows.
  it('applies minDate, omits blank cells and maps bare pathogen columns (illustrative RESP-NET by season)', () => {
    const csv = `season,mmwr_week,week_end,covid_19,influenza,rsv,combined
2022-23,40,10/8/2022,6.1,0.4,1.2,7.7
2025-26,38,9/26/2026,1.4,0.2,0.3,1.9
2025-26,39,10/3/2026,1.2,0.3,,1.5`
    const { series, diag } = norm(csv, specOf('respnet-season'))
    expect(diag.dateStrategy).toMatch(/week_end/)
    expect(pick(series, 'covid', '27')!.points).toEqual([['2026-09-26', 1.4], ['2026-10-03', 1.2]])
    expect(pick(series, 'rsv', '27')!.points).toEqual([['2026-09-26', 0.3]])
    expect(pick(series, 'respiratory-combined', '27')!.points.at(-1)).toEqual(['2026-10-03', 1.5])
    expect(series.every((s) => s.metric === 'hosp_rate')).toBe(true)
  })

  // ILLUSTRATIVE: week × season matrix ("Hospitalized Influenza Cases by Season").
  it('melts a week × season matrix, honoring 53-week years', () => {
    const csv = `MMWR Week,2023-24,2024-25,2025-26
40,5,12,20
52,150,410,960
53,,,700
1,180,380,880
39,2,4,6`
    const { series, diag } = norm(csv, specOf('flu-hosp-season'))
    expect(diag.dateStrategy).toMatch(/matrix/)
    const s = pick(series, 'influenza', '27', 'hosp_admissions')!
    expect(s.points).toContainEqual(['2023-10-07', 5])
    expect(s.points).toContainEqual(['2024-12-28', 410])
    expect(s.points).toContainEqual(['2026-01-03', 700])
    expect(s.points).toContainEqual(['2026-01-10', 880])
    expect(s.points.at(-1)).toEqual(['2026-10-03', 6])
    expect(s.points).toHaveLength(13) // 4 weeks × 3 seasons + week 53 (2025-26 only)
  })

  // ILLUSTRATIVE: flu MLS positivity with stacked positives by type.
  it('uses only the published percentage in a lab file and leaves bare type counts unmapped', () => {
    const csv = `Week Ending Date,Influenza A,Influenza B,Total Positive,Total Tests,Percent Positive
9/19/2026,40,5,45,4100,1.10
9/26/2026,44,6,50,4200,1.19
10/3/2026,60,8,68,4300,1.58`
    const { series, diag } = norm(csv, specOf('flu-lab-positivity'))
    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({ pathogen: 'influenza', metric: 'test_positivity' })
    expect(series[0].points).toEqual([['2026-09-19', 1.1], ['2026-09-26', 1.19], ['2026-10-03', 1.58]])
    expect(series[0].computed).toBeUndefined()
    const a = diag.valueColumns.find((c) => c.column === 'Influenza A')!
    expect(a.status).toMatch(/not mapped/)
  })

  it('collapses dates to MMWR week-ending Saturdays', () => {
    const csv = `week_start,percent_positive
9/27/2026,1.2
10/4/2026,1.5`
    const { series } = norm(csv, specOf('rsv-lab-positivity'))
    expect(series[0].points).toEqual([['2026-10-03', 1.2], ['2026-10-10', 1.5]])
  })

  // ILLUSTRATIVE: long-format MLS other molecular results (positives and tests only).
  it('computes positivity from positives ÷ tests and resolves a bare "coronavirus" label', () => {
    const csv = `week_ending,virus,positive,tested
09/26/2026,Rhinovirus/Enterovirus,213,1500
09/26/2026,Human metapneumovirus,10,1500
09/26/2026,Adenovirus,30,1500
09/26/2026,Parainfluenza,25,1500
09/26/2026,Coronavirus (seasonal),12,1500
09/26/2026,SARS-CoV-2,80,1600`
    const { series, diag } = norm(csv, specOf('mls-other-molecular'))
    expect(diag.pathogenColumn).toBe('virus')
    expect(pick(series, 'rhino-entero', '27')!.points).toEqual([['2026-09-26', 14.2]])
    expect(pick(series, 'seasonal-cov', '27')!.points).toEqual([['2026-09-26', 0.8]])
    expect(pick(series, 'covid', '27')!.points).toEqual([['2026-09-26', 5]])
    expect(pick(series, 'hmpv', '27')!.computed).toMatch(/positive tests/)
  })

  it('prefers a published percent over computing one', () => {
    const csv = `week_ending,virus,positive,tested,percent_positive
09/26/2026,Adenovirus,30,1500,2.1`
    const { series } = norm(csv, specOf('mls-other-molecular'))
    expect(series).toHaveLength(1)
    expect(series[0].points).toEqual([['2026-09-26', 2.1]])
    expect(series[0].computed).toBeUndefined()
  })

  // ILLUSTRATIVE: ILI by the 8 SCHSAC regions plus statewide.
  it('emits region series with counties for the SCHSAC scheme', () => {
    const csv = `week_end,region,pct_ili
10/3/2026,Central,0.9
10/3/2026,Metro,1.1
10/3/2026,Northeast,0.8
10/3/2026,Northwest,0.7
10/3/2026,South Central,1.0
10/3/2026,Southeast,1.2
10/3/2026,Southwest,0.6
10/3/2026,West Central,0.5
10/3/2026,Statewide,1.0`
    const { series, diag } = norm(csv, specOf('ili-region'))
    expect(diag.geo).toMatchObject({ level: 'region', scheme: 'schsac' })
    expect(series).toHaveLength(9)
    expect(pick(series, 'ili', 'Metro')!.geo.counties).toHaveLength(7)
    expect(pick(series, 'ili', '27')!.points).toEqual([['2026-10-03', 1]])
    expect(series.every((s) => s.metric === 'ili_pct')).toBe(true)
  })

  it('handles wide-by-region tables in the district scheme', () => {
    const csv = `Week,Metro,Northwest,Northeast,West Central,Central,Southwest/South Central,Southeast
202539,1.1,0.7,0.8,0.5,0.9,0.6,1.2`
    const { series, diag } = norm(csv, specOf('ili-region'))
    expect(diag.geo).toMatchObject({ level: 'region', scheme: 'district', fromHeaders: true })
    expect(pick(series, 'ili', 'South')!.geo.type).toBe('mdh-district')
    expect(pick(series, 'ili', 'South')!.points).toEqual([['2025-09-27', 0.6]])
  })

  it('keeps only all-ages rows and refuses age-only tables', () => {
    const spec: NormalizeSpec = { pathogens: ['covid'], defaultPathogen: 'covid', metrics: ['hosp_rate'] }
    const ok = norm(`week_end,age_group,rate\n10/3/2026,0-4 years,5.0\n10/3/2026,All ages,2.0`, spec)
    expect(ok.series[0].points).toEqual([['2026-10-03', 2]])
    const bad = norm(`week_end,age_group,rate\n10/3/2026,0-4 years,5.0\n10/3/2026,65+ years,9.0`, spec)
    expect(bad.series).toHaveLength(0)
    expect(bad.diag.unparsed[0]).toMatch(/stratified/)
  })

  // ILLUSTRATIVE: RESP-NET by county, long format with MDH risk levels.
  it('maps county rates and the publisher risk level to series.official', () => {
    const csv = `county,week_ending,pathogen,rate_per_100k,risk_level
Hennepin,09/26/2026,COVID-19,3.1,Low
Hennepin,10/03/2026,COVID-19,9.0,Moderate
Hennepin,10/03/2026,Influenza,1.0,Low
Traverse,10/03/2026,COVID-19,30.3,High
Statewide,10/03/2026,COVID-19,4.0,Low`
    const { series, diag } = norm(csv, specOf('respnet-county'))
    expect(diag.levelColumns).toEqual(['risk_level'])
    const henn = pick(series, 'covid', '27053')!
    expect(henn.points).toEqual([['2026-09-26', 3.1], ['2026-10-03', 9]])
    expect(henn.official).toMatchObject({ level: 'moderate', label: 'Moderate', asOf: '2026-10-03' })
    expect(pick(series, 'covid', '27155')!.official?.level).toBe('high')
    expect(pick(series, 'covid', '27')!.geo.type).toBe('state')
  })

  // ILLUSTRATIVE: wastewater site data, sample-level rows (two samples in one week).
  it('averages samples per week and builds sewershed geography', () => {
    const csv = `site_name,sample_date,target,pmmov_normalized
Mankato,9/28/2026,SARS-CoV-2,0.0012
Mankato,10/1/2026,SARS-CoV-2,0.0016
Mankato,10/1/2026,Influenza A,0.0003
Rochester,9/30/2026,SARS-CoV-2,0.002`
    const { series, diag } = norm(csv, specOf('ww-site'))
    expect(diag.geo.level).toBe('site')
    const m = pick(series, 'covid', 'mdh-mankato')!
    expect(m.points).toEqual([['2026-10-03', 0.0014]])
    // No county column: the host city only places the point; it is not written as counties served.
    expect(m.geo).toMatchObject({ type: 'sewershed', name: 'Mankato' })
    expect(m.geo.counties).toBeUndefined()
    expect(m.geo.coord![0]).toBeCloseTo(-94.07, 0)
    expect(m.geo.coord![1]).toBeCloseTo(44.03, 0)
    expect(m.attrs?.coordBasis).toMatch(/approximate/)
    expect(pick(series, 'influenza-a', 'mdh-mankato')!.points).toEqual([['2026-10-03', 0.0003]])
  })

  it('does not treat facility columns as sewersheds outside wastewater site files', () => {
    const csv = `week_end,facility_type,influenza_outbreaks
10/3/2026,Nursing home,2
10/3/2026,Assisted living,1`
    const { series, diag } = norm(csv, specOf('ltc-outbreaks'))
    expect(series).toHaveLength(0)
    expect(diag.unparsed[0]).toMatch(/facility_type/)
  })

  it('drops series fed by two columns with different values', () => {
    const csv = `week_end,flu_a_h1n1_pct_pos,flu_a_h3n2_pct_pos
10/3/2026,0.4,1.0`
    const { series, diag } = norm(csv, specOf('flu-lab-positivity'))
    expect(series).toHaveLength(0)
    expect(diag.unparsed.join(' ')).toMatch(/several columns/)
  })

  it('treats mostly-suppressed count columns as numeric; all-suppressed series are not emitted', () => {
    const csv = `week_end,county,case_count\n10/3/2026,Traverse,<5\n10/3/2026,Hennepin,106\n10/3/2026,Cook,<5\n10/3/2026,Lake,*`
    const { series } = norm(csv, { pathogens: ['covid'], defaultPathogen: 'covid', metrics: ['hosp_admissions'] })
    expect(series.map((s) => [s.geo.code, s.points])).toEqual([['27053', [['2026-10-03', 106]]]])
  })

  it('keeps a suppressed latest week as null so an older level is not shown as current', () => {
    const csv = `county,week_ending,covid_rate,covid_risk
Traverse,9/26/2026,30.1,High
Traverse,10/3/2026,<5,
Hennepin,9/26/2026,2.1,Low
Hennepin,10/3/2026,,Low`
    const { series } = norm(csv, specOf('respnet-county'))
    const trav = pick(series, 'covid', '27155')!
    expect(trav.points).toEqual([['2026-09-26', 30.1], ['2026-10-03', null]])
    expect(trav.official).toBeUndefined()
    // A blank cell is not reported: no point.
    expect(pick(series, 'covid', '27053')!.points).toEqual([['2026-09-26', 2.1]])
  })

  it('refuses percent series that look like proportions across a winter', () => {
    const rows = ['12/6/2025', '12/13/2025', '12/20/2025', '12/27/2025', '1/3/2026', '1/10/2026', '1/17/2026', '1/24/2026'].map((d, i) => `${d},0.${10 + i}`)
    const { series, diag } = norm(`week_end,percent_positive\n${rows.join('\n')}`, specOf('flu-lab-positivity'))
    expect(series).toHaveLength(0)
    expect(diag.unparsed.join(' ')).toMatch(/suspected proportion/)
    expect(fluPositivityKeyStat(['Hospitalizations: 5,526', 'Percent of molecular laboratory tests positive: 1.10%'])).toBe(1.1) // REAL key statistic text
  })

  it('never reads a week-of-season column as an MMWR week', () => {
    const csv = `season,week_of_season,covid_19,influenza\n2025-26,1,0.5,0.1\n2025-26,2,0.6,0.1\n2025-26,40,1.1,0.3`
    const { series, diag } = norm(csv, specOf('respnet-season'))
    expect(series).toHaveLength(0)
    expect(diag.unparsed[0]).toMatch(/no weekly date/)
  })

  it('moves Sunday "week ending" dates to the previous Saturday and warns', () => {
    const { series, diag } = norm(`week_ending,percent_positive\n9/27/2026,1.0\n10/4/2026,1.1`, specOf('rsv-lab-positivity'))
    expect(series[0].points).toEqual([['2026-09-26', 1], ['2026-10-03', 1.1]])
    expect(diag.warnings?.[0]).toMatch(/week ending.*Sundays/)
    const wed = norm(`week_ending,percent_positive\n9/30/2026,1.0\n10/7/2026,1.1`, specOf('rsv-lab-positivity'))
    expect(wed.series).toHaveLength(0)
  })

  it('does not map an "Influenza A & B" column next to separate A and B columns (co-infection)', () => {
    const csv = `Week Ending,Influenza A,Influenza B,Influenza A & B,Total
9/26/2026,10,2,1,13
10/3/2026,15,2,1,18`
    const spec: NormalizeSpec = { pathogens: ['influenza', 'influenza-a', 'influenza-b'], defaultPathogen: 'influenza', metrics: ['hosp_admissions'], bareMeans: 'hosp_admissions' }
    const { series, diag } = norm(csv, spec)
    expect(pick(series, 'influenza', '27')!.points).toEqual([['2026-09-26', 13], ['2026-10-03', 18]]) // from "Total"
    expect(pick(series, 'influenza-a', '27')!.points.at(-1)).toEqual(['2026-10-03', 15])
    expect(diag.valueColumns.find((c) => c.column === 'Influenza A & B')!.status).toMatch(/co-infection/)
  })

  it('rescales explicit proportions to percent and reads year + week columns', () => {
    const a = norm(`week_end,proportion_positive\n10/3/2026,0.011`, specOf('rsv-lab-positivity'))
    expect(a.series[0].points).toEqual([['2026-10-03', 1.1]])
    const b = norm(`mmwr_year,mmwr_week,percent_positive\n2025,53,20.5\n2026,1,22.0`, specOf('flu-lab-positivity'))
    expect(b.diag.dateStrategy).toMatch(/year/)
    expect(b.series[0].points).toEqual([['2026-01-03', 20.5], ['2026-01-10', 22]])
  })

  it('reports tables without weekly dates', () => {
    const csv = `Season,Deaths\n2023-24,270\n2024-25,574`
    const { series, diag } = norm(csv, specOf('flu-deaths'))
    expect(series).toHaveLength(0)
    expect(diag.unparsed[0]).toMatch(/no weekly date/)
  })

  // ILLUSTRATIVE: K-12 outbreaks with a "Total" pathogen-less count column.
  it('uses the link-text pathogen for generic count columns (K-12 outbreaks)', () => {
    const csv = `week_ending,number_of_outbreaks\n9/26/2026,3\n10/3/2026,7`
    const { series } = norm(csv, specOf('k12-outbreaks'))
    expect(series[0]).toMatchObject({ pathogen: 'respiratory-combined', metric: 'outbreaks' })
    expect(series[0].points).toEqual([['2026-09-26', 3], ['2026-10-03', 7]])
  })
})

describe('mdh link specs', () => {
  const cases: [string, string][] = [
    ['MLS Other Molecular Testing Results by Week (CSV)', 'mls-other-molecular'],
    ['MLS Weekly RSV Positive Tests and Percent Positivity (CSV)', 'rsv-lab-positivity'],
    ['Weekly Total of Influenza Positive Tests and Percent Positivity', 'flu-lab-positivity'],
    ['Weekly Influenza A Positives by Subtype', 'flu-lab-subtype'],
    ['RESP-NET by County', 'respnet-county'],
    ['RESP-NET by County, 2023-2025 (CSV)', 'respnet-county'], // archive chosen by specForLink
    ['Outpatient Health Care Visits due to Influenza-Like Illness by Region', 'ili-region'], // REAL label
    ['Long-term/congregate care data', 'ltc-covid-cases'], // REAL label
    ['MLS Weekly RSV Positive Tests and Percent Positivity', 'rsv-lab-positivity'], // REAL label
    ['RESP-NET by Age Group', 'respnet-age'],
    ['Weekly rates of respiratory virus-associated hospitalizations by season', 'respnet-season'],
    ['Weekly Acute Respiratory Illness Outbreaks in K-12 Schools', 'k12-outbreaks'],
    ['Weekly Influenza and RSV Outbreaks in Long-term Care Facilities', 'ltc-outbreaks'],
    ['Regional Wastewater Data', 'ww-regional'],
    ['Wastewater Treatment Plant Site Data', 'ww-site'],
    ['Wastewater Weekly Detection Map', 'ww-detection'],
    ['Wastewater Compared to Hospitalization Trends', 'ww-hosp'],
    ['Outpatient Health Care Visits due to Influenza-Like Illness (ILI) by Region', 'ili-region'],
    ['Weekly Percent of Health Care Visits Due to Influenza-Like Illness (ILI) by Age Group', 'ili-age'],
    ['Outpatient Health Care Visits Due to Influenza-Like Illness (ILI)', 'ili'],
    ['Hospitalized Influenza Cases by Type', 'flu-hosp-type'],
    ['Hospitalized Influenza Cases by Season', 'flu-hosp-season'],
    ['Number of Influenza Hospitalizations and Incidence by Region', 'flu-hosp-region'],
    ['Number of Influenza Hospitalizations and Incidence by Age', 'flu-hosp-age'],
    ['Deaths Associated with Influenza by Season', 'flu-deaths'],
    ['Deaths Associated with Influenza by Age Group and Season', 'flu-deaths-age'],
    ['Syndromic surveillance by Region', 'syndromic-region'],
  ]
  it.each(cases)('maps "%s"', (text, key) => {
    expect(matchSpec({ label: text, text, heading: '' })?.key).toBe(key)
  })
  it('chooses the archive spec by page path or a past year range', () => {
    const l = (t: string) => ({ label: t, text: t, heading: '' })
    expect(specForLink(l('RESP-NET by County, 2023-2025'), '/diseases/respiratory/stats/archive.html', 2026).spec?.key).toBe('respnet-county-archive')
    expect(specForLink(l('RESP-NET by County, 2023-2025'), '/diseases/respiratory/stats/hosp.html', 2026).spec?.key).toBe('respnet-county-archive')
    expect(specForLink(l('RESP-NET by County, 2025-2026'), '/diseases/respiratory/stats/hosp.html', 2026)).toMatchObject({ archive: false, spec: { key: 'respnet-county' } })
    expect(specForLink(l('RESP-NET by County'), '/diseases/respiratory/stats/hosp.html', 2026).spec?.key).toBe('respnet-county')
    expect(isPastSeasonLink('Data 2024-25', 2026)).toBe(true)
    // An empty link text never selects a spec by itself.
    expect(specForLink({ label: 'RESP-NET by County, 2025-2026', text: '', heading: '' }, '/diseases/respiratory/stats/hosp.html', 2026).spec?.key).toBe('respnet-county')
    expect(matchSpec({ label: '', text: '', heading: '' })).toBeUndefined()
  })
  it('keeps influenza hospital surveillance and RESP-NET in different datasets', () => {
    const geoState = { type: 'state' as const, code: '27', name: 'Minnesota' }
    expect(placement(specOf('respnet-county'), { metric: 'hosp_rate', geo: geoState })).toEqual({ dataset: 'mdh-respnet', family: 'respnet-state' })
    expect(placement(specOf('respnet-county'), { metric: 'hosp_rate', geo: { type: 'county', code: '27053', name: 'Hennepin County' } }).dataset).toBe('mdh-respnet-county')
    expect(placement(specOf('respnet-season'), { metric: 'hosp_rate', geo: geoState }).dataset).toBe('mdh-respnet')
    expect(placement(specOf('flu-hosp-season'), { metric: 'hosp_admissions', geo: geoState }).dataset).toBe('mdh-hosp')
    expect(placement(specOf('flu-hosp-region'), { metric: 'hosp_rate', geo: geoState }).dataset).toBe('mdh-hosp')
  })
  it('falls back to the heading for generic link text', () => {
    expect(matchSpec({ label: 'Download data', text: 'Download data (CSV)', heading: 'RESP-NET by County' })?.key).toBe('respnet-county')
  })
})

describe('mdh page parsing', () => {
  // ILLUSTRATIVE page markup (MDH Drupal theme: #block-bootstrap-mdh-content, "Updated M/D/YYYY").
  const LAB_HTML = `<html><head><title>Influenza Laboratory Data - MN Dept. of Health</title></head><body>
<nav><a href="/nav-only.csv">Nav CSV</a></nav>
<div id="block-bootstrap-mdh-content">
<h1>Situation Update for Influenza</h1>
<p><strong>Updated 10/1/2026</strong></p>
<p>Data for the most recent week are pending.</p>
<h2>Minnesota Laboratory System</h2>
<p><a href="lab/flulabpos.csv">Weekly Total of Influenza Positive Tests and Percent Positivity (CSV)</a></p>
<h3>Influenza A subtypes</h3>
<p><a href="/diseases/flu/stats/flusubtype.csv#x">Download data (CSV)</a></p>
<a href="2025summary.pdf">2025-26 season summary (PDF)</a>
<table><caption>Key statistics</caption><thead><tr><th>Measure</th><th>Value</th></tr></thead>
<tbody><tr><td>Percent of molecular tests positive</td><td>1.10%</td></tr><tr><td>Hospitalizations</td><td>5,526</td></tr></tbody></table>
</div></body></html>`

  it('extracts links, headings, update date, pending notice and tables', () => {
    const info = parsePage(LAB_HTML, 'https://www.health.state.mn.us/diseases/flu/stats/lab.html')
    expect(info.updated).toBe('2026-10-01')
    expect(info.pendingNotice).toBe(true)
    expect(info.links.map((l) => l.url)).toEqual([
      'https://www.health.state.mn.us/diseases/flu/stats/lab/flulabpos.csv',
      'https://www.health.state.mn.us/diseases/flu/stats/flusubtype.csv',
      'https://www.health.state.mn.us/diseases/flu/stats/2025summary.pdf',
    ])
    expect(info.links[0]).toMatchObject({ ext: 'csv', label: 'Weekly Total of Influenza Positive Tests and Percent Positivity', heading: 'Minnesota Laboratory System' })
    expect(info.links[1].label).toBe('Influenza A subtypes')
    expect(info.tables[0]).toMatchObject({ caption: 'Key statistics', headers: ['Measure', 'Value'] })
    expect(info.keyStats).toContain('Hospitalizations | 5,526')
  })

  // ILLUSTRATIVE layout; the 9/10/2026 county numbers shown are the ones MDH reported publicly (partial list).
  it('parses the pertussis county table', () => {
    const html = `<div id="block-bootstrap-mdh-content"><h1>Pertussis Statistics, 2026</h1><p>Updated 9/10/2026</p>
<p>Confirmed and probable cases by county of residence as of 9/10/2026</p>
<table><thead><tr><th>County</th><th>Cases</th></tr></thead><tbody>
<tr><td>Anoka</td><td>22</td></tr><tr><td>Dakota</td><td>15</td></tr><tr><td>Hennepin</td><td>44</td></tr>
<tr><td>Isanti</td><td>11</td></tr><tr><td>Total</td><td>186</td></tr></tbody></table></div>`
    const pp = parsePertussisPage(parsePage(html, 'https://www.health.state.mn.us/diseases/pertussis/stats/stats26.html'), 2026)
    expect(pp).toMatchObject({ total: 186, totalBasis: 'total row', asOf: '2026-09-10' })
    expect(pp.counties[0]).toEqual({ fips: '27053', name: 'Hennepin', cases: 44 })
  })

  it('parses measles cases by year', () => {
    const html = `<div id="block-bootstrap-mdh-content"><p>Updated 9/19/2026</p>
<table><thead><tr><th>Year</th><th>Confirmed cases</th></tr></thead><tbody>
<tr><td>2024</td><td>70</td></tr><tr><td>2025</td><td>26</td></tr><tr><td>2026</td><td>18</td></tr></tbody></table></div>`
    const mp = parseMeaslesPage(parsePage(html, 'https://www.health.state.mn.us/diseases/measles/stats.html'), 2026)
    expect(mp).toMatchObject({ cases: 18, asOf: '2026-09-19' })
  })
})

describe('mdh source end-to-end (stubbed fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('falls back to www.health.mn.gov, parses CSVs and watch pages, and never throws', async () => {
    vi.stubEnv('GITHUB_ACTIONS', '')
    const H2 = 'https://www.health.mn.gov'
    const page = (body: string) => `<html><body><div id="block-bootstrap-mdh-content"><p>Updated 10/1/2026</p>${body}</div></body></html>`
    const files: Record<string, string> = {
      '/diseases/flu/stats/lab.html': page(`<h2>MLS</h2><a href="flulab.csv">Weekly Total of Influenza Positive Tests and Percent Positivity (CSV)</a>`),
      '/diseases/flu/stats/flulab.csv': `week_ending_date,percent_positive\n9/26/2026,1.0\n10/3/2026,1.1\n`,
      '/diseases/respiratory/stats/hosp.html': page(
        `<p>Data pending for the most recent week.</p><h2>County</h2><a href="/diseases/respiratory/stats/respnetcounty.csv">RESP-NET by County (CSV)</a>` +
          `<a href="broken.csv">Hospitalized Influenza Cases by Type (CSV)</a><a href="odd.csv">Something new (CSV)</a>`,
      ),
      '/diseases/respiratory/stats/respnetcounty.csv': `county,week_end,covid_rate,flu_rate,rsv_rate\nHennepin,10/3/2026,2.0,0.5,0.3\nRamsey,10/3/2026,1.5,,0.2\n`,
      '/diseases/respiratory/stats/odd.csv': `week_end,mystery\n10/3/2026,5\n`,
      '/diseases/wastewater/stats/index.html': page(`<a href="regional.csv">Regional Wastewater Data (CSV)</a><a href="sites.xlsx">Site data (XLSX)</a>`),
      '/diseases/wastewater/stats/regional.csv': `region,week,target,concentration\nMetro,202539,SARS-CoV-2,0.00051\nCentral,202539,SARS-CoV-2,0.00032\nSouth Central,202539,SARS-CoV-2,0.0004\nSouthwest,202539,SARS-CoV-2,0.0001\n`,
      '/diseases/pertussis/stats/stats26.html': page(`<p>Cases as of 9/10/2026</p><table><tr><th>County</th><th>Cases</th></tr><tr><td>Hennepin</td><td>44</td></tr><tr><td>Total</td><td>186</td></tr></table>`),
      '/diseases/measles/stats.html': page(`<table><tr><th>Year</th><th>Cases</th></tr><tr><td>2026</td><td>18</td></tr></table>`),
    }
    const seen: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const u = new URL(String(input))
      seen.push(u.toString())
      if (u.hostname === 'www.health.state.mn.us') return new Response('Forbidden', { status: 403 })
      const body = files[u.pathname]
      return body == null ? new Response('Not found', { status: 404 }) : new Response(body, { status: 200 })
    })
    const logs: string[] = []
    const log = { ...createLogger('mdh-test'), info: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) }
    log.child = () => log
    const res = await mdh.run({
      now: '2026-10-07T18:00:00Z',
      log,
      historyStart: '2021-07-01',
      cacheDir: mkdtempSync(path.join(tmpdir(), 'mdh-test-')),
      rootDir: process.cwd(),
    })
    const all = res.datasets.flatMap((d) => d.series)
    const ids = all.map((s) => s.id)
    expect(ids).toContain('mdh:mdh-lab:influenza:test_positivity:state:27')
    expect(ids).toContain('mdh:mdh-respnet-county:covid:hosp_rate:county:27053')
    expect(ids).toContain('mdh:mdh-respnet-county:influenza:hosp_rate:county:27053')
    expect(ids).not.toContain('mdh:mdh-respnet-county:influenza:hosp_rate:county:27123') // blank cell omitted
    expect(ids).toContain('mdh:mdh-wastewater:covid:wastewater_conc:mdh-region:ww-metro')
    expect(ids).toContain('mdh:mdh-other:pertussis:cases_ytd:state:27')
    expect(ids).toContain('mdh:mdh-other:pertussis:cases_ytd:county:27053')
    expect(ids).toContain('mdh:mdh-other:measles:cases_ytd:state:27')
    const lab = all.find((s) => s.id === 'mdh:mdh-lab:influenza:test_positivity:state:27')!
    expect(lab.points).toEqual([['2026-09-26', 1], ['2026-10-03', 1.1]])
    expect(lab.attrs).toMatchObject({ mdhFile: 'flulab.csv', mdhUpdated: '2026-10-01' })
    const henn = all.find((s) => s.id === 'mdh:mdh-respnet-county:covid:hosp_rate:county:27053')!
    expect(henn.provisionalFrom).toBe('2026-10-03')
    expect(lab.provisionalFrom).toBeUndefined()
    // Year-to-date counts: one point at MDH's as-of (report) date, metric cases_ytd.
    const pert = all.find((s) => s.id === 'mdh:mdh-other:pertussis:cases_ytd:state:27')!
    expect(pert.points).toEqual([['2026-09-10', 186]])
    expect(pert.note).toMatch(/Cumulative/)
    expect(all.find((s) => s.id === 'mdh:mdh-other:pertussis:cases_ytd:county:27053')!.summary).toMatch(/44 of 186/)
    expect(all.find((s) => s.id === 'mdh:mdh-other:measles:cases_ytd:state:27')!.points).toEqual([['2026-10-01', 18]])
    const ww = all.find((s) => s.id.endsWith('ww-metro'))!
    expect(ww.points).toEqual([['2025-09-27', 0.00051]])
    expect(ww.geo.population).toBeUndefined() // wastewater regions carry no county population
    for (const s of all) {
      expect(s.points.map((p) => p[0])).toEqual([...s.points.map((p) => p[0])].sort())
      if (s.metric === 'cases_ytd') continue
      for (const [d] of s.points) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(6)
    }
    const diag = res.diagnostics as { summary: Record<string, unknown>; files: { url: string; status: string; reason?: string; header?: string[] }[] }
    expect(diag.summary.hostsUsed).toEqual(['www.health.mn.gov'])
    expect(diag.summary.csvParsed).toBe(3)
    expect(diag.files.find((f) => f.url.endsWith('broken.csv'))!.status).toBe('error') // 404
    expect(diag.files.find((f) => f.url.endsWith('odd.csv'))).toMatchObject({ status: 'unparsed', header: ['week_end', 'mystery'] })
    expect(diag.files.find((f) => f.url.endsWith('sites.xlsx'))!.status).toBe('recorded')
    expect(res.message).toMatch(/CSV links found/)
    expect(seen.some((u) => u.startsWith(H2))).toBe(true)
  })

  it('returns a clear message when every host is unreachable', async () => {
    vi.stubEnv('GITHUB_ACTIONS', '')
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const log = createLogger('mdh-test')
    log.info = () => {}
    log.warn = () => {}
    const res = await mdh.run({ now: '2026-10-07T18:00:00Z', log, historyStart: '2021-07-01', cacheDir: mkdtempSync(path.join(tmpdir(), 'mdh-test-')), rootDir: process.cwd() })
    expect(res.datasets.every((d) => d.series.length === 0)).toBe(true)
    expect(res.message).toMatch(/MDH pages unreachable/)
  }, 60_000)
})

describe('mdh real file layouts (CI run 2026-10-07)', () => {
  const OLD = { ...OPTS, historyStart: '2019-01-01' }
  const normAt = (csv: string, spec: NormalizeSpec, opts = OLD) => {
    const g = csvToGrid(csv)
    return normalizeTable(g.header, g.rows, spec, opts)
  }

  // REAL: respnetall.csv header and first rows.
  it('parses RESP-NET by season with its Geography column (7-co / statewide)', () => {
    const csv = `Season,MMWR Week,MMWR Start Date,Pathogen,Geography,Count of Hospitalizations,Population,Rate per 100000
2024-2025,202508,2/16/2025,Total,7-co,357,3065147,11.65
2023-2024,202414,3/31/2024,Total,statewide,266,5563378,4.78
2024-2025,202505,1/26/2025,Total,statewide,1364,5563378,24.52`
    const { series, diag } = normAt(csv, specOf('respnet-season'))
    expect(diag.geo).toMatchObject({ level: 'region', column: 'Geography', scheme: 'metro-greater' })
    expect(pick(series, 'respiratory-combined', '27')!.points).toEqual([['2024-04-06', 4.78], ['2025-02-01', 24.52]])
    const metro = pick(series, 'respiratory-combined', 'Metro')!
    expect(metro.points).toEqual([['2025-02-22', 11.65]])
    expect(metro.geo.counties).toHaveLength(7)
    expect(series.every((s) => s.metric === 'hosp_rate')).toBe(true)
  })

  // REAL: respnetcounty.csv and respnetcounty202325.csv first rows.
  it('parses RESP-NET by County with MDH risk levels; the statewide row goes to the RESP-NET dataset', () => {
    const csv = `Season,MMWR Week,MMWR Start Date,Pathogen,County,Count,Population,"Rate per 100,000",Risk Level
2025-2026,202540,9/28/2025,Influenza,Statewide,1,5563378,0,Low
2025-2026,202540,9/28/2025,Influenza,Aitkin,0,15834,0,Low
2025-2026,202540,9/28/2025,Influenza,Anoka,0,350253,0,Low`
    const { series, diag } = normAt(csv, specOf('respnet-county'))
    expect(diag.levelColumns).toEqual(['Risk Level'])
    const anoka = pick(series, 'influenza', '27003')!
    expect(anoka.points).toEqual([['2025-10-04', 0]])
    expect(anoka.official).toMatchObject({ level: 'low', label: 'Low', asOf: '2025-10-04' })
    const state = pick(series, 'influenza', '27')!
    const built = buildSeries(state, specOf('respnet-county'), { file: 'respnetcounty.csv', pending: false })
    expect(built.id).toBe('mdh:mdh-respnet:influenza:hosp_rate:state:27')
    expect(buildSeries(anoka, specOf('respnet-county'), { file: 'respnetcounty.csv', pending: false }).note).toMatch(/county residents/)
    const arch = normAt(`Season,MMWR Week,MMWR Start Date,Pathogen,County,Count,Population,"Rate per 100,000",Risk Level
2023-2024,202340,10/1/2023,COVID-19,Aitkin,0,15834,0,Low
2023-2024,202340,10/1/2023,Influenza,Aitkin,0,15834,0,Low
2023-2024,202340,10/1/2023,RSV,Aitkin,0,15834,0,Low`, specOf('respnet-county-archive'))
    expect(arch.series.map((s) => [s.pathogen, s.geo.code, s.points])).toEqual([
      ['covid', '27001', [['2023-10-07', 0]]], ['influenza', '27001', [['2023-10-07', 0]]], ['rsv', '27001', [['2023-10-07', 0]]],
    ])
  })

  // REAL: mls_flutype.csv and mls_rsv.csv first rows (week start dates are Sundays).
  it('parses MLS flu and RSV percent positive', () => {
    const flu = normAt(`Season,Week Start Date,Flu Type A/B,Frequency,% Flu Positive
2023-24,10/1/2023,Flu A,1,0.9
2023-24,10/1/2023,Flu A,0,0.9
2023-24,10/1/2023,Flu A,0,0.9`, specOf('flu-lab-positivity'))
    expect(flu.series.map((s) => [s.pathogen, s.metric, s.points])).toEqual([['influenza', 'test_positivity', [['2023-10-07', 0.9]]]])
    const rsv = normAt(`Season,MMWR Week,Week Start Date,Pathogen,Frequency,% RSV Positive
2023-24,40,10/1/2023,RSV,7,1.3
2023-24,41,10/8/2023,RSV,11,2.1
2023-24,42,10/15/2023,RSV,72,3.2`, specOf('rsv-lab-positivity'))
    expect(rsv.series[0].points).toEqual([['2023-10-07', 1.3], ['2023-10-14', 2.1], ['2023-10-21', 3.2]])
  })

  // REAL: ili_statewide.csv and ili_region.csv first rows.
  it('parses ILI statewide and Metro / Greater Minnesota', () => {
    const st = normAt(`Season,Week of date,Level,ILI Visits,Patient Visits,ILI Visit %
2024-2025,9/29/2024,Statewide,399,45128,0.88
2024-2025,10/6/2024,Statewide,407,45600,0.89
2024-2025,10/13/2024,Statewide,437,41431,1.1`, specOf('ili'))
    expect(st.series.map((s) => [s.geo.code, s.points])).toEqual([['27', [['2024-10-05', 0.88], ['2024-10-12', 0.89], ['2024-10-19', 1.1]]]])
    const rg = normAt(`Season,Week,Week of date,MetroGreater,ILI Visits,Patient Visits,ILI Visit %
2024-2025,40,9/29/2024,Greater Minnesota,187,34132,0.55
2024-2025,40,9/29/2024,Metropolitan,212,11050,1.9
2024-2025,41,10/6/2024,Greater Minnesota,183,34737,0.5`, specOf('ili-region'))
    expect(pick(rg.series, 'ili', 'Greater Minnesota')!.points).toEqual([['2024-10-05', 0.55], ['2024-10-12', 0.5]])
    expect(pick(rg.series, 'ili', 'Metro')!.points).toEqual([['2024-10-05', 1.9]])
  })

  // REAL: hospflu_byseason.csv, fludeath_byseason.csv, schools.csv and ltcf.csv first rows.
  it('parses flu hospitalizations and deaths by season, and outbreak files', () => {
    expect(normAt(`Season,MMWR Week,Number of Hospitalizations\n2019-2020,40,2\n2019-2020,41,5\n2019-2020,42,6`, specOf('flu-hosp-season')).series[0].points)
      .toEqual([['2019-10-05', 2], ['2019-10-12', 5], ['2019-10-19', 6]])
    expect(normAt(`Season,MMWR Week,Number of Deaths\n2021-2022,40,1\n2021-2022,41,0\n2021-2022,42,0`, specOf('flu-deaths')).series[0].points)
      .toEqual([['2021-10-09', 1], ['2021-10-16', 0], ['2021-10-23', 0]])
    const k12 = normAt(`Week of date,Number of newly reported outbreaks\n3/8/2026,5\n2/8/2026,10\n3/29/2026,1`, specOf('k12-outbreaks'))
    expect(k12.series[0]).toMatchObject({ pathogen: 'respiratory-combined', metric: 'outbreaks', points: [['2026-02-14', 10], ['2026-03-14', 5], ['2026-04-04', 1]] })
    const ltc = normAt(`Number of newly reported outbreaks,Week starting date,Reported viruses\n3,3/29/2026,RSV\n26,12/28/2025,Influenza\n12,1/4/2026,Influenza`, specOf('ltc-outbreaks'))
    expect(pick(ltc.series, 'rsv', '27')!.points).toEqual([['2026-04-04', 3]])
    expect(pick(ltc.series, 'influenza', '27')!.points).toEqual([['2026-01-03', 26], ['2026-01-10', 12]])
  })

  // REAL headers; first three rows REAL, the rest use REAL region labels with values from the published
  // 2026-10-07 output (week beginning 9/20/2026).
  it('parses regional wastewater as Field Services districts without county population', () => {
    const csv = `Week Beginning,SortOrder,Pathogen,Region,Weighted Average Normalized Value
9/21/2025,9/21/2025,SARS-CoV-2,Central,361.704314611
8/24/2025,8/24/2025,RSV,Southwest,9.065401689
2/1/2026,2/1/2026,Influenza B,Southwest,0
9/20/2026,9/20/2026,SARS-CoV-2,Metropolitan,105.075
9/20/2026,9/20/2026,SARS-CoV-2,Northeast,226.795
9/20/2026,9/20/2026,SARS-CoV-2,Southeast,75.96
9/20/2026,9/20/2026,SARS-CoV-2,West Central,150.811`
    const { series, diag } = normAt(csv, specOf('ww-regional'))
    expect(diag.geo).toMatchObject({ level: 'region', scheme: 'district' })
    const central = pick(series, 'covid', 'Central')!
    expect(central.points).toEqual([['2025-09-27', 361.704]])
    expect(central.geo.type).toBe('mdh-district')
    expect(central.geo.population).toBeUndefined()
    expect(central.geo.counties!.length).toBeGreaterThan(5)
    expect(pick(series, 'rsv', 'South')!.points).toEqual([['2025-08-30', 9.065]])
  })

  // REAL: wwsite.csv header and first rows; the aggregate plant names "Northeast" and "Statewide Weighted"
  // are REAL names from the same file (values from the published output).
  it('parses plant data, skips region/statewide aggregate rows and never guesses metro plant counties', () => {
    const csv = `Week Beginning,Pathogen,Wastewater Treatment Plant,Region,Average Normalized Concentration,Population Served
5/10/2026,Influenza A,Eagles Point WWTP,Metropolitan,0,114148
6/7/2026,Influenza B,Buffalo WWTP,Central,0,16168
10/19/2025,Influenza A,Blue Lake WWTP,Metropolitan,0,450074
9/20/2026,SARS-CoV-2,Northeast,Northeast,226.795,
9/20/2026,SARS-CoV-2,Statewide Weighted,Statewide,108.974,`
    const { series, diag } = normAt(csv, specOf('ww-site'))
    expect(series.map((s) => s.geo.name).sort()).toEqual(['Blue Lake WWTP', 'Buffalo WWTP', 'Eagles Point WWTP'])
    expect(diag.skipped['region/statewide aggregate row in site file']).toBe(2)
    const buffalo = pick(series, 'influenza-b', 'mdh-buffalo-wwtp')!
    expect(buffalo.points).toEqual([['2026-06-13', 0]])
    expect(buffalo.geo).toMatchObject({ population: 16168 })
    expect(buffalo.geo.coord).toBeDefined()
    expect(buffalo.geo.counties).toBeUndefined()
    expect(pick(series, 'influenza-a', 'mdh-eagles-point-wwtp')!.geo.coord).toBeUndefined()
    // The detection-map file lists each plant's county (REAL header and rows).
    const map = csvToGrid(`Detection Status,Pathogen,Wastewater Treatment Plant,Week Beginning,Region,County Name,Population Served
Not detected,Influenza A,Little Falls WWTP,8/30/2026,Central,Morrison,9140
Not detected,Influenza B,Little Falls WWTP,8/30/2026,Central,Morrison,9140
Not detected,RSV,Little Falls WWTP,8/30/2026,Central,Morrison,9140`)
    expect(plantLookup(map.header, map.rows).get('little falls wwtp')).toEqual({ counties: ['27097'], population: 9140 })
  })

  // REAL: wwhosp.csv header and first rows (the statewide value equals the regional file's statewide row).
  it('parses the statewide wastewater file and ignores its hospitalization column', () => {
    const { series, diag } = normAt(`Hospitalization Rate,Date,Normalized Weighted Concentration,population_served
0.8,7/27/2025,236.884463999,
1.6,9/28/2025,187.192034142,
0.3,8/9/2026,46.502261265,`, specOf('ww-hosp'))
    expect(series.map((s) => [s.pathogen, s.geo.code, s.points])).toEqual([['covid', '27', [['2025-08-02', 236.884], ['2025-10-04', 187.192], ['2026-08-15', 46.5]]]])
    expect(diag.valueColumns.find((c) => c.column === 'Hospitalization Rate')!.status).toMatch(/not mapped/)
  })

  // REAL: tsys.csv is UTF-16LE with a byte-order mark (header and first row decoded from the CI sample).
  it('decodes UTF-16 CSVs', () => {
    const text = 'Week of Visit Admit Datetime,COVID-19 Diagnosis (%),Cough (%),Influenza-like illness (%),Shortness of Breath (%),\r\n07/12/20,0.2%,0.2%,0.0%,0.5%,\r\n'
    const body = Buffer.from(text, 'utf16le')
    const buf = new Uint8Array(body.length + 2)
    buf.set([0xff, 0xfe])
    buf.set(body, 2)
    const g = csvToGrid(decodeText(buf.buffer))
    expect(g.header.slice(0, 5)).toEqual(['Week of Visit Admit Datetime', 'COVID-19 Diagnosis (%)', 'Cough (%)', 'Influenza-like illness (%)', 'Shortness of Breath (%)'])
    expect(g.rows[0].slice(0, 2)).toEqual(['07/12/20', '0.2%'])
  })

  it('skips layouts that cannot be mapped honestly (REAL headers)', () => {
    const mls = ['Year', 'Week of date', 'County', 'Molecular_FluTestTotal', 'Singleplex_COVIDTestTotal', 'Singleplex_COVID', 'MMP_TestTotal', 'MMP_hMPV', 'MMP_Rhinovirus', 'MMP_PIV1', 'F53']
    expect(specOf('mls-other-molecular').headerSkip!(mls)).toMatch(/panel test total mixes/)
    expect(specOf('flu-hosp-region').headerSkip!(['Season', 'Region', 'Number of hospitalizations', 'Incidence rate'])).toMatch(/no weekly/)
    expect(specOf('flu-hosp-type').skip).toMatch(/by Season/)
    expect(specOf('syndromic').skip).toMatch(/ADT/)
  })

  // REAL layout and partial REAL values (MDH 9/10/2026 county table: Aitkin 0, Anoka 22, Becker 0, ...).
  it('parses the pertussis county table; a total needs a Total row or all 87 counties', () => {
    const real: [string, number][] = [
      ['Aitkin', 0], ['Anoka', 22], ['Becker', 0], ['Hennepin', 44], ['Ramsey', 24], ['Dakota', 15], ['Wright', 13], ['Isanti', 11],
      ['Washington', 6], ['Scott', 5], ['Nicollet', 4], ['Otter Tail', 4], ['Beltrami', 3], ['Carver', 3], ['Sherburne', 3], ['St. Louis', 3], ['Blue Earth', 2],
    ]
    const page = (rows: [string, number | string][], extra = '') =>
      parsePage(
        `<div id="block-bootstrap-mdh-content"><h1>Pertussis Statistics, 2026</h1><p>Updated 9/10/2026</p><p>Vaccination guidance as of 1/5/2026.</p>${extra}<h3>County of residence table</h3><table><thead><tr><th>County</th><th>Number of Cases</th></tr></thead><tbody>${rows
          .map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`)
          .join('')}</tbody></table></div>`,
        'https://www.health.state.mn.us/diseases/pertussis/stats/stats26.html',
      )
    const partial = parsePertussisPage(page([...real, ['Unknown', 1]]), 2026)
    expect(partial.total).toBeUndefined()
    expect(partial.problem).toMatch(/incomplete \(17 of 87/)
    expect(partial.asOf).toBe('2026-09-10') // the page Updated date, not the unrelated "as of 1/5/2026"
    expect(partial.counties[0]).toEqual({ fips: '27053', name: 'Hennepin', cases: 44 })
    // ILLUSTRATIVE: the other 70 counties filled with 0 to make a complete table.
    const known = new Set(real.map(([n]) => countyByName(n)!.fips))
    const complete: [string, number][] = [...real, ...MN_COUNTIES.filter((c) => !known.has(c.fips)).map((c) => [c.name, 0] as [string, number]), ['Unknown', 1]]
    const full = parsePertussisPage(page(complete), 2026)
    expect(full).toMatchObject({ total: 163, totalBasis: 'sum of a complete county table', unknownCounty: 1 })
    expect(full.counties).toHaveLength(87)
    const series = pertussisCountySeries(full.counties.slice(0, 2), 2026, full.asOf!, full.total, 'stats26.html')
    expect(series[0]).toMatchObject({ id: 'mdh:mdh-other:pertussis:cases_ytd:county:27053', metric: 'cases_ytd', points: [['2026-09-10', 44]] })
    expect(series[0].summary).toBe('Hennepin County: 44 of 163 Minnesota cases so far in 2026 (as of 2026-09-10).')
    // A side-by-side County | Cases | County | Cases layout reads every pair.
    const pairs = parsePage(
      `<p>Cases as of 9/10/2026</p><table><thead><tr><th>County</th><th>Cases</th><th>County</th><th>Cases</th></tr></thead><tbody>
<tr><td>Anoka</td><td>22</td><td>Hennepin</td><td>44</td></tr><tr><td>Dakota</td><td>15</td><td>Isanti</td><td>11</td></tr></tbody></table>`,
      'https://x/',
    )
    const pp = parsePertussisPage(pairs, 2026)
    expect(pp.counties.map((c) => c.name).sort()).toEqual(['Anoka', 'Dakota', 'Hennepin', 'Isanti'])
    expect(pp.total).toBeUndefined()
    expect(pp.asOf).toBe('2026-09-10')
  })

  // REAL header and 2016-2018 rows; 2026 row from MDH's reported 18 cases, all exposed within the U.S.
  it('reads the measles "Total cases" column, not the imported-case column', () => {
    const html = `<div id="block-bootstrap-mdh-content"><p>Updated 10/1/2026</p><h2>Annual incidence of measles disease in Minnesota, 2016-2026</h2>
<table><thead><tr><th>Year</th><th>Exposure outside U.S. (imported case)</th><th>Exposure within U.S.</th><th>Other*</th><th>Total cases</th></tr></thead><tbody>
<tr><td>2016</td><td>2</td><td>0</td><td>0</td><td>2</td></tr><tr><td>2017</td><td>0</td><td>75</td><td>0</td><td>75</td></tr>
<tr><td>2018</td><td>2</td><td>0</td><td>0</td><td>2</td></tr><tr><td>2026</td><td>0</td><td>18</td><td>0</td><td>18</td></tr></tbody></table></div>`
    const mp = parseMeaslesPage(parsePage(html, 'https://www.health.state.mn.us/diseases/measles/stats.html'), 2026)
    expect(mp).toMatchObject({ cases: 18, asOf: '2026-10-01' })
    expect(mp.basis).toMatch(/Total cases/)
    const s = ytdSeries('measles', 2026, 18, '2026-10-01', {}, 'confirmed measles cases')
    expect(s).toMatchObject({ id: 'mdh:mdh-other:measles:cases_ytd:state:27', metric: 'cases_ytd', unit: 'count', points: [['2026-10-01', 18]] })
  })
})

describe('mdh series assembly', () => {
  const mk = (id: string, points: Series['points'], file: string): Series =>
    ({ id, source: 'mdh', dataset: 'mdh-respnet', pathogen: 'covid', metric: 'hosp_rate', unit: 'per100k', geo: { type: 'state', code: '27', name: 'Minnesota' }, label: 'x', points, attrs: { mdhFile: file } }) as Series

  it('merges a family deterministically (primary file wins overlaps) and logs conflicts', () => {
    const season = { series: mk('a', [['2026-09-19', 1.0], ['2026-09-26', 1.2]], 'respnetall.csv'), family: 'respnet-state', priority: 11, file: 'respnetall.csv' }
    const county = { series: mk('a', [['2026-09-12', 0.9], ['2026-09-26', 1.0]], 'respnetcounty.csv'), family: 'respnet-state', priority: 10, file: 'respnetcounty.csv' }
    const results = [[season, county], [county, season]].map((order) => {
      const book = new SeriesBook()
      for (const b of order) book.add({ ...b, series: { ...b.series, points: [...b.series.points] } })
      return book
    })
    for (const book of results) {
      expect(book.byId.get('a')!.series.points).toEqual([['2026-09-12', 0.9], ['2026-09-19', 1], ['2026-09-26', 1.2]])
      expect(book.collisions[0]).toMatch(/1 overlapping week\(s\) differ; kept respnetall\.csv over respnetcounty\.csv/)
    }
  })

  it('carries forward last run\'s series when their file fails to download', async () => {
    vi.stubEnv('GITHUB_ACTIONS', '')
    const root = mkdtempSync(path.join(tmpdir(), 'mdh-root-'))
    mkdirSync(path.join(root, 'public', 'data', 'series'), { recursive: true })
    const prevRsv = { ...mk('mdh:mdh-lab:rsv:test_positivity:state:27', [['2026-09-19', 0.2], ['2026-09-26', 0.3]], 'mls_rsv.csv'), dataset: 'mdh-lab', pathogen: 'rsv', metric: 'test_positivity', unit: '%' }
    writeFileSync(path.join(root, 'public', 'data', 'series', 'mdh__mdh-lab.json'), JSON.stringify({ source: 'mdh', dataset: 'mdh-lab', generatedAt: '2026-10-01T00:00:00Z', series: [prevRsv] }))
    const page = (b: string) => `<html><body><div id="block-bootstrap-mdh-content"><p>Updated 10/1/2026</p>${b}</div></body></html>`
    const files: Record<string, string> = {
      '/diseases/flu/stats/lab.html': page(`<a href="mls_flutype.csv">Weekly Total of Influenza Positive Tests and Percent Positivity (CSV)</a>`),
      '/diseases/flu/stats/mls_flutype.csv': `Season,Week Start Date,Flu Type A/B,Frequency,% Flu Positive\n2025-26,9/20/2026,Flu A,1,1.1\n`,
      '/diseases/respiratory/stats/lab.html': page(`<a href="mls_rsv.csv">MLS Weekly RSV Positive Tests and Percent Positivity (CSV)</a>`),
    }
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const body = files[new URL(String(input)).pathname]
      return body == null ? new Response('Not found', { status: 404 }) : new Response(body, { status: 200 })
    })
    const log = createLogger('mdh-test')
    log.info = () => {}
    log.warn = () => {}
    try {
      const res = await mdh.run({ now: '2026-10-07T18:00:00Z', log, historyStart: '2021-07-01', cacheDir: mkdtempSync(path.join(tmpdir(), 'mdh-c-')), rootDir: root })
      const lab = res.datasets.find((d) => d.dataset === 'mdh-lab')!.series
      expect(lab.map((s) => s.id)).toEqual(['mdh:mdh-lab:influenza:test_positivity:state:27', 'mdh:mdh-lab:rsv:test_positivity:state:27'])
      expect(lab[1].attrs?.mdhCarriedForward).toMatch(/not fetched/)
      expect(lab[1].points).toEqual(prevRsv.points)
      expect((res.diagnostics as { carriedForward: string[] }).carriedForward).toEqual(['mdh:mdh-lab:rsv:test_positivity:state:27'])
    } finally {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    }
  }, 60_000)
})
