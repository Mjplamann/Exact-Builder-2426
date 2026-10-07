import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Series } from '../../shared/types'
import type { Logger } from '../../pipeline/lib/log'
import {
  ATTRIBUTION, addDetections, assayPublicMap, buildDetectionSeries, buildPlantSeries, categoryKeys, describeAssays,
  loadCountyFeatures, mapActivityCategory, newDetectionAccumulator, normalizeCounties, openWeeks, plantGeo,
  reduceSamples, selectMnPlants, sig, trendFromCategory, unusableReason, wastewaterscan, weeklyMeans,
  type RawPlant, type RawSample, type RawTargetDef,
} from '../../pipeline/sources/wastewaterscan'

// Fixtures: real rows from storage.googleapis.com/wastewater-dev-data/json/{uid}.json (fetched 2026-10-07),
// reduced to the fields the module reads.
const nd = { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not detected' }
const ROCHESTER_FEB_2026: RawSample[] = [
  {
    sample_id: '113-260223',
    collection_date: '2026-02-23',
    targets: {
      'N Gene': { gc_g_dry_weight: 50262.89528639157, gc_g_dry_weight_pmmov: 7.861930670278813e-5, activity_category: 'low' },
      MeV_Roy: nd,
      InfA_H5: nd,
      MPXV_G2R_WA: nd,
      'MPXV_dD14-16': nd,
      C_auris: nd,
      InfA_H1_V2: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'low' },
      PMMoV: { gc_g_dry_weight: 639320001.5920398, gc_g_dry_weight_pmmov: null, activity_category: 'not calculated' },
      'Influenza A': { gc_g_dry_weight: 10662.979920163887, gc_g_dry_weight_pmmov: 1.6678627125087356e-5, activity_category: 'high' },
      HAV: { gc_g_dry_weight: 1603.510203973076, gc_g_dry_weight_pmmov: 2.5081495964149437e-6, activity_category: 'low' },
      WNV: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' },
    },
  },
  {
    sample_id: '113-260225',
    collection_date: '2026-02-25',
    targets: {
      'N Gene': { gc_g_dry_weight: 350370.0937386155, gc_g_dry_weight_pmmov: 0.0001226430210178852, activity_category: 'low' },
      MeV_Roy: nd,
      InfA_H5: nd,
      'Influenza A': { gc_g_dry_weight: 45981.86152630653, gc_g_dry_weight_pmmov: 1.6095421699488406e-5, activity_category: 'high' },
      HAV: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'low' },
      WNV: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' },
    },
  },
  {
    sample_id: '113-260227',
    collection_date: '2026-02-27',
    targets: {
      'N Gene': { gc_g_dry_weight: 33843.09572887514, gc_g_dry_weight_pmmov: 9.580292922260461e-5, activity_category: 'low' },
      MeV_Roy_V2: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' },
      InfA_H5: nd,
      'Influenza A': { gc_g_dry_weight: 12282.188959174408, gc_g_dry_weight_pmmov: 3.476838197607613e-5, activity_category: 'high' },
      HAV: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'low' },
      WNV: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' },
    },
  },
]
const MANKATO_H5_WEEK: RawSample[] = [
  { collection_date: '2025-12-29', targets: { InfA_H5: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' } } },
  {
    collection_date: '2025-12-31',
    targets: { InfA_H5: { gc_g_dry_weight: 4709.966980168068, gc_g_dry_weight_pmmov: 9.23708348989236e-6, activity_category: 'not calculated' } },
  },
  {
    collection_date: '2026-01-02',
    targets: { InfA_H5: { gc_g_dry_weight: 7823.505932380578, gc_g_dry_weight_pmmov: 1.7524442716258998e-5, activity_category: 'low' } },
  },
]
const ROCHESTER_H5_WEEK: RawSample[] = [
  { collection_date: '2025-12-29', targets: { InfA_H5: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' } } },
  { collection_date: '2025-12-31', targets: { InfA_H5: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0, activity_category: 'not calculated' } } },
]
const ROCHESTER_PLANT: RawPlant = {
  id: 'e1e03cad-89b9-4458-8e9b-ab889fb53833',
  uid: 'e1e03cad',
  city: 'Rochester',
  state: 'Minnesota',
  name: 'Rochester, MN',
  site_name: 'City Of Rochester MN Water Reclamation Plant',
  counties_served: ['27109'],
  sewershed_pop: 120000,
  point: { type: 'Point', coordinates: [-92.4716896425487, 44.00477406592521] } as RawPlant['point'],
}
// Real targets.json entries.
const TARGET_DEFS: RawTargetDef[] = [
  { id: 'MeV_Roy', public: 'MeV', target: 'MeV_WT' },
  { id: 'MeV_Roy_V2', public: 'MeV', target: 'MeV_WT' },
  { id: 'N Gene', public: 'SC2_N', target: 'sars-cov-2' },
  { id: 'Influenza A', public: 'Influenza_A', target: 'FLUAV' },
  { id: 'Influenza A F1R1', public: 'Influenza_A', target: 'FLUAV' },
  { id: 'InfA_H1_V2', public: 'InfA_H1', target: 'FLUAV A H1' },
  { id: 'MPXV_G2R_WA', public: 'MPXV_G2R', target: 'hMPXV Clade II' },
  { id: 'MPXV_dD14-16', public: 'MPXV_dD14-16', target: 'hMPXV Clade I', suggested_label: 'MPXV Clade Ib' },
  { id: 'Rota', public: 'Rotavirus', suggested_label: 'Rotavirus' },
  { id: 'HAV', public: 'HAV' },
  { id: 'WNV', public: 'WNV' },
]
const OPTS = { now: '2026-03-02T12:00:00Z', historyStart: '2021-07-01' }

describe('wastewaterscan mapping', () => {
  it('maps per-sample activity categories to activity levels', () => {
    expect(mapActivityCategory('very low')).toEqual({ level: 'minimal', label: 'Very low' })
    expect(mapActivityCategory('low')).toEqual({ level: 'low', label: 'Low' })
    expect(mapActivityCategory('medium')).toEqual({ level: 'moderate', label: 'Medium' })
    expect(mapActivityCategory('high')?.level).toBe('high')
    expect(mapActivityCategory('very high')?.level).toBe('very-high')
    expect(mapActivityCategory('not detected')).toEqual({ level: 'minimal', label: 'Not detected' })
    expect(mapActivityCategory('not calculated')).toBeNull()
    expect(mapActivityCategory(null)).toBeNull()
  })

  it('builds the assay → public map from targets.json with a built-in fallback', () => {
    const m = assayPublicMap(TARGET_DEFS)
    expect(m.get('MeV_Roy_V2')).toBe('MeV')
    expect(m.get('Influenza A F1R1')).toBe('Influenza_A')
    expect(assayPublicMap(null).get('EVD68_V2')).toBe('EV-D68')
    expect(assayPublicMap([{ id: 'NewAssay_V9', public: 'SC2_N' }]).get('NewAssay_V9')).toBe('SC2_N')
  })

  it('reads WastewaterSCAN trend verdicts only when significant', () => {
    // Shapes from data.wastewaterscan.org/data/categories/plants.json (smach/biobot_mwra fixture).
    const up = trendFromCategory({ category: 'high', method: 'commonly detected', details: { trend: { m: 3.4021, p: 0.0071, significant: true }, tertile: 3 }, lastSampleDate: '2026-08-05' })
    expect(up?.trend).toBe('rising')
    const flat = trendFromCategory({ category: 'medium', method: 'commonly detected', details: { trend: { m: 0.11396808842585934, p: 0.5466319203768065, significant: false }, tertile: 2 } })
    expect(flat?.trend).toBeUndefined()
    expect(flat?.text).toMatch(/No significant trend/)
    expect(trendFromCategory({ category: 'low', method: 'seasonal', details: {} })).toBeNull()
  })

  it('normalizes county lists and selects Minnesota plants', () => {
    expect(normalizeCounties(['27145', '27009', 27141, 'x'])).toEqual(['27009', '27141', '27145'])
    const picked = selectMnPlants([
      ROCHESTER_PLANT,
      { uid: 'b50c6424', state: 'Massachusetts', counties_served: ['25025'] },
      { uid: 'border01', state: 'Wisconsin', counties_served: ['55093', '27049'] },
    ])
    expect(picked.map((p) => p.uid)).toEqual(['e1e03cad', 'border01'])
  })
})

describe('wastewaterscan reduction and series', () => {
  const map = assayPublicMap(TARGET_DEFS)

  it('reduces samples to per-public-target values and merges assay versions', () => {
    const r = reduceSamples(ROCHESTER_FEB_2026, map, OPTS.historyStart)
    expect(r.samplesKept).toBe(3)
    const mev = r.targets.get('MeV')!
    expect(Object.keys(mev.assays).sort()).toEqual(['MeV_Roy', 'MeV_Roy_V2'])
    expect(mev.latest).toEqual({ date: '2026-02-27', assay: 'MeV_Roy_V2', category: 'not calculated' })
    // PMMoV control has no normalized value.
    expect(r.targets.get('PMMoV')!.raw[0][1]).toBeNull()
    expect(r.warnings).toEqual([])
  })

  it('prefers the current assay when two versions ran on one sample', () => {
    const both: RawSample[] = [
      ...ROCHESTER_FEB_2026.slice(0, 2),
      { collection_date: '2026-02-27', targets: { MeV_Roy: { gc_g_dry_weight: 5, gc_g_dry_weight_pmmov: 1e-6 }, MeV_Roy_V2: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0 } } },
      { collection_date: '2026-03-02', targets: { MeV_Roy_V2: { gc_g_dry_weight: 0, gc_g_dry_weight_pmmov: 0 } } },
    ]
    const mev = reduceSamples(both, map, OPTS.historyStart).targets.get('MeV')!
    expect(mev.raw.find(([d]) => d === '2026-02-27')?.[1]).toBe(0)
  })

  it('builds weekly-mean sewershed series with publisher categories', () => {
    const r = reduceSamples(ROCHESTER_FEB_2026, map, OPTS.historyStart)
    const { series, skipped } = buildPlantSeries({ uid: 'e1e03cad', plant: ROCHESTER_PLANT, reduction: r }, OPTS)
    const covid = series.find((s) => s.pathogen === 'covid')!
    expect(covid.id).toBe('wastewaterscan:wwscan:covid:wastewater_conc:sewershed:wwscan:e1e03cad')
    expect(covid.label).toContain('per million PMMoV (normalized)')
    expect(covid.unit).toBe('ratio')
    // Week ending 2026-02-28: mean of 78.619, 122.643, 95.803 copies per million PMMoV (4 significant figures).
    expect(covid.points).toEqual([['2026-02-28', 99.02]])
    expect(covid.official).toEqual({ level: 'low', label: 'Low', asOf: '2026-02-28', by: 'WastewaterSCAN' })
    expect(covid.geo).toEqual({
      type: 'sewershed', code: 'wwscan:e1e03cad', name: 'Rochester (WastewaterSCAN)', counties: ['27109'], population: 120000,
      coord: [-92.4717, 44.0048],
    })
    expect(covid.attrs).toEqual({
      plant: 'City Of Rochester MN Water Reclamation Plant', assay: 'N Gene', nwssId: '1017', detectedLatestWeek: 'yes',
    })
    const flu = series.find((s) => s.pathogen === 'influenza-a')!
    expect(flu.official?.level).toBe('high')
    expect(flu.note).toContain("Low out of season")
    // Measles: the latest category is 'not calculated' → no official level (only the publisher's own
    // categories go in `official`); the non-detection is recorded as a plain fact in attrs.
    const measles = series.find((s) => s.pathogen === 'measles')!
    expect(measles.official).toBeUndefined()
    expect(measles.attrs?.detectedLatestWeek).toBe('no')
    expect(series.find((s) => s.pathogen === 'west-nile')!.official).toBeUndefined()
    // HAV: detected on 02-23 (gc 1603.5) → mean of 2.508, 0, 0.
    const hav = series.find((s) => s.pathogen === 'hepatitis-a')!
    expect(hav.points).toEqual([['2026-02-28', 0.836]])
    expect(hav.official).toMatchObject({ level: 'low', label: 'Low' })
    expect(measles.attrs?.assay).toBe('MeV_Roy_V2 (since 2026-02-27; earlier MeV_Roy)')
    expect(measles.note).toContain('MeV_Roy 2026-02-23–2026-02-25; MeV_Roy_V2 2026-02-27–2026-02-27')
    expect(series.every((s) => s.official === undefined || s.official.by === 'WastewaterSCAN')).toBe(true)
    const h5 = series.find((s) => s.pathogen === 'h5n1')!
    expect(h5.official).toMatchObject({ level: 'minimal', label: 'Not detected' })
    const mpox = series.filter((s) => s.pathogen === 'mpox').map((s) => s.id.split(':').pop())
    expect(mpox).toEqual(['clade-ii', 'clade-ib'])
    expect(Object.keys(skipped).sort()).toEqual(['C_auris', 'InfA_H1', 'PMMoV'])
    // Week in progress on 2026-03-02? No: last week (02-28) is complete.
    expect(covid.provisionalFrom).toBeUndefined()
    const live = buildPlantSeries({ uid: 'e1e03cad', plant: ROCHESTER_PLANT, reduction: r }, { ...OPTS, now: '2026-02-27T18:00:00Z' })
    expect(live.series[0].provisionalFrom).toBe('2026-02-28')
  })

  it('omits the official level when the category is not calculated and the week had a detection', () => {
    // Rochester 2025-11-03 (real row): measles MeV_Roy detected, category 'not calculated'.
    const r = reduceSamples(
      [{ collection_date: '2025-11-03', targets: { MeV_Roy: { gc_g_dry_weight: 3279.8503861140266, gc_g_dry_weight_pmmov: 4.525996931440705e-6, activity_category: 'not calculated' } } }],
      map,
      OPTS.historyStart,
    )
    const { series } = buildPlantSeries({ uid: 'e1e03cad', plant: ROCHESTER_PLANT, reduction: r }, { ...OPTS, now: '2025-11-10T00:00:00Z' })
    expect(series[0].points).toEqual([['2025-11-08', 4.526]])
    expect(series[0].official).toBeUndefined()
    expect(series[0].attrs?.detectedLatestWeek).toBe('yes')
  })

  it('drops targets with no sample in the last year', () => {
    const r = reduceSamples(ROCHESTER_FEB_2026, map, OPTS.historyStart)
    const { series, discontinued } = buildPlantSeries({ uid: 'e1e03cad', plant: ROCHESTER_PLANT, reduction: r }, { ...OPTS, now: '2027-06-01T00:00:00Z' })
    expect(series).toEqual([])
    expect(discontinued[0]).toMatch(/last sample 2026-02-2/)
  })

  it('counts plants with a detection per week for rare targets', () => {
    const acc = newDetectionAccumulator()
    addDetections(acc, '90771388', 'Mankato', reduceSamples(MANKATO_H5_WEEK, map, OPTS.historyStart), OPTS.historyStart)
    addDetections(acc, 'e1e03cad', 'Rochester', reduceSamples([...ROCHESTER_H5_WEEK, ...ROCHESTER_FEB_2026], map, OPTS.historyStart), OPTS.historyStart)
    const dopts = { ...OPTS, plantNames: ['Mankato', 'Rochester'], openWeeks: new Set(['2026-03-07']) }
    const det = buildDetectionSeries(acc, { ...dopts, pathogens: ['measles', 'mpox', 'h5n1'] })
    const h5 = det.find((s) => s.pathogen === 'h5n1')!
    expect(h5.id).toBe('wastewaterscan:wwscan-detections:h5n1:ww_detections:state:27')
    expect(h5.points).toEqual([['2026-01-03', 1], ['2026-02-28', 0]])
    expect(h5.attrs).toEqual({ assays: 'InfA_H5', plantsTestedLatestWeek: '1', lastDetection: '2026-01-02 (Mankato)' })
    expect(h5.label).toContain('(of 2)')
    expect(h5.note).toContain('Plants: Mankato and Rochester.')
    // No module-made classification on the count.
    expect(h5.official).toBeUndefined()
    expect(h5.provisionalFrom).toBeUndefined()
    const mpox = det.find((s) => s.pathogen === 'mpox')!
    expect(mpox.attrs?.assays).toBe('MPXV_G2R_WA, MPXV_dD14-16')
    expect(det.map((s) => s.pathogen)).toEqual(['measles', 'mpox', 'h5n1'])
    // Default: every rare target (series are keyed by measurement system, so they coexist with CDC NWSS).
    const def = buildDetectionSeries(acc, dopts)
    expect(def.map((s) => s.pathogen)).toEqual(['measles', 'mpox', 'h5n1', 'hepatitis-a', 'west-nile'])
    const hav = def.find((s) => s.pathogen === 'hepatitis-a')!
    expect(hav.points).toEqual([['2026-02-28', 1]])
    expect(hav.attrs?.lastDetection).toBe('2026-02-23 (Rochester)')
    // Last week flagged open by a plant → provisional.
    expect(buildDetectionSeries(acc, { ...dopts, openWeeks: new Set(['2026-02-28', '2026-03-07']) })[0].provisionalFrom).toBe('2026-02-28')
  })
})

describe('wastewaterscan completeness, schema drift and helpers', () => {
  // Real samples per week (St. Cloud c089ed87 and Mankato 90771388 files, updated 2026-10-06).
  const weeks = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26', '2026-10-03']
  const stCloud = new Map(weeks.map((w, i) => [w, i === 9 ? 2 : 3]))
  const mankato = new Map(weeks.map((w, i) => [w, i === 6 ? 2 : 3]))

  it('keeps last week provisional while it is short of the usual samples', () => {
    // St. Cloud on Wed 2026-10-07: only Mon 09-28 and Wed 09-30 posted for week 10-03 (usually 3).
    expect([...openWeeks(stCloud, '2026-10-07T12:00:00Z')].sort()).toEqual(['2026-10-03', '2026-10-10'])
    // Mankato has its usual 3 samples (Mon, Wed, Thu): final. A short week earlier (09-12) is final.
    expect([...openWeeks(mankato, '2026-10-07T12:00:00Z')]).toEqual(['2026-10-10'])
    // A plant that stopped sampling long ago does not flag anything.
    expect([...openWeeks(new Map([['2025-01-04', 3]]), '2026-10-07T12:00:00Z')]).toEqual(['2026-10-10'])
  })

  it('marks the plant series provisional when its last week is still filling', () => {
    const map = assayPublicMap(TARGET_DEFS)
    // Rochester Feb fixture minus the Friday sample, with 8 earlier full weeks.
    const prior: RawSample[] = []
    for (let i = 1; i <= 8; i++) {
      const sat = new Date(Date.UTC(2026, 1, 28 - 7 * i))
      for (const back of [5, 3, 1]) {
        const d = new Date(sat.getTime() - back * 86400000).toISOString().slice(0, 10)
        prior.push({ collection_date: d, targets: { 'N Gene': ROCHESTER_FEB_2026[0].targets!['N Gene'] } })
      }
    }
    const r = reduceSamples([...prior, ...ROCHESTER_FEB_2026.slice(0, 2)], map, OPTS.historyStart)
    const b = buildPlantSeries({ uid: 'e1e03cad', plant: ROCHESTER_PLANT, reduction: r }, { ...OPTS, now: '2026-03-02T12:00:00Z' })
    expect(b.series.find((s) => s.pathogen === 'covid')!.provisionalFrom).toBe('2026-02-28')
    const full = reduceSamples([...prior, ...ROCHESTER_FEB_2026], map, OPTS.historyStart)
    const bf = buildPlantSeries({ uid: 'e1e03cad', plant: ROCHESTER_PLANT, reduction: full }, { ...OPTS, now: '2026-03-02T12:00:00Z' })
    expect(bf.series.find((s) => s.pathogen === 'covid')!.provisionalFrom).toBeUndefined()
  })

  it('treats a renamed value field as an error, not as all-null series', () => {
    const renamed = ROCHESTER_FEB_2026.map((s) => ({
      ...s,
      targets: Object.fromEntries(
        Object.entries(s.targets!).map(([a, t]) => {
          const { gc_g_dry_weight_pmmov, ...rest } = t
          return [a, { ...rest, gc_pmmov_ratio: gc_g_dry_weight_pmmov }]
        }),
      ),
    }))
    const r = reduceSamples(renamed, assayPublicMap(TARGET_DEFS), OPTS.historyStart)
    expect(r.missingRequired).toEqual(['gc_g_dry_weight_pmmov'])
    expect(unusableReason(r)).toMatch(/schema drift: required field\(s\) gc_g_dry_weight_pmmov/)
    // Field present but every value null → still unusable.
    const nulls = ROCHESTER_FEB_2026.map((s) => ({
      ...s,
      targets: Object.fromEntries(Object.entries(s.targets!).map(([a, t]) => [a, { ...t, gc_g_dry_weight_pmmov: null }])),
    }))
    expect(unusableReason(reduceSamples(nulls, assayPublicMap(TARGET_DEFS), OPTS.historyStart))).toMatch(/no numeric/)
    expect(unusableReason(reduceSamples(ROCHESTER_FEB_2026, assayPublicMap(TARGET_DEFS), OPTS.historyStart))).toBeNull()
  })

  it('rounds weekly means to 4 significant figures and keeps all-null weeks as null', () => {
    expect(sig(41840.801)).toBe(41840)
    expect(sig(0.000123456)).toBe(0.0001235)
    expect(sig(0)).toBe(0)
    expect(weeklyMeans([['2026-09-28', 58.002], ['2026-09-30', 92.255], ['2026-10-02', 113.898], ['2026-10-05', null]])).toEqual([
      ['2026-10-03', 88.05],
      ['2026-10-10', null],
    ])
  })

  it('looks up category-file entries by assay id, public id, then suggested label', () => {
    const labels = new Map([['MPXV_dD14-16', 'MPXV Clade Ib'], ['Rota', 'Rotavirus']])
    expect(categoryKeys('N Gene', 'SC2_N', labels)).toEqual(['N Gene', 'SC2_N'])
    expect(categoryKeys('MPXV_dD14-16', 'MPXV_dD14-16', labels)).toEqual(['MPXV_dD14-16', 'MPXV Clade Ib'])
    expect(categoryKeys('Rota', 'Rotavirus', labels)).toEqual(['Rota', 'Rotavirus'])
  })
})

describe('wastewaterscan geography and meta', () => {
  it('falls back to the centroid of the counties served when the plant has no point', async () => {
    const counties = await loadCountyFeatures(process.cwd())
    const geo = plantGeo('c089ed87', { city: 'St. Cloud', counties_served: ['27009', '27141', '27145'], sewershed_pop: 120000 }, counties)
    expect(geo.coord).toBeDefined()
    const [lon, lat] = geo.coord!
    expect(lon).toBeGreaterThan(-95.2)
    expect(lon).toBeLessThan(-93.4)
    expect(lat).toBeGreaterThan(45.2)
    expect(lat).toBeLessThan(45.9)
  })

  it('carries the required attribution verbatim', () => {
    expect(wastewaterscan.meta.attribution).toBe(ATTRIBUTION)
    expect(ATTRIBUTION).toContain('License: CC BY-NC 4.0.')
    expect(describeAssays({ 'N Gene': { first: '2022-11-04', last: '2026-10-02', n: 596 } }, 'N Gene')).toBe('N Gene')
  })
})

describe('wastewaterscan run() failure paths (stubbed fetch)', () => {
  const GCS = 'https://storage.googleapis.com/wastewater-dev-data/json'
  const CATS = 'https://data.wastewaterscan.org/data/categories/plants.json'
  const silent: Logger = { info() {}, warn() {}, error() {}, child: () => silent }
  let root = ''

  afterEach(async () => {
    vi.unstubAllGlobals()
    if (root) await rm(root, { recursive: true, force: true })
    root = ''
  })

  function stubFetch(routes: Record<string, unknown>) {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const body = routes[String(url)]
      if (body === undefined || typeof body === 'number')
        return new Response('not found', { status: typeof body === 'number' ? body : 404 })
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  async function makeRoot(prev?: { conc?: Series[]; det?: Series[] }) {
    root = await mkdtemp(path.join(os.tmpdir(), 'wws-test-'))
    const dir = path.join(root, 'public', 'data', 'series')
    await mkdir(dir, { recursive: true })
    if (prev?.conc) await writeFile(path.join(dir, 'wastewaterscan__wwscan.json'), JSON.stringify({ series: prev.conc }))
    if (prev?.det) await writeFile(path.join(dir, 'wastewaterscan__wwscan-detections.json'), JSON.stringify({ series: prev.det }))
    return root
  }

  const prevMankato: Series = {
    id: 'wastewaterscan:wwscan:covid:wastewater_conc:sewershed:wwscan:90771388', source: 'wastewaterscan', dataset: 'wwscan',
    pathogen: 'covid', metric: 'wastewater_conc', unit: 'ratio', label: 'COVID-19 (SARS-CoV-2 N gene) — wastewater (WastewaterSCAN), per million PMMoV (normalized)',
    geo: { type: 'sewershed', code: 'wwscan:90771388', name: 'Mankato (WastewaterSCAN)' }, points: [['2026-02-21', 116.5]],
  }
  const prevHav: Series = {
    id: 'wastewaterscan:wwscan-detections:hepatitis-a:ww_detections:state:27', source: 'wastewaterscan', dataset: 'wwscan-detections',
    pathogen: 'hepatitis-a', metric: 'ww_detections', unit: 'count', label: 'Hepatitis A — Minnesota WastewaterSCAN plants with a detection (of 4)',
    geo: { type: 'state', code: '27', name: 'Minnesota' }, points: [['2026-02-21', 2]],
  }
  const renamed = ROCHESTER_FEB_2026.map((s) => ({
    ...s,
    targets: Object.fromEntries(Object.entries(s.targets!).map(([a, { gc_g_dry_weight_pmmov, ...t }]) => [a, { ...t, value_pmmov: gc_g_dry_weight_pmmov }])),
  }))

  it('falls back to the built-in plant list, keeps a failed plant’s previous series and rejects schema drift', async () => {
    const rootDir = await makeRoot({ conc: [prevMankato], det: [prevHav] })
    stubFetch({
      [`${GCS}/plants.json`]: 404,
      [`${GCS}/targets.json`]: { targets: TARGET_DEFS },
      // Shape of the categories file (smach/biobot_mwra fixture values), keyed here by public id.
      [CATS]: { e1e03cad: { SC2_N: { category: 'high', method: 'commonly detected', details: { trend: { m: 3.4021, p: 0.0071, significant: true }, tertile: 3 }, lastSampleDate: '2026-02-27' } } },
      [`${GCS}/e1e03cad.json`]: { samples: ROCHESTER_FEB_2026, plant: ROCHESTER_PLANT, updated: '2026-03-01T13:27:05' },
      [`${GCS}/90771388.json`]: 404,
      [`${GCS}/6c9b6f97.json`]: { samples: renamed, plant: { uid: '6c9b6f97', city: 'Red Wing', state: 'Minnesota' } },
      [`${GCS}/c089ed87.json`]: { plants: [] },
    })
    const res = await wastewaterscan.run({ now: '2026-03-02T12:00:00Z', log: silent, historyStart: '2021-07-01', cacheDir: rootDir, rootDir })
    const diag = res.diagnostics as Record<string, any>
    expect(diag.plantsIndex.via).toBe('fallback')
    expect(res.message).toMatch(/^Partial refresh \(1 of 4 Minnesota plants; latest week 2026-02-28; plant index unavailable/)
    expect(res.message).toContain('plant 90771388: HTTP 404')
    expect(res.message).toContain('plant 6c9b6f97: schema drift: required field(s) gc_g_dry_weight_pmmov not present')
    expect(res.message).toContain('plant c089ed87: response has no samples[] array')
    const conc = res.datasets.find((d) => d.dataset === 'wwscan')!.series
    // Rochester fresh, Mankato carried forward unchanged, nothing for Red Wing or St. Cloud.
    expect(conc.find((s) => s.geo.code === 'wwscan:90771388')).toEqual(prevMankato)
    expect(conc.some((s) => s.geo.code === 'wwscan:6c9b6f97')).toBe(false)
    expect(diag.keptPrevious).toEqual({ '90771388': '1 series through 2026-02-21', '6c9b6f97': null, c089ed87: null })
    // Trend verdict found under the public id.
    const covid = conc.find((s) => s.id.endsWith('covid:wastewater_conc:sewershed:wwscan:e1e03cad'))!
    expect(covid.official).toMatchObject({ level: 'low', trend: 'rising', by: 'WastewaterSCAN' })
    expect(diag.categories.lookups.hit).toBeGreaterThan(0)
    // Statewide counts: kept from the previous file while plants are missing.
    const det = res.datasets.find((d) => d.dataset === 'wwscan-detections')!.series
    expect(det.find((s) => s.pathogen === 'hepatitis-a')).toEqual(prevHav)
    const wnv = det.find((s) => s.pathogen === 'west-nile')!
    expect(wnv.attrs?.plantsMissing).toBe('90771388, 6c9b6f97, c089ed87')
  })

  it('returns no series when no plant loads, so the orchestrator keeps the previous files', async () => {
    const rootDir = await makeRoot({ conc: [prevMankato] })
    stubFetch({ [`${GCS}/targets.json`]: { targets: TARGET_DEFS }, [`${GCS}/e1e03cad.json`]: { samples: renamed, plant: ROCHESTER_PLANT } })
    const res = await wastewaterscan.run({ now: '2026-03-02T12:00:00Z', log: silent, historyStart: '2021-07-01', cacheDir: rootDir, rootDir })
    expect(res.datasets.every((d) => d.series.length === 0)).toBe(true)
    expect(res.message).toMatch(/^No Minnesota plant could be loaded \(0 of 4\)/)
    expect(res.message).toContain('schema drift')
  })
})
