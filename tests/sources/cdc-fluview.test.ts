import { describe, expect, it } from 'vitest'
import { unzipEntries } from '../../pipeline/lib/cdc-fluview-zip.ts'
import {
  buildSeries,
  cdcSeasonIds,
  latestWeek,
  parseCdcFluviewCsv,
  parsePopHive,
  parseV3,
  parseV5Rows,
  referenceWeek,
  vizRows,
} from '../../pipeline/sources/cdc-fluview.ts'
import { parseCsv } from '../../pipeline/lib/csv.ts'

// Real rows from the PopHIVE mirror of Delphi's FluView pull (data/delphi_ili_fluview/raw/data.csv.xz,
// release 2026-10-02). `epiweek` is the Sunday that starts the MMWR week.
const POPHIVE_CSV = `release_date,region,issue,epiweek,lag,num_ili,num_patients,num_providers,num_age_0,num_age_1,num_age_2,num_age_3,num_age_4,num_age_5,wili,ili
2026-10-02,nat,2026-09-20,2026-09-13,1,41123,2589124,4032,7351,11964,NA,11522,4915,5371,1.64559,1.5883
2026-10-02,nat,2026-09-20,2026-09-20,0,43747,2621495,3986,7912,12598,NA,12019,5307,5911,1.74236,1.66878
2026-10-02,mn,2026-09-20,2026-09-13,1,253,35479,100,NA,NA,NA,NA,NA,NA,0.713098,0.713098
2026-10-02,mn,2026-09-20,2026-09-20,0,402,41999,100,NA,NA,NA,NA,NA,NA,0.957166,0.957166
`

// Real CDC FluView Interactive export lines (FluViewPhase2Data ILINet.csv / WHO_NREVSS_Clinical_Labs.csv).
const CDC_ILINET = `PERCENTAGE OF VISITS FOR INFLUENZA-LIKE-ILLNESS REPORTED BY SENTINEL PROVIDERS
REGION TYPE,REGION,YEAR,WEEK,% WEIGHTED ILI,%UNWEIGHTED ILI,AGE 0-4,AGE 25-49,AGE 25-64,AGE 5-24,AGE 50-64,AGE 65,ILITOTAL,NUM. OF PROVIDERS,TOTAL PATIENTS
States,Alabama,2010,40,X,2.13477,X,X,X,X,X,X,249,35,11664
States,Florida,2010,40,X,X,X,X,X,X,X,X,X,X,X
States,Minnesota,2010,40,X,0.5748,X,X,X,X,X,X,38,17,6611
States,Minnesota,2010,41,X,0.541293,X,X,X,X,X,X,35,18,6466
`
const CDC_CLINICAL = `"*Beginning for the 2015-16 season, reports from public health and clinical laboratories are presented separately in the weekly influenza update, FluView. Data from clinical laboratories include the weekly total number of specimens tested, the number of positive influenza test, and the percent positive by influenza type."
REGION TYPE,REGION,YEAR,WEEK,TOTAL SPECIMENS,TOTAL A,TOTAL B,PERCENT POSITIVE,PERCENT A,PERCENT B
States,Alaska,2015,40,X,X,X,X,X,X
States,Minnesota,2017,41,359,1,1,0.56,0.28,0.28
States,Minnesota,2017,42,298,3,0,1.01,1.01,0
States,Minnesota,2017,43,285,2,1,1.05,0.7,0.35
`

describe('referenceWeek', () => {
  it('normalizes ISO, compact and epiweek forms to the week-ending Saturday', () => {
    expect(referenceWeek('2026-09-26')).toBe('2026-09-26')
    expect(referenceWeek('2026-09-20')).toBe('2026-09-26') // Sunday start of the week
    expect(referenceWeek('20260926')).toBe('2026-09-26')
    expect(referenceWeek(202638)).toBe('2026-09-26')
    expect(referenceWeek(201040)).toBe('2010-10-09')
    expect(referenceWeek('')).toBeNull()
    expect(referenceWeek('202699')).toBeNull()
  })
})

describe('parseV5Rows (Delphi V5 /viz/ and /snapshot/)', () => {
  // V5 column layout from Delphi's docs and epidatr fixtures; MN values are the real ILINet numbers
  // (PopHIVE mirror). The 0-4, pa and wili rows only exercise the filters.
  const csv = `signal,report_time,geo_type,geo_value,age_group,fill_method,reference_time,value
ili,2026-10-02T00:00:00Z,state,mn,all,source,2026-09-19,0.713098
ili,2026-10-02T00:00:00Z,state,mn,all,source,2026-09-26,0.957166
num_ili,2026-10-02T00:00:00Z,state,mn,all,source,2026-09-26,402
num_ili,2026-10-02T00:00:00Z,state,mn,0-4,source,2026-09-26,57
num_patients,2026-10-02T00:00:00Z,state,mn,all,source,2026-09-26,41999
num_providers,2026-10-02T00:00:00Z,state,mn,all,source,2026-09-26,100
ili,2026-10-02T00:00:00Z,state,pa,all,source,2026-09-26,1.9
wili,2026-10-02T00:00:00Z,state,mn,all,source,2026-09-26,0.95
`
  it('keeps Minnesota all-ages rows of the wanted signals', () => {
    const p = parseV5Rows(parseCsv(csv), 'ilinet')
    expect(p.rowsRead).toBe(8)
    expect(p.signals).toEqual(['ili', 'num_ili', 'num_patients', 'num_providers'])
    expect(p.weeks.get('2026-09-26')).toEqual({ ili: 0.957166, num_ili: 402, num_patients: 41999, num_providers: 100 })
    expect(p.weeks.get('2026-09-19')).toEqual({ ili: 0.713098 })
    expect(p.reportTime).toBe('2026-10-02T00:00:00Z')
    expect(latestWeek(p.weeks, 'ili')).toBe('2026-09-26')
  })

  it('drops a signal whose values conflict within a week (age strata without an age key)', () => {
    const rows = [
      { signal: 'ili', geo_value: 'mn', reference_time: '2026-09-26', value: 0.957166 },
      { signal: 'num_ili', geo_value: 'mn', reference_time: '2026-09-26', value: 402 },
      { signal: 'num_ili', geo_value: 'mn', reference_time: '2026-09-26', value: 57 },
    ]
    const p = parseV5Rows(rows, 'ilinet')
    expect(p.weeks.get('2026-09-26')).toEqual({ ili: 0.957166 })
    expect(p.warnings.join(' ')).toMatch(/num_ili/)
  })

  it('keeps reported-missing values as null and rejects out-of-range percentages', () => {
    const rows = [
      { signal: 'pct_positive', geo_value: 'mn', reference_time: '2017-10-21', value: null },
      { signal: 'pct_positive', geo_value: 'mn', reference_time: '2017-10-28', value: 1.05 },
      { signal: 'pct_positive_a', geo_value: 'mn', reference_time: '2017-10-28', value: 170 },
    ]
    const p = parseV5Rows(rows, 'clinical')
    expect(p.weeks.get('2017-10-21')).toEqual({ pct_positive: null })
    expect(p.weeks.get('2017-10-28')).toEqual({ pct_positive: 1.05, pct_positive_a: null })
    expect(p.warnings.join(' ')).toMatch(/out-of-range/)
  })

  it('reports schema drift clearly', () => {
    expect(() => parseV5Rows([{ signal: 'ili', time_value: '2026-09-26', value: 1 }], 'ilinet')).toThrow(/reference_time/)
  })

  it('unwraps viz responses', () => {
    expect(vizRows([{ signal: 'ili' }])).toHaveLength(1)
    expect(vizRows({ epidata: [{ signal: 'ili' }, { signal: 'ili' }] })).toHaveLength(2)
    expect(() => vizRows({ message: 'Rate limit exceeded' })).toThrow(/Rate limit/)
  })
})

describe('parseCdcFluviewCsv (CDC FluView Interactive zip)', () => {
  it('parses ILINet state rows keyed by MMWR week-ending Saturday', () => {
    const p = parseCdcFluviewCsv(CDC_ILINET, 'ilinet')
    expect(p.weeks.size).toBe(2)
    expect(p.weeks.get('2010-10-09')).toEqual({ ili: 0.5748, num_ili: 38, num_patients: 6611, num_providers: 17 })
    expect(p.weeks.get('2010-10-16')?.ili).toBe(0.541293)
    expect(p.warnings).toEqual([])
  })

  it('parses WHO/NREVSS clinical-lab rows', () => {
    const p = parseCdcFluviewCsv(CDC_CLINICAL, 'clinical')
    expect([...p.weeks.keys()].sort()).toEqual(['2017-10-14', '2017-10-21', '2017-10-28'])
    expect(p.weeks.get('2017-10-28')).toEqual({
      total_specimens: 285, positive_a: 2, positive_b: 1, pct_positive: 1.05, pct_positive_a: 0.7, pct_positive_b: 0.35,
    })
  })

  it('fails loudly when the header or primary column is missing', () => {
    expect(() => parseCdcFluviewCsv('just a title\nfoo,bar\n', 'ilinet')).toThrow(/header row/)
    expect(() => parseCdcFluviewCsv('REGION TYPE,REGION,YEAR,WEEK,TOTAL A\nStates,Minnesota,2017,43,2\n', 'clinical')).toThrow(
      /PERCENT POSITIVE/,
    )
  })
})

describe('parseV3 (Delphi legacy API)', () => {
  it('maps fluview_clinical fields and epiweeks', () => {
    // V3 response layout from Delphi's docs; the MN values are CDC's for 2017w43.
    const p = parseV3(
      {
        result: 1,
        message: 'success',
        epidata: [
          { release_date: '2021-10-08', region: 'mn', issue: 202139, epiweek: 201743, lag: 205, total_specimens: 285, total_a: 2, total_b: 1, percent_positive: 1.05, percent_a: 0.7, percent_b: 0.35 },
          { release_date: '2021-10-08', region: 'nat', issue: 202139, epiweek: 202001, lag: 91, total_specimens: 65177, total_a: 5645, total_b: 9664, percent_positive: 23.4883, percent_a: 8.66103, percent_b: 14.8273 },
        ],
      },
      'clinical',
    )
    expect(p.weeks.size).toBe(1)
    expect(p.weeks.get('2017-10-28')).toEqual({
      total_specimens: 285, positive_a: 2, positive_b: 1, pct_positive: 1.05, pct_positive_a: 0.7, pct_positive_b: 0.35,
    })
    expect(p.reportTime).toBe('2021-10-08')
  })

  it('surfaces API errors', () => {
    expect(() => parseV3({ result: -2, message: 'no results' }, 'ilinet')).toThrow(/no results/)
  })
})

describe('parsePopHive', () => {
  it('reads Minnesota rows and converts the Sunday epiweek to Saturday', () => {
    const p = parsePopHive(POPHIVE_CSV)
    expect(p.rowsRead).toBe(4)
    expect(p.weeks.get('2026-09-19')).toEqual({ ili: 0.713098, num_ili: 253, num_patients: 35479, num_providers: 100 })
    expect(p.weeks.get('2026-09-26')).toEqual({ ili: 0.957166, num_ili: 402, num_patients: 41999, num_providers: 100 })
    expect(p.reportTime).toBe('2026-10-02')
  })
})

describe('buildSeries', () => {
  it('builds the ILI series with provenance', () => {
    const [s, ...rest] = buildSeries('ilinet', parsePopHive(POPHIVE_CSV), 'pophive-mirror', '2021-07-01')
    expect(rest).toHaveLength(0)
    expect(s.id).toBe('cdc-fluview:fluview-mn:ili:ili_pct:state:27')
    expect(s.unit).toBe('%')
    expect(s.geo).toEqual({ type: 'state', code: '27', name: 'Minnesota' })
    expect(s.points).toEqual([['2026-09-19', 0.713], ['2026-09-26', 0.957]])
    expect(s.provisionalFrom).toBe('2026-09-26')
    expect(s.attrs?.['Reporting providers']).toBe('100')
    expect(s.attrs?.['Retrieved via']).toMatch(/PopHIVE/)
    expect(s.official).toBeUndefined()
  })

  it('builds flu, flu A and flu B positivity series and honors historyStart', () => {
    const series = buildSeries('clinical', parseCdcFluviewCsv(CDC_CLINICAL, 'clinical'), 'cdc-fluview-interactive', '2017-10-20')
    expect(series.map((s) => s.id)).toEqual([
      'cdc-fluview:fluview-mn:influenza:test_positivity:state:27',
      'cdc-fluview:fluview-mn:influenza-a:test_positivity:state:27',
      'cdc-fluview:fluview-mn:influenza-b:test_positivity:state:27',
    ])
    expect(series[0].points).toEqual([['2017-10-21', 1.01], ['2017-10-28', 1.05]])
    expect(series[2].points).toEqual([['2017-10-21', 0], ['2017-10-28', 0.35]])
    expect(series[0].attrs?.['Specimens tested']).toBe('285')
  })
})

describe('cdcSeasonIds', () => {
  it('maps seasons to CDC ids (first year minus 1960)', () => {
    expect(cdcSeasonIds('2021-07-01', '2026-10-07')).toEqual([60, 61, 62, 63, 64, 65, 66])
    expect(cdcSeasonIds('2021-07-01', '2026-09-30', [37, 60, 61, 62, 63, 64, 65])).toEqual([60, 61, 62, 63, 64, 65])
  })
})

describe('unzipEntries', () => {
  // Built with Python's zipfile: one stored entry, one deflated entry holding real CDC rows.
  const ZIP_B64 =
    'UEsDBBQAAAAAAAAAIQDGqR6VDAAAAAwAAAAKAAAAUkVBRE1FLnR4dHN0b3JlZCBlbnRyeVBLAwQUAAAACAAAACEAdBJgc+YAAAAtAQAAHAAAAFdIT19OUkVWU1NfQ2xpbmljYWxfTGFicy5jc3Y9UMFugzAMvfMVVo+Th4COdVeosgptBQSoU48pmBI1S1ASVG1fv6irerD8nv3kp+fVU05noZRQZxi1ATcRJFGcPsevYIlbrRAMzdo4C6PR3zAvJyl6mIhLNwFXA/RSKNFzCZKftOFOG0EWuCGYDVlSjgZ/auZ+RfIHhLqZXIkuNzbKhdQvh2UevADhXS4HQddwFTRsV1QldMea4T/GI8sa/GLsA7uqyz6hrdm22LOyvfPs3nOsWbNlZQd11RZdcWCPQfZAedA6b2lx7x9AVjuOPvoGX9aYvKWYYIxxGKUYhRtf6zT4A1BLAQIUAxQAAAAAAAAAIQDGqR6VDAAAAAwAAAAKAAAAAAAAAAAAAACAAQAAAABSRUFETUUudHh0UEsBAhQDFAAAAAgAAAAhAHQSYHPmAAAALQEAABwAAAAAAAAAAAAAAIABNAAAAFdIT19OUkVWU1NfQ2xpbmljYWxfTGFicy5jc3ZQSwUGAAAAAAIAAgCCAAAAVAEAAAAA'

  it('reads stored and deflated entries', () => {
    const files = unzipEntries(Buffer.from(ZIP_B64, 'base64'))
    const dec = new TextDecoder()
    expect([...files.keys()]).toEqual(['README.txt', 'WHO_NREVSS_Clinical_Labs.csv'])
    expect(dec.decode(files.get('README.txt'))).toBe('stored entry')
    const p = parseCdcFluviewCsv(dec.decode(files.get('WHO_NREVSS_Clinical_Labs.csv')), 'clinical')
    expect(p.weeks.get('2017-10-28')?.pct_positive).toBe(1.05)
  })

  it('rejects non-zip input', () => {
    expect(() => unzipEntries(new TextEncoder().encode('<html>blocked</html>'))).toThrow(/not a zip/)
  })
})
