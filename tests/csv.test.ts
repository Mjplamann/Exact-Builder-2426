// CSV export of the Trends chart: RFC 4180 quoting and the spreadsheet formula-injection guard. Series
// labels, place names and model names come from upstream data, so a hostile value must never reach a
// spreadsheet as a live formula.
import { describe, expect, it } from 'vitest'
import { chartedCsv, csvCell, toCsv } from '../src/components/trends/csv'
import type { Forecast, Series } from '../shared/types'

describe('csvCell formula guard', () => {
  it.each([
    ['=SUM(A1:A9)', "'=SUM(A1:A9)"],
    ['+1+1', "'+1+1"],
    ['-2+3', "'-2+3"],
    ['@cmd', "'@cmd"],
    ['=HYPERLINK("http://evil.example","x")', `"'=HYPERLINK(""http://evil.example"",""x"")"`],
  ])('prefixes text starting with a formula trigger: %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected)
  })

  it('prefixes text starting with a tab or a carriage return', () => {
    expect(csvCell('\t=1+1')).toBe("'\t=1+1")
    // The CR also forces quoting.
    expect(csvCell('\r=1+1')).toBe(`"'\r=1+1"`)
  })

  it('leaves ordinary text and triggers that are not at the start alone', () => {
    expect(csvCell('Flu — % of ED visits')).toBe('Flu — % of ED visits')
    expect(csvCell('a=b')).toBe('a=b')
    expect(csvCell('2026-09-26')).toBe('2026-09-26')
  })

  it('writes numbers as numbers, including negatives, and drops non-finite values', () => {
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell(0.26)).toBe('0.26')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('csvCell quoting (RFC 4180)', () => {
  it('quotes commas, quotes and line breaks, doubling embedded quotes', () => {
    expect(csvCell('Minneapolis, MN')).toBe('"Minneapolis, MN"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('quotes leading or trailing whitespace so it survives a round trip', () => {
    expect(csvCell(' padded')).toBe('" padded"')
    expect(csvCell('padded ')).toBe('"padded "')
  })

  it('quotes a guarded cell that also needs quoting', () => {
    expect(csvCell('=1,2')).toBe(`"'=1,2"`)
  })
})

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF, ending with CRLF', () => {
    expect(toCsv([['a', 1], ['=b', null]])).toBe("a,1\r\n'=b,\r\n")
  })
})

describe('chartedCsv', () => {
  const series: Series = {
    id: 'test:ds:influenza:ed_visit_pct:state:27',
    source: 'test',
    dataset: 'ds',
    pathogen: 'influenza',
    metric: 'ed_visit_pct',
    unit: '%',
    geo: { type: 'state', code: '27', name: 'Minnesota' },
    label: '=cmd|"/c calc"!A1',
    points: [
      ['2026-09-12', 0.2],
      ['2026-09-19', 0.19],
      ['2026-09-26', 0.26],
    ],
    provisionalFrom: '2026-09-26',
  }
  const forecast: Forecast = {
    id: 'f1',
    source: 'mn-pulse',
    model: '@model',
    seriesId: series.id,
    pathogen: 'influenza',
    metric: 'ed_visit_pct',
    geo: series.geo,
    referenceDate: '2026-09-19',
    issuedAt: '2026-09-20T00:00:00Z',
    points: [{ date: '2026-09-26', horizon: 1, median: 0.22, lo50: 0.2, hi50: 0.3, lo95: 0.13, hi95: 0.67 }],
  }

  it('writes observed and projection rows with hostile labels neutralized', () => {
    const csv = chartedCsv([series], [forecast], { after: '2026-09-12' }, (id) => (id === 'test' ? '+Source' : id))
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('week_ending,type,series_id,measure,geography,age_group,source,metric,unit,value,lo50,hi50,lo95,hi95,provisional,model')
    // The window excludes the week on/before `after`.
    expect(lines).toHaveLength(1 + 2 + 1)
    expect(lines[1]).toContain(`"'=cmd|""/c calc""!A1"`)
    expect(lines[1]).toContain("'+Source")
    expect(lines[2]).toMatch(/,yes,$/)
    expect(lines[3].startsWith('2026-09-26,projection,')).toBe(true)
    expect(lines[3]).toContain(",'@model")
    expect(lines[3]).toContain(',0.22,0.2,0.3,0.13,0.67,')
  })
})
