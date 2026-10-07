// CDC National Wastewater Surveillance System (NWSS) — Minnesota.
//
// 1) nwss-wval: site-level Wastewater Viral Activity Level (data.cdc.gov atcp-73re) for SARS-CoV-2,
//    influenza A and RSV at each Minnesota treatment plant, with CDC's category as the official level,
//    plus a derived statewide weekly median across reporting sites. CDC's own current state category
//    (cdc.gov NWSSWVALStateMap.json, undocumented) is attached when reachable.
// 2) nwss-detections: weekly count of Minnesota sites with a measles (akvg-8vrb), H5 avian influenza
//    (mtpu-urpp) or mpox (xpxn-rzgz) detection, from CDC's sample-level datasets.
//
// data.cdc.gov is primary; atcp-73re and akvg-8vrb fall back to the PopHIVE GitHub mirror (see cdcData.ts).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Series } from '../../shared/types.ts'
import { loadCdcRows, type CdcRowsResult } from '../lib/cdcData.ts'
import { fetchText } from '../lib/http.ts'
import { latestDate } from '../lib/series.ts'
import {
  DETECTION_SPECS, PATHOGEN_NAME, SOURCE_ID, buildDetectionSeries, buildWvalSeries, checkCutpoints, countyCentroids,
  parseSiteMap, parseStateMap, parseWvalRows, type CentroidMap, type SiteLocation, type WvalPathogen,
} from '../lib/cdc-nwss-parse.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'

const CDC_VIZ = 'https://www.cdc.gov/wcms/vizdata/NCEZID_DIDRI/NWSS_WVAL_metric'
const MN_WHERE = "upper(state_territory) in ('MINNESOTA', 'MN')"
const isMn = (r: Record<string, string>) => /^(minnesota|mn)$/i.test((r.state_territory ?? '').trim())

const WVAL_REQUIRED = ['site', 'site_wval', 'week_end', 'pathogen_target']
const WVAL_EXPECTED = [...WVAL_REQUIRED, 'state_territory', 'counties_served', 'population_served', 'source', 'site_wval_category', 'date_included_in_wval', 'date_updated']
const SAMPLE_REQUIRED = ['site', 'sample_collect_date', 'pcr_target_detect']
const SAMPLE_EXPECTED = [...SAMPLE_REQUIRED, 'state_territory', 'pcr_target', 'county_fips', 'counties_served']

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300)

function columnsOf(rows: Record<string, string>[]): string[] {
  const cols = new Set<string>()
  // SODA JSON omits null fields per row, so take the union over a sample of rows.
  for (const r of rows.slice(0, 2000)) for (const k of Object.keys(r)) cols.add(k)
  return [...cols].sort()
}

function checkSchema(label: string, cols: string[], required: string[], expected: string[], ctx: SourceContext) {
  const missingRequired = required.filter((c) => !cols.includes(c))
  if (missingRequired.length) throw new Error(`${label}: schema drift — required column(s) missing: ${missingRequired.join(', ')} (seen: ${cols.join(', ')})`)
  const missing = expected.filter((c) => !cols.includes(c))
  if (missing.length) ctx.log.warn(`${label}: expected column(s) not present: ${missing.join(', ')}`)
  return missing
}

function loadCentroids(ctx: SourceContext): CentroidMap {
  try {
    const gj = JSON.parse(readFileSync(join(ctx.rootDir, 'public/geo/mn-counties.geojson'), 'utf8'))
    return countyCentroids(gj)
  } catch (e) {
    ctx.log.warn(`county centroids unavailable (${errMsg(e)}); sites will have no coordinates`)
    return new Map()
  }
}

async function fetchCdcJson(file: string): Promise<string> {
  return fetchText(`${CDC_VIZ}/${file}`, { retries: 1, timeoutMs: 30_000, headers: { Accept: 'application/json' } })
}

async function runWval(ctx: SourceContext, errors: string[], diagnostics: Record<string, unknown>): Promise<Series[]> {
  const log = ctx.log.child('wval')
  const loaded: CdcRowsResult = await loadCdcRows('atcp-73re', { where: MN_WHERE }, isMn, log)
  const cols = columnsOf(loaded.rows)
  const missing = checkSchema('atcp-73re', cols, WVAL_REQUIRED, WVAL_EXPECTED, ctx)
  const parsed = parseWvalRows(loaded.rows)
  if (parsed.unknownTargets.length) log.warn(`unrecognized pathogen_target value(s): ${parsed.unknownTargets.join(', ')}`)
  if (parsed.unknownCategories.length) log.warn(`unrecognized site_wval_category value(s): ${parsed.unknownCategories.join(', ')}`)
  if (!parsed.rows.length) throw new Error(`atcp-73re: ${loaded.rows.length} Minnesota rows but none parseable`)

  // Re-verify the hard-coded cut-points against CDC's own categories; drop thresholds that disagree.
  const check = checkCutpoints(parsed.rows.filter((r) => r.level).map((r) => ({ pathogen: r.pathogen, value: r.value, level: r.level! })))
  const thresholdsFor = new Set<WvalPathogen>()
  for (const p of Object.keys(PATHOGEN_NAME) as WvalPathogen[]) {
    const c = check[p]
    if (c && c.checked > 0 && c.mismatches / c.checked <= 0.01) thresholdsFor.add(p)
    else if (c && c.checked > 0) {
      log.warn(`WVAL cut-points for ${p} disagree with CDC categories in ${c.mismatches}/${c.checked} rows (e.g. ${c.examples.join('; ')}); thresholds omitted — CDC may have revised them`)
    }
  }

  // Optional (cdc.gov, undocumented): jittered site coordinates and the official state category.
  let siteCoords: Map<string, SiteLocation> | undefined
  const siteMapDiag: Record<string, unknown> = {}
  try {
    siteCoords = parseSiteMap(await fetchCdcJson('NWSSWVALSiteMap.json'))
    siteMapDiag.sites = siteCoords.size
  } catch (e) {
    siteMapDiag.error = errMsg(e)
    log.info(`CDC site map unavailable (${errMsg(e).slice(0, 120)}); using county centroids`)
  }

  const built = buildWvalSeries(parsed.rows, { historyStart: ctx.historyStart, centroids: loadCentroids(ctx), siteCoords, thresholdsFor })
  if (built.unmatchedCounties.length) log.warn(`county name(s) not matched to MN FIPS: ${built.unmatchedCounties.join(', ')}`)

  const stateDiag: Record<string, unknown> = { ...built.stateDiag }
  try {
    const official = parseStateMap(await fetchCdcJson('NWSSWVALStateMap.json'))
    stateDiag.cdcStateMap = official
    for (const o of official) {
      const s = built.state.find((x) => x.pathogen === o.pathogen)
      const last = s?.points[s.points.length - 1]?.[0]
      if (!s || !o.level || !o.week) continue
      if (o.week !== last) {
        log.warn(`CDC state WVAL for ${o.pathogen} is for week ${o.week}, derived series ends ${last}; official level not attached`)
        continue
      }
      s.official = { level: o.level, label: o.category, asOf: o.week, by: 'CDC NWSS WVAL (official Minnesota level)' }
      s.attrs = { ...s.attrs, ...(o.value != null ? { cdcStateWval: String(o.value) } : {}), ...(o.sites != null ? { cdcSites: String(o.sites) } : {}) }
    }
  } catch (e) {
    stateDiag.cdcStateMapError = errMsg(e)
    log.info(`CDC official state WVAL unavailable (${errMsg(e).slice(0, 120)}); derived median is classified with CDC cut-points`)
  }

  const weeks = parsed.rows.map((r) => r.week).sort()
  const updated = loaded.rows.reduce((m, r) => ((r.date_updated ?? '') > m ? r.date_updated : m), '')
  const perPathogen: Record<string, unknown> = {}
  for (const p of Object.keys(PATHOGEN_NAME) as WvalPathogen[]) {
    const rs = parsed.rows.filter((r) => r.pathogen === p)
    if (!rs.length) continue
    const latest = rs.reduce((m, r) => (r.week > m ? r.week : m), '')
    perPathogen[p] = {
      rows: rs.length,
      sites: new Set(rs.map((r) => r.site)).size,
      latestWeek: latest,
      sitesLatestWeek: rs.filter((r) => r.week === latest).length,
      cutpointCheck: check[p],
    }
  }
  diagnostics.wval = {
    dataset: 'atcp-73re',
    via: loaded.via,
    datasetUpdatedAt: loaded.updatedAt,
    dateUpdatedField: updated || undefined,
    rowsRead: loaded.rows.length,
    rowsParsed: parsed.rows.length,
    rowsRejected: parsed.rejected,
    columns: cols,
    missingColumns: missing,
    firstWeek: weeks[0],
    latestWeek: weeks[weeks.length - 1],
    sites: new Set(parsed.rows.map((r) => r.site)).size,
    perPathogen,
    unmatchedCounties: built.unmatchedCounties,
    siteLocations: built.locationBasis,
    siteMap: siteMapDiag,
    state: stateDiag,
  }
  log.info(
    `atcp-73re via ${loaded.via}: ${loaded.rows.length} MN rows, ${built.sites.length} site series, ${built.state.length} state series, latest week ${weeks[weeks.length - 1]}`,
  )
  if (loaded.via === 'pophive-mirror') errors.push(`WVAL served from the PopHIVE mirror of atcp-73re (data.cdc.gov unavailable)`)
  return [...built.state, ...built.sites]
}

async function runDetections(ctx: SourceContext, errors: string[], diagnostics: Record<string, unknown>): Promise<Series[]> {
  const out: Series[] = []
  const diag: Record<string, unknown> = {}
  for (const spec of DETECTION_SPECS) {
    const log = ctx.log.child(spec.key)
    try {
      const loaded = await loadCdcRows(spec.datasetId, { where: MN_WHERE }, isMn, log)
      const cols = columnsOf(loaded.rows)
      const missing = checkSchema(spec.datasetId, cols, SAMPLE_REQUIRED, SAMPLE_EXPECTED, ctx)
      const { series, diag: d } = buildDetectionSeries(loaded.rows, spec, ctx.historyStart)
      diag[spec.key] = { dataset: spec.datasetId, via: loaded.via, datasetUpdatedAt: loaded.updatedAt, rowsRead: loaded.rows.length, columns: cols, missingColumns: missing, ...d }
      if (series) {
        out.push(series)
        log.info(`${spec.datasetId} via ${loaded.via}: ${loaded.rows.length} MN rows, ${series.points.length} weeks, latest ${series.points[series.points.length - 1][0]}`)
      } else {
        log.warn(`${spec.datasetId}: no usable Minnesota samples`)
      }
      if (loaded.via === 'pophive-mirror') errors.push(`${spec.name} detections served from the PopHIVE mirror of ${spec.datasetId}`)
    } catch (e) {
      // Keep the last published series for this pathogen (unchanged) so one failed dataset does not
      // drop it from the shared detections file; the analysis flags it stale if it ages.
      const kept = previousSeries(ctx, 'nwss-detections').find((s) => s.pathogen === spec.pathogen)
      if (kept) out.push(kept)
      diag[spec.key] = { dataset: spec.datasetId, error: errMsg(e), keptPrevious: kept ? latestDate([kept]) : null }
      errors.push(`${spec.name} detections (${spec.datasetId}): ${errMsg(e)}${kept ? ` — kept previous data through ${latestDate([kept])}` : ''}`)
    }
  }
  diagnostics.detections = diag
  return out
}

/** Series from the previously published file for this source/dataset (empty when none). */
function previousSeries(ctx: SourceContext, dataset: string): Series[] {
  try {
    const file = JSON.parse(readFileSync(join(ctx.rootDir, 'public/data/series', `${SOURCE_ID}__${dataset}.json`), 'utf8'))
    return Array.isArray(file?.series) ? (file.series as Series[]).filter((s) => s.source === SOURCE_ID) : []
  } catch {
    return []
  }
}

export const cdcNwss: SourceModule = {
  meta: {
    id: SOURCE_ID,
    name: 'CDC wastewater surveillance (NWSS)',
    publisher: 'CDC — National Wastewater Surveillance System',
    url: 'https://www.cdc.gov/nwss/rv/index.html',
    description:
      'How much SARS-CoV-2 (COVID-19), influenza A and RSV virus is in sewage at Minnesota treatment plants, as CDC’s Wastewater Viral Activity Level: each plant’s current level compared with its own baseline, grouped from Very Low to Very High. ' +
      'Includes a statewide weekly median across reporting plants (calculated by MN Pulse) and weekly counts of Minnesota sites where measles, H5 avian influenza or mpox was detected. ' +
      'Wastewater reflects virus shed by everyone connected to a sewer system, including people without symptoms or tests; it does not count cases, does not cover homes on septic systems, and a non-detect does not rule out infections. ' +
      'Raw activity numbers are not comparable between plants, and H5 can come from animal sources.',
    geography: 'Minnesota wastewater treatment plants (sewersheds) and statewide',
    cadence: 'Weekly (CDC updates Fridays; data through the prior Saturday)',
    attribution:
      'CDC National Wastewater Surveillance System (data.cdc.gov datasets atcp-73re, akvg-8vrb, mtpu-urpp, xpxn-rzgz); samples collected by MDH and WastewaterSCAN',
  },
  timeoutMs: 8 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const errors: string[] = []
    const diagnostics: Record<string, unknown> = {}
    let wval: Series[] = []
    let detections: Series[] = []
    try {
      wval = await runWval(ctx, errors, diagnostics)
    } catch (e) {
      errors.push(`WVAL (atcp-73re): ${errMsg(e)}`)
      diagnostics.wval = { error: errMsg(e) }
    }
    try {
      detections = await runDetections(ctx, errors, diagnostics)
    } catch (e) {
      errors.push(`detections: ${errMsg(e)}`)
    }
    diagnostics.latestData = { wval: latestDate(wval), detections: latestDate(detections) }
    for (const err of errors) ctx.log.warn(err)
    if (!wval.length && !detections.length) throw new Error(`No CDC NWSS data: ${errors.join('; ')}`)
    return {
      datasets: [
        { source: SOURCE_ID, dataset: 'nwss-wval', series: wval },
        { source: SOURCE_ID, dataset: 'nwss-detections', series: detections },
      ],
      message: errors.length ? `Partial refresh: ${errors.join('; ')}` : undefined,
      diagnostics,
    }
  },
}
