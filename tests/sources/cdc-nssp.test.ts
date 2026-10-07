// Tests for the CDC NSSP source. Fixture rows are copied from real data observed on 2026-10-07:
//   * rdmq-nq56 rows from the PopHIVE mirror (build 2026-09-30; CSV export format, fips "27,053")
//     and the same rows re-expressed in SODA JSON format (fips "27053", ISO datetime, null fields omitted)
//   * the CDCgov/covid19-forecast-hub NSSP archive parquet (Minnesota rows)
//   * vjzj-u7u8 daily U.S. rows (tajarvarghese-arch/pm-peds-surveillance data/ed_state.json, fetched 2026-10-06)
//   * f3zz-zga5 Minnesota row (week_end 2026-09-26, label "Very Low")
//   * CDCgov/forecasttools PRISM thresholds nssp/2026-09-04.tsv (Minnesota rows)
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSeries, cdcNssp, columnsSeen, mapLevel, mapTrend, normalizeRow, officialFrom, parseAriLevel, parseFips,
  weeklyMeanFromDaily, type NsspRow,
} from '../../pipeline/sources/cdc-nssp'
import type { PrismTable } from '../../pipeline/lib/prism'
import type { Logger } from '../../pipeline/lib/log'

const MIRROR_ROWS: Record<string, string>[] = [
  { week_end: '2026-09-12', geography: 'Minnesota', county: 'All', percent_visits_covid: '0.23', percent_visits_influenza: '0.17', percent_visits_rsv: '0.01', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'All', hsa_counties: 'All', hsa_nci_id: 'All', fips: '27,000', trend_source: 'State', buildnumber: '2026-09-30' },
  { week_end: '2026-09-19', geography: 'Minnesota', county: 'All', percent_visits_covid: '0.29', percent_visits_influenza: '0.19', percent_visits_rsv: '0.01', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'All', hsa_counties: 'All', hsa_nci_id: 'All', fips: '27,000', trend_source: 'State', buildnumber: '2026-09-30' },
  { week_end: '2026-09-26', geography: 'Minnesota', county: 'All', percent_visits_covid: '0.28', percent_visits_influenza: '0.26', percent_visits_rsv: '0.01', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'All', hsa_counties: 'All', hsa_nci_id: 'All', fips: '27,000', trend_source: 'State', buildnumber: '2026-09-30' },
  { week_end: '2026-09-12', geography: 'Minnesota', county: 'Hennepin', percent_visits_covid: '0.21', percent_visits_influenza: '0.16', percent_visits_rsv: '0.02', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'Hennepin (Minneapolis), MN - Anoka, MN', hsa_counties: 'Anoka, Carver, Hennepin, Le Sueur, McLeod, Scott, Sherburne, Sibley, Wright', hsa_nci_id: '540', fips: '27,053', trend_source: 'HSA', buildnumber: '2026-09-30' },
  { week_end: '2026-09-19', geography: 'Minnesota', county: 'Hennepin', percent_visits_covid: '0.31', percent_visits_influenza: '0.18', percent_visits_rsv: '0.02', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'Hennepin (Minneapolis), MN - Anoka, MN', hsa_counties: 'Anoka, Carver, Hennepin, Le Sueur, McLeod, Scott, Sherburne, Sibley, Wright', hsa_nci_id: '540', fips: '27,053', trend_source: 'HSA', buildnumber: '2026-09-30' },
  { week_end: '2026-09-26', geography: 'Minnesota', county: 'Hennepin', percent_visits_covid: '0.31', percent_visits_influenza: '0.23', percent_visits_rsv: '0.02', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'Hennepin (Minneapolis), MN - Anoka, MN', hsa_counties: 'Anoka, Carver, Hennepin, Le Sueur, McLeod, Scott, Sherburne, Sibley, Wright', hsa_nci_id: '540', fips: '27,053', trend_source: 'HSA', buildnumber: '2026-09-30' },
  { week_end: '2026-09-26', geography: 'Minnesota', county: 'Beltrami', percent_visits_covid: '', percent_visits_influenza: '', percent_visits_rsv: '', ed_trends_covid: 'Data Unavailable', ed_trends_influenza: 'Data Unavailable', ed_trends_rsv: 'Data Unavailable', hsa: 'Beltrami, MN - Clearwater, MN', hsa_counties: 'Beltrami, Clearwater', hsa_nci_id: '597', fips: '27,007', trend_source: 'HSA', buildnumber: '2026-09-30' },
  { week_end: '2026-09-26', geography: 'Minnesota', county: 'Traverse', percent_visits_covid: '0', percent_visits_influenza: '0', percent_visits_rsv: '0', ed_trends_covid: 'No Change', ed_trends_influenza: 'No Change', ed_trends_rsv: 'Limited Data', hsa: 'Big Stone, MN - Traverse, MN', hsa_counties: 'Big Stone, Traverse', hsa_nci_id: '590', fips: '27,155', trend_source: 'HSA', buildnumber: '2026-09-30' },
]

/** Same rows as the SODA JSON API returns them: numeric fips, ISO datetimes, null fields omitted. */
const toLive = (r: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === '') continue
    if (k === 'fips') out[k] = v.replace(/,/g, '')
    else if (k === 'week_end') out[k] = `${v}T00:00:00.000`
    else out[k] = v
  }
  return out
}

// Archive parquet rows (values as stringified by the loader).
const ARCHIVE_ROWS: Record<string, string>[] = [
  { week_end: '2026-09-26', geography: 'Minnesota', county: 'All', percent_visits_ari: '9.89', percent_visits_covid: '0.28', percent_visits_influenza: '0.26', percent_visits_rsv: '0.01', ed_trends_ari: 'Increasing', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'All', hsa_counties: 'All', hsa_nci_id: 'All', fips: '27000', ari_threshold_classification: 'Very Low', covid_threshold_classification: 'Very Low', influenza_threshold_classification: 'Low', rsv_threshold_classification: 'Very Low' },
  { week_end: '2026-09-26', geography: 'Minnesota', county: 'Hennepin', percent_visits_ari: '9.59', percent_visits_covid: '0.31', percent_visits_influenza: '0.23', percent_visits_rsv: '0.02', ed_trends_ari: 'Increasing', ed_trends_covid: 'Increasing', ed_trends_influenza: 'Increasing', ed_trends_rsv: 'No Change', hsa: 'Hennepin (Minneapolis), MN - Anoka, MN', hsa_counties: 'Anoka, Carver, Hennepin, Le Sueur, McLeod, Scott, Sherburne, Sibley, Wright', hsa_nci_id: '540', fips: '27053', ari_threshold_classification: 'Very Low', covid_threshold_classification: 'Very Low', influenza_threshold_classification: 'Very Low', rsv_threshold_classification: 'Very Low' },
]

// vjzj-u7u8 United States ARI, 2026-09-19 (Sat) through 2026-09-26 (Sat). CDC's weekly U.S. ARI for the
// week ending 2026-09-26 (hub archive) is 9.68.
const US_ARI_DAILY: [string, number][] = [
  ['2026-09-19', 9.51], ['2026-09-20', 10.42], ['2026-09-21', 10.06], ['2026-09-22', 9.96],
  ['2026-09-23', 9.7], ['2026-09-24', 9.43], ['2026-09-25', 8.95], ['2026-09-26', 9.16],
]

const PRISM_TSV = [
  'disease\tstate_abb\tperc_level_low\tperc_level_moderate\tperc_level_high\tperc_level_very_high',
  'ARI\tMN\t10.9932555144254\t14.6540714879752\t18.314887461525\t21.9757034350748',
  'COVID-19\tMN\t0.374939326250506\t1.41877793422102\t2.46261654219154\t3.50645515016205',
  'Influenza\tMN\t0.250195462132341\t3.3279554650336\t6.40571546793487\t9.48347547083613',
  'RSV\tMN\t0.0496813274839207\t0.494112696176212\t0.938544064868503\t1.38297543356079',
].join('\n')

const PRISM: PrismTable = new Map([
  ['covid', { low: 0.3749, moderate: 1.4188, high: 2.4626, veryHigh: 3.5065, by: 'test', population: 1 }],
  ['influenza', { low: 0.2502, moderate: 3.328, high: 6.4057, veryHigh: 9.4835, by: 'test' }],
])

const norm = (rows: Record<string, string>[], keys: Parameters<typeof normalizeRow>[1] = ['covid', 'influenza', 'rsv']) =>
  rows.map((r) => normalizeRow(r, keys)).filter((r): r is NsspRow => !!r)

describe('cdc-nssp parsing', () => {
  it('parses FIPS from CSV exports and the JSON API', () => {
    expect(parseFips('27,053')).toBe('27053')
    expect(parseFips('27053')).toBe('27053')
    expect(parseFips('27,000')).toBe('27000')
    expect(parseFips('27053.0')).toBe('27053')
    expect(parseFips('1001')).toBe('01001')
    expect(parseFips('')).toBeNull()
    expect(parseFips('All')).toBeNull()
    expect(parseFips(undefined)).toBeNull()
  })

  it('maps CDC trend and level wording, ignoring non-trends', () => {
    expect(mapTrend('Increasing')).toBe('rising')
    expect(mapTrend('Decreasing')).toBe('falling')
    expect(mapTrend('No Change')).toBe('steady')
    for (const t of ['Data Unavailable', 'Sparse', 'Limited Data', '', undefined]) expect(mapTrend(t)).toBeUndefined()
    expect(mapLevel('Very Low')).toBe('minimal')
    expect(mapLevel('Low')).toBe('low')
    expect(mapLevel('Moderate')).toBe('moderate')
    expect(mapLevel('High')).toBe('high')
    expect(mapLevel('Very High')).toBe('very-high')
    expect(mapLevel('Data Unavailable')).toBeUndefined()
  })

  it('normalizes mirror (CSV) and live (JSON) rows identically', () => {
    for (const fmt of [(r: Record<string, string>) => r, toLive]) {
      const [state] = norm([fmt(MIRROR_ROWS[2])])
      expect(state).toMatchObject({ week: '2026-09-26', geo: 'state', values: { covid: 0.28, influenza: 0.26, rsv: 0.01 } })
      const [hen] = norm([fmt(MIRROR_ROWS[5])])
      expect(hen).toMatchObject({ geo: '27053', hsaId: '540', values: { covid: 0.31, influenza: 0.23, rsv: 0.02 } })
      expect(hen.trends).toEqual({ covid: 'Increasing', influenza: 'Increasing', rsv: 'No Change' })
      const [bel] = norm([fmt(MIRROR_ROWS[6])])
      expect(bel).toMatchObject({ geo: '27007', values: { covid: null, influenza: null, rsv: null } })
      expect(bel.trends.covid).toBe('Data Unavailable')
    }
    // Zero is a real value, not missing.
    expect(norm([MIRROR_ROWS[7]])[0].values.rsv).toBe(0)
    // Other states and unknown counties are dropped.
    expect(normalizeRow({ ...MIRROR_ROWS[2], geography: 'Wisconsin' }, ['covid'])).toBeNull()
    expect(normalizeRow({ ...MIRROR_ROWS[5], county: 'Nowhere', fips: '99,999' }, ['covid'])).toBeNull()
    // County name is the fallback when FIPS is malformed.
    expect(normalizeRow({ ...MIRROR_ROWS[5], fips: '' }, ['covid'])?.geo).toBe('27053')
  })

  it('reports the union of columns (SODA JSON omits null fields)', () => {
    const cols = columnsSeen([toLive(MIRROR_ROWS[6]), toLive(MIRROR_ROWS[5])])
    expect(cols.has('percent_visits_covid')).toBe(true)
    expect(columnsSeen([toLive(MIRROR_ROWS[6])]).has('percent_visits_covid')).toBe(false)
  })
})

describe('cdc-nssp series', () => {
  const opts = { dataset: 'nssp-ed', historyStart: '2021-07-01', thresholds: PRISM, retrieved: 'test' }

  it('builds state and county series with official trend, thresholds and HSA attrs', () => {
    const { series, skipped } = buildSeries(norm(MIRROR_ROWS), 'influenza', opts)
    expect(skipped).toEqual(['27007']) // Beltrami: never reported
    const state = series.find((s) => s.geo.type === 'state')!
    expect(state.id).toBe('cdc-nssp:nssp-ed:influenza:ed_visit_pct:state:27')
    expect(state.points).toEqual([['2026-09-12', 0.17], ['2026-09-19', 0.19], ['2026-09-26', 0.26]])
    expect(state.unit).toBe('%')
    expect(state.official).toEqual({ label: 'Increasing', asOf: '2026-09-26', by: 'CDC NSSP', trend: 'rising' })
    expect(state.thresholds).toEqual({ low: 0.2502, moderate: 3.328, high: 6.4057, veryHigh: 9.4835, by: 'test' })
    const hen = series.find((s) => s.geo.code === '27053')!
    expect(hen.id).toBe('cdc-nssp:nssp-ed:influenza:ed_visit_pct:county:27053')
    expect(hen.geo).toEqual({ type: 'county', code: '27053', name: 'Hennepin County' })
    expect(hen.points.at(-1)).toEqual(['2026-09-26', 0.23])
    expect(hen.thresholds).toBeUndefined()
    expect(hen.attrs).toMatchObject({ hsa: 'Hennepin (Minneapolis), MN - Anoka, MN', hsaId: '540' })
    expect(hen.note).toContain('Health Service Area')
  })

  it('keeps the verbatim label but no trend for Sparse / Limited Data', () => {
    const { series } = buildSeries(norm(MIRROR_ROWS), 'rsv', opts)
    const trav = series.find((s) => s.geo.code === '27155')!
    expect(trav.points).toEqual([['2026-09-26', 0]])
    expect(trav.official).toEqual({ label: 'Limited Data', asOf: '2026-09-26', by: 'CDC NSSP' })
  })

  it('trims leading nulls, keeps trailing nulls, and honors historyStart', () => {
    const rows = norm([
      { ...MIRROR_ROWS[3], percent_visits_covid: '' },
      MIRROR_ROWS[4],
      { ...MIRROR_ROWS[5], percent_visits_covid: '', ed_trends_covid: 'Data Unavailable' },
    ])
    const [hen] = buildSeries(rows, 'covid', opts).series
    expect(hen.points).toEqual([['2026-09-19', 0.31], ['2026-09-26', null]])
    expect(hen.official).toEqual({ label: 'Data Unavailable', asOf: '2026-09-26', by: 'CDC NSSP' })
    const late = buildSeries(norm(MIRROR_ROWS), 'covid', { ...opts, historyStart: '2026-09-20' }).series
    expect(late.find((s) => s.geo.type === 'state')!.points).toEqual([['2026-09-26', 0.28]])
  })

  it('archive rows carry CDC level + trend and are labeled archived', () => {
    const rows = norm(ARCHIVE_ROWS, ['ari', 'covid', 'influenza', 'rsv'])
    expect(officialFrom(rows[0], 'influenza')).toEqual({ label: 'Low · Increasing', asOf: '2026-09-26', by: 'CDC NSSP', level: 'low', trend: 'rising' })
    const { series } = buildSeries(rows, 'ari', { ...opts, dataset: 'nssp-archive', archivedThrough: '2026-09-26' })
    expect(series.map((s) => s.id)).toEqual([
      'cdc-nssp:nssp-archive:respiratory-combined:ed_visit_pct:state:27',
      'cdc-nssp:nssp-archive:respiratory-combined:ed_visit_pct:county:27053',
    ])
    expect(series[0].points).toEqual([['2026-09-26', 9.89]])
    expect(series[0].official).toEqual({ label: 'Very Low · Increasing', asOf: '2026-09-26', by: 'CDC NSSP', level: 'minimal', trend: 'rising' })
    expect(series[1].label).toContain('archived')
    expect(series[1].note).toContain('Archived')
  })
})

describe('cdc-nssp daily ARI and activity level', () => {
  it('averages complete Sunday–Saturday weeks only', () => {
    const { points, incomplete } = weeklyMeanFromDaily(
      US_ARI_DAILY.map(([date, value]) => ({ date: `${date}T00:00:00.000`, value })),
      '2021-07-01',
    )
    expect(points).toEqual([['2026-09-26', 9.669]])
    expect(Math.abs((points[0][1] as number) - 9.68)).toBeLessThan(0.05) // CDC weekly value
    expect(incomplete).toEqual(['2026-09-19']) // only its Saturday is in the fixture
  })

  it('drops a week with a missing day', () => {
    const obs = US_ARI_DAILY.map(([date, value]) => ({ date, value: date === '2026-09-23' ? null : value }))
    expect(weeklyMeanFromDaily(obs, '2021-07-01').points).toEqual([])
  })

  it('reads the latest Minnesota ARI activity level', () => {
    const rows: Record<string, string>[] = [
      { week_end: '2026-09-26T00:00:00.000', geography: 'Minnesota', label: 'Very Low', buildnumber: '2026-10-02 16:03:50.980149' },
      { week_end: '2026-09-26T00:00:00.000', geography: 'Wisconsin', label: 'Low' },
    ]
    expect(parseAriLevel(rows)).toEqual({ week: '2026-09-26', label: 'Very Low', level: 'minimal' })
    expect(parseAriLevel([{ ...rows[0], label: 'Data Unavailable' }])).toEqual({ week: '2026-09-26', label: 'Data Unavailable', level: undefined })
    expect(parseAriLevel([rows[1]])).toBeNull()
  })
})

describe('cdc-nssp run() with stubbed network', () => {
  const silent: Logger = { info: () => {}, warn: () => {}, error: () => {}, child: () => silent }
  let dir = ''
  afterEach(async () => {
    vi.unstubAllGlobals()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const notFound = () => new Response('not found', { status: 404 })

  function stub(dailyGeography: string) {
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('https://data.cdc.gov/resource/rdmq-nq56.json')) return json(MIRROR_ROWS.map(toLive))
      if (url.startsWith('https://data.cdc.gov/api/views/rdmq-nq56.json')) return json({ rowsUpdatedAt: 1759248000 })
      if (url.startsWith('https://data.cdc.gov/resource/vjzj-u7u8.json')) {
        // Real U.S. daily values; geography relabeled only to exercise the Minnesota code path.
        return json(US_ARI_DAILY.map(([d, v]) => ({ date: `${d}T00:00:00.000`, geography: dailyGeography, pathogen: 'ARI', percent_visits: String(v) })))
      }
      if (url.startsWith('https://data.cdc.gov/resource/f3zz-zga5.json')) {
        return json([{ week_end: '2026-09-26T00:00:00.000', geography: 'Minnesota', label: 'Very Low', buildnumber: '2026-10-02 16:03:50.980149' }])
      }
      if (url.includes('/prism_thresholds/nssp/2026-09-04.tsv')) return new Response(PRISM_TSV, { status: 200 })
      return notFound() // GitHub API listing, other PRISM vintages, the hub archive
    })
  }

  async function run() {
    dir = await mkdtemp(path.join(os.tmpdir(), 'cdc-nssp-test-'))
    return cdcNssp.run({ now: '2026-10-07T12:00:00Z', log: silent, historyStart: '2021-07-01', cacheDir: 'cache', rootDir: dir })
  }

  it('builds all live datasets and fails soft on the archive', async () => {
    stub('Minnesota')
    const res = await run()
    const [ed, ari, archive] = res.datasets
    expect(ed.dataset).toBe('nssp-ed')
    expect(ed.series).toHaveLength(9) // 3 pathogens × (state, Hennepin, Traverse); Beltrami has no data
    const flu = ed.series.find((s) => s.id === 'cdc-nssp:nssp-ed:influenza:ed_visit_pct:state:27')!
    expect(flu.points.at(-1)).toEqual(['2026-09-26', 0.26])
    expect(flu.thresholds?.low).toBeCloseTo(0.2502, 4)
    expect(flu.attrs?.retrieved).toBe('data.cdc.gov rdmq-nq56')
    expect(ari.dataset).toBe('nssp-ari-state')
    expect(ari.series).toHaveLength(1)
    expect(ari.series[0].points).toEqual([['2026-09-26', 9.669]])
    expect(ari.series[0].official).toEqual({ label: 'Very Low', asOf: '2026-09-26', by: 'CDC NSSP respiratory illness activity level', level: 'minimal' })
    expect(ari.series[0].thresholds?.low).toBeCloseTo(10.993, 3)
    expect(archive.series).toHaveLength(0)
    expect(res.message).toMatch(/hub NSSP archive/)
    expect(res.diagnostics?.rdmq).toMatchObject({ via: 'data.cdc.gov', rowsRead: 8, latestWeek: '2026-09-26', missingColumns: [] })
  })

  it('reports a clear error when the daily feed has no Minnesota ARI rows', async () => {
    stub('United States')
    const res = await run()
    expect(res.datasets[1].series).toHaveLength(0)
    expect(res.message).toMatch(/vjzj-u7u8 \(daily ARI\): no Minnesota ARI rows/)
    expect(res.message).toMatch(/no ARI series to attach it to/)
    expect(res.datasets[0].series.length).toBeGreaterThan(0)
  })
})
