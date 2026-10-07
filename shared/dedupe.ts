// Series de-duplication shared by the pipeline analysis and the web app.
//
// Several sources republish the same measure (e.g. CDC NSSP ER-visit percentages arrive both from
// data.cdc.gov and from the CDC forecast hubs' target data). Series that describe the same
// pathogen, metric, place, age band, assay variant and measurement system are duplicates; only the
// best copy is kept:
//   1. fresher data wins (newest non-null observation),
//   2. on ties, live data beats archived copies,
//   3. then SOURCE_PRIORITY decides.
// Series from one source dataset are never collapsed into each other: a source does not publish the
// same measure twice in one file, so two such series are distinct (e.g. assay variants).
import type { Series } from './types.ts'

/**
 * Measurement system a dataset belongs to. Series from the same system that describe the same
 * pathogen/metric/place are duplicates (e.g. NSSP ED % from the forecast hub and from data.cdc.gov);
 * series from different systems are distinct measures (e.g. NHSN admissions per 100k vs RESP-NET rates).
 */
export function measureFamily(dataset: string): string {
  if (/^nssp/.test(dataset)) return 'nssp'
  if (/^nhsn/.test(dataset)) return 'nhsn'
  return dataset
}

/**
 * Assay or sub-measure discriminator: the part of the id after
 * `source:dataset:pathogen:metric:geoType:geoCode` (e.g. 'clade-ib', 'ev-d68', 'ltc', 'age-0-6mo').
 * Empty for ids without a suffix.
 */
export function seriesVariant(s: Pick<Series, 'id' | 'source' | 'dataset' | 'pathogen' | 'metric' | 'geo'>): string {
  const prefix = [s.source, s.dataset, s.pathogen, s.metric, s.geo.type, s.geo.code].join(':')
  return s.id.startsWith(`${prefix}:`) ? s.id.slice(prefix.length + 1) : ''
}

/** Series identity independent of source, used to de-duplicate and to match forecasts to series. */
export function seriesKey(x: {
  pathogen: string
  metric: string
  geo: { type: string; code: string }
  age?: string
  dataset?: string
  variant?: string
}): string {
  return [x.pathogen, x.metric, x.geo.type, x.geo.code, x.age ?? '', measureFamily(x.dataset ?? ''), x.variant ?? ''].join('|')
}

/** Key of a full series (includes its assay variant). */
export const keyOfSeries = (s: Series): string => seriesKey({ ...s, variant: seriesVariant(s) })

/** When two sources publish the same measure for the same place, prefer the one listed first. */
export const SOURCE_PRIORITY = ['cdc-nssp', 'cdc-hubs', 'mdh', 'cdc-respnet', 'cdc-fluview', 'cdc-nwss', 'wastewaterscan']

const sourceRank = (src: string) => {
  const i = SOURCE_PRIORITY.indexOf(src)
  return i === -1 ? SOURCE_PRIORITY.length : i
}

function lastDate(s: Series): string {
  for (let i = s.points.length - 1; i >= 0; i--) if (s.points[i][1] != null) return s.points[i][0]
  return ''
}

const archived = (s: Series) => (/archive/.test(s.dataset) ? 1 : 0)

/** True when `a` should replace `b` as the kept copy of a measure. */
export function preferSeries(a: Series, b: Series): boolean {
  const da = lastDate(a)
  const db = lastDate(b)
  if (da !== db) return da > db
  if (archived(a) !== archived(b)) return archived(a) < archived(b)
  return sourceRank(a.source) < sourceRank(b.source)
}

/**
 * Drop duplicate copies of the same measure, keeping the best one (see file header).
 * Order of first appearance is preserved.
 */
export function dedupeSeries(series: Series[]): Series[] {
  const best = new Map<string, Series>()
  for (const s of series) {
    let k = keyOfSeries(s)
    const prev = best.get(k)
    // Same source dataset: never duplicates of each other, keep both.
    if (prev && prev.source === s.source && prev.dataset === s.dataset) k = `${k}|${s.id}`
    const cur = best.get(k)
    if (!cur || preferSeries(s, cur)) best.set(k, s)
  }
  return [...best.values()]
}
