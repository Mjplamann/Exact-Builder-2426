// Tests for the BioFire source: organism mapping, CSV import formats and the USMA report parser.
//
// FORMAT FIXTURES: BioFire publishes no public data files, so these inputs are built from the documented
// formats (BioFire Trend export "Trend <Organism> Detection Rates <date>.csv" with Week,US,Northeast,Midwest,
// West,South proportions; the MN Pulse long format in data/manual/biofire/README.md; and report wording quoted
// in public search snippets of bioMérieux USMA TRENDS reports). The numbers are illustrative, not real data.
import { describe, expect, it } from 'vitest'
import { findOrganismsInText, matchOrganism } from '../../pipeline/lib/biofire-organisms.ts'
import { columnsOf, detectFormat, mergeObservations, parseLongCsv, parseWideCsv } from '../../pipeline/lib/biofire-manual.ts'
import {
  PAGE_BREAK, extractPdfLinks, itemsToRows, parseMidwestTables, parseSentence, parseUsmaReport, parseWindowFromName,
  parseWindowFromText, reportNumber, windowWeek,
} from '../../pipeline/lib/biofire-usma.ts'
import { biofire, buildTrendSeries, buildUsmaSeries } from '../../pipeline/sources/biofire.ts'

describe('organism mapping', () => {
  it('maps BioFire target names, file-name spellings and codes', () => {
    expect(matchOrganism('Mycoplasma pneumoniae')?.pathogen).toBe('mycoplasma')
    expect(matchOrganism('Influenza A/H1-2009')).toMatchObject({ code: 'FLUA_H1_2009', pathogen: 'influenza-a', variant: 'h1-2009' })
    expect(matchOrganism('Influenza A H1 2009')?.code).toBe('FLUA_H1_2009')
    expect(matchOrganism('Influenza A')).toMatchObject({ code: 'FLUA', pathogen: 'influenza-a' })
    expect(matchOrganism('Influenza A')?.variant).toBeUndefined()
    expect(matchOrganism('Human Rhinovirus/Enterovirus')?.pathogen).toBe('rhino-entero')
    expect(matchOrganism('Human Rhinovirus Enterovirus')?.pathogen).toBe('rhino-entero')
    expect(matchOrganism('SARS-CoV-2')?.pathogen).toBe('covid')
    expect(matchOrganism('Coronavirus OC43')).toMatchObject({ pathogen: 'seasonal-cov', variant: 'oc43' })
    expect(matchOrganism('Parainfluenza Virus 3')).toMatchObject({ pathogen: 'parainfluenza', variant: 'piv3' })
    expect(matchOrganism('Bordetella pertussis (ptxP)')?.pathogen).toBe('pertussis')
    expect(matchOrganism('Chlamydia pneumoniae')?.pathogen).toBe('chlamydia-pneumoniae')
    expect(matchOrganism('Norovirus GI/GII')?.pathogen).toBe('norovirus')
    expect(matchOrganism('Shigella/Enteroinvasive E. coli (EIEC)')?.pathogen).toBe('shigella')
    expect(matchOrganism('Clostridioides difficile (toxin A/B)')?.pathogen).toBe('c-diff')
    expect(matchOrganism('Adenovirus F40 41')?.pathogen).toBe('adenovirus-gi')
    expect(matchOrganism('rsv')?.code).toBe('RSV')
    expect(matchOrganism('COV_229E')?.variant).toBe('229e')
  })

  it('uses the panel to tell GI adenovirus from respiratory adenovirus', () => {
    expect(matchOrganism('Adenovirus')?.pathogen).toBe('adenovirus')
    expect(matchOrganism('Adenovirus', 'GI')?.pathogen).toBe('adenovirus-gi')
    expect(matchOrganism('ADV', 'GI')?.code).toBe('ADV_F4041')
  })

  it('recognizes untracked targets and rejects unknown names (no substring guessing)', () => {
    expect(matchOrganism('Bordetella parapertussis (IS1001)')).toMatchObject({ code: 'BPARA', pathogen: null })
    expect(matchOrganism('Enteropathogenic E. coli (EPEC)')?.pathogen).toBeNull()
    expect(matchOrganism('Mystery virus')).toBeNull()
    expect(matchOrganism('Influenza A H5')).toBeNull()
  })

  it('finds organisms in narrative text, longest phrase first', () => {
    const codes = (s: string) => findOrganismsInText(s).map((h) => h.def.code)
    expect(codes('Influenza A/H3 rose while influenza B was flat')).toEqual(['FLUA_H3', 'FLUB'])
    expect(codes('SARS-CoV-2 and HRV/EV')).toEqual(['SARS2', 'RVEV'])
    expect(codes('PIV3 and RSV')).toEqual(['PIV3', 'RSV'])
    expect(codes('the virus was observed')).toEqual([])
  })
})

// Format fixture: BioFire Trend wide export (columns per the documented file layout; values illustrative).
const WIDE = `Week,US,Northeast,Midwest,West,South
2024-06-02,0.0061,0.0050,0.0072,0.0049,0.0068
2024-06-09,0.0069,0.0055,0.0081,0.0052,0.0075
2024-06-16,0.0074,0.0061,,0.0058,0.0079
2024-06-23,0.0082,0.0066,NA,0.0063,0.0088
`

describe('BioFire Trend wide CSV (format fixture)', () => {
  it('detects the format from the header', () => {
    expect(detectFormat(columnsOf(WIDE))).toBe('wide')
  })

  it('reads US and Midwest, converts proportions to percent and keys weeks by Saturday', () => {
    const { obs, report } = parseWideCsv('Trend Mycoplasma pneumoniae Detection Rates 2024-06-30.csv', WIDE)
    expect(report.organismCode).toBe('MPNEU')
    expect(report.snapshot).toBe('2024-06-30')
    expect(report.weekdays).toEqual({ Sun: 4 })
    const mw = obs.filter((o) => o.geo === 'Midwest')
    // Blank cell → no point; "NA" → null.
    expect(mw.map((o) => [o.week, o.value == null ? null : Math.round(o.value * 1000) / 1000])).toEqual([
      ['2024-06-08', 0.72],
      ['2024-06-15', 0.81],
      ['2024-06-29', null],
    ])
    expect(obs.filter((o) => o.geo === 'US')).toHaveLength(4)
    expect(obs.every((o) => o.vintage === '2024-06-30' && o.smoothing === '3wk_centered')).toBe(true)
    expect(report.warnings).toEqual([])
  })

  it('rejects files whose values are not proportions, or whose name gives no organism', () => {
    const pct = WIDE.replace('0.0061', '0.61').replace('0.0069', '1.69')
    const a = parseWideCsv('Trend RSV Detection Rates 2024-06-30.csv', pct)
    expect(a.obs).toHaveLength(0)
    expect(a.report.warnings[0]).toMatch(/exceed 1/)
    const b = parseWideCsv('export.csv', WIDE)
    expect(b.obs).toHaveLength(0)
    expect(b.report.warnings[0]).toMatch(/file name/)
    const c = parseWideCsv('Trend Enteropathogenic E. coli (EPEC) Detection Rates 2024-06-30.csv', WIDE)
    expect(c.obs).toHaveLength(0)
  })

  it('warns on schema drift', () => {
    const drift = 'Week,US,Midwest,Extra\n2024-06-02,0.01,0.02,9\n'
    const { obs, report } = parseWideCsv('Trend RSV Detection Rates 2024-06-30.csv', drift)
    expect(obs).toHaveLength(2)
    expect(report.warnings.join(' ')).toMatch(/missing: Northeast, West, South/)
    expect(report.warnings.join(' ')).toMatch(/unexpected column\(s\) ignored: Extra/)
  })
})

// Format fixture: MN Pulse long format (columns per data/manual/biofire/README.md; values illustrative).
const LONG = `source,panel,organism_code,organism_label,geo_type,geo_code,week_start,detection_rate,smoothing,n_tests,n_positive,n_sites,provisional,retrieved_at,source_url,notes
biofire_trend,RP2.1,PIV3,Parainfluenza Virus 3,census_region,Midwest,2026-09-13,0.0110,3wk_centered,,,14,false,2026-10-05,https://syndromictrends.com/,
biofire_trend,RP2.1,PIV3,Parainfluenza Virus 3,census_region,Midwest,2026-09-20,0.0102,3wk_centered,,,14,true,2026-10-05,https://syndromictrends.com/,
biofire_trend,GI,,Adenovirus,census_region,Midwest,2026-09-20,0.0310,,,,,,2026-10-05,,
biofire_trend,RP2.1,RSV,Respiratory Syncytial Virus,census_region,Northeast,2026-09-20,0.0050,3wk_centered,,,,,2026-10-05,,
partner_lab,RP2.1,RSV,Respiratory Syncytial Virus,site,LAB-01,2026-09-20,0.0040,weekly_raw,250,1,1,,2026-10-05,,
biofire_trend,RP2.1,RSV,Respiratory Syncytial Virus,census_region,Midwest,2026-09-20,1.5,3wk_centered,,,,,2026-10-05,,
biofire_trend,RP2.1,RSV,Respiratory Syncytial Virus,nation,US,2026-09-21,0.0060,weekly_raw,,,,,2026-10-05,,
biofire_trend,GI,NORO,Norovirus GI/GII,census_region,Midwest,2026-09-20,,3wk_centered,,,,,2026-10-05,,
biofire_trend,GI,EPEC,,census_region,Midwest,2026-09-20,0.0800,3wk_centered,,,,,2026-10-05,,
biofire_trend,RP2.1,XYZ,Mystery virus,census_region,Midwest,2026-09-20,0.0100,3wk_centered,,,,,2026-10-05,,
`

describe('MN Pulse long CSV (format fixture)', () => {
  it('detects the format and parses kept rows', () => {
    expect(detectFormat(columnsOf(LONG))).toBe('long')
    const { obs, report } = parseLongCsv('long.csv', LONG, '2026-01-01')
    expect(report.accepted).toBe(5)
    expect(report.skipped).toEqual({ 'other-region': 1, 'site-level': 1, 'out-of-range': 1, 'untracked-organism': 1, 'unmapped-organism': 1 })
    expect(report.notes).toEqual({ 'week_start-not-sunday': 1 })
    const piv = obs.filter((o) => o.def.code === 'PIV3')
    expect(piv.map((o) => [o.week, Math.round(o.value! * 100) / 100, o.provisional, o.nSites])).toEqual([
      ['2026-09-19', 1.1, false, 14],
      ['2026-09-26', 1.02, true, 14],
    ])
    expect(obs.find((o) => o.def.code === 'ADV_F4041')?.smoothing).toBe('3wk_centered')
    expect(obs.find((o) => o.def.code === 'NORO')?.value).toBeNull()
    // Monday week start → the MMWR week (Sun–Sat) holding most of its days.
    expect(obs.find((o) => o.def.code === 'RSV')).toMatchObject({ geo: 'US', week: '2026-09-26', smoothing: 'weekly_raw' })
  })

  it('accepts week_end and uses the file fallback vintage when retrieved_at is blank', () => {
    const csv = 'organism_code,geo_type,geo_code,week_end,detection_rate\nFLUB,census_region,Midwest,2026-09-26,0.004\n'
    const { obs } = parseLongCsv('x.csv', csv, '2026-09-30')
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ week: '2026-09-26', vintage: '2026-09-30', value: 0.4 })
  })
})

describe('merging and series building', () => {
  it('keeps the newest snapshot per week and drops weeks before historyStart', () => {
    const older = parseWideCsv('Trend Influenza A Detection Rates 2026-09-27.csv', 'Week,US,Midwest\n2026-09-13,0.0044,0.0038\n2026-09-20,0.0049,0.0040\n').obs
    const newer = parseWideCsv('Trend Influenza A Detection Rates 2026-10-04.csv', 'Week,US,Midwest\n2026-09-20,0.0051,0.0043\n2026-09-27,0.0058,0.0047\n').obs
    const merged = mergeObservations([...newer, ...older], '2026-09-20')
    const mw = merged.find((g) => g.geo === 'Midwest')!
    expect(mw.obs.map((o) => [o.week, o.vintage])).toEqual([
      ['2026-09-26', '2026-10-04'],
      ['2026-10-03', '2026-10-04'],
    ])
    const series = buildTrendSeries(merged)
    const s = series.find((x) => x.geo.code === 'Midwest')!
    expect(s.id).toBe('biofire:biofire-trend:influenza-a:detection_rate:census-region:Midwest')
    expect(s.unit).toBe('%')
    expect(s.geo).toEqual({ type: 'census-region', code: 'Midwest', name: 'Midwest (12 states incl. MN)' })
    expect(s.points).toEqual([['2026-09-26', 0.43], ['2026-10-03', 0.47]])
    expect(s.provisionalFrom).toBe('2026-10-03')
    expect(s.attrs?.file).toBe('Trend Influenza A Detection Rates 2026-10-04.csv')
    expect(series.find((x) => x.geo.code === 'US')?.id).toBe('biofire:biofire-trend:influenza-a:detection_rate:national:US')
  })

  it('gives sub-targets and non-default smoothing their own variant ids, listed after main series', () => {
    const { obs } = parseLongCsv('long.csv', LONG, '2026-01-01')
    const series = buildTrendSeries(mergeObservations(obs, '2021-07-01'))
    const ids = series.map((s) => s.id)
    expect(ids).toContain('biofire:biofire-trend:parainfluenza:detection_rate:census-region:Midwest:piv3')
    expect(ids).toContain('biofire:biofire-trend:rsv:detection_rate:national:US:weekly-raw')
    const firstVariant = ids.findIndex((id) => id.split(':').length > 6)
    expect(ids.slice(firstVariant).every((id) => id.split(':').length > 6)).toBe(true)
    // Earliest flagged-provisional week starts the provisional tail.
    expect(series.find((s) => s.id.endsWith(':piv3'))?.provisionalFrom).toBe('2026-09-26')
    // weekly_raw rows are not smoothed, so nothing is provisional unless flagged.
    expect(series.find((s) => s.id.endsWith(':weekly-raw'))?.provisionalFrom).toBeUndefined()
  })
})

describe('USMA TRENDS reports', () => {
  it('collects report PDF links from the index page without guessing names', () => {
    const html = `<a href="/content/dam/biomerieux-com/medical-affairs/10-syndromic-trends-reports/trends-reports/2026/36--USMA-TRENDS-Insights-Respiratory-Report-16AUG26-29AUG26.pdf">36</a>
      <div data-path="\\/content\\/dam\\/biomerieux-com\\/medical-affairs\\/10-syndromic-trends-reports\\/trends-reports\\/2026\\/25-USMA-TRENDS-Insights-Report-4JAN26-17JAN26.pdf"></div>
      <a href="https://www.biomerieux.com/us/en/brochure.pdf">x</a>`
    const links = extractPdfLinks(html)
    expect(links).toEqual([
      'https://www.biomerieux.com/content/dam/biomerieux-com/medical-affairs/10-syndromic-trends-reports/trends-reports/2026/36--USMA-TRENDS-Insights-Respiratory-Report-16AUG26-29AUG26.pdf',
      'https://www.biomerieux.com/content/dam/biomerieux-com/medical-affairs/10-syndromic-trends-reports/trends-reports/2026/25-USMA-TRENDS-Insights-Report-4JAN26-17JAN26.pdf',
    ])
  })

  it('reads report windows from the documented file-name variants', () => {
    const w = (n: string) => {
      const r = parseWindowFromName(n)
      return r && [r.start, r.end]
    }
    expect(w('06--USMA-TRENDS-Report-02FEB2025-15FEB2025.pdf')).toEqual(['2025-02-02', '2025-02-15'])
    expect(w('18--USMA-TRENDS-Insights-Report-21SEP25-4OCT25.pdf')).toEqual(['2025-09-21', '2025-10-04'])
    expect(w('24--USMA-TRENDS-Insights-Report-14DEC25-3JAN26.pdf')).toEqual(['2025-12-14', '2026-01-03'])
    expect(w('25-USMA-TRENDS-Insights-Report-4JAN26-17JAN26.pdf')).toEqual(['2026-01-04', '2026-01-17'])
    expect(w('36--USMA-TRENDS-Insights-Respiratory-Report-16AUG26-29AUG26.pdf')).toEqual(['2026-08-16', '2026-08-29'])
    expect(w('USMA-TRENDS-Report.pdf')).toBeNull()
    expect(reportNumber('.../2026/25-USMA-TRENDS-Insights-Report-4JAN26-17JAN26.pdf')).toBe(25)
    expect(reportNumber('/2025/06--USMA-TRENDS-Report-02FEB2025-15FEB2025.pdf')).toBe(6)
  })

  it('reads report windows from text and maps them to the week-ending Saturday', () => {
    const t = parseWindowFromText('USMA TRENDS Insights Respiratory Report: August 16 - August 29, 2026')!
    expect([t.start, t.end]).toEqual(['2026-08-16', '2026-08-29'])
    const t2 = parseWindowFromText('Reporting period Dec 14, 2025 – Jan 3, 2026')!
    expect([t2.start, t2.end]).toEqual(['2025-12-14', '2026-01-03'])
    expect(windowWeek(t)).toBe('2026-08-29')
    expect(windowWeek({ start: '2026-08-17', end: '2026-08-30', raw: '' })).toBe('2026-08-29')
  })

  it('accepts only unambiguous Midwest sentences', () => {
    // Wording from a public search snippet of report 24's GI section.
    const ok = parseSentence('Midwest norovirus 17% in the past two weeks vs a 12-week average of 12.2%.')
    expect(ok).toMatchObject({ def: { code: 'NORO' }, rate: 17, avg12wk: 12.2, strategy: 'sentence' })
    const ok2 = parseSentence('In the Midwest, influenza A detection rose to 3.2% over the past 2 weeks, above the 12-week average (1.1%).')
    expect(ok2).toMatchObject({ def: { code: 'FLUA' }, rate: 3.2, avg12wk: 1.1 })
    // Not relevant: no 12-week average phrase.
    expect(parseSentence('Midwest HRV/EV peaked at 25.4% then fell to 22.9%.')).toBeNull()
    expect(parseSentence('In the South, RSV was 1.0% in the past two weeks vs a 12-week average of 0.5%.')).toBeNull()
    // Ambiguous → rejected with a reason.
    expect(parseSentence('In the Midwest and South, RSV was 1.0% in the past two weeks vs a 12-week average of 0.5%.')).toEqual({ reason: 'several regions in one sentence' })
    expect(parseSentence('In the Midwest, RSV and hMPV were 1.0% in the past two weeks vs a 12-week average of 0.5%.')).toEqual({ reason: 'several organisms in one sentence' })
    expect(parseSentence('In the Midwest, RSV was 1.0% (12-week average 0.5%, prior 0.7%) in the past two weeks.')).toEqual({ reason: 'expected 2 percentages, found 3' })
    expect(parseSentence('In the Midwest, RSV was 1.0% compared with 0.5% for the 12-week average.')).toEqual({ reason: 'no 2-week window cue' })
    expect(parseSentence('Midwest RSV had a 12-week average of 0.8%, below the national rate of 1.5% in the past two weeks.')).toEqual({ reason: 'also mentions national or other geographies' })
    expect(parseSentence('In the Midwest, RSV was 1.0% in the past two weeks vs a 12-week average of 0.5% (U.S. trend shown).')).toEqual({ reason: 'also mentions national or other geographies' })
  })

  it('parses Midwest table rows only under a Midwest heading with an explicit header', () => {
    const rows = [
      'South',
      'Organism | Past 2 Weeks | 12-Week Average',
      'HRV/EV | 30.1% | 25.0%',
      'Midwest',
      'Organism | 12-Week Average | Past 2 Weeks',
      'HRV/EV | 17.2% | 19.8%',
      'Parainfluenza Virus 3 | 2.0 | 1.1',
      'Influenza A/H3 | 0.3% | 0.4% | +33%',
    ]
    const { accepted, rejected } = parseMidwestTables(rows)
    expect(accepted.map((f) => [f.def.code, f.rate, f.avg12wk])).toEqual([
      ['RVEV', 19.8, 17.2],
      ['PIV3', 1.1, 2.0],
    ])
    expect(rejected).toEqual([{ reason: 'table row: expected 2 numbers, found 3', text: 'Influenza A/H3 | 0.3% | 0.4% | +33%' }])
  })

  it('ends the Midwest table context at another region, the nation or a page break', () => {
    const header = 'Organism | Past 2 Weeks | 12-Week Average'
    const rows = (sep: string) => ['Midwest', header, 'RSV | 1.0% | 0.5%', sep, 'HRV/EV | 22.0% | 20.0%']
    expect(parseMidwestTables(rows('Northeast Region Detection Rates')).accepted.map((f) => f.def.code)).toEqual(['RSV'])
    expect(parseMidwestTables(rows('National Detection Rates')).accepted.map((f) => f.def.code)).toEqual(['RSV'])
    expect(parseMidwestTables(rows(PAGE_BREAK)).accepted.map((f) => f.def.code)).toEqual(['RSV'])
    // A narrative line naming only the Midwest keeps the context.
    expect(parseMidwestTables(rows('Midwest values are 3-week centered')).accepted.map((f) => f.def.code)).toEqual(['RSV', 'RVEV'])
  })

  it('drops organisms with conflicting values inside one report', () => {
    const r = parseUsmaReport({
      text: ['In the Midwest, RSV was 1.0% in the past two weeks vs a 12-week average of 0.5%.\nIn the Midwest, RSV was 1.4% in the past two weeks vs a 12-week average of 0.5%.'],
      rows: [],
    })
    expect(r.accepted).toEqual([])
    expect(r.rejected.filter((x) => /conflicting/.test(x.reason))).toHaveLength(2)
  })

  it('rebuilds table rows from positioned PDF text items', () => {
    const it = (str: string, x: number, y: number, width: number) => ({ str, x, y, width, fontSize: 10, hasEOL: false })
    const rows = itemsToRows([it('19.8%', 283, 549, 28), it('HRV/EV', 176, 549, 37), it(' ', 213, 549, 70), it('17.2%', 356, 549, 28), it('Midwest', 78, 590, 55)])
    expect(rows).toEqual(['Midwest', 'HRV/EV | 19.8% | 17.2%'])
  })

  it('builds Midwest series dated at the window end with report attrs', () => {
    const report = { url: 'u', name: '36--USMA-TRENDS-Insights-Respiratory-Report-16AUG26-29AUG26.pdf', number: 36, window: { start: '2026-08-16', end: '2026-08-29', raw: '' } }
    const finding = parseSentence('In the Midwest, SARS-CoV-2 detection was 1.6% in the past two weeks compared to a 12-week average of 0.9%.')
    if (!finding || 'reason' in finding) throw new Error('expected a finding')
    const { series } = buildUsmaSeries([{ report, finding }], '2021-07-01')
    expect(series).toHaveLength(1)
    expect(series[0]).toMatchObject({
      id: 'biofire:biofire-usma:covid:detection_rate:census-region:Midwest',
      points: [['2026-08-29', 1.6]],
      attrs: { report: report.name, window: '2026-08-16 to 2026-08-29', avg12wk: '0.9%', parsedBy: 'sentence' },
    })
  })
})

describe('module meta', () => {
  it('describes the measure and its limits and carries the required attribution', () => {
    expect(biofire.meta.id).toBe('biofire')
    expect(biofire.meta.attribution).toBe('BIOFIRE® Syndromic Trends / bioMérieux (syndromictrends.com)')
    expect(biofire.meta.description).toMatch(/not prevalence/i)
    expect(biofire.meta.description).toMatch(/Midwest/)
  })
})
