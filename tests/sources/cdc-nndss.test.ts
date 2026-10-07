import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  buildSeries, checkSchema, groupByPathogen, liveQuery, matchLabel, mirrorRows, normalizeLabel, parseRows,
  sumReported, xzFilterLines, ytdSummary,
} from '../../pipeline/sources/cdc-nndss'

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
    expect(pert.official).toEqual({
      label: '119 cases so far in 2026 vs 1,125 by this week in 2025',
      asOf: '2026-09-26',
      by: 'CDC NNDSS weekly tables',
    })
    expect(pert.official?.level).toBeUndefined()
  })
  it('reports current-week counts when published', () => {
    const mpox = build().series.find((s) => s.pathogen === 'mpox')!
    expect(mpox.points).toEqual([
      ['2026-09-19', null],
      ['2026-09-26', 3],
    ])
    expect(mpox.official?.label).toBe('25 cases so far in 2026 vs 17 by this week in 2025')
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
    expect(campy.official?.label).toBe("2026 count is blank in CDC's weekly table; 1,461 by this week in 2025")
    expect(campy.note).toMatch(/blanks do not mean zero/)
    // West Nile has 2026 YTD values, so it is not flagged.
    const wnv = build().series.find((s) => s.pathogen === 'west-nile')!
    expect(wnv.attrs?.currentYear).toBeUndefined()
    expect(wnv.official?.label).toBe('10 cases so far in 2026 vs 158 by this week in 2025')
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
  })
  it('streams xz and keeps only Minnesota lines', async () => {
    const xz = execFileSync('xz', ['-c'], { input: [HEADER, ...LINES].join('\n') + '\n' })
    const out = await xzFilterLines(new Uint8Array(xz), (l) => /^"?minnesota"?,/i.test(l))
    expect(out.header).toBe(HEADER)
    expect(out.scanned).toBe(LINES.length)
    expect(out.lines).toHaveLength(LINES.length - 1)
  })
})
