import { describe, expect, it } from 'vitest'
import {
  ahfsMnWhere,
  buildRtSeries,
  detectAhfsSchema,
  newestPerDate,
  newestRuns,
  officialLabel,
  parseAhfsRows,
  parseCfaDate,
  parseStateRows,
  trendOf,
  weeklyLast,
  STATE_DATASET,
  COUNTY_DATASET,
  type AhfsSchema,
  type SocrataColumn,
} from '../../pipeline/sources/cdc-cfa-rt.ts'
import { STATE_GEO } from '../../pipeline/lib/series.ts'

// Real rows from data.cdc.gov 5dqz-y4ea as mirrored by PopHIVE (BuildNumber 2026-10-02), with the
// mirror's display-name headers already mapped to API field names (as loadCdcRows delivers them).
const FIELDS = ['as_of', 'disease', 'state', 'date', 'median', 'lower', 'upper', 'interval_width', 'p_growing', 'category', 'buildnumber']
const B = '2026 Oct 02 04:03:06 PM'
const row = (...v: string[]) => Object.fromEntries(FIELDS.map((f, i) => [f, v[i] ?? ''])) as Record<string, string>

const RSV_ROWS = [
  // 2026-09-22 run: Not Estimated across the board
  row('2026 Sep 22 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 19 12:00:00 AM', '', '', '', '', '', 'Not Estimated', B),
  row('2026 Sep 22 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 22 12:00:00 AM', '', '', '', '', '', 'Not Estimated', B),
  // 2026-09-29 run
  row('2026 Sep 29 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 19 12:00:00 AM', '1.4143', '0.9409', '2.035', '0.95', '0.862', 'Likely Growing', B),
  row('2026 Sep 29 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 22 12:00:00 AM', '1.4054', '0.8875', '2.0883', '0.95', '0.862', 'Likely Growing', B),
  row('2026 Sep 29 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 25 12:00:00 AM', '1.3778', '0.8353', '2.0964', '0.95', '0.862', 'Likely Growing', B),
  row('2026 Sep 29 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 26 12:00:00 AM', '1.3647', '0.8254', '2.074', '0.95', '0.862', 'Likely Growing', B),
  row('2026 Sep 29 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 28 12:00:00 AM', '1.3488', '0.8049', '2.0288', '0.95', '0.862', 'Likely Growing', B),
  row('2026 Sep 29 12:00:00 AM', 'RSV', 'Minnesota', '2026 Sep 29 12:00:00 AM', '1.3406', '0.7987', '2.0061', '0.95', '0.862', 'Likely Growing', B),
]

const COVID_ROWS = [
  row('2026 Sep 15 12:00:00 AM', 'COVID-19', 'Minnesota', '2026 Sep 12 12:00:00 AM', '1.0662', '1.0366', '1.1021', '0.95', '1', 'Growing', B),
  row('2026 Sep 15 12:00:00 AM', 'COVID-19', 'Minnesota', '2026 Sep 14 12:00:00 AM', '1.067', '1.0376', '1.1029', '0.95', '1', 'Growing', B),
  row('2026 Sep 15 12:00:00 AM', 'COVID-19', 'Minnesota', '2026 Sep 15 12:00:00 AM', '1.0674', '1.038', '1.1032', '0.95', '1', 'Growing', B),
  row('2026 Sep 22 12:00:00 AM', 'COVID-19', 'Minnesota', '2026 Sep 15 12:00:00 AM', '', '', '', '', '', 'Not Estimated', B),
  row('2026 Sep 22 12:00:00 AM', 'COVID-19', 'Minnesota', '2026 Sep 19 12:00:00 AM', '', '', '', '', '', 'Not Estimated', B),
  row('2026 Sep 22 12:00:00 AM', 'COVID-19', 'Minnesota', '2026 Sep 22 12:00:00 AM', '', '', '', '', '', 'Not Estimated', B),
]

const opts = { dataset: STATE_DATASET, geo: STATE_GEO, historyStart: '2021-07-01', note: 'n', provenance: 'data.cdc.gov 5dqz-y4ea' }

describe('parseCfaDate', () => {
  it('reads mirror display dates, SODA ISO timestamps and M/D/YYYY', () => {
    expect(parseCfaDate('2026 Sep 29 12:00:00 AM')).toBe('2026-09-29')
    expect(parseCfaDate('2026 Jun 02 12:00:00 AM')).toBe('2026-06-02')
    expect(parseCfaDate('2026-09-29T00:00:00.000')).toBe('2026-09-29')
    expect(parseCfaDate('9/29/2026')).toBe('2026-09-29')
    expect(parseCfaDate('')).toBeNull()
    expect(parseCfaDate('not a date')).toBeNull()
    expect(parseCfaDate('2026 Foo 02 12:00:00 AM')).toBeNull()
  })
})

describe('trend categories', () => {
  it('maps CDC CFA wording to trend directions, never *-fast', () => {
    expect(trendOf('Growing')).toBe('rising')
    expect(trendOf('Likely Growing')).toBe('rising')
    expect(trendOf('Not Changing')).toBe('steady')
    expect(trendOf('Likely Declining')).toBe('falling')
    expect(trendOf('Declining')).toBe('falling')
    expect(trendOf('likely  growing ')).toBe('rising')
    expect(trendOf('Not Estimated')).toBeUndefined()
    expect(trendOf('Something new')).toBeUndefined()
  })
  it('keeps the category verbatim and adds P(Rt > 1)', () => {
    expect(officialLabel('Likely Growing', 0.862)).toBe('Likely Growing (86% chance Rt > 1)')
    expect(officialLabel('Growing', 1)).toBe('Growing (>99% chance Rt > 1)')
    expect(officialLabel('Declining', 0)).toBe('Declining (<1% chance Rt > 1)')
    expect(officialLabel('Likely Declining', 0.1005)).toBe('Likely Declining (10% chance Rt > 1)')
    expect(officialLabel('Not Estimated', null)).toBe('Not Estimated')
  })
})

describe('parseStateRows', () => {
  it('keeps Minnesota rows, parses numbers and blanks', () => {
    const alabama = row('2026 Jun 02 12:00:00 AM', 'Influenza', 'Alabama', '2026 May 05 12:00:00 AM', '', '', '', '', '', 'Not Estimated', B)
    const { estimates, stats } = parseStateRows([...RSV_ROWS, alabama, { ...RSV_ROWS[2], disease: 'Measles' }])
    expect(stats).toMatchObject({ rows: 10, kept: 8, otherLocation: 1, badDate: 0, unknownDisease: { Measles: 1 } })
    expect(estimates[0]).toMatchObject({ loc: '27', pathogen: 'rsv', asOf: '2026-09-22', date: '2026-09-19', median: null, category: 'Not Estimated' })
    expect(estimates[2]).toMatchObject({ asOf: '2026-09-29', median: 1.4143, lower: 0.9409, upper: 2.035, pGrowing: 0.862, intervalWidth: 0.95 })
  })
})

describe('newestPerDate', () => {
  it('takes the newest run that produced an estimate for each date', () => {
    const daily = newestPerDate(parseStateRows(RSV_ROWS).estimates).get('27|rsv')!
    expect(daily.map((e) => [e.date, e.asOf, e.median])).toEqual([
      ['2026-09-19', '2026-09-29', 1.4143],
      ['2026-09-22', '2026-09-29', 1.4054],
      ['2026-09-25', '2026-09-29', 1.3778],
      ['2026-09-26', '2026-09-29', 1.3647],
      ['2026-09-28', '2026-09-29', 1.3488],
      ['2026-09-29', '2026-09-29', 1.3406],
    ])
  })
  it('does not let a newer all-blank run erase a published estimate', () => {
    const daily = newestPerDate(parseStateRows(COVID_ROWS).estimates).get('27|covid')!
    const byDate = Object.fromEntries(daily.map((e) => [e.date, [e.asOf, e.median]]))
    expect(byDate['2026-09-15']).toEqual(['2026-09-15', 1.0674])
    expect(byDate['2026-09-19']).toEqual(['2026-09-22', null])
  })
})

describe('weeklyLast / buildRtSeries', () => {
  it('uses the last estimated day of each MMWR week', () => {
    const daily = newestPerDate(parseStateRows(RSV_ROWS).estimates).get('27|rsv')!
    expect(weeklyLast(daily).map(({ week, e }) => [week, e.date])).toEqual([
      ['2026-09-19', '2026-09-19'],
      ['2026-09-26', '2026-09-26'],
      ['2026-10-03', '2026-09-29'],
    ])
  })

  it('builds the statewide series with the official CDC category', () => {
    const est = parseStateRows(RSV_ROWS).estimates
    const s = buildRtSeries(newestPerDate(est).get('27|rsv')!, { ...opts, newestRun: newestRuns(est).get('27|rsv') })!
    expect(s.id).toBe('cdc-cfa-rt:cfa-rt-mn:rsv:rt:state:27')
    expect(s.unit).toBe('index')
    expect(s.points).toEqual([
      ['2026-09-19', 1.414],
      ['2026-09-26', 1.365],
      ['2026-10-03', 1.341],
    ])
    expect(s.official).toEqual({ trend: 'rising', label: 'Likely Growing (86% chance Rt > 1)', asOf: '2026-10-03', by: 'CDC CFA' })
    expect(s.attrs).toMatchObject({ modelRun: '2026-09-29', estimateDate: '2026-09-29', category: 'Likely Growing', pGrowing: '0.862', lower: '0.799', upper: '2.006' })
    expect(s.attrs?.newestRun).toBeUndefined()
    // The run's window starts 2026-09-19 here; the next weekly run re-estimates from a week later.
    expect(s.provisionalFrom).toBe('2026-09-26')
  })

  it('after a blank run, labels the newest estimate and flags the newer blank run', () => {
    const est = parseStateRows(COVID_ROWS).estimates
    const s = buildRtSeries(newestPerDate(est).get('27|covid')!, { ...opts, newestRun: newestRuns(est).get('27|covid') })!
    expect(s.points).toEqual([
      ['2026-09-12', 1.066],
      ['2026-09-19', 1.067],
      ['2026-09-26', null],
    ])
    expect(s.official).toEqual({ trend: 'rising', label: 'Growing (>99% chance Rt > 1)', asOf: '2026-09-19', by: 'CDC CFA' })
    expect(s.attrs).toMatchObject({ modelRun: '2026-09-15', newestRun: '2026-09-22', newestRunCategory: 'Not Estimated' })
  })

  it('maps a real Declining run', () => {
    const rows = [
      row('2026 Jan 06 12:00:00 AM', 'Influenza', 'Minnesota', '2026 Jan 04 12:00:00 AM', '0.61', '0.5062', '0.7368', '0.95', '0', 'Declining', B),
      row('2026 Jan 06 12:00:00 AM', 'Influenza', 'Minnesota', '2026 Jan 06 12:00:00 AM', '0.5785', '0.455', '0.7394', '0.95', '0', 'Declining', B),
    ]
    const s = buildRtSeries(newestPerDate(parseStateRows(rows).estimates).get('27|influenza')!, opts)!
    expect(s.points).toEqual([['2026-01-10', 0.579]])
    expect(s.official).toMatchObject({ trend: 'falling', label: 'Declining (<1% chance Rt > 1)', asOf: '2026-01-10' })
  })

  it('respects historyStart', () => {
    const daily = newestPerDate(parseStateRows(RSV_ROWS).estimates).get('27|rsv')!
    expect(buildRtSeries(daily, { ...opts, historyStart: '2026-09-26' })!.points.map((p) => p[0])).toEqual(['2026-09-26', '2026-10-03'])
    expect(buildRtSeries(daily, { ...opts, historyStart: '2027-01-01' })).toBeNull()
  })
})

// ahfs-x44r: the CDC catalog description documents origin_date, target_date and horizon and says
// there is one row per county; the other column names below are unverified guesses that exercise
// the runtime schema detection. Values are copied from the real 5dqz-y4ea Minnesota rows above.
describe('ahfs-x44r schema detection', () => {
  const cols = (...names: [string, string][]): SocrataColumn[] => names.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName }))
  const WIDE = cols(
    ['origin_date', 'calendar_date'], ['target_date', 'calendar_date'], ['horizon', 'number'], ['disease', 'text'],
    ['state', 'text'], ['hsa_nci_id', 'text'], ['county_fips', 'text'], ['median', 'number'], ['lower', 'number'],
    ['upper', 'number'], ['p_growing', 'number'], ['category', 'text'], [':id', 'meta_data'],
  )

  it('identifies a wide layout', () => {
    const det = detectAhfsSchema(WIDE)
    expect('schema' in det).toBe(true)
    const s = (det as { schema: AhfsSchema }).schema
    expect(s).toMatchObject({ format: 'wide', origin: 'origin_date', target: 'target_date', fips: 'county_fips', fipsNumeric: false, median: 'median', hsa: 'hsa_nci_id' })
    expect(ahfsMnWhere(s)).toBe("county_fips like '27%'")
    expect(ahfsMnWhere({ ...s, fipsNumeric: true })).toBe('county_fips between 27001 and 27199')
  })

  it('identifies a hubverse long layout', () => {
    const det = detectAhfsSchema(
      cols(['origin_date', 'calendar_date'], ['target_date', 'calendar_date'], ['disease', 'text'], ['fips', 'number'],
        ['output_type', 'text'], ['output_type_id', 'text'], ['value', 'number']),
    )
    expect((det as { schema: AhfsSchema }).schema).toMatchObject({ format: 'long', fips: 'fips', fipsNumeric: true, outputTypeId: 'output_type_id', value: 'value' })
  })

  it('skips when Minnesota counties cannot be identified', () => {
    const det = detectAhfsSchema(cols(['origin_date', 'calendar_date'], ['target_date', 'calendar_date'], ['disease', 'text'], ['hsa_name', 'text'], ['median', 'number']))
    expect(det).toEqual({ reason: 'could not identify county FIPS (or county + state)' })
    const noDates = detectAhfsSchema(cols(['date', 'calendar_date'], ['disease', 'text'], ['fips', 'text'], ['median', 'number']))
    expect((noDates as { reason: string }).reason).toMatch(/origin date/)
  })
})

describe('parseAhfsRows', () => {
  const schema = (detectAhfsSchema([
    'origin_date', 'target_date', 'horizon', 'disease', 'hsa_nci_id', 'county_fips', 'median', 'lower', 'upper', 'p_growing', 'category',
  ].map((fieldName) => ({ fieldName, dataTypeName: 'text' }))) as { schema: AhfsSchema }).schema
  const r = (fips: string, target: string, horizon: string, median: string, extra: Record<string, string> = {}) => ({
    origin_date: '2026-09-29T00:00:00.000', target_date: `${target}T00:00:00.000`, horizon, disease: 'RSV', hsa_nci_id: '540',
    county_fips: fips, median, lower: '0.7987', upper: '2.0061', p_growing: '0.862', category: 'Likely Growing', ...extra,
  })

  it('keeps Minnesota county rows for observed dates only', () => {
    const rows = [
      r('27053', '2026-09-28', '-1', '1.3488'),
      r('27053', '2026-09-29', '0', '1.3406'),
      r('27053', '2026-10-06', '7', '1.2'), // forward projection → dropped
      r('27', '2026-09-29', '0', '1.3406'), // state row → not a county
      r('55025', '2026-09-29', '0', '1.1'), // Wisconsin county → dropped
      r('27123', '2026-09-29', '0', '1.3406', { disease: 'COVID-19', median: '1.0533' }),
    ]
    const { estimates, stats } = parseAhfsRows(rows, schema)
    expect(stats).toMatchObject({ rows: 6, kept: 3, projected: 1, notMnCounty: 2, conflicts: 0 })
    const daily = newestPerDate(estimates)
    const s = buildRtSeries(daily.get('27053|rsv')!, {
      dataset: COUNTY_DATASET, geo: { type: 'county', code: '27053', name: 'Hennepin County' }, historyStart: '2021-07-01', note: 'n', provenance: 'p',
    })!
    expect(s.id).toBe('cdc-cfa-rt:cfa-rt-county:rsv:rt:county:27053')
    expect(s.points).toEqual([['2026-10-03', 1.341]])
    expect(s.official).toMatchObject({ trend: 'rising', asOf: '2026-10-03' })
    expect(s.attrs?.hsa).toBe('540')
    expect(daily.get('27123|covid')![0].median).toBe(1.0533)
  })

  it('counts conflicting values for one county/date as ambiguous', () => {
    const { stats } = parseAhfsRows([r('27053', '2026-09-29', '0', '1.3406'), r('27053', '2026-09-29', '0', '1.2')], schema)
    expect(stats.conflicts).toBe(1)
  })

  it('pivots hubverse quantiles', () => {
    const long = (detectAhfsSchema(['origin_date', 'target_date', 'disease', 'county_fips', 'output_type', 'output_type_id', 'value', 'category']
      .map((fieldName) => ({ fieldName }))) as { schema: AhfsSchema }).schema
    const q = (id: string, value: string) => ({ origin_date: '2026-09-29', target_date: '2026-09-29', disease: 'Influenza', county_fips: '27001', output_type: 'quantile', output_type_id: id, value, category: 'Growing' })
    const { estimates } = parseAhfsRows([q('0.025', '1.0459'), q('0.5', '1.1192'), q('0.975', '1.1867')], long)
    expect(estimates).toHaveLength(1)
    expect(estimates[0]).toMatchObject({ loc: '27001', pathogen: 'influenza', median: 1.1192, lower: 1.0459, upper: 1.1867, intervalWidth: 0.95, category: 'Growing' })
  })
})
