import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION, addDetections, assayPublicMap, buildDetectionSeries, buildPlantSeries, describeAssays,
  loadCountyFeatures, mapActivityCategory, newDetectionAccumulator, normalizeCounties, plantGeo, reduceSamples,
  selectMnPlants, trendFromCategory, wastewaterscan, type RawPlant, type RawSample, type RawTargetDef,
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
  { id: 'MPXV_dD14-16', public: 'MPXV_dD14-16', target: 'hMPXV Clade I' },
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
    // Week ending 2026-02-28: mean of 78.619, 122.643, 95.803 copies per million PMMoV.
    expect(covid.points).toEqual([['2026-02-28', 99.022]])
    expect(covid.official).toEqual({ level: 'low', label: 'Low', asOf: '2026-02-28', by: 'WastewaterSCAN' })
    expect(covid.geo).toEqual({
      type: 'sewershed', code: 'wwscan:e1e03cad', name: 'Rochester (WastewaterSCAN)', counties: ['27109'], population: 120000,
      coord: [-92.4717, 44.0048],
    })
    expect(covid.attrs).toEqual({ plant: 'City Of Rochester MN Water Reclamation Plant', assay: 'N Gene', nwssId: '1017' })
    const flu = series.find((s) => s.pathogen === 'influenza-a')!
    expect(flu.official?.level).toBe('high')
    // Measles: latest category is 'not calculated', but no sample that week had gene copies → plain
    // non-detection; the assay switch is documented.
    const measles = series.find((s) => s.pathogen === 'measles')!
    expect(measles.official).toEqual({ level: 'minimal', label: 'Not detected this week', asOf: '2026-02-28', by: 'WastewaterSCAN sample results' })
    expect(measles.attrs?.assay).toBe('MeV_Roy_V2 (since 2026-02-27; earlier MeV_Roy)')
    expect(measles.note).toContain('MeV_Roy 2026-02-23–2026-02-25; MeV_Roy_V2 2026-02-27–2026-02-27')
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
    const det = buildDetectionSeries(acc, 2, OPTS)
    const h5 = det.find((s) => s.pathogen === 'h5n1')!
    expect(h5.id).toBe('wastewaterscan:wwscan-detections:h5n1:ww_detections:state:27')
    expect(h5.points).toEqual([['2026-01-03', 1], ['2026-02-28', 0]])
    expect(h5.attrs).toEqual({ assays: 'InfA_H5', plantsTestedLatestWeek: '1', lastDetection: '2026-01-02 (Mankato)' })
    expect(h5.official).toMatchObject({ level: 'minimal', asOf: '2026-02-28' })
    const mpox = det.find((s) => s.pathogen === 'mpox')!
    expect(mpox.attrs?.assays).toBe('MPXV_G2R_WA, MPXV_dD14-16')
    expect(det.map((s) => s.pathogen)).toEqual(['measles', 'mpox', 'h5n1'])
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
