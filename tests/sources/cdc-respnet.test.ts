import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ageBandOf, ageKey, ageSeries, candidatesFrom, cdcRespnet, CATCHMENT_CHANGE, filterLines, isAllLabel, isCrudeRate,
  isOverallAge, isPer100k, normalizeRow, overallSeries, pickFreshest, provisionalFrom, selectWeekly, weeklyPoints,
  type RespRow,
} from '../../pipeline/sources/cdc-respnet'
import type { Logger } from '../../pipeline/lib/log'

// Fixtures are real rows observed in the data.cdc.gov exports (via the PopHIVE/Ingest mirror, 2026-09-25),
// except where a comment marks a row as altered to exercise a guard.

// kvib-3txy, API field names (as returned by SODA or renamed from the mirror CSV).
const KVIB = (network: string, season: string, date: string, estimate: string, extra: Record<string, string> = {}) => ({
  surveillance_network: network,
  season,
  date_type: 'Week Ending Date',
  date,
  age_category: 'Overall',
  race: 'All',
  sex: 'All',
  state: 'Minnesota',
  data_type: 'Weekly Rate',
  estimate_type: 'Rate per 100,000',
  rate_type: 'Observed',
  estimate,
  ...extra,
})

const KVIB_ROWS = [
  KVIB('COVID-NET', '2025-26', '2026-09-12', '0.5'),
  KVIB('COVID-NET', '2025-26', '2026-09-19', '0.4'),
  KVIB('RSV-NET', '2025-26', '2026-09-12', '0.0'),
  KVIB('RSV-NET', '2025-26', '2026-09-19', '0.0'),
  KVIB('Combined', '2025-26', '2026-09-12', '0.7'),
  KVIB('Combined', '2025-26', '2026-09-19', '0.6'),
  KVIB('FluSurv-NET', '2025-26', '2026-09-12', '0.2'),
  KVIB('FluSurv-NET', '2025-26', '2026-09-19', '0.2'),
  // Same week, Minnesota cumulative rate — must be ignored.
  KVIB('COVID-NET', '2025-26', '2026-09-19', '54.0', { data_type: 'Cumulative Rate' }),
  // Multi-site ('Overall') weekly rows — observed, model-estimated and race-stratified age-adjusted — must be ignored.
  KVIB('COVID-NET', '2025-26', '2026-09-19', '0.8', { state: 'Overall' }),
  KVIB('COVID-NET', '2025-26', '2026-09-19', '3.2', { state: 'Overall', rate_type: 'Estimated' }),
  KVIB('COVID-NET', '2025-26', '2026-09-19', '0.6', { state: 'Overall', race: 'Hispanic', rate_type: 'Age-Adjusted' }),
]

// 6jg4-xsqq (COVID-NET) uses agecat_label / race_label / sex_label.
const COVID = (date: string, age: string, estimate: string, sex = 'All') => ({
  season: '2025-26',
  date_type: 'Week Ending Date',
  date,
  agecat_label: age,
  race_label: 'All',
  sex_label: sex,
  state: 'MN',
  data_type: 'Weekly Rate',
  estimate_type: 'Rate per 100,000',
  rate_type: 'Observed',
  estimate,
})

// 29hc-w46k (RSV-NET) uses age_category / race / sex.
const RSV = (date: string, age: string, estimate: string) => ({
  season: '2025-26',
  date,
  date_type: 'Week Ending Date',
  age_category: age,
  race: 'All',
  sex: 'All',
  state: 'MN',
  data_type: 'Weekly Rate',
  estimate_type: 'Rate per 100,000',
  rate_type: 'Observed',
  estimate,
})

const stats = () => ({ conflicts: 0, nonSaturday: 0, unmappedNetworks: new Set<string>(), skippedAges: new Set<string>() })

describe('cdc-respnet row normalization', () => {
  it('maps kvib-3txy, COVID-NET and RSV-NET field names to one shape', () => {
    const k = normalizeRow(KVIB_ROWS[1])
    expect(k).toMatchObject({ network: 'COVID-NET', date: '2026-09-19', age: 'Overall', state: 'Minnesota', estimate: 0.4 })
    const c = normalizeRow(COVID('2026-09-19', '≥75 years', '3.4'), 'COVID-NET')
    expect(c).toMatchObject({ network: 'COVID-NET', age: '≥75 years', race: 'All', sex: 'All', state: 'MN', estimate: 3.4 })
    const r = normalizeRow(RSV('2026-09-19', '0-<6 months', '3.3'), 'RSV-NET')
    expect(r).toMatchObject({ network: 'RSV-NET', age: '0-<6 months', estimate: 3.3, rateType: 'Observed' })
  })

  it('falls back to CSV display names when a mirror rename map is missing', () => {
    const row = normalizeRow(
      {
        Season: '2025-26', 'Date Type': 'Week Ending Date', Date: '2026-09-19', 'Age Category': '0-17 years (Children)',
        Race: 'All', Sex: 'All', State: 'MN', 'Data Type': 'Weekly Rate', 'Estimate Type': 'Rate per 100,000',
        'Rate Type': 'Observed', Estimate: '0.1',
      },
      'COVID-NET',
    )
    expect(row).toMatchObject({ age: '0-17 years (Children)', state: 'MN', dataType: 'Weekly Rate', estimate: 0.1 })
  })

  it('treats blank estimates as missing, not zero', () => {
    expect(normalizeRow(KVIB('RSV-NET', '2025-26', '2026-09-12', '')).estimate).toBeNull()
  })

  it('recognizes the un-stratified encodings', () => {
    for (const v of ['All', 'All Race/Ethnicities', 'All Sexes', 'Overall']) expect(isAllLabel(v)).toBe(true)
    for (const v of ['Male', 'Hispanic', 'White, non-Hispanic']) expect(isAllLabel(v)).toBe(false)
    for (const v of ['Overall', 'All', 'All Ages']) expect(isOverallAge(v)).toBe(true)
    expect(isOverallAge('≥18 years (Adults)')).toBe(false)
    expect(isCrudeRate('Observed')).toBe(true)
    expect(isCrudeRate('Age-Adjusted')).toBe(false)
    expect(isCrudeRate('Estimated')).toBe(false)
    expect(isPer100k('Rate per 100,000')).toBe(true)
    expect(isPer100k('')).toBe(true) // column missing: tolerated, reported as schema drift
    expect(isPer100k('Count')).toBe(false)
    expect(isPer100k('Percent')).toBe(false)
  })
})

describe('cdc-respnet age bands', () => {
  it('canonicalizes labels across datasets', () => {
    expect(ageKey('≥65 years')).toBe('ge65y')
    expect(ageKey('65+ yr')).toBe('ge65y')
    expect(ageKey('0-<6 months')).toBe('0-<6m')
    expect(ageKey('0-17 years (Children)')).toBe('0-17y')
  })

  it('keeps the audience-group bands and skips the rest', () => {
    expect(ageBandOf('0-<6 months')).toMatchObject({ slug: '0-6mo', group: 'infants' })
    expect(ageBandOf('0-<1 year')).toMatchObject({ slug: '0-1y', group: 'infants' })
    expect(ageBandOf('0-<1 yr')).toMatchObject({ slug: '0-1y' })
    expect(ageBandOf('1-4 years')).toMatchObject({ slug: '1-4y', group: 'children' })
    expect(ageBandOf('5-17 years')).toMatchObject({ slug: '5-17y', group: 'children' })
    // 0-17 includes infants, so it is not labelled as the 'children' (1-17) audience group.
    expect(ageBandOf('0-17 years (Children)')).toMatchObject({ slug: '0-17y' })
    expect(ageBandOf('0-17 years (Children)')!.group).toBeUndefined()
    expect(ageBandOf('18-49 years')).toMatchObject({ slug: '18-49y', group: 'adults' })
    expect(ageBandOf('50-64 yr')).toMatchObject({ slug: '50-64y', group: 'older-adults' })
    expect(ageBandOf('≥65 years')).toMatchObject({ slug: '65plus', group: 'seniors' })
    expect(ageBandOf('65-74 years')).toMatchObject({ slug: '65-74y', group: 'seniors' })
    expect(ageBandOf('≥75 years')).toMatchObject({ slug: '75plus', group: 'seniors' })
    expect(ageBandOf('75+ yr')).toMatchObject({ slug: '75plus' })
    for (const skip of ['6mo-<12 months', '1-<2 years', '≥18 years (Adults)', '75-84 years', '≥85 years', 'Pediatrics']) {
      expect(ageBandOf(skip)).toBeNull()
    }
  })
})

describe('cdc-respnet weekly series', () => {
  const kvib = KVIB_ROWS.map((r) => normalizeRow(r))

  it('selects only Minnesota crude weekly rates for all races and sexes', () => {
    const sel = selectWeekly(kvib, ['Minnesota', 'MN'])
    expect(sel).toHaveLength(8)
    expect(sel.every((r) => r.dataType === 'Weekly Rate' && r.rateType === 'Observed' && r.state === 'Minnesota')).toBe(true)
    const covid = [COVID('2026-09-19', 'All', '0.4'), COVID('2026-09-19', 'All', '0.3', 'Male')].map((r) => normalizeRow(r, 'COVID-NET'))
    expect(selectWeekly(covid, ['MN'])).toHaveLength(1)
    // Altered row: a weekly row with a non-rate estimate type must never be read as per-100k.
    const counted = normalizeRow({ ...KVIB('COVID-NET', '2025-26', '2026-09-19', '12'), estimate_type: 'Count' })
    expect(selectWeekly([counted], ['Minnesota'])).toHaveLength(0)
  })

  it('pre-filters mirror CSV lines but keeps the header', () => {
    const text = [
      '"Season","Date","State","Data Type","Estimate"',
      '"2025-26","2026-09-19","MN","Weekly Rate","0.4"',
      '"2025-26","2026-09-19","MN","Cumulative Rate","54.0"',
      '"2025-26","2026-09-19","CA","Weekly Rate","0.6"',
      '',
    ].join('\n')
    expect(filterLines(text, (l) => l.includes('"MN"') && l.includes('Weekly Rate')).split('\n')).toEqual([
      '"Season","Date","State","Data Type","Estimate"',
      '"2025-26","2026-09-19","MN","Weekly Rate","0.4"',
    ])
  })

  it('builds sorted Saturday-keyed points from historyStart on', () => {
    const rows: RespRow[] = [
      normalizeRow(KVIB('COVID-NET', '2025-26', '2026-09-19', '0.4')),
      normalizeRow(KVIB('COVID-NET', '2025-26', '2026-09-12', '0.5')),
      normalizeRow(KVIB('COVID-NET', '2020-21', '2021-06-26', '0.6')),
      normalizeRow(KVIB('COVID-NET', '2025-26', '2026-09-05', '')),
    ]
    const b = weeklyPoints(rows, '2021-07-01')
    expect(b.points).toEqual([
      ['2026-09-05', null],
      ['2026-09-12', 0.5],
      ['2026-09-19', 0.4],
    ])
    expect(b.conflicts).toBe(0)
    expect(b.nonSaturday).toBe(0)
  })

  it('maps non-Saturday dates to the week-ending Saturday and flags conflicts', () => {
    const rows = [
      normalizeRow(KVIB('COVID-NET', '2025-26', '2026-09-13', '0.5')), // a Sunday → week ending 2026-09-19
      normalizeRow(KVIB('COVID-NET', '2026-27', '2026-09-19', '0.6')),
    ]
    const b = weeklyPoints(rows, '2021-07-01')
    expect(b.points).toEqual([['2026-09-19', 0.6]])
    expect(b.nonSaturday).toBe(1)
    expect(b.conflicts).toBe(1)
  })

  it('groups kvib-3txy rows into one overall candidate per network', () => {
    const st = stats()
    const { overall, byAge } = candidatesFrom(selectWeekly(kvib, ['Minnesota']), 'kvib-3txy', '2021-07-01', st)
    expect(byAge).toHaveLength(0)
    expect(overall.map((c) => c.network).sort()).toEqual(['COVID-NET', 'Combined', 'FluSurv-NET', 'RSV-NET'])
    expect(overall.find((c) => c.network === 'Combined')!.points).toEqual([
      ['2026-09-12', 0.7],
      ['2026-09-19', 0.6],
    ])
  })

  it('splits RSV-NET rows into overall and kept age bands', () => {
    const rows = [
      RSV('2026-09-19', 'All', '0.0'),
      RSV('2026-09-19', '0-<6 months', '3.3'),
      RSV('2026-09-19', '0-<1 year', '1.6'),
      RSV('2026-09-19', '≥65 years', '0.1'),
      RSV('2026-09-19', '6mo-<12 months', '0.0'),
    ].map((r) => normalizeRow(r, 'RSV-NET'))
    const st = stats()
    const { overall, byAge } = candidatesFrom(selectWeekly(rows, ['MN']), '29hc-w46k', '2021-07-01', st)
    expect(overall).toHaveLength(1)
    expect(overall[0].points).toEqual([['2026-09-19', 0]])
    expect(byAge.map((c) => [c.band!.slug, c.rawAge, c.points[0][1]])).toEqual([
      ['0-6mo', '0-<6 months', 3.3],
      ['0-1y', '0-<1 year', 1.6],
      ['65plus', '≥65 years', 0.1],
    ])
    expect([...st.skippedAges]).toEqual(['6mo-<12 months'])
  })

  it('prefers fresher data and keeps the first candidate on ties', () => {
    const a = { network: 'RSV-NET' as const, datasetId: '29hc-w46k', points: [], latest: '2026-09-19' }
    const b = { network: 'RSV-NET' as const, datasetId: 'kvib-3txy', points: [], latest: '2026-09-19' }
    const c = { network: 'RSV-NET' as const, datasetId: 'kvib-3txy', points: [], latest: '2026-09-26' }
    expect(pickFreshest([a, b])!.datasetId).toBe('29hc-w46k')
    expect(pickFreshest([a, c])!.datasetId).toBe('kvib-3txy')
  })

  it('marks the latest two weeks provisional only for current series', () => {
    const pts: [string, number][] = [['2026-09-05', 0.3], ['2026-09-12', 0.5], ['2026-09-19', 0.4]]
    expect(provisionalFrom(pts, '2026-09-19')).toBe('2026-09-12')
    expect(provisionalFrom(pts, '2026-10-31')).toBeUndefined()
  })

  it('documents the catchment break, rounding and combined-rate gaps', () => {
    const pts: [string, number][] = [['2026-09-12', 0.7], ['2026-09-19', 0.6]]
    const comb = overallSeries('Combined', pts, 'kvib-3txy', '2026-09-19')
    expect(CATCHMENT_CHANGE).toBe('2024-10-05')
    expect(comb.attrs).toEqual({ network: 'Combined', dataset: 'kvib-3txy', rate: 'Observed (crude)', catchmentChange: '2024-10-05' })
    expect(comb.note).toMatch(/7-county Twin Cities metro through the 2023-24 season/)
    expect(comb.note).toMatch(/statewide from the 2024-25 season \(week ending 2024-10-05\)/)
    expect(comb.note).toMatch(/covers COVID-19 and RSV only/)
    expect(comb.note).toMatch(/0\.0 means under 0\.05 per 100,000/)
    expect(overallSeries('COVID-NET', pts, 'kvib-3txy').note).not.toMatch(/RSV only/)
    const kids = ageSeries('RSV-NET', '0-17 years (Children)', ageBandOf('0-17 years (Children)')!, pts, '29hc-w46k', 'respnet-mn-age-rsv')
    expect(kids.id).toBe('cdc-respnet:respnet-mn-age-rsv:rsv:hosp_rate:state:27:age-0-17y')
    expect(kids.attrs).toEqual({ network: 'RSV-NET', dataset: '29hc-w46k', catchmentChange: '2024-10-05' })
    const infants = ageSeries('RSV-NET', '0-<6 months', ageBandOf('0-<6 months')!, pts, '29hc-w46k', 'respnet-mn-age-rsv')
    expect(infants.attrs?.ageGroup).toBe('infants')
  })
})

// ───────── End-to-end run() with stubbed network: live data.cdc.gov path and PopHIVE-mirror fallback ─────────

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {}, child: () => silent }
const ctx = { now: '2026-10-07T12:00:00Z', log: silent, historyStart: '2021-07-01', cacheDir: '/tmp', rootDir: '/tmp' }

const COVID_LIVE = [
  COVID('2026-09-12', 'All', '0.5'),
  COVID('2026-09-19', 'All', '0.4'),
  COVID('2026-09-12', '≥75 years', '3.0'),
  COVID('2026-09-19', '≥75 years', '3.4'),
]
const RSV_LIVE = [RSV('2026-09-19', 'All', '0.0'), RSV('2026-09-19', '0-<6 months', '3.3')]

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

function csvOf(header: string[], rows: Record<string, string>[], keys: string[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  return [header.map(q).join(','), ...rows.map((r) => keys.map((k) => q(r[k] ?? '')).join(','))].join('\n') + '\n'
}

const KVIB_COLS: [string, string][] = [
  ['Surveillance Network', 'surveillance_network'], ['Season', 'season'], ['Date Type', 'date_type'], ['Date', 'date'],
  ['Age Category', 'age_category'], ['Race', 'race'], ['Sex', 'sex'], ['State', 'state'], ['Data Type', 'data_type'],
  ['Estimate Type', 'estimate_type'], ['Rate Type', 'rate_type'], ['Estimate', 'estimate'],
]
const RSV_COLS: [string, string][] = [
  ['Season', 'season'], ['Date', 'date'], ['Date Type', 'date_type'], ['Age Category', 'age_category'], ['Race', 'race'],
  ['Sex', 'sex'], ['State', 'state'], ['Data Type', 'data_type'], ['Estimate Type', 'estimate_type'],
  ['Rate Type', 'rate_type'], ['Estimate', 'estimate'],
]
const COVID_COLS: [string, string][] = [
  ['Season', 'season'], ['Date Type', 'date_type'], ['Date', 'date'], ['Age Category', 'agecat_label'],
  ['Race', 'race_label'], ['Sex', 'sex_label'], ['State', 'state'], ['Data Type', 'data_type'],
  ['Estimate Type', 'estimate_type'], ['Rate Type', 'rate_type'], ['Estimate', 'estimate'],
]

function mirror(cols: [string, string][], rows: Record<string, string>[]) {
  const csv = csvOf(cols.map((c) => c[0]), rows, cols.map((c) => c[1]))
  return {
    meta: { rowsUpdatedAt: 1790343703, columns: cols.map(([name, fieldName]) => ({ name, fieldName })) },
    xz: execFileSync('xz', ['-c'], { input: Buffer.from(csv) }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

type MirrorFile = { meta: unknown; xz: Buffer }

/** data.cdc.gov blocked; serve the given PopHIVE mirror files, 404 for the rest. */
function blockedLive(files: Record<string, MirrorFile>) {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input)
    if (url.includes('data.cdc.gov')) return new Response('Forbidden', { status: 403 })
    const m = /respnet\/raw\/([a-z0-9-]+)\.(json|csv\.xz)$/.exec(url)
    if (m && files[m[1]]) return m[2] === 'json' ? json(files[m[1]].meta) : new Response(files[m[1]].xz)
    return new Response('not found', { status: 404 })
  })
}

const byName = (res: Awaited<ReturnType<typeof cdcRespnet.run>>) => Object.fromEntries(res.datasets.map((d) => [d.dataset, d]))

describe('cdc-respnet run()', () => {
  it('uses data.cdc.gov when it answers', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', async (input: string | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('/api/views/')) return json({ rowsUpdatedAt: 1790343703 })
      if (url.includes('/resource/kvib-3txy.json')) return json(KVIB_ROWS.filter((r) => r.state === 'Minnesota' && r.data_type === 'Weekly Rate'))
      if (url.includes('/resource/6jg4-xsqq.json')) return json(COVID_LIVE)
      if (url.includes('/resource/29hc-w46k.json')) return json(RSV_LIVE)
      return new Response('not found', { status: 404 })
    })
    const res = await cdcRespnet.run(ctx)
    expect(res.datasets.map((d) => d.dataset)).toEqual(['respnet-mn', 'respnet-mn-age-covid', 'respnet-mn-age-rsv'])
    const ds = byName(res)
    const overall = ds['respnet-mn']
    expect(overall.series.map((s) => s.id)).toEqual([
      'cdc-respnet:respnet-mn:covid:hosp_rate:state:27',
      'cdc-respnet:respnet-mn:influenza:hosp_rate:state:27',
      'cdc-respnet:respnet-mn:rsv:hosp_rate:state:27',
      'cdc-respnet:respnet-mn:respiratory-combined:hosp_rate:state:27',
    ])
    const covid = overall.series[0]
    expect(covid.points).toEqual([['2026-09-12', 0.5], ['2026-09-19', 0.4]])
    expect(covid.unit).toBe('per100k')
    expect(covid.provisionalFrom).toBe('2026-09-12')
    expect(covid.attrs).toMatchObject({ network: 'COVID-NET', dataset: 'kvib-3txy', catchmentChange: '2024-10-05' })
    expect(covid.official).toBeUndefined()
    expect(ds['respnet-mn-age-covid'].series.map((s) => [s.id, s.age, s.points.at(-1), s.attrs?.ageGroup])).toEqual([
      ['cdc-respnet:respnet-mn-age-covid:covid:hosp_rate:state:27:age-75plus', '≥75 years', ['2026-09-19', 3.4], 'seniors'],
    ])
    expect(ds['respnet-mn-age-rsv'].series.map((s) => [s.id, s.age, s.points.at(-1)])).toEqual([
      ['cdc-respnet:respnet-mn-age-rsv:rsv:hosp_rate:state:27:age-0-6mo', '0-<6 months', ['2026-09-19', 3.3]],
    ])
    expect(res.message).toBeUndefined()
    const covidQuery = new URL(urls.find((u) => u.includes('6jg4-xsqq.json'))!).searchParams.get('$where')
    expect(covidQuery).toContain("state = 'MN'")
    expect(covidQuery).toContain("race_label IN ('All', 'All Race/Ethnicities')")
    expect((res.diagnostics!['kvib-3txy'] as { estimateTypes: Record<string, number> }).estimateTypes).toEqual({ 'Rate per 100,000': 8 })
  })

  it('falls back to the PopHIVE mirror; a failed sub-dataset leaves only its own file empty', async () => {
    blockedLive({ 'kvib-3txy': mirror(KVIB_COLS, KVIB_ROWS), '29hc-w46k': mirror(RSV_COLS, RSV_LIVE) }) // 6jg4-xsqq mirror missing
    const res = await cdcRespnet.run(ctx)
    const ds = byName(res)
    expect(ds['respnet-mn'].series).toHaveLength(4)
    expect(ds['respnet-mn'].series.find((s) => s.pathogen === 'respiratory-combined')!.points.at(-1)).toEqual(['2026-09-19', 0.6])
    // Empty → the orchestrator does not write it, so the previous COVID age file survives.
    expect(ds['respnet-mn-age-covid'].series).toEqual([])
    expect(ds['respnet-mn-age-rsv'].series.map((s) => s.id)).toEqual(['cdc-respnet:respnet-mn-age-rsv:rsv:hosp_rate:state:27:age-0-6mo'])
    expect(res.message).toMatch(/Partial refresh: 6jg4-xsqq/)
    expect(res.message).toMatch(/previous respnet-mn-age-covid data kept/)
    expect(res.message).toMatch(/PopHIVE mirror/)
    expect((res.diagnostics!['kvib-3txy'] as { via: string }).via).toBe('pophive-mirror')
  })

  it('leaves respnet-mn empty (previous file kept) when kvib-3txy is unavailable', async () => {
    blockedLive({ '6jg4-xsqq': mirror(COVID_COLS, COVID_LIVE), '29hc-w46k': mirror(RSV_COLS, RSV_LIVE) })
    const res = await cdcRespnet.run(ctx)
    const ds = byName(res)
    // No COVID/RSV-only subset overwriting the four-network file.
    expect(ds['respnet-mn'].series).toEqual([])
    expect(ds['respnet-mn-age-covid'].series.map((s) => s.id)).toEqual(['cdc-respnet:respnet-mn-age-covid:covid:hosp_rate:state:27:age-75plus'])
    expect(ds['respnet-mn-age-rsv'].series.map((s) => s.id)).toEqual(['cdc-respnet:respnet-mn-age-rsv:rsv:hosp_rate:state:27:age-0-6mo'])
    expect(res.message).toMatch(/Partial refresh: kvib-3txy/)
    expect(res.message).toMatch(/previous respnet-mn data kept/)
  })

  it('uses a dedicated dataset for the overall rate when it is fresher than kvib-3txy', async () => {
    // kvib-3txy one week behind (its 2026-09-19 rows withheld); 6jg4-xsqq current.
    blockedLive({
      'kvib-3txy': mirror(KVIB_COLS, KVIB_ROWS.filter((r) => r.date !== '2026-09-19')),
      '6jg4-xsqq': mirror(COVID_COLS, COVID_LIVE),
      '29hc-w46k': mirror(RSV_COLS, RSV_LIVE),
    })
    const res = await cdcRespnet.run(ctx)
    const overall = byName(res)['respnet-mn']
    expect(overall.series.map((s) => [s.pathogen, s.attrs?.dataset, s.points.at(-1)])).toEqual([
      ['covid', '6jg4-xsqq', ['2026-09-19', 0.4]],
      ['influenza', 'kvib-3txy', ['2026-09-12', 0.2]],
      ['rsv', '29hc-w46k', ['2026-09-19', 0]],
      ['respiratory-combined', 'kvib-3txy', ['2026-09-12', 0.7]],
    ])
    expect(res.message).not.toMatch(/Partial refresh/)
  })
})
