// Tests for the MDH source: page crawler, CSV normalizer, region schemes, watch-list pages and an
// offline end-to-end run with a stubbed fetch.
//
// FIXTURES: MDH pages are not reachable from the development sandbox and the new 2025-26 CSV schemas
// are undocumented, so most fixtures below are ILLUSTRATIVE OF FORMAT ONLY (MDH conventions: snake_case
// headers, MMWR "YYYYWW" strings, "Total" rows, m/d/yyyy dates, week × season matrices). Their numbers
// are made up unless marked REAL. The one REAL fixture is a set of rows from MDH's legacy COVID-19
// hcounty.csv as captured by MPR News (report date 2024-01-25).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from '../../pipeline/lib/log'
import { parsePage } from '../../pipeline/lib/mdh-crawl'
import { countyGeo, detectRegionScheme, PLANT_CITIES, plantCounty, regionGeo, regionToken } from '../../pipeline/lib/mdh-geo'
import {
  csvToGrid, detectPathogens, headerRole, normalizeTable, parseDateCell, parseSeason, parseYearWeek, roundValue,
  seasonWeekEnding, type NormalizeSpec,
} from '../../pipeline/lib/mdh-normalize'
import { parseMeaslesPage, parsePertussisPage } from '../../pipeline/lib/mdh-watch'
import { LINK_SPECS, matchSpec, mdh } from '../../pipeline/sources/mdh'
import { countyByName } from '../../shared/geo/mnCounties'

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
    expect(detectRegionScheme(['Metro', 'Northwest', 'Northeast', 'Central', 'Southwest', 'South Central', 'Southeast'])).toBe('wastewater')
    expect(detectRegionScheme(['Twin Cities Metro', 'Greater Minnesota'])).toBe('metro-greater')
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
    expect(plantCounty('Mankato WWTP')).toBe('27013')
    expect(plantCounty('St. Cloud')).toBe('27145')
    expect(plantCounty('Metro Plant (St. Paul)')).toBe('27123')
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
    expect(m.geo).toMatchObject({ type: 'sewershed', name: 'Mankato', counties: ['27013'] })
    expect(m.geo.coord![0]).toBeCloseTo(-94.07, 0)
    expect(m.geo.coord![1]).toBeCloseTo(44.03, 0)
    expect(m.attrs?.coordBasis).toMatch(/plant city/)
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

  it('treats mostly-suppressed count columns as numeric and omits suppressed cells', () => {
    const csv = `week_end,county,case_count\n10/3/2026,Traverse,<5\n10/3/2026,Hennepin,106\n10/3/2026,Cook,<5\n10/3/2026,Lake,*`
    const { series } = norm(csv, { pathogens: ['covid'], defaultPathogen: 'covid', metrics: ['hosp_admissions'] })
    expect(series.map((s) => [s.geo.code, s.points])).toEqual([['27053', [['2026-10-03', 106]]]])
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
    ['RESP-NET by County, 2023-2025 (CSV)', 'respnet-county-archive'],
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
    expect(ids).toContain('mdh:mdh-other:pertussis:cases:state:27:ytd')
    expect(ids).toContain('mdh:mdh-other:measles:cases:state:27:ytd')
    const lab = all.find((s) => s.id === 'mdh:mdh-lab:influenza:test_positivity:state:27')!
    expect(lab.points).toEqual([['2026-09-26', 1], ['2026-10-03', 1.1]])
    expect(lab.attrs).toMatchObject({ mdhFile: 'flulab.csv', mdhUpdated: '2026-10-01' })
    const henn = all.find((s) => s.id === 'mdh:mdh-respnet-county:covid:hosp_rate:county:27053')!
    expect(henn.provisionalFrom).toBe('2026-10-03')
    expect(lab.provisionalFrom).toBeUndefined()
    const pert = all.find((s) => s.pathogen === 'pertussis')!
    expect(pert.points).toEqual([['2026-09-12', 186]])
    expect(pert.note).toMatch(/cumulative/)
    const ww = all.find((s) => s.id.endsWith('ww-metro'))!
    expect(ww.points).toEqual([['2025-09-27', 0.00051]])
    for (const s of all) {
      expect(s.points.map((p) => p[0])).toEqual([...s.points.map((p) => p[0])].sort())
      for (const [d] of s.points) expect(new Date(`${d}T00:00:00Z`).getUTCDay()).toBe(6)
    }
    const diag = res.diagnostics as { summary: Record<string, unknown>; files: { url: string; status: string; reason?: string; header?: string[] }[] }
    expect(diag.summary.hostsUsed).toEqual(['www.health.mn.gov'])
    expect(diag.summary.csvParsed).toBe(3)
    expect(diag.files.find((f) => f.url.endsWith('broken.csv'))!.status).toBe('error')
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
