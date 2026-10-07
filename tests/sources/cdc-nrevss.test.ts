import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  describesMovingAverage, geoKeyOf, latestObs, normalizePathogen, parseRegional, parseRgnm, parseSeuz,
  parseSocrataTimestamp, selectLatest, subtypeRank, toPoints, weekOf,
} from '../../pipeline/lib/cdc-nrevss-parse'
import { cdcNrevss } from '../../pipeline/sources/cdc-nrevss'
import type { Logger } from '../../pipeline/lib/log'

// Real rows from the PopHIVE mirror of data.cdc.gov 3cxc-4k8q (RSV NAAT positivity), fetched 2026-10-07.
// Mirror exports use "YYYY Mon DD hh:mm:ss AM" timestamps and thousands separators.
const RSV_MIRROR_ROWS: Record<string, string>[] = [
  { level: 'Region 5', perc_diff: '0', pcr_percent_positive: '0.2', percent_pos_2_week: '0.1', percent_pos_4_week: '0.1', pcr_detections: '15.7', detections_2_week: '33.3', detections_4_week: '65.7', pcr_tests: '8,399', posted: '2026 Sep 17 01:15:00 PM', mmwrweek_end: '2026 Sep 12 12:00:00 AM' },
  { level: 'Region 5', perc_diff: '0', pcr_percent_positive: '0.2', percent_pos_2_week: '0.1', percent_pos_4_week: '0.1', pcr_detections: '15.7', detections_2_week: '33.3', detections_4_week: '65.7', pcr_tests: '8,399', posted: '2026 Sep 17 11:07:15 AM', mmwrweek_end: '2026 Sep 12 12:00:00 AM' },
  { level: 'Region 5', perc_diff: '0', pcr_percent_positive: '0.2', percent_pos_2_week: '0.1', percent_pos_4_week: '0.1', pcr_detections: '19.8', detections_2_week: '36.6', detections_4_week: '69', pcr_tests: '9,944.3', posted: '2026 Sep 23 07:36:22 PM', mmwrweek_end: '2026 Sep 12 12:00:00 AM' },
  { level: 'Region 5', perc_diff: '0', pcr_percent_positive: '0.2', percent_pos_2_week: '0.1', percent_pos_4_week: '0.1', pcr_detections: '21.6', detections_2_week: '36.8', detections_4_week: '69.2', pcr_tests: '10,296', posted: '2026 Sep 30 07:40:25 PM', mmwrweek_end: '2026 Sep 12 12:00:00 AM' },
  { level: 'Region 5', perc_diff: '0', pcr_percent_positive: '0.2', percent_pos_2_week: '0.1', percent_pos_4_week: '0', pcr_detections: '21.7', detections_2_week: '39.4', detections_4_week: '72.8', pcr_tests: '10,530.5', posted: '2026 Sep 23 07:36:22 PM', mmwrweek_end: '2026 Sep 19 12:00:00 AM' },
  { level: 'Region 5', perc_diff: '0.1', pcr_percent_positive: '0.3', percent_pos_2_week: '0.1', percent_pos_4_week: '0', pcr_detections: '23.5', detections_2_week: '41.4', detections_4_week: '74.8', pcr_tests: '9,874.7', posted: '2026 Sep 30 07:40:25 PM', mmwrweek_end: '2026 Sep 19 12:00:00 AM' },
  { level: 'Region 5', perc_diff: '0', pcr_percent_positive: '0.3', percent_pos_2_week: '0.1', percent_pos_4_week: '0', pcr_detections: '26.3', detections_2_week: '45.1', detections_4_week: '81.9', pcr_tests: '9,732.5', posted: '2026 Sep 30 07:40:25 PM', mmwrweek_end: '2026 Sep 26 12:00:00 AM' },
  { level: 'National', perc_diff: '0', pcr_percent_positive: '0.6', percent_pos_2_week: '0.2', percent_pos_4_week: '0.1', pcr_detections: '209', detections_2_week: '366', detections_4_week: '694', pcr_tests: '', posted: '2026 Sep 30 07:40:20 PM', mmwrweek_end: '2026 Sep 26 12:00:00 AM' },
  { level: 'Region 1', perc_diff: '-0.2', pcr_percent_positive: '1', percent_pos_2_week: '1.7', percent_pos_4_week: '1.2', pcr_detections: '12.6', detections_2_week: '92', detections_4_week: '278.8', pcr_tests: '997', posted: '2026 Jul 16 10:14:39 AM', mmwrweek_end: '2020 Apr 11 12:00:00 AM' },
]

// rgnm-fkqb in SODA JSON shape (null cells omitted). National percent_pos values are real (data.cdc.gov,
// week ending 2026-09-26, as captured 2026-10-06 by pm-peds-surveillance); PIV and HCOV aggregates are
// published only as subtype='Combined Type'.
const RGNM_NATIONAL_ROWS: Record<string, string>[] = [
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'RV/EV', percent_pos: '32.44' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'SARS-COV-2', percent_pos: '4.86' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'Adenovirus', percent_pos: '3.11' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'PIV', subtype: 'Combined Type', percent_pos: '2.22' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'HCOV', subtype: 'Combined Type', percent_pos: '0.77' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'HMPV', percent_pos: '0.59' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'RSV', percent_pos: '0.58' },
  { mmwrweek_end: '2026-09-19T00:00:00.000', level: 'National', pathogen: 'RV/EV', percent_pos: '29.89' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 2', pathogen: 'RV/EV', percent_pos: '42.52' },
]

// Real rgnm-fkqb HHS Region 1 percent_pos values (data.cdc.gov via pm-peds, captured 2026-10-06), RELABELED as
// 'Region 5' only to exercise the Region 5 code path (no real Region 5 rgnm row was reachable here).
const RGNM_R5_ROWS: Record<string, string>[] = [
  { mmwrweek_end: '2026-09-19T00:00:00.000', level: 'Region 5', pathogen: 'RSV', percent_pos: '0.12' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 5', pathogen: 'RSV', percent_pos: '0.16' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 5', pathogen: 'HMPV', percent_pos: '0.83' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 5', pathogen: 'PIV', subtype: 'Combined Type', percent_pos: '1.13' },
]

// Minnesota state-row shape (illustrative values; state-row encoding in rgnm-fkqb is unverified).
const MN_MIXED_ROWS: Record<string, string>[] = [
  { mmwrweek_end: '2026-09-12T00:00:00.000', level: 'Region 5', state: 'Minnesota', pathogen: 'RSV', percent_pos: '0.9', percent_pos_3wma: '0.5' },
  { mmwrweek_end: '2026-09-19T00:00:00.000', level: 'Region 5', state: 'Minnesota', pathogen: 'RSV', percent_pos: '0.1', percent_pos_3wma: '0.4' },
  { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 5', state: 'Minnesota', pathogen: 'RSV', percent_pos: '1.7' },
]

// seuz-s2cv rows (real values, week ending 2026-09-26 and 2026-09-19).
const SEUZ_ROWS: Record<string, string>[] = [
  { week_end: '2026-09-26T00:00:00.000', pathogen: 'COVID-19', percent_test_positivity: '4.9' },
  { week_end: '2026-09-26T00:00:00.000', pathogen: 'Influenza', percent_test_positivity: '3.4' },
  { week_end: '2026-09-26T00:00:00.000', pathogen: 'RSV', percent_test_positivity: '0.6' },
  { week_end: '2026-09-19T00:00:00.000', pathogen: 'Influenza', percent_test_positivity: '2.6' },
]

describe('cdc-nrevss parsing', () => {
  it('parses Socrata timestamp formats into sortable keys', () => {
    expect(parseSocrataTimestamp('2026 Sep 30 07:40:20 PM')).toBe('2026-09-30T19:40:20')
    expect(parseSocrataTimestamp('2026 Sep 26 12:00:00 AM')).toBe('2026-09-26T00:00:00')
    expect(parseSocrataTimestamp('2026 Sep 17 12:15:00 PM')).toBe('2026-09-17T12:15:00')
    expect(parseSocrataTimestamp('2026-09-30T19:40:20.000')).toBe('2026-09-30T19:40:20')
    expect(parseSocrataTimestamp('09/30/2026 07:40:20 PM')).toBe('2026-09-30T19:40:20')
    expect(parseSocrataTimestamp('2026-09-26')).toBe('2026-09-26T00:00:00')
    expect(parseSocrataTimestamp('')).toBeNull()
    expect(parseSocrataTimestamp('not a date')).toBeNull()
    // 1:15 PM posting is newer than 11:07 AM the same day (string order must follow time order)
    expect(parseSocrataTimestamp('2026 Sep 17 01:15:00 PM')! > parseSocrataTimestamp('2026 Sep 17 11:07:15 AM')!).toBe(true)
  })

  it('keys weeks by the MMWR week-ending Saturday', () => {
    expect(weekOf('2026 Sep 26 12:00:00 AM')).toBe('2026-09-26')
    expect(weekOf('2026-09-26T00:00:00.000')).toBe('2026-09-26')
    expect(weekOf('2026-09-20')).toBe('2026-09-26') // a Sunday start date maps to its Saturday
    expect(weekOf('2026-02-30')).toBeNull()
  })

  it('maps NREVSS pathogen labels', () => {
    expect(normalizePathogen('RV/EV')).toBe('rhino-entero')
    expect(normalizePathogen('SARS-COV-2')).toBe('covid')
    expect(normalizePathogen('SARS-CoV-2')).toBe('covid')
    expect(normalizePathogen('COVID-19')).toBe('covid')
    expect(normalizePathogen('HMPV')).toBe('hmpv')
    expect(normalizePathogen('Adenovirus')).toBe('adenovirus')
    expect(normalizePathogen('PIV')).toBe('parainfluenza')
    expect(normalizePathogen('HCOV')).toBe('seasonal-cov')
    expect(normalizePathogen('RSV')).toBe('rsv')
    expect(normalizePathogen('Influenza')).toBe('influenza')
    expect(normalizePathogen('Rhinovirus/Enterovirus')).toBe('rhino-entero')
    expect(normalizePathogen('Norovirus')).toBeNull()
  })

  it('ranks subtype encodings and classifies geographies', () => {
    expect(subtypeRank(undefined)).toBe(2)
    expect(subtypeRank('')).toBe(2)
    expect(subtypeRank('Combined Type')).toBe(1)
    expect(subtypeRank('PIV-3')).toBe(0) // illustrative component label
    expect(geoKeyOf('National')).toBe('US')
    expect(geoKeyOf('Region 5')).toBe('HHS5')
    expect(geoKeyOf('Region 5', '')).toBe('HHS5')
    expect(geoKeyOf('Region 5', 'Region 5')).toBe('HHS5')
    expect(geoKeyOf('Region 10')).toBeNull()
    expect(geoKeyOf('Region 5', 'Minnesota')).toBe('MN')
    expect(geoKeyOf('Region 5', 'Wisconsin')).toBe('other-state')
  })

  it('keeps the newest posted vintage per week (3cxc-4k8q mirror rows)', () => {
    const { obs, diag } = parseRegional('3cxc-4k8q', RSV_MIRROR_ROWS)
    expect(diag.skipped['other-level']).toBe(1)
    expect(diag.vintages).toBe(5)
    expect(diag.latestWeek).toBe('2026-09-26')
    const sel = selectLatest(obs)
    const r5 = sel.byGeoPathogen.get('HHS5|rsv')!
    // 2026-09-19 was 0.2 when posted 09-23 and revised to 0.3 on 09-30
    expect(r5.get('2026-09-19')!.value).toBe(0.3)
    expect(r5.get('2026-09-12')!.tests).toBe(10296)
    expect(r5.get('2026-09-12')!.posted).toBe('2026-09-30T19:40:25')
    expect(toPoints(r5, '2021-07-01')).toEqual([['2026-09-12', 0.2], ['2026-09-19', 0.3], ['2026-09-26', 0.3]])
    expect(toPoints(r5, '2026-09-19')).toEqual([['2026-09-19', 0.3], ['2026-09-26', 0.3]])
    expect(latestObs(r5)!.tests).toBe(9732.5)
    const us = sel.byGeoPathogen.get('US|rsv')!
    expect(us.get('2026-09-26')!.tests).toBeNull()
    expect(toPoints(us, '2021-07-01')).toEqual([['2026-09-26', 0.6]])
  })

  it('parses rgnm-fkqb aggregates, falling back to Combined Type only when no NULL-subtype row exists', () => {
    const extra: Record<string, string>[] = [
      // Same week/posting: NULL-subtype aggregate must win over Combined Type (illustrative duplicate).
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'RSV', subtype: 'Combined Type', percent_pos: '9.99' },
      // Component subtype rows are never the aggregate (illustrative).
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'PIV', subtype: 'PIV-3', percent_pos: '1.5' },
    ]
    const { obs, diag } = parseRgnm([...RGNM_NATIONAL_ROWS, ...extra])
    expect(diag.unmappedPathogens).toEqual([])
    expect(diag.skipped['other-level']).toBe(1) // Region 2
    expect(diag.skipped['component-subtype']).toBe(1)
    const sel = selectLatest(obs)
    const at = (p: string) => sel.byGeoPathogen.get(`US|${p}`)!.get('2026-09-26')!.value
    expect(at('rhino-entero')).toBe(32.44)
    expect(at('covid')).toBe(4.86)
    expect(at('adenovirus')).toBe(3.11)
    expect(at('parainfluenza')).toBe(2.22)
    expect(at('seasonal-cov')).toBe(0.77)
    expect(at('hmpv')).toBe(0.59)
    expect(at('rsv')).toBe(0.58)
    expect(toPoints(sel.byGeoPathogen.get('US|rhino-entero'), '2021-07-01')).toEqual([['2026-09-19', 29.89], ['2026-09-26', 32.44]])
  })

  it('reads Minnesota state rows from ONE field per series (never mixing 3-week averages and weekly values)', () => {
    // Shape check only: the encoding of rgnm-fkqb state rows is unverified (values illustrative).
    const { obs } = parseRgnm([
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 5', state: 'Minnesota', pathogen: 'RSV', percent_pos: '0.4', percent_pos_3wma: '0.35' },
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'Region 5', state: 'Ohio', pathogen: 'RSV', percent_pos: '0.9', percent_pos_3wma: '0.8' },
    ])
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ geo: 'MN', pathogen: 'rsv', value: 0.35, field: 'percent_pos_3wma' })

    // 3-week average present on some rows only → that field for every row (blank stays null, no weekly mix-in)
    const mixed = parseRgnm(MN_MIXED_ROWS).obs
    expect(mixed.map((o) => [o.week, o.value, o.field])).toEqual([
      ['2026-09-12', 0.5, 'percent_pos_3wma'],
      ['2026-09-19', 0.4, 'percent_pos_3wma'],
      ['2026-09-26', null, 'percent_pos_3wma'],
    ])
    // No 3-week average anywhere → weekly percent_pos for every row
    const weekly = parseRgnm(MN_MIXED_ROWS.map(({ percent_pos_3wma: _drop, ...r }) => r)).obs
    expect(weekly.map((o) => [o.value, o.field])).toEqual([[0.9, 'percent_pos'], [0.1, 'percent_pos'], [1.7, 'percent_pos']])
  })

  it('flags pathogens that have only component-subtype rows (renamed aggregate label)', () => {
    expect(subtypeRank('PIV Combined')).toBe(1)
    expect(subtypeRank('All types')).toBe(1)
    const { obs, diag } = parseRgnm([
      // Illustrative: CDC renames 'Combined Type' to an unrecognized label for PIV.
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'PIV', subtype: 'PIV1', percent_pos: '0.3' },
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'PIV', subtype: 'PIV3', percent_pos: '1.2' },
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'HCOV', subtype: 'Combined Type', percent_pos: '0.77' },
      { mmwrweek_end: '2026-09-26T00:00:00.000', level: 'National', pathogen: 'HCOV', subtype: 'OC43', percent_pos: '0.4' },
    ])
    expect(obs.map((o) => o.pathogen)).toEqual(['seasonal-cov'])
    expect(diag.componentOnly).toEqual({ PIV: ['PIV1', 'PIV3'] })
    expect(diag.geos).toEqual({ US: 1 })
  })

  it('parses seuz-s2cv national positivity', () => {
    const { obs } = parseSeuz(SEUZ_ROWS)
    const sel = selectLatest(obs)
    expect(toPoints(sel.byGeoPathogen.get('US|influenza'), '2021-07-01')).toEqual([['2026-09-19', 2.6], ['2026-09-26', 3.4]])
    expect(sel.byGeoPathogen.get('US|covid')!.get('2026-09-26')!.value).toBe(4.9)
  })

  it("detects CDC's moving-average wording", () => {
    expect(
      describesMovingAverage(
        'The average of the weekly % test positivity for the current, previous, and following weeks for HHS Region. The weekly percent positive is displayed for the national level. ',
      ),
    ).toBe(true)
    expect(describesMovingAverage('Weekly percent of tests positive')).toBe(false)
    expect(describesMovingAverage(undefined)).toBeUndefined()
  })
})

describe('cdcNrevss.run (network stubbed)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const silent: Logger = { info() {}, warn() {}, error() {}, child: () => silent }
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  const toSoda = (rows: Record<string, string>[]) =>
    rows.map((r) => ({ ...r, posted: r.posted ? parseSocrataTimestamp(r.posted)! + '.000' : undefined, mmwrweek_end: parseSocrataTimestamp(r.mmwrweek_end)! + '.000' }))
  const RSV_SODA = toSoda(RSV_MIRROR_ROWS.filter((r) => r.level !== 'Region 1'))
  /** Stub fetch: dataset id → SODA rows; everything else (metadata, mirrors, other datasets) is 403. */
  function stub(data: Record<string, unknown[]>, urls: string[] = []) {
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      urls.push(url)
      const m = /\/resource\/([a-z0-9]{4}-[a-z0-9]{4})\.json/.exec(url)
      if (m && data[m[1]]) return json(data[m[1]])
      return new Response('forbidden', { status: 403 })
    })
  }
  const ctxFor = (root = '/nonexistent') => ({ now: '2026-10-07T12:00:00Z', log: silent, historyStart: '2021-07-01', cacheDir: root, rootDir: root })
  const region = (res: Awaited<ReturnType<typeof cdcNrevss.run>>) =>
    new Map(res.datasets.find((d) => d.dataset === 'nrevss-region5')!.series.map((s) => [s.id, s]))
  const ID = 'cdc-nrevss:nrevss-region5'

  it('prefers rgnm-fkqb, falls back per virus/place, and adds national flu', async () => {
    const urls: string[] = []
    stub({ 'rgnm-fkqb': RGNM_NATIONAL_ROWS, '3cxc-4k8q': RSV_SODA, 'seuz-s2cv': SEUZ_ROWS }, urls)
    const res = await cdcNrevss.run(ctxFor())
    const byId = region(res)
    // National RV/EV from rgnm-fkqb (weekly)
    const rv = byId.get(`${ID}:rhino-entero:test_positivity:national:US`)!
    expect(rv.points).toEqual([['2026-09-19', 29.89], ['2026-09-26', 32.44]])
    expect(rv.unit).toBe('%')
    expect(rv.geo).toEqual({ type: 'national', code: 'US', name: 'United States' })
    expect(rv.attrs?.dataset).toBe('rgnm-fkqb')
    expect(rv.note).toMatch(/not prevalence/)
    expect(rv.note).toContain('NREVSS laboratories in the United States. Weekly')
    expect(rv.note).not.toContain('..')
    expect(rv.official).toBeUndefined()
    // CDC: last two weeks less complete → provisional from the second-newest week
    expect(rv.provisionalFrom).toBe('2026-09-19')
    // National RSV: rgnm-fkqb wins over 3cxc-4k8q
    expect(byId.get(`${ID}:rsv:test_positivity:national:US`)!.points.at(-1)).toEqual(['2026-09-26', 0.58])
    // Region 5 RSV: rgnm-fkqb has none here, so the 3cxc-4k8q centered 3-week average is used under its OWN id
    expect(byId.has(`${ID}:rsv:test_positivity:hhs-region:HHS5`)).toBe(false)
    const r5 = byId.get(`${ID}:rsv:test_positivity:hhs-region:HHS5:3wma`)!
    expect(r5.geo.code).toBe('HHS5')
    expect(r5.attrs).toMatchObject({ dataset: '3cxc-4k8q', method: 'centered 3-week moving average' })
    expect(r5.label).toContain('3-wk avg')
    expect(r5.points).toEqual([['2026-09-12', 0.2], ['2026-09-19', 0.3], ['2026-09-26', 0.3]])
    expect(r5.provisionalFrom).toBe('2026-09-19')
    // National influenza from seuz-s2cv
    const flu = byId.get(`${ID}:influenza:test_positivity:national:US`)!
    expect(flu.points.at(-1)).toEqual(['2026-09-26', 3.4])
    expect(flu.attrs?.dataset).toBe('seuz-s2cv')
    // gvsb-yw6g failure is reported but does not break the module; missing Region 5 rgnm data is reported too
    expect(res.message).toMatch(/gvsb-yw6g/)
    expect(res.message).toMatch(/rgnm-fkqb loaded but had no current data for RSV \(HHS5\), COVID-19 \(HHS5\)/)
    expect(res.datasets.find((d) => d.dataset === 'nrevss-state')!.series).toEqual([])
    // Live query: Minnesota by name, abbreviation or FIPS; no server-side subtype filter
    const where = decodeURIComponent(urls.find((u) => u.includes('/resource/rgnm-fkqb.json'))!.replace(/\+/g, ' '))
    expect(where).toContain("state in('Minnesota','MN','27')")
    expect(where).toContain("level in('Minnesota','MN')")
    expect(where).not.toContain('subtype')
  })

  it('uses weekly rgnm-fkqb Region 5 values over the 3cxc-4k8q 3-week average when both exist', async () => {
    stub({ 'rgnm-fkqb': [...RGNM_NATIONAL_ROWS, ...RGNM_R5_ROWS], '3cxc-4k8q': RSV_SODA, 'seuz-s2cv': SEUZ_ROWS })
    const byId = region(await cdcNrevss.run(ctxFor()))
    const r5 = byId.get(`${ID}:rsv:test_positivity:hhs-region:HHS5`)!
    expect(r5.attrs).toMatchObject({ dataset: 'rgnm-fkqb', method: 'weekly % positive' })
    expect(r5.label).toBe('RSV — % of lab tests positive (HHS Region 5)')
    expect(r5.points).toEqual([['2026-09-19', 0.12], ['2026-09-26', 0.16]])
    expect(r5.note).toContain('not Minnesota-specific')
    expect(byId.has(`${ID}:rsv:test_positivity:hhs-region:HHS5:3wma`)).toBe(false)
    // PIV aggregate published only as 'Combined Type'
    expect(byId.get(`${ID}:parainfluenza:test_positivity:hhs-region:HHS5`)!.points).toEqual([['2026-09-26', 1.13]])
  })

  it('switches to a fallback when the primary is 2+ weeks behind', async () => {
    // rgnm-fkqb frozen at 2026-09-05 (real National 0.49 / Region 1 0.16 values; Region 1 relabeled as Region 5)
    const frozen = [
      { mmwrweek_end: '2026-09-05T00:00:00.000', level: 'National', pathogen: 'RSV', percent_pos: '0.49' },
      { mmwrweek_end: '2026-09-05T00:00:00.000', level: 'Region 5', pathogen: 'RSV', percent_pos: '0.16' },
    ]
    stub({ 'rgnm-fkqb': frozen, '3cxc-4k8q': RSV_SODA })
    const res = await cdcNrevss.run(ctxFor())
    const byId = region(res)
    // Same id nationally → the fresher 3cxc-4k8q weekly national value replaces the stale one
    const us = byId.get(`${ID}:rsv:test_positivity:national:US`)!
    expect(us.attrs?.dataset).toBe('3cxc-4k8q')
    expect(us.points.at(-1)).toEqual(['2026-09-26', 0.6])
    // Region 5: the fresh 3-week average is published under its variant id, the stale weekly series is kept as-is
    expect(byId.get(`${ID}:rsv:test_positivity:hhs-region:HHS5:3wma`)!.points.at(-1)).toEqual(['2026-09-26', 0.3])
    expect(byId.get(`${ID}:rsv:test_positivity:hhs-region:HHS5`)!.points).toEqual([['2026-09-05', 0.16]])
    expect(res.message).toMatch(/stale source skipped: RSV \(US\): rgnm-fkqb latest week 2026-09-05 is 2\+ weeks behind 3cxc-4k8q/)
  })

  it('reports and carries forward a series that a successfully loaded dataset stopped returning', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nrevss-'))
    mkdirSync(path.join(root, 'public/data/series'), { recursive: true })
    const prev = (id: string, dataset: string, last = '2026-09-19') => ({
      id, source: 'cdc-nrevss', dataset: 'nrevss-region5', pathogen: 'hmpv', metric: 'test_positivity', unit: '%',
      geo: { type: 'national', code: 'US', name: 'United States' }, label: 'x', points: [['2026-09-12', 0.64], [last, 0.68]], attrs: { dataset },
    })
    writeFileSync(
      path.join(root, 'public/data/series/cdc-nrevss__nrevss-region5.json'),
      JSON.stringify({
        series: [
          prev(`${ID}:hmpv:test_positivity:national:US`, 'rgnm-fkqb'),
          prev(`${ID}:adenovirus:test_positivity:national:US`, 'rgnm-fkqb', '2025-06-28'), // > 1 year old: dropped
        ],
      }),
    )
    stub({ 'rgnm-fkqb': RGNM_NATIONAL_ROWS.filter((r) => r.pathogen !== 'HMPV' && r.pathogen !== 'Adenovirus') })
    const res = await cdcNrevss.run(ctxFor(root))
    const byId = region(res)
    const kept = byId.get(`${ID}:hmpv:test_positivity:national:US`)!
    expect(kept.points.at(-1)).toEqual(['2026-09-19', 0.68])
    expect(kept.attrs?.refresh).toBe('kept from previous run (rgnm-fkqb returned no data for it)')
    expect(byId.has(`${ID}:adenovirus:test_positivity:national:US`)).toBe(false)
    expect(res.message).toMatch(/rgnm-fkqb loaded but had no current data for .*hMPV \(US\), Adenovirus \(US\)/)
    expect((res.diagnostics as Record<string, unknown>).missingExpected).toContain(`${ID}:hmpv:test_positivity:national:US`)
  })

  it('labels Minnesota state series by the field actually used', async () => {
    stub({ 'rgnm-fkqb': [...RGNM_NATIONAL_ROWS, ...MN_MIXED_ROWS] })
    const res = await cdcNrevss.run(ctxFor())
    const mn = res.datasets.find((d) => d.dataset === 'nrevss-state')!.series
    expect(mn.map((s) => s.id)).toEqual(['cdc-nrevss:nrevss-state:rsv:test_positivity:state:27:3wma'])
    expect(mn[0].label).toBe('RSV — % of lab tests positive (Minnesota, 3-wk avg)')
    expect(mn[0].attrs).toMatchObject({ field: 'percent_pos_3wma', method: 'centered 3-week moving average' })
    expect(mn[0].points).toEqual([['2026-09-12', 0.5], ['2026-09-19', 0.4], ['2026-09-26', null]])
  })

  it('keeps previous-run series from a failed sub-dataset instead of wiping them', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nrevss-'))
    mkdirSync(path.join(root, 'public/data/series'), { recursive: true })
    const prevSeries = (id: string, dataset: string) => ({
      id, source: 'cdc-nrevss', dataset: 'nrevss-region5', pathogen: 'hmpv', metric: 'test_positivity', unit: '%',
      geo: { type: 'national', code: 'US', name: 'United States' }, label: 'x',
      points: [['2021-06-26', 1], ['2026-09-26', 0.59]], attrs: { dataset },
    })
    writeFileSync(
      path.join(root, 'public/data/series/cdc-nrevss__nrevss-region5.json'),
      JSON.stringify({
        series: [
          prevSeries(`${ID}:hmpv:test_positivity:national:US`, 'rgnm-fkqb'),
          prevSeries(`${ID}:gone:test_positivity:national:US`, '3cxc-4k8q'),
        ],
      }),
    )
    stub({ '3cxc-4k8q': [{ level: 'National', pcr_percent_positive: '0.6', posted: '2026-09-30T19:40:20.000', mmwrweek_end: '2026-09-26T00:00:00.000' }] })
    const res = await cdcNrevss.run(ctxFor(root))
    const ids = res.datasets[0].series.map((s) => s.id)
    expect(ids).toContain(`${ID}:rsv:test_positivity:national:US`)
    const kept = res.datasets[0].series.find((s) => s.pathogen === 'hmpv')!
    expect(kept.points).toEqual([['2026-09-26', 0.59]]) // trimmed to historyStart
    expect(kept.attrs?.refresh).toBe('kept from previous run (rgnm-fkqb unavailable)')
    expect(ids).not.toContain(`${ID}:gone:test_positivity:national:US`)
    expect(res.message).toMatch(/kept from the previous run/)
  })
})
