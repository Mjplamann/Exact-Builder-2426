import { describe, expect, it } from 'vitest'
import {
  derivedFiles, headlineFor, outlookFrom, outlookSubject, rollupSites, runAnalysis, summarize, unpublishedSeriesIds,
} from '../pipeline/analysis/index.ts'
import { dedupeSeries, seriesVariant } from '../shared/dedupe.ts'
import { addDays } from '../shared/mmwr.ts'
import type { Forecast, GeoRef, Point, Series, SeriesFile } from '../shared/types.ts'
import type { Logger } from '../pipeline/lib/log.ts'

// Synthetic fixtures for the analysis rules (test-only, never shipped as data).
const NOW = '2026-10-07T00:00:00.000Z'
const LAST = '2026-10-03'
const STATE: GeoRef = { type: 'state', code: '27', name: 'Minnesota' }
const quiet: Logger = { info() {}, warn() {}, error() {}, child: () => quiet }

/** Weekly points ending at `end`. */
const weeklyTo = (end: string, values: (number | null)[]): Point[] =>
  values.map((v, i) => [addDays(end, -7 * (values.length - 1 - i)), v])

function mk(p: Partial<Series> & Pick<Series, 'id' | 'pathogen' | 'metric' | 'points'>): Series {
  const [source, dataset] = p.id.split(':')
  return {
    source,
    dataset,
    unit: p.metric === 'test_positivity' || p.metric === 'ed_visit_pct' ? '%' : p.metric === 'hosp_rate' ? 'per100k' : p.metric === 'wastewater_conc' ? 'ratio' : p.metric === 'rt' ? 'index' : 'count',
    geo: STATE,
    label: `${p.pathogen} — ${p.metric}`,
    ...p,
  }
}

const file = (series: Series[]): SeriesFile => ({ source: series[0].source, dataset: series[0].dataset, generatedAt: NOW, series })

describe('levels at zero', () => {
  it('rates a zero against a mostly-zero history as very low', () => {
    const vals = Array.from({ length: 120 }, (_, i) => (i % 30 === 5 ? 2 : 0))
    const s = mk({ id: 'wastewaterscan:wwscan-mn:mpox:wastewater_conc:state:27', pathogen: 'mpox', metric: 'wastewater_conc', points: weeklyTo(LAST, vals) })
    const sig = summarize(s, NOW)!
    expect(sig.latestValue).toBe(0)
    expect(sig.percentile).toBe(0)
    expect(sig.level).toBe('minimal')
  })
  it('rates a zero against an all-zero history as very low', () => {
    const s = mk({ id: 'x:y:h5n1:wastewater_conc:state:27', pathogen: 'h5n1', metric: 'wastewater_conc', points: weeklyTo(LAST, Array(120).fill(0)) })
    expect(summarize(s, NOW)!.level).toBe('minimal')
  })
  it('reads the floor of a three-step publisher scale at zero as very low', () => {
    const s = mk({
      id: 'mdh:mdh-respnet-county:covid:hosp_rate:county:27001',
      pathogen: 'covid',
      metric: 'hosp_rate',
      geo: { type: 'county', code: '27001', name: 'Aitkin County' },
      points: weeklyTo(LAST, [0.5, 0, 0, 0]),
      official: { level: 'low', label: 'Low', by: 'MDH RESP-NET', asOf: LAST },
    })
    const sig = summarize(s, NOW)!
    expect(sig.level).toBe('minimal')
    expect(sig.levelBasis).toBe('MDH RESP-NET category “Low” (none reported this week)')
    // A non-zero value keeps the publisher's category.
    const s2 = { ...s, points: weeklyTo(LAST, [0.5, 0, 0, 0.4]) }
    expect(summarize(s2, NOW)!.level).toBe('low')
  })
  it('rates a single-week detection low and repeated detections moderate', () => {
    const base = { id: 'wastewaterscan:wwscan-detections:measles:ww_detections:state:27', pathogen: 'measles' as const, metric: 'ww_detections' as const }
    const once = summarize(mk({ ...base, points: weeklyTo(LAST, [0, 0, 0, 0, 1]) }), NOW)!
    expect(once.level).toBe('low')
    expect(once.levelBasis).toBe('Detected at 1 site this week')
    const twice = summarize(mk({ ...base, points: weeklyTo(LAST, [0, 0, 1, 0, 2]) }), NOW)!
    expect(twice.level).toBe('moderate')
  })
})

describe('Rt', () => {
  const rt = mk({
    id: 'cdc-cfa-rt:cfa-rt-mn:influenza:rt:state:27',
    pathogen: 'influenza',
    metric: 'rt',
    points: weeklyTo(LAST, Array.from({ length: 80 }, (_, i) => 0.9 + (i % 10) / 50)),
    official: { trend: 'rising', label: 'Growing', asOf: LAST, by: 'CDC CFA' },
  })
  it('gets a trend but no activity level', () => {
    const sig = summarize(rt, NOW)!
    expect(sig.level).toBe('unknown')
    expect(sig.levelBasis).toBe('Rt shows direction of spread, not amount')
    expect(sig.trend).toBe('rising')
    expect(sig.percentile).toBeUndefined()
  })
  it('never drives a pathogen level or the statewide summary', () => {
    const ed = mk({
      id: 'cdc-nssp:nssp-ed:influenza:ed_visit_pct:state:27',
      pathogen: 'influenza',
      metric: 'ed_visit_pct',
      points: weeklyTo(LAST, Array.from({ length: 160 }, (_, i) => 0.2 + (i % 52) / 20)),
    })
    const { pulse } = runAnalysis([file([rt]), file([ed])], [], { now: NOW, log: quiet })
    const flu = pulse.pathogens.find((p) => p.pathogen === 'influenza')!
    expect(flu.primary?.metric).toBe('ed_visit_pct')
    expect(flu.signals.at(-1)?.metric).toBe('rt')
    // Only Rt: the pathogen has no level.
    const only = runAnalysis([file([rt])], [], { now: NOW, log: quiet }).pulse
    expect(only.pathogens[0].level).toBe('unknown')
    expect(only.statewide.level).toBe('unknown')
  })
})

describe('outlook anchoring', () => {
  // Six weeks of rises, latest 32 on LAST.
  const rising = mk({
    id: 'cdc-nrevss:nrevss-region5:rhino-entero:test_positivity:hhs-region:HHS5',
    pathogen: 'rhino-entero',
    metric: 'test_positivity',
    geo: { type: 'hhs-region', code: 'HHS5', name: 'HHS Region 5' },
    points: weeklyTo(LAST, [...Array.from({ length: 100 }, (_, i) => 5 + (i % 52) / 4), 16, 19, 22, 25, 28, 32]),
  })
  const skill = [1, 2, 3, 4].map((horizon) => ({ horizon, n: 100, mae: 1, relMae: 0.8, coverage95: 0.9 }))
  const fc = (points: [string, number, number, number][], referenceDate: string): Forecast => ({
    id: 'mn-pulse:rhino',
    source: 'mn-pulse',
    model: 'MN Pulse analog–trend ensemble',
    seriesId: rising.id,
    pathogen: 'rhino-entero',
    metric: 'test_positivity',
    geo: rising.geo,
    referenceDate,
    issuedAt: NOW,
    points: points.map(([date, median, lo50, hi50], i) => ({ date, horizon: i + 1, median, lo50, hi50, lo95: lo50 / 2, hi95: hi50 * 2 })),
    skill,
  })
  const origin = addDays(LAST, -14)

  it('does not flip direction against the data when the origin precedes the latest point', () => {
    // From an older origin the forecast expected 24 by now (50% range 20–33, so 32 is inside) and 28 two
    // weeks later: up from its own path. Compared naively with the latest 32 it would read as a decline.
    const f = fc(
      [
        [addDays(origin, 7), 22, 20, 30],
        [LAST, 24, 20, 33],
        [addDays(LAST, 7), 26, 21, 35],
        [addDays(LAST, 14), 28, 22, 36],
      ],
      origin,
    )
    const o = outlookFrom(f, LAST, 32, rising, 'rhino-entero')!
    expect(o.direction).not.toMatch(/falling/)
    expect(o.text).toMatch(/over the next 2 weeks/)
  })
  it('gives no outlook once the data have left the forecast’s 50% range', () => {
    const f = fc(
      [
        [addDays(origin, 7), 22, 21, 23],
        [LAST, 21, 19, 23],
        [addDays(LAST, 7), 19, 17, 21],
        [addDays(LAST, 14), 18, 16, 20],
      ],
      origin,
    )
    expect(outlookFrom(f, LAST, 32, rising, 'rhino-entero')).toBeUndefined()
  })
  it('skips projections no better than "no change"', () => {
    const f = { ...fc([[addDays(LAST, 7), 33, 31, 35], [addDays(LAST, 14), 34, 31, 37], [addDays(LAST, 21), 36, 32, 40]], LAST), skill: skill.map((k) => ({ ...k, relMae: 1.05 })) }
    expect(outlookFrom(f, LAST, 32, rising, 'rhino-entero')).toBeUndefined()
  })
  it('targets three weeks past the latest observation and calls a wide range uncertain', () => {
    const f = fc([[addDays(LAST, 7), 32, 25, 40], [addDays(LAST, 14), 32, 24, 42], [addDays(LAST, 21), 33, 22, 45], [addDays(LAST, 28), 34, 20, 50]], LAST)
    const o = outlookFrom(f, LAST, 32, rising, 'rhino-entero')!
    expect(o.direction).toBe('unknown')
    expect(o.text).toMatch(/uncertain outlook over the next 3 weeks/)
  })
  it('says "may rise but stay very low" instead of "sharply" inside the lowest band', () => {
    const rsv = mk({
      id: 'cdc-nssp:nssp-ed:rsv:ed_visit_pct:state:27',
      pathogen: 'rsv',
      metric: 'ed_visit_pct',
      points: weeklyTo(LAST, [...Array.from({ length: 150 }, (_, i) => (i % 52 > 10 && i % 52 < 25 ? 1.2 : 0.05)), 0.01]),
      thresholds: { low: 0.05, moderate: 0.5, high: 0.94, veryHigh: 1.38, by: 'CDC' },
    })
    const f: Forecast = {
      id: 'cdc-hubs:RSVHub-ensemble:ed_visit_pct:27',
      source: 'cdc-hubs',
      model: 'RSVHub-ensemble',
      seriesId: rsv.id,
      pathogen: 'rsv',
      metric: 'ed_visit_pct',
      geo: STATE,
      referenceDate: addDays(LAST, 7),
      issuedAt: NOW,
      points: [1, 2, 3].map((h) => ({ date: addDays(LAST, 7 * h), horizon: h - 1, median: 0.01 * (1 + h), lo50: 0.01 * h, hi50: 0.012 * (1 + h), lo95: 0.005, hi95: 0.06 })),
    }
    const o = outlookFrom(f, LAST, 0.01, rsv, 'rsv')!
    expect(o.direction).toBe('rising')
    expect(o.text).toBe('RSV ER visits may rise but stay very low, about 0.04%, over the next 3 weeks (CDC RSVHub-ensemble).')
  })
})

describe('outlook wording', () => {
  it('never repeats a leading phrase', () => {
    expect(outlookSubject('ili', 'ili_pct')).toBe('Flu-like illness visits')
    expect(outlookSubject('influenza', 'ed_visit_pct')).toBe('Flu ER visits')
    const texts = (['ili', 'influenza', 'covid', 'rsv', 'respiratory-combined', 'rhino-entero'] as const).flatMap((p) =>
      (['ed_visit_pct', 'ili_pct', 'test_positivity', 'hosp_rate', 'wastewater_conc'] as const).map((m) => outlookSubject(p, m)),
    )
    for (const t of texts) {
      const words = t.toLowerCase().split(/\s+/)
      for (let n = 1; n <= 3; n++) expect(words.slice(n, 2 * n).join(' ')).not.toBe(words.slice(0, n).join(' '))
      expect(t.toLowerCase()).not.toMatch(/flu-like illness flu-like illness/)
    }
  })
})

describe('statewide wastewater rollups', () => {
  const plant = (code: string, variant: string | null, values: number[], counties = ['27109']): Series =>
    mk({
      id: ['wastewaterscan', 'wwscan', 'mpox', 'wastewater_conc', 'sewershed', `wwscan:${code}`, variant].filter(Boolean).join(':'),
      pathogen: 'mpox',
      metric: 'wastewater_conc',
      geo: { type: 'sewershed', code: `wwscan:${code}`, name: `Plant ${code} (WastewaterSCAN)`, counties },
      label: variant === 'clade-ib' ? 'Mpox clade Ib — wastewater (WastewaterSCAN)' : 'Mpox clade II — wastewater (WastewaterSCAN)',
      points: weeklyTo(LAST, values),
    })
  const plants = [
    plant('a', 'clade-ii', [0, 0, 0, 0, 0, 0]),
    plant('a', 'clade-ib', [0, 0, 0, 0, 1, 0]),
    plant('b', 'clade-ii', [0, 0, 0, 0, 0, 0], ['27145']),
    plant('b', 'clade-ib', [0, 0, 0, 2, 0, 0], ['27145']),
  ]

  it('keeps assay variants apart when de-duplicating and rolling up', () => {
    expect(seriesVariant(plants[1])).toBe('clade-ib')
    expect(dedupeSeries(plants)).toHaveLength(4)
    const rolled = rollupSites(plants)
    expect(rolled.map((s) => s.id).sort()).toEqual([
      'wastewaterscan:wwscan-mn:mpox:wastewater_conc:state:27:clade-ib',
      'wastewaterscan:wwscan-mn:mpox:wastewater_conc:state:27:clade-ii',
    ])
    expect(rolled.every((s) => s.attrs?.plants === '2' && s.attrs?.metroPlants === '0')).toBe(true)
  })
  it('still collapses the same measure published by two sources', () => {
    const pts = weeklyTo(LAST, [0.2, 0.3])
    const a = mk({ id: 'cdc-nssp:nssp-ed:covid:ed_visit_pct:state:27', pathogen: 'covid', metric: 'ed_visit_pct', points: pts })
    const b = mk({ id: 'cdc-hubs:nssp-ed-state:covid:ed_visit_pct:state:27', pathogen: 'covid', metric: 'ed_visit_pct', points: pts })
    expect(dedupeSeries([b, a]).map((s) => s.id)).toEqual(['cdc-nssp:nssp-ed:covid:ed_visit_pct:state:27'])
  })
  it('publishes every derived series the pulse or forecasts reference', () => {
    const noro = ['p1', 'p2', 'p3'].map((c, k) =>
      mk({
        id: `wastewaterscan:wwscan:norovirus:wastewater_conc:sewershed:wwscan:${c}`,
        pathogen: 'norovirus',
        metric: 'wastewater_conc',
        geo: { type: 'sewershed', code: `wwscan:${c}`, name: c, counties: ['27109'] },
        label: 'Norovirus GII — wastewater (WastewaterSCAN)',
        points: weeklyTo(LAST, Array.from({ length: 160 }, (_, i) => 1000 + 800 * Math.sin(i / 8) + 100 * k)),
      }),
    )
    const input = [file(noro)]
    const { pulse, forecasts, derived } = runAnalysis(input, [], { now: NOW, log: quiet })
    const id = 'wastewaterscan:wwscan-mn:norovirus:wastewater_conc:state:27'
    expect(derived.map((s) => s.id)).toContain(id)
    expect(pulse.pathogens.find((p) => p.pathogen === 'norovirus')?.primary?.seriesId).toBe(id)
    const inputIds = new Set(noro.map((s) => s.id))
    // Without the derived file the pulse would point at a series no file contains…
    expect(unpublishedSeriesIds(pulse, forecasts, inputIds)).toContain(id)
    // …with it, nothing is missing.
    const files = derivedFiles(derived, NOW)
    expect(files).toEqual([expect.objectContaining({ source: 'wastewaterscan', dataset: 'wwscan-mn', derived: true })])
    const published = new Set([...inputIds, ...files.flatMap((f) => f.series.map((s) => s.id))])
    expect(unpublishedSeriesIds(pulse, forecasts, published)).toEqual([])
    // Headline says how many plants and that none are in the Twin Cities.
    expect(pulse.pathogens.find((p) => p.pathogen === 'norovirus')?.headline).toMatch(/at 3 WastewaterSCAN plants \(none in the Twin Cities\)/)
  })
})

describe('rare targets', () => {
  it('lead with the year-to-date count and detection status, never "levels are reported"', () => {
    const ytd = mk({
      id: 'mdh:mdh-other:measles:cases_ytd:state:27',
      pathogen: 'measles',
      metric: 'cases_ytd',
      points: [['2026-10-01', 21]],
      attrs: { year: '2026' },
    })
    const det = mk({
      id: 'wastewaterscan:wwscan-detections:measles:ww_detections:state:27',
      pathogen: 'measles',
      metric: 'ww_detections',
      points: weeklyTo(LAST, [0, 0, 0, 0]),
      attrs: { plantsTestedLatestWeek: '4', lastDetection: '2025-11-03 (Rochester)' },
    })
    const conc = mk({
      id: 'wastewaterscan:wwscan-mn:measles:wastewater_conc:state:27',
      pathogen: 'measles',
      metric: 'wastewater_conc',
      points: weeklyTo(LAST, Array(60).fill(0)),
      attrs: { plants: '4' },
    })
    const { pulse } = runAnalysis([file([ytd]), file([det]), file([conc])], [], { now: NOW, log: quiet })
    const m = pulse.pathogens.find((p) => p.pathogen === 'measles')!
    expect(m.primary?.metric).toBe('cases_ytd')
    expect(m.level).toBe('unknown')
    expect(m.headline).toBe(
      'Measles: 21 Minnesota cases so far in 2026 (as of 2026-10-01); not detected at 4 WastewaterSCAN plants in the week ending 2026-10-03; last detected 2025-11-03 (Rochester).',
    )
    expect(m.headline).not.toMatch(/levels .* are reported|in the week ending 2026-10-01/)
  })
  it('treat cumulative counts typed as weekly as year-to-date', () => {
    const s = mk({ id: 'mdh:mdh-other:pertussis:cases:state:27:ytd', pathogen: 'pertussis', metric: 'cases', points: [['2026-09-10', 186]] })
    const { pulse } = runAnalysis([file([s])], [], { now: NOW, log: quiet })
    const p = pulse.pathogens[0]
    expect(p.primary?.metric).toBe('cases_ytd')
    expect(p.headline).toBe('Whooping cough: 186 Minnesota cases so far in 2026 (as of 2026-09-10).')
  })
  it('never rate batch-reported NNDSS weekly counts (a 0 → 30 jump is a batch, not a surge)', () => {
    const vals: number[] = [...Array.from({ length: 150 }, (_, i) => (i % 7 === 0 ? 4 : 0)), 0, 0, 0, 0, 0, 30]
    const s = mk({ id: 'cdc-nndss:nndss-mn:pertussis:cases:state:27', pathogen: 'pertussis', metric: 'cases', points: weeklyTo(LAST, vals) })
    const sig = summarize(s, NOW)!
    expect(sig.latestValue).toBe(30)
    expect(sig.level).toBe('unknown')
    expect(sig.trend).toBe('unknown')
    expect(sig.percentile).toBeUndefined()
    expect(sig.levelBasis).toMatch(/batches/)
    // The same shape from another source is still rated against its history.
    const other = summarize({ ...s, id: 'mdh:mdh-other:pertussis:cases:state:27', source: 'mdh', dataset: 'mdh-other' }, NOW)!
    expect(other.level).toBe('very-high')
  })
  it("lead with MDH's year-to-date total over a fresher NNDSS one from the same year, unless MDH's is stale", () => {
    const mdh = (date: string) =>
      mk({ id: 'mdh:mdh-other:pertussis:cases_ytd:state:27', pathogen: 'pertussis', metric: 'cases_ytd', points: [[date, 186]], attrs: { year: '2026' } })
    const nndss = mk({
      id: 'cdc-nndss:nndss-mn:pertussis:cases_ytd:state:27',
      pathogen: 'pertussis',
      metric: 'cases_ytd',
      points: weeklyTo('2026-09-26', [89, 89, 119]),
      attrs: { year: '2026', ytdPrevYear: '1125' },
    })
    const lead = (m: Series) => runAnalysis([file([m]), file([nndss])], [], { now: NOW, log: quiet }).pulse.pathogens[0]
    const fresh = lead(mdh('2026-09-10'))
    expect(fresh.primary?.source).toBe('mdh')
    expect(fresh.headline).toBe('Whooping cough: 186 Minnesota cases so far in 2026 (as of 2026-09-10).')
    expect(lead(mdh('2026-08-01')).primary?.source).toBe('cdc-nndss')
  })
  it('keep single detections off the watch list', () => {
    const det = mk({
      id: 'wastewaterscan:wwscan-detections:h5n1:ww_detections:state:27',
      pathogen: 'h5n1',
      metric: 'ww_detections',
      points: weeklyTo(LAST, [0, 0, 0, 3]),
      attrs: { plantsTestedLatestWeek: '4' },
    })
    const { pulse } = runAnalysis([file([det])], [], { now: NOW, log: quiet })
    expect(pulse.pathogens[0].level).toBe('low')
    expect(pulse.statewide.watchList).toEqual([])
    expect(headlineFor('h5n1', pulse.pathogens[0].primary, 'low', 'steady', { plantsBySource: new Map() })).toBe(
      'H5 bird flu: detected at 3 of 4 WastewaterSCAN plants in the week ending 2026-10-03.',
    )
  })
})

describe('one scale per measure', () => {
  it('rates admissions counts by their per-100k sibling and counties by Minnesota cut-points', () => {
    const t = { low: 1.22, moderate: 4.02, high: 8.33, veryHigh: 13.97, by: 'CDC respiratory activity levels for Minnesota' }
    const hist = Array.from({ length: 156 }, (_, i) => (i % 52) / 2)
    const rate = mk({ id: 'cdc-hubs:nhsn-admissions:influenza:hosp_rate:state:27', pathogen: 'influenza', metric: 'hosp_rate', points: weeklyTo(LAST, [...hist, 0.37]), thresholds: t })
    const count = mk({ id: 'cdc-hubs:nhsn-admissions:influenza:hosp_admissions:state:27', pathogen: 'influenza', metric: 'hosp_admissions', points: weeklyTo(LAST, [...hist.map((v) => v * 57), 21]) })
    const edT = { low: 0.25, moderate: 3.33, high: 6.41, veryHigh: 9.48, by: 'CDC' }
    const edState = mk({ id: 'cdc-nssp:nssp-ed:influenza:ed_visit_pct:state:27', pathogen: 'influenza', metric: 'ed_visit_pct', points: weeklyTo(LAST, [...hist.map((v) => v / 4), 0.26]), thresholds: edT })
    const edCounty = mk({
      id: 'cdc-nssp:nssp-ed:influenza:ed_visit_pct:county:27123',
      pathogen: 'influenza',
      metric: 'ed_visit_pct',
      geo: { type: 'county', code: '27123', name: 'Ramsey County' },
      points: weeklyTo(LAST, [...hist.map((v) => v / 2), 0.36]),
    })
    const { pulse } = runAnalysis([file([rate, count]), file([edState, edCounty])], [], { now: NOW, log: quiet })
    const flu = pulse.pathogens.find((p) => p.pathogen === 'influenza')!
    const r = flu.signals.find((s) => s.metric === 'hosp_rate')!
    const c = flu.signals.find((s) => s.metric === 'hosp_admissions')!
    expect(r.level).toBe('minimal')
    expect(c.level).toBe(r.level)
    const ramsey = pulse.counties.find((x) => x.fips === '27123')!.metrics['ed:influenza']
    expect(ramsey.level).toBe('low')
  })
})

describe('MDH panel-only percentages', () => {
  it('rank behind regional full-panel positivity for the headline (their denominator tracks the assay mix)', () => {
    const season = (lo: number, hi: number) => Array.from({ length: 160 }, (_, i) => lo + (hi - lo) * (0.5 + 0.5 * Math.sin((i / 52) * 2 * Math.PI)))
    const mdh = mk({
      id: 'mdh:mdh-lab:rhino-entero:test_positivity:state:27',
      pathogen: 'rhino-entero',
      metric: 'test_positivity',
      points: weeklyTo(LAST, [...season(0.8, 1.6).slice(0, 159), 1.2]),
      attrs: { mlsAssays: 'multiplex panels' },
    })
    const region = mk({
      id: 'cdc-nrevss:nrevss-region5:rhino-entero:test_positivity:hhs-region:HHS5',
      pathogen: 'rhino-entero',
      metric: 'test_positivity',
      geo: { type: 'hhs-region', code: 'HHS5', name: 'HHS Region 5' },
      points: weeklyTo(LAST, [...season(8, 28).slice(0, 159), 33]),
    })
    const { pulse } = runAnalysis([file([mdh]), file([region])], [], { now: NOW, log: quiet })
    const r = pulse.pathogens.find((p) => p.pathogen === 'rhino-entero')!
    expect(r.primary?.geo.code).toBe('HHS5')
    expect(r.level).toBe('very-high')
    // The Minnesota panel percent is still published alongside it.
    expect(r.signals.some((s) => s.source === 'mdh')).toBe(true)
  })

  it('still head the card when no regional positivity exists', () => {
    const mdh = mk({
      id: 'mdh:mdh-lab:hmpv:test_positivity:state:27',
      pathogen: 'hmpv',
      metric: 'test_positivity',
      points: weeklyTo(LAST, Array.from({ length: 120 }, (_, i) => 0.5 + (i % 10) / 10)),
      attrs: { mlsAssays: 'multiplex panels' },
    })
    const { pulse } = runAnalysis([file([mdh])], [], { now: NOW, log: quiet })
    expect(pulse.pathogens.find((p) => p.pathogen === 'hmpv')!.primary?.source).toBe('mdh')
  })
})
