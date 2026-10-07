import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  BLANK_SERIES_WEEKS, buildSeries, checkSchema, combineMeasure, describeLiveError, groupByPathogen, liveQuery, matchLabel,
  mirrorRows, normalizeLabel, parseRows, sumReported, xzFilterLines, ytdSummary,
} from '../../pipeline/sources/cdc-nndss'
import { HttpError } from '../../pipeline/lib/http'
import { mmwrWeekEnding } from '../../shared/mmwr'

// Real rows from the PopHIVE/Ingest mirror of data.cdc.gov x9gk-5huc (rows updated 2026-09-30).
const HEADER =
  '"Reporting Area","Current MMWR Year","MMWR WEEK","Label","Current week","Current week, flag","Previous 52 week Max","Previous 52 weeks Max, flag","Cumulative YTD Current MMWR Year","Cumulative YTD Current MMWR Year, flag","Cumulative YTD Previous MMWR Year","Cumulative YTD Previous MMWR Year, flag","LOCATION1","LOCATION2","sort_order","geocode"'
const LINES = [
  '"Minnesota","2026","7","Measles, Imported",,"-","3",,,"-",,"-","Minnesota",,"20260704363","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","7","Measles, Indigenous","3",,"6",,"5",,,"-","Minnesota",,"20260704433","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","7","Pertussis",,"-","49",,,"-","415",,"Minnesota",,"20260705273","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","7","Campylobacteriosis",,"-","0",,,"-",,"-","Minnesota",,"20260700933","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","37","Arboviral diseases, West Nile virus disease",,"-","4",,"7",,"154",,"Minnesota",,"20263700513","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","37","Mpox",,"-","3",,"20",,"17",,"Minnesota",,"20263704923","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","37","Pertussis",,"-","18",,"89",,"1,114",,"Minnesota",,"20263705343","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","38","Arboviral diseases, West Nile virus disease",,"-","3",,"10",,"158",,"Minnesota",,"20263800513","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","38","Campylobacteriosis",,"-","53",,,"-","1,461",,"Minnesota",,"20263801003","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","38","Measles, Imported",,"-","3",,,"-","1",,"Minnesota",,"20263804363","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","38","Measles, Indigenous",,"-","8",,"18",,"13",,"Minnesota",,"20263804433","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","38","Mpox","3",,"4",,"25",,"17",,"Minnesota",,"20263804923","POINT (-93.09649 44.94339)"',
  '"Minnesota","2026","38","Pertussis",,"-","18",,"119",,"1,125",,"Minnesota",,"20263805343","POINT (-93.09649 44.94339)"',
  '"Minnesota","2025","38","Campylobacteriosis",,"-","49",,,"-","1,557",,"Minnesota",,"20253800933","POINT (-93.09649 44.94339)"',
  '"Minnesota","2025","53","Campylobacteriosis",,"-","0",,,"-","2,057",,"Minnesota",,"20255300933","POINT (-93.09649 44.94339)"',
  '"Minnesota","2025","53","Pertussis",,"-","92",,"1,179",,"3,086",,"Minnesota",,"20255305273","POINT (-93.09649 44.94339)"',
  '"MINNESOTA","2023","45","Hepatitis A, Confirmed",,"-","3","-","17","-","13","-","MINNESOTA",,"20234503103","POINT (-94.200790583 46.348855766)"',
  '"MINNESOTA","2023","45","Hepatitis, A, acute",,"-","3","-","17","-","13","-","MINNESOTA",,"20234503663","POINT (-94.200790583 46.348855766)"',
  '"MINNESOTA","2024","25","Hepatitis A, Confirmed","1","-","3","-","12","-","12","-","MINNESOTA",,"20242502963","POINT (-94.200790583 46.348855766)"',
  '"MINNESOTA","2022","52","Ehrlichiosis and Anaplasmosis, Anaplasma phagocytophilum infection",,"-","0","-",,"-","587","-","MINNESOTA",,"20225201843","POINT (-93.09649 44.94339)"',
  '"West North Central","2026","38","Pertussis",,"-","83",,"568",,"2,906",,,"West North Central","20263805340",',
]
// Display name → API field name, from the mirrored Socrata metadata (x9gk-5huc.json).
const COLUMNS = [
  ['Reporting Area', 'states'], ['Current MMWR Year', 'year'], ['MMWR WEEK', 'week'], ['Label', 'label'],
  ['Current week', 'm1'], ['Current week, flag', 'm1_flag'], ['Previous 52 week Max', 'm2'],
  ['Previous 52 weeks Max, flag', 'm2_flag'], ['Cumulative YTD Current MMWR Year', 'm3'],
  ['Cumulative YTD Current MMWR Year, flag', 'm3_flag'], ['Cumulative YTD Previous MMWR Year', 'm4'],
  ['Cumulative YTD Previous MMWR Year, flag', 'm4_flag'], ['LOCATION1', 'location1'], ['LOCATION2', 'location2'],
  ['sort_order', 'sort_order'], ['geocode', 'geocode'],
].map(([name, fieldName]) => ({ name, fieldName }))

const rawRows = () => mirrorRows(HEADER, LINES, COLUMNS)
const build = () => {
  const { rows } = parseRows(rawRows())
  return buildSeries(groupByPathogen(rows), '2021-07-01', rows[rows.length - 1].weekEnding)
}

describe('cdc-nndss label mapping', () => {
  it('maps the exact Minnesota labels seen in x9gk-5huc', () => {
    const p = (l: string) => matchLabel(normalizeLabel(l))?.rule.pathogen ?? null
    expect(p('Pertussis')).toBe('pertussis')
    expect(p('Measles, Indigenous')).toBe('measles')
    expect(p('Measles, Imported')).toBe('measles')
    expect(p('Salmonellosis (excluding Salmonella Typhi infection and Salmonella Paratyphi infection)')).toBe('salmonella')
    expect(p('Shiga toxin-producing Escherichia coli (STEC)')).toBe('stec')
    expect(p('Shigellosis')).toBe('shigella')
    expect(p('Campylobacteriosis')).toBe('campylobacter')
    expect(p('Hepatitis A, Confirmed')).toBe('hepatitis-a')
    expect(p('Hepatitis, A, acute')).toBe('hepatitis-a')
    expect(p('Mpox')).toBe('mpox')
    expect(p('Arboviral diseases, West Nile virus disease')).toBe('west-nile')
    expect(p('West Nile virus disease, Neuroinvasive')).toBe('west-nile')
    expect(p('West Nile virus disease, Non-neuroinvasive')).toBe('west-nile')
    expect(p('Ehrlichiosis and Anaplasmosis, Anaplasma phagocytophilum infection')).toBe('anaplasmosis')
    expect(p('Babesiosis')).toBe('babesiosis')
    expect(p('Cryptosporidiosis')).toBe('cryptosporidium')
    expect(p('Cyclosporiasis')).toBe('cyclospora')
    expect(p('Giardiasis')).toBe('giardia')
  })
  it('does not map look-alike or unsupported labels', () => {
    const p = (l: string) => matchLabel(normalizeLabel(l))?.rule.pathogen ?? null
    expect(p('Salmonella Typhi infection')).toBeNull()
    expect(p('SalmonellaParatyphi infection')).toBeNull()
    expect(p('Hepatitis B, acute, Confirmed')).toBeNull()
    expect(p('Ehrlichiosis and Anaplasmosis, Ehrlichia chaffeensis infection')).toBeNull()
    expect(p('Streptococcal toxic shock syndrome')).toBeNull()
    expect(p('Mumps')).toBeNull()
    expect(p('Legionellosis')).toBeNull()
    expect(p('Arboviral diseases, La Crosse  virus disease')).toBeNull()
  })
  it('anchors every pattern so Confirmed/Probable rows never match beside a Total', () => {
    const p = (l: string) => matchLabel(normalizeLabel(l))?.rule.pathogen ?? null
    expect(p('Salmonellosis, Total')).toBe('salmonella')
    expect(p('Salmonellosis, Confirmed')).toBeNull()
    expect(p('Salmonellosis, Probable')).toBeNull()
    expect(p('Shiga toxin-producing Escherichia coli (STEC), Total')).toBe('stec')
    expect(p('Shiga toxin-producing Escherichia coli (STEC), Probable')).toBeNull()
    expect(p('Anaplasma phagocytophilum infection, Probable')).toBeNull()
    expect(p('Pertussis, Total')).toBe('pertussis')
    expect(p('Pertussis, Confirmed')).toBeNull()
    expect(p('Mpox, Probable')).toBeNull()
    expect(p('Arboviral diseases, West Nile virus disease, Probable')).toBeNull()
  })
  it('treats the two invasive group A strep wordings as alternatives, not parts to add', () => {
    const a = matchLabel(normalizeLabel('Invasive group A streptococcal disease'))!
    const b = matchLabel(normalizeLabel('Group A streptococcal infection, invasive'))!
    expect([a.rule.pathogen, a.alt, a.comp]).toEqual(['strep-a', 0, 0])
    expect([b.rule.pathogen, b.alt, b.comp]).toEqual(['strep-a', 1, 0])
  })
  it('separates neuroinvasive from non-neuroinvasive components', () => {
    const neuro = matchLabel(normalizeLabel('West Nile virus disease, Neuroinvasive'))!
    const non = matchLabel(normalizeLabel('West Nile virus disease, Non-neuroinvasive'))!
    expect([neuro.alt, neuro.comp]).toEqual([1, 0])
    expect([non.alt, non.comp]).toEqual([1, 1])
  })
})

describe('cdc-nndss parsing', () => {
  it('renames mirror display headers and parses thousands separators', () => {
    const rows = rawRows()
    expect(rows[12]).toMatchObject({ states: 'Minnesota', year: '2026', week: '38', label: 'Pertussis', m1: '', m1_flag: '-', m4: '1,125' })
    const { rows: parsed, stats } = parseRows(rows)
    const pert = parsed.find((r) => r.label === 'Pertussis' && r.weekEnding === '2026-09-26')!
    expect(pert).toMatchObject({ year: 2026, week: 38, m1: null, m1Flag: '-', m2: 18, m3: 119, m4: 1125 })
    expect(stats.stateSpellings).toEqual({ Minnesota: 16, MINNESOTA: 4 })
    expect(stats.minnesota).toBe(20) // the West North Central row is ignored
  })
  it('accepts SODA JSON rows (null fields omitted) and MMWR week 53', () => {
    const { rows } = parseRows([
      { states: 'Minnesota', year: '2026', week: '38', label: 'Mpox', m1: '3', m2: '4', m3: '25', m4: '17' },
      { states: 'Minnesota', year: '2025', week: '53', label: 'Pertussis', m1_flag: '-', m2: '92', m3: '1179', m4: '3086' },
      { states: 'Minnesota', year: '2026', week: '54', label: 'Pertussis' },
    ])
    expect(rows.map((r) => [r.weekEnding, r.label, r.m1])).toEqual([
      ['2026-01-03', 'Pertussis', null],
      ['2026-09-26', 'Mpox', 3],
    ])
  })
  it('checks the schema', () => {
    expect(checkSchema(rawRows()).missingRequired).toEqual([])
    const drift = checkSchema([{ states: 'Minnesota', year: '2026', week: '38', disease: 'Mpox' }])
    expect(drift.missingRequired).toEqual(['label'])
    expect(drift.missingMetrics).toEqual(['m1', 'm2', 'm3', 'm4'])
  })
  it('builds a Minnesota-only SoQL query with text years', () => {
    expect(liveQuery([2025, 2026]).where).toBe("upper(states) = 'MINNESOTA' AND year IN ('2025', '2026')")
  })
})

describe('cdc-nndss series', () => {
  it('keeps blank current-week cells as null, never zero', () => {
    const pert = build().series.find((s) => s.pathogen === 'pertussis')!
    expect(pert.id).toBe('cdc-nndss:nndss-mn:pertussis:cases:state:27')
    expect(pert.points).toEqual([
      ['2026-01-03', null],
      ['2026-02-21', null],
      ['2026-09-19', null],
      ['2026-09-26', null],
    ])
    expect(pert.attrs).toMatchObject({ ytd: '119', ytdPrevYear: '1125', max52: '18', mmwrWeek: '2026-W38' })
    // MN Pulse's own sentence, not the publisher's assessment.
    expect(pert.summary).toBe('119 cases so far in 2026 vs 1,125 by this week in 2025')
    expect(pert.official).toBeUndefined()
  })
  it('reports current-week counts when published', () => {
    const mpox = build().series.find((s) => s.pathogen === 'mpox')!
    expect(mpox.points).toEqual([
      ['2026-09-19', null],
      ['2026-09-26', 3],
    ])
    expect(mpox.summary).toBe('25 cases so far in 2026 vs 17 by this week in 2025')
  })
  it('combines indigenous and imported measles without summing 52-week maxima', () => {
    const measles = build().series.find((s) => s.pathogen === 'measles')!
    expect(measles.points).toEqual([
      ['2026-02-21', 3], // Indigenous 3 + Imported blank
      ['2026-09-26', null], // both blank
    ])
    expect(measles.attrs).toMatchObject({
      ytd: '18',
      ytdPrevYear: '14',
      'max52 (Measles, Imported)': '3',
      'max52 (Measles, Indigenous)': '8',
    })
    expect(measles.attrs?.max52).toBeUndefined()
  })
  it('flags diseases Minnesota leaves blank all year', () => {
    const campy = build().series.find((s) => s.pathogen === 'campylobacter')!
    expect(campy.points.every(([, v]) => v === null)).toBe(true)
    expect(campy.attrs?.ytd).toBeUndefined()
    expect(campy.attrs?.currentYear).toMatch(/blank all year/)
    expect(campy.summary).toBe("2026 count is blank in CDC's weekly table; 1,461 by this week in 2025")
    expect(campy.note).toMatch(/blanks do not mean zero/)
    // West Nile has 2026 YTD values, so it is not flagged.
    const wnv = build().series.find((s) => s.pathogen === 'west-nile')!
    expect(wnv.attrs?.currentYear).toBeUndefined()
    expect(wnv.summary).toBe('10 cases so far in 2026 vs 158 by this week in 2025')
  })
  it('does not double count renamed labels in the same week', () => {
    const hepA = build().series.find((s) => s.pathogen === 'hepatitis-a')
    // Hepatitis A's last row (2024) is far from the latest table week but has a current-week count.
    expect(hepA?.points).toEqual([
      ['2023-11-11', null],
      ['2024-06-22', 1],
    ])
    const { rows } = parseRows(rawRows())
    const weeks = groupByPathogen(rows).get('hepatitis-a')!
    expect(weeks[0].labels).toEqual(['Hepatitis A, Confirmed'])
    expect(weeks[0].m3).toBe(17)
  })
  it('skips discontinued labels with no current-week counts and missing labels', () => {
    const { series, skipped } = build()
    expect(series.find((s) => s.pathogen === 'anaplasmosis')).toBeUndefined()
    expect(skipped.anaplasmosis).toMatch(/last seen 2022 week 52/)
    expect(skipped.lyme).toMatch(/no matching label/)
  })
  it('respects historyStart', () => {
    const { rows } = parseRows(rawRows())
    const { series } = buildSeries(groupByPathogen(rows), '2026-09-20', '2026-09-26')
    expect(series.find((s) => s.pathogen === 'pertussis')!.points).toEqual([['2026-09-26', null]])
  })
})

// SODA-style row (null cells omitted); used for hypothetical label changes and flags.
const soda = (year: number, week: number, label: string, m: Partial<Record<'m1' | 'm2' | 'm3' | 'm4' | 'm1_flag' | 'm3_flag' | 'm4_flag', string>>) => ({
  states: 'Minnesota', year: String(year), week: String(week), label, ...m,
})

describe('cdc-nndss label changes', () => {
  it('uses the Total row when CDC lists Total, Confirmed and Probable (no double counting)', () => {
    const { rows } = parseRows([
      soda(2026, 38, 'Salmonellosis, Total', { m1: '5', m3: '50', m4: '60' }),
      soda(2026, 38, 'Salmonellosis, Confirmed', { m1: '3', m3: '30', m4: '40' }),
      soda(2026, 38, 'Salmonellosis, Probable', { m1: '2', m3: '20', m4: '20' }),
      soda(2026, 38, 'Shiga toxin-producing Escherichia coli (STEC)', { m1: '4', m3: '40', m4: '41' }),
      soda(2026, 38, 'Shiga toxin-producing Escherichia coli (STEC), Total', { m1: '4', m3: '40', m4: '41' }),
    ])
    const g = groupByPathogen(rows)
    expect(g.get('salmonella')![0]).toMatchObject({ m1: 5, m3: 50, m4: 60, labels: ['Salmonellosis, Total'] })
    const stec = g.get('stec')![0]
    expect(stec).toMatchObject({ m1: 4, m3: 40, labels: ['Shiga toxin-producing Escherichia coli (STEC), Total'] })
    expect(stec.dropped).toEqual(['Shiga toxin-producing Escherichia coli (STEC)'])
    const built = buildSeries(g, '2021-07-01', '2026-09-26')
    expect(built.series.find((s) => s.pathogen === 'salmonella')!.points).toEqual([['2026-09-26', 5]])
    expect(built.perPathogen.stec).toMatchObject({ droppedInFavorOfTotal: ['Shiga toxin-producing Escherichia coli (STEC)'] })
  })
  it('leaves overlapping labels without a Total blank and warns instead of adding them', () => {
    const { rows } = parseRows([
      soda(2026, 38, 'Salmonellosis', { m1: '5', m3: '50', m4: '60' }),
      soda(2026, 38, 'Salmonellosis (excluding Salmonella Typhi infection and Salmonella Paratyphi infection)', { m1: '5', m3: '50', m4: '60' }),
    ])
    const g = groupByPathogen(rows)
    expect(g.get('salmonella')![0]).toMatchObject({ m1: null, m3: null, m4: null })
    expect(g.get('salmonella')![0].ambiguous).toHaveLength(2)
    const built = buildSeries(g, '2021-07-01', '2026-09-26')
    const s = built.series.find((x) => x.pathogen === 'salmonella')!
    expect(s.points).toEqual([['2026-09-26', null]])
    expect(s.official).toBeUndefined()
    expect(s.summary).toBeUndefined()
    expect(s.attrs?.overlappingLabels).toMatch(/Salmonellosis \| Salmonellosis \(excluding/)
    expect(built.warnings.join(' ')).toMatch(/Salmonellosis: 1 week\(s\) list overlapping labels/)
  })
  it('warns when a label seen in the past year is missing from the latest table', () => {
    const { rows } = parseRows(rawRows().filter((r) => !(r.label === 'Mpox' && r.week === '38')))
    const built = buildSeries(groupByPathogen(rows), '2021-07-01', '2026-09-26')
    expect(built.warnings).toHaveLength(1)
    expect(built.warnings[0]).toMatch(/^Mpox: no matching label in the latest table \(2026-09-26\); last seen 2026-09-19 as 'Mpox'/)
    // Hepatitis A (last 2024) and anaplasmosis (2022) are older than a year: no warning.
  })
})

describe('cdc-nndss flags', () => {
  it("keeps 'U' / 'NP' cells out of totals and says so", () => {
    expect(combineMeasure([{ value: 3, flag: '' }, { value: null, flag: 'U' }])).toEqual({ value: null, flag: 'U' })
    expect(combineMeasure([{ value: 3, flag: '' }, { value: null, flag: '-' }])).toEqual({ value: 3 })
    const { rows } = parseRows([
      soda(2025, 38, 'Pertussis', { m1_flag: '-', m3_flag: 'U', m4: '900' }),
      soda(2026, 38, 'Pertussis', { m1_flag: '-', m3_flag: 'U', m4: '1125' }),
      soda(2026, 38, 'Measles, Indigenous', { m1: '3', m3: '18', m4: '13' }),
      soda(2026, 38, 'Measles, Imported', { m1_flag: '-', m3_flag: 'NP', m4: '1' }),
    ])
    const built = buildSeries(groupByPathogen(rows), '2021-07-01', '2026-09-26')
    const pert = built.series.find((s) => s.pathogen === 'pertussis')!
    expect(pert.summary).toBe("2026 count is marked unavailable in CDC's weekly table; 1,125 by this week in 2025")
    expect(pert.attrs).toMatchObject({ ytdFlag: 'U (unavailable)', ytdPrevYear: '1125' })
    expect(pert.attrs?.currentYear).toBeUndefined() // 'U' is not the after-year-end blank pattern
    const measles = built.series.find((s) => s.pathogen === 'measles')!
    expect(measles.points).toEqual([['2026-09-26', 3]])
    expect(measles.attrs?.ytd).toBeUndefined()
    expect(measles.summary).toBe("2026 count is marked not published in CDC's weekly table; 14 by this week in 2025")
  })
})

describe('cdc-nndss compact output', () => {
  it(`lists only the latest ${BLANK_SERIES_WEEKS} weeks when every current-week cell is blank`, () => {
    const raw = []
    for (let w = 1; w <= 20; w++) {
      raw.push(soda(2026, w, 'Pertussis', { m1_flag: '-', m3: String(w * 3), m4: String(w * 30) }))
      raw.push(soda(2026, w, 'Mpox', w === 2 ? { m1: '1', m3: '1', m4: '0' } : { m1_flag: '-', m3: '1', m4: '0' }))
    }
    const { rows } = parseRows(raw)
    const built = buildSeries(groupByPathogen(rows), '2021-07-01', mmwrWeekEnding(2026, 20))
    const pert = built.series.find((s) => s.pathogen === 'pertussis')!
    expect(pert.points).toHaveLength(BLANK_SERIES_WEEKS)
    expect(pert.points.at(-1)).toEqual([mmwrWeekEnding(2026, 20), null])
    expect(pert.note).toMatch(/Only the latest 13 weeks are listed because every current-week cell since 2026-01-10 is blank/)
    expect(built.perPathogen.pertussis).toMatchObject({ points: 13, nonNullPoints: 0, blankSince: '2026-01-10' })
    // A series with any published count keeps its full history.
    expect(built.series.find((s) => s.pathogen === 'mpox')!.points).toHaveLength(20)
  })
})

describe('cdc-nndss live errors', () => {
  it('keeps the HTTP status and Socrata body instead of the long URL', () => {
    const url = 'https://data.cdc.gov/resource/x9gk-5huc.json?' + 'x'.repeat(300)
    const e = new HttpError(url, 400, '{\n  "code" : "query.soql.no-such-column",\n  "error" : true,\n  "message" : "No such column: states"\n}')
    const d = describeLiveError(e)
    expect(d.rejected).toBe(true)
    expect(d.text).toBe('HTTP 400: { "code" : "query.soql.no-such-column", "error" : true, "message" : "No such column: states" }')
    expect(describeLiveError(new HttpError(url, 503, '')).rejected).toBe(false)
    const net = describeLiveError(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }))
    expect(net).toEqual({ text: 'fetch failed: ENOTFOUND', rejected: false })
    // What undici throws here when the proxy refuses data.cdc.gov (DOMException, numeric code 0).
    const cancelled = describeLiveError(new TypeError('fetch failed', { cause: new DOMException('Request was cancelled.') }))
    expect(cancelled.text).toBe('fetch failed: Request was cancelled.')
  })
})

describe('cdc-nndss helpers', () => {
  it('sums only reported components', () => {
    expect(sumReported([3, null])).toBe(3)
    expect(sumReported([null, null])).toBeNull()
    expect(sumReported([0, 2])).toBe(2)
  })
  it('words the year-to-date summary', () => {
    expect(ytdSummary(2026, 1, 3)).toBe('1 case so far in 2026 vs 3 by this week in 2025')
    expect(ytdSummary(2026, 18, null)).toBe('18 cases so far in 2026 (2025 count for this week is blank)')
    expect(ytdSummary(2026, null, null)).toMatch(/blank/)
    expect(ytdSummary(2026, 18, null, undefined, 'NN')).toBe('18 cases so far in 2026 (2025 count for this week is marked not nationally notifiable)')
  })
  it('streams xz and keeps only Minnesota lines', async () => {
    const xz = execFileSync('xz', ['-c'], { input: [HEADER, ...LINES].join('\n') + '\n' })
    const out = await xzFilterLines(new Uint8Array(xz), (l) => /^"?minnesota"?,/i.test(l))
    expect(out.header).toBe(HEADER)
    expect(out.scanned).toBe(LINES.length)
    expect(out.lines).toHaveLength(LINES.length - 1)
  })
})
