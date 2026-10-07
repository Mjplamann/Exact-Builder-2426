// CDC NREVSS — laboratory test positivity for respiratory viruses, HHS Region 5 and the U.S.
//
// The National Respiratory and Enteric Virus Surveillance System collects weekly counts of NAAT (PCR) tests
// and positives from ~450 clinical, public-health and commercial laboratories. Minnesota is in HHS Region 5
// with IL, IN, MI, OH and WI; CDC publishes the multi-virus data only for the nation and the 10 HHS regions.
// It is the closest public analogue to a multiplex respiratory-panel picture (BioFire), minus influenza.
//
//   rgnm-fkqb  weekly % positive for RSV, SARS-CoV-2, hMPV, adenovirus, PIV, RV/EV, HCoV (primary; CI-only)
//   3cxc-4k8q  RSV by HHS region (fallback; PopHIVE GitHub mirror available)
//   gvsb-yw6g  SARS-CoV-2 by HHS region (fallback; CI-only)
//   seuz-s2cv  national % positive for influenza (+ COVID-19/RSV as a last-resort fallback; CI-only)
//
// Regional values in 3cxc-4k8q/gvsb-yw6g are centered 3-week moving averages, whereas rgnm-fkqb carries the
// raw weekly percent, so the fallbacks are only used when rgnm-fkqb has nothing for that virus and place.
// NREVSS publishes no activity categories or trend labels, so no `official` classification is attached.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { GeoRef, PathogenId, Series } from '../../shared/types.ts'
import { loadCdcRows, POPHIVE_MIRRORS } from '../lib/cdcData.ts'
import { fetchJson, HttpError } from '../lib/http.ts'
import { socrataQuery } from '../lib/socrata.ts'
import { latestDate, makeSeries, since, STATE_GEO } from '../lib/series.ts'
import type { Logger } from '../lib/log.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'
import {
  checkColumns, describesMovingAverage, HHS5_GEO, latestObs, parseRegional, parseRgnm, parseSeuz, REGIONAL_LAYOUTS,
  RGNM_OPTIONAL, RGNM_REQUIRED, SEUZ_REQUIRED, selectLatest, toPoints, US_GEO,
  type GeoKey, type Obs, type ParseDiag, type RegionalId, type Selected,
} from '../lib/cdc-nrevss-parse.ts'

const SOURCE = 'cdc-nrevss'
const DS_REGION = 'nrevss-region5'
const DS_STATE = 'nrevss-state'

const GEOS: Record<GeoKey, GeoRef> = { HHS5: HHS5_GEO, US: US_GEO, MN: STATE_GEO }
const WHERE: Record<GeoKey, string> = {
  HHS5: 'HHS Region 5 (MN, WI, IL, IN, MI, OH)',
  US: 'the U.S.',
  MN: 'Minnesota',
}

const PATHOGENS: { id: PathogenId; name: string }[] = [
  { id: 'rsv', name: 'RSV' },
  { id: 'covid', name: 'COVID-19' },
  { id: 'hmpv', name: 'hMPV' },
  { id: 'adenovirus', name: 'Adenovirus' },
  { id: 'parainfluenza', name: 'Parainfluenza' },
  { id: 'rhino-entero', name: 'Rhinovirus/enterovirus' },
  { id: 'seasonal-cov', name: 'Seasonal coronaviruses' },
]
const NAME = Object.fromEntries([...PATHOGENS.map((p) => [p.id, p.name]), ['influenza', 'Flu']]) as Record<string, string>

const NOT_PREVALENCE =
  'Positivity is the share of lab tests that were positive among people who were tested — not the share of the population infected (not prevalence); it counts tests, not patients.'

const DATASET_LINK: Record<string, string> = {
  'rgnm-fkqb': 'https://data.cdc.gov/d/rgnm-fkqb',
  '3cxc-4k8q': 'https://data.cdc.gov/d/3cxc-4k8q',
  'gvsb-yw6g': 'https://data.cdc.gov/d/gvsb-yw6g',
  'seuz-s2cv': 'https://data.cdc.gov/d/seuz-s2cv',
}

interface Loaded {
  rows: Record<string, string>[]
  via: 'data.cdc.gov' | 'pophive-mirror'
  updatedAt?: string
  query?: string
  /** Socrata column descriptions (fieldName → description) when metadata was reachable. */
  descriptions?: Record<string, string>
  metaFields?: string[]
}

interface SocrataView {
  rowsUpdatedAt?: number
  columns?: { name: string; fieldName: string; description?: string }[]
}

async function loadMeta(id: string): Promise<SocrataView | null> {
  try {
    return await fetchJson<SocrataView>(`https://data.cdc.gov/api/views/${id}.json`, { retries: 1, timeoutMs: 30_000 })
  } catch {
    const mirror = POPHIVE_MIRRORS[id]
    if (!mirror) return null
    try {
      return await fetchJson<SocrataView>(`https://raw.githubusercontent.com/PopHIVE/Ingest/main/data/${mirror}.json`, {
        retries: 1,
        timeoutMs: 30_000,
      })
    } catch {
      return null
    }
  }
}

function withMeta(loaded: Loaded, meta: SocrataView | null): Loaded {
  if (!meta) return loaded
  const descriptions: Record<string, string> = {}
  for (const c of meta.columns ?? []) if (c.description) descriptions[c.fieldName] = c.description
  return {
    ...loaded,
    updatedAt: loaded.updatedAt ?? (meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString() : undefined),
    descriptions,
    metaFields: (meta.columns ?? []).map((c) => c.fieldName).filter((f) => !f.startsWith(':')),
  }
}

/** rgnm-fkqb: National + Region 5 aggregates, plus Minnesota state rows if CDC publishes them. */
async function loadRgnm(): Promise<Loaded> {
  const attempts: { query: string; where: string }[] = [
    {
      query: 'region5+national+MN, aggregate subtypes',
      where:
        "(level in('National','Region 5') OR state in('Minnesota','MN')) AND (subtype IS NULL OR subtype='Combined Type')",
    },
    // If CDC renames/drops `state` or `subtype` the narrow query 400s; fall back and filter in code.
    { query: 'region5+national (fallback query)', where: "level in('National','Region 5')" },
  ]
  let lastErr: unknown
  for (const a of attempts) {
    try {
      const rows = await socrataQuery<Record<string, unknown>>('rgnm-fkqb', { where: a.where })
      if (!rows.length) throw new Error('no rows returned')
      return { rows: rows.map(stringify), via: 'data.cdc.gov', query: a.query }
    } catch (e) {
      lastErr = e
      if (!(e instanceof HttpError && e.status === 400)) break
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function loadRegional(id: RegionalId, log: Logger): Promise<Loaded> {
  const wanted = /^(national|region 5)$/i
  const res = await loadCdcRows(id, { where: "level in('National','Region 5')" }, (r) => wanted.test((r.level ?? '').trim()), log)
  return { rows: res.rows, via: res.via, updatedAt: res.updatedAt }
}

async function loadSeuz(): Promise<Loaded> {
  const rows = await socrataQuery<Record<string, unknown>>('seuz-s2cv', {})
  if (!rows.length) throw new Error('no rows returned')
  return { rows: rows.map(stringify), via: 'data.cdc.gov' }
}

/** Error text including the network cause (undici reports only "fetch failed" at the top level). */
function errText(e: unknown): string {
  if (!(e instanceof Error)) return String(e)
  const cause = (e as Error & { cause?: unknown }).cause
  const c = cause instanceof Error ? cause.message : cause ? String(cause) : ''
  return c && !e.message.includes(c) ? `${e.message} (${c})` : e.message
}

function stringify(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return out
}

interface Built {
  series: Series
  latest?: Obs
}

function buildSeries(
  dataset: string,
  geo: GeoKey,
  pathogen: PathogenId,
  weeks: Map<string, Obs> | undefined,
  ctx: SourceContext,
  from: string,
  movingAverage: boolean,
): Built | null {
  const points = toPoints(weeks, ctx.historyStart)
  if (!points.some(([, v]) => v != null)) return null
  const latest = latestObs(weeks)
  const name = NAME[pathogen] ?? pathogen
  const lab =
    from === 'seuz-s2cv'
      ? `CDC's national respiratory virus surveillance (data.cdc.gov ${from})`
      : `NREVSS laboratories in ${WHERE[geo]}`
  const method = movingAverage
    ? 'Values are CDC’s centered 3-week moving average (the latest week averages only the current and previous week).'
    : 'Weekly percent of NAAT (PCR) tests positive.'
  const extra =
    pathogen === 'influenza'
      ? ' CDC publishes influenza positivity on data.cdc.gov for the U.S. only (no HHS-region or state series).'
      : geo === 'HHS5'
        ? ' Regional figure pools six states; it is not Minnesota-specific.'
        : ''
  const series = makeSeries({
    source: SOURCE,
    dataset,
    pathogen,
    metric: 'test_positivity',
    geo: GEOS[geo],
    label: `${name} — % of lab tests positive (${geo === 'HHS5' ? 'HHS Region 5' : geo === 'US' ? 'U.S.' : 'Minnesota'}${movingAverage ? ', 3-wk avg' : ''})`,
    points,
    // NREVSS: "Reporting is less complete for the past 1 week."
    provisionalFrom: latest?.week,
    note: `Share of tests positive at ${lab}. ${method}${extra} ${NOT_PREVALENCE}`,
  })
  const attrs: Record<string, string> = { dataset: from, method: movingAverage ? 'centered 3-week moving average' : 'weekly % positive' }
  if (latest?.posted) attrs.posted = latest.posted.slice(0, 10)
  if (geo === 'MN' && latest) attrs.field = latest.field
  if (latest?.tests != null) attrs.tests = `${Math.round(latest.tests).toLocaleString('en-US')} tests in week ending ${latest.week}`
  attrs.link = DATASET_LINK[from] ?? ''
  series.attrs = attrs
  return { series, latest }
}

async function loadPrevious(ctx: SourceContext, dataset: string): Promise<Series[]> {
  try {
    const file = path.join(ctx.rootDir, 'public', 'data', 'series', `${SOURCE}__${dataset}.json`)
    const json = JSON.parse(await readFile(file, 'utf8')) as { series?: Series[] }
    return Array.isArray(json.series) ? json.series : []
  } catch {
    return []
  }
}

function summarizeDiag(d: ParseDiag) {
  return { ...d, levels: Object.keys(d.levels).length > 12 ? `${Object.keys(d.levels).length} distinct` : d.levels }
}

export const cdcNrevss: SourceModule = {
  meta: {
    id: SOURCE,
    name: 'CDC NREVSS lab test positivity (HHS Region 5)',
    publisher: 'CDC — National Respiratory and Enteric Virus Surveillance System (NREVSS)',
    url: 'https://www.cdc.gov/nrevss/php/dashboard/index.html',
    description:
      'Each week, about 450 hospital, commercial and public-health laboratories report how many PCR (NAAT) tests they ran for respiratory viruses and how many were positive. This shows the percent positive for RSV, COVID-19, human metapneumovirus (hMPV), adenovirus, parainfluenza, rhinovirus/enterovirus and seasonal coronaviruses in HHS Region 5 (Minnesota, Wisconsin, Illinois, Indiana, Michigan and Ohio) and nationally, plus national flu positivity — the closest public counterpart to a multi-virus respiratory panel. It shows which viruses are circulating and whether they are rising or falling. It does NOT measure how many people are infected: it counts tests (not patients) among people who were tested, depends on who gets tested, pools six states rather than Minnesota alone, and has no regional flu data.',
    geography: 'HHS Region 5 (MN, WI, IL, IN, MI, OH); United States',
    cadence: 'Weekly (week ending Saturday; CDC posts updates on Wednesday evenings)',
    attribution: 'CDC National Respiratory and Enteric Virus Surveillance System (NREVSS), data.cdc.gov',
  },
  timeoutMs: 6 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const log = ctx.log
    const errors: string[] = []
    const notes: string[] = []
    const diagnostics: Record<string, unknown> = { historyStart: ctx.historyStart }

    const [rgnmR, rsvR, covR, seuzR] = await Promise.allSettled([
      loadRgnm().then(async (l) => withMeta(l, await loadMeta('rgnm-fkqb'))),
      loadRegional('3cxc-4k8q', log).then(async (l) => withMeta(l, await loadMeta('3cxc-4k8q'))),
      loadRegional('gvsb-yw6g', log).then(async (l) => withMeta(l, await loadMeta('gvsb-yw6g'))),
      loadSeuz().then(async (l) => withMeta(l, await loadMeta('seuz-s2cv'))),
    ])

    const selected: Record<string, Selected> = {}
    const movingAvgRegional: Record<string, boolean> = {}
    const failed = new Set<string>()
    const describe = (id: string, loaded: Loaded, parsed: { diag: ParseDiag }, check: ReturnType<typeof checkColumns>) => {
      if (check.missingRequired.length) {
        log.warn(`${id}: schema drift — expected column(s) missing: ${check.missingRequired.join(', ')} (seen: ${check.columns.join(', ')})`)
      }
      if (check.unexpected.length) log.info(`${id}: new/unrecognized columns: ${check.unexpected.join(', ')}`)
      if (parsed.diag.unmappedPathogens.length) {
        log.warn(`${id}: unmapped pathogen label(s): ${parsed.diag.unmappedPathogens.join(', ')}`)
      }
      const metaMissing = loaded.metaFields ? check.missingRequired.filter((c) => !loaded.metaFields!.includes(c)) : []
      diagnostics[id] = {
        via: loaded.via,
        query: loaded.query,
        updatedAt: loaded.updatedAt,
        columnsSeen: check.columns,
        missingRequired: check.missingRequired,
        missingFromMetadata: metaMissing.length ? metaMissing : undefined,
        unexpectedColumns: check.unexpected.length ? check.unexpected : undefined,
        ...summarizeDiag(parsed.diag),
      }
      log.info(
        `${id}: ${parsed.diag.rows} rows via ${loaded.via}, ${parsed.diag.used} used, ${parsed.diag.vintages} posting(s), latest week ${parsed.diag.latestWeek ?? 'n/a'} (posted ${parsed.diag.latestPosted?.slice(0, 10) ?? 'n/a'})`,
      )
    }

    // rgnm-fkqb (primary, all seven viruses)
    if (rgnmR.status === 'fulfilled') {
      try {
        const parsed = parseRgnm(rgnmR.value.rows)
        describe('rgnm-fkqb', rgnmR.value, parsed, checkColumns(rgnmR.value.rows, RGNM_REQUIRED, RGNM_OPTIONAL))
        selected['rgnm-fkqb'] = selectLatest(parsed.obs)
        if (selected['rgnm-fkqb'].conflicts) {
          log.warn(`rgnm-fkqb: ${selected['rgnm-fkqb'].conflicts} duplicate week/posting rows with different values`)
        }
        if (!parsed.obs.length) throw new Error('no usable National/Region 5 rows')
      } catch (e) {
        failed.add('rgnm-fkqb')
        errors.push(`rgnm-fkqb: ${errText(e)}`)
      }
    } else {
      failed.add('rgnm-fkqb')
      errors.push(`rgnm-fkqb: ${errText(rgnmR.reason)}`)
    }

    // 3cxc-4k8q (RSV) and gvsb-yw6g (SARS-CoV-2): fallbacks + cross-checks
    for (const [id, r] of [['3cxc-4k8q', rsvR], ['gvsb-yw6g', covR]] as const) {
      if (r.status === 'rejected') {
        failed.add(id)
        errors.push(`${id}: ${errText(r.reason)}`)
        continue
      }
      try {
        const layout = REGIONAL_LAYOUTS[id]
        const parsed = parseRegional(id, r.value.rows)
        describe(id, r.value, parsed, checkColumns(r.value.rows, [...layout.required], [...layout.optional]))
        selected[id] = selectLatest(parsed.obs)
        // CDC's column description says whether regional values are 3-week averages; 3cxc-4k8q's does.
        const desc = r.value.descriptions?.[parsed.obs[0]?.field ?? layout.value[0]]
        movingAvgRegional[id] = describesMovingAverage(desc) ?? true
        if (!parsed.obs.length) throw new Error('no usable National/Region 5 rows')
      } catch (e) {
        failed.add(id)
        errors.push(`${id}: ${errText(e)}`)
      }
    }

    // seuz-s2cv (national influenza)
    if (seuzR.status === 'fulfilled') {
      try {
        const parsed = parseSeuz(seuzR.value.rows)
        describe('seuz-s2cv', seuzR.value, parsed, checkColumns(seuzR.value.rows, SEUZ_REQUIRED))
        selected['seuz-s2cv'] = selectLatest(parsed.obs)
        if (selected['seuz-s2cv'].conflicts) {
          log.warn(`seuz-s2cv: ${selected['seuz-s2cv'].conflicts} duplicate pathogen/week rows with different values`)
        }
        if (!parsed.obs.length) throw new Error('no usable rows')
      } catch (e) {
        failed.add('seuz-s2cv')
        errors.push(`seuz-s2cv: ${errText(e)}`)
      }
    } else {
      failed.add('seuz-s2cv')
      errors.push(`seuz-s2cv: ${errText(seuzR.reason)}`)
    }

    // Assemble: rgnm-fkqb first; fallbacks only where rgnm-fkqb produced nothing.
    const region: Series[] = []
    const state: Series[] = []
    const used: Record<string, string> = {}
    const pick = (geo: GeoKey, pathogen: PathogenId, chain: string[]): Built | null => {
      for (const from of chain) {
        const sel = selected[from]
        if (!sel) continue
        const ma = from === 'rgnm-fkqb' ? geo === 'MN' : from === 'seuz-s2cv' ? false : geo === 'HHS5' && movingAvgRegional[from]
        const built = buildSeries(
          geo === 'MN' ? DS_STATE : DS_REGION,
          geo,
          pathogen,
          sel.byGeoPathogen.get(`${geo}|${pathogen}`),
          ctx,
          from,
          !!ma,
        )
        if (built) {
          used[built.series.id] = from
          if (from !== chain[0]) notes.push(`${NAME[pathogen]} (${GEOS[geo].code}) from ${from}`)
          return built
        }
      }
      return null
    }
    for (const geo of ['HHS5', 'US'] as const) {
      for (const p of PATHOGENS) {
        const chain = ['rgnm-fkqb']
        if (p.id === 'rsv') chain.push('3cxc-4k8q')
        if (p.id === 'covid') chain.push('gvsb-yw6g')
        if (geo === 'US' && (p.id === 'rsv' || p.id === 'covid')) chain.push('seuz-s2cv')
        const b = pick(geo, p.id, chain)
        if (b) region.push(b.series)
      }
    }
    const flu = pick('US', 'influenza', ['seuz-s2cv'])
    if (flu) region.push(flu.series)
    // Minnesota state rows (RSV, SARS-CoV-2), published by CDC for the prior two years only.
    for (const p of ['rsv', 'covid'] as const) {
      const b = pick('MN', p, ['rgnm-fkqb'])
      if (b) state.push(b.series)
    }
    diagnostics.minnesotaStateRows = state.length
      ? state.map((s) => `${s.id} (${s.points.length} weeks)`)
      : selected['rgnm-fkqb']
        ? 'none — rgnm-fkqb returned no Minnesota state rows'
        : 'not checked (rgnm-fkqb unavailable)'

    // Cross-check national values that two CDC datasets both publish (detects silent field/meaning changes).
    const crossChecks: Record<string, unknown>[] = []
    for (const [pathogen, others] of [['rsv', ['3cxc-4k8q', 'seuz-s2cv']], ['covid', ['gvsb-yw6g', 'seuz-s2cv']]] as const) {
      const a = selected['rgnm-fkqb']?.byGeoPathogen.get(`US|${pathogen}`)
      const la = latestObs(a)
      if (!a || !la) continue
      for (const other of others) {
        const b = selected[other]?.byGeoPathogen.get(`US|${pathogen}`)
        const ob = b?.get(la.week)
        if (!ob || ob.value == null || la.value == null) continue
        const diff = Math.round((ob.value - la.value) * 100) / 100
        crossChecks.push({ pathogen, week: la.week, 'rgnm-fkqb': la.value, [other]: ob.value, diff })
        if (Math.abs(diff) > 0.5) log.warn(`national ${pathogen} ${la.week}: rgnm-fkqb ${la.value}% vs ${other} ${ob.value}% — check field definitions`)
      }
    }
    diagnostics.crossChecks = crossChecks

    // If a sub-dataset failed, keep the previous run's series that this run could not rebuild, so a
    // data.cdc.gov outage (when only the RSV mirror works) does not wipe the other viruses from the file.
    const carried: string[] = []
    if (failed.size) {
      for (const [dataset, list] of [[DS_REGION, region], [DS_STATE, state]] as const) {
        const have = new Set(list.map((s) => s.id))
        for (const prev of await loadPrevious(ctx, dataset)) {
          // Only series that came from a dataset that failed this run (others were legitimately rebuilt or dropped).
          if (have.has(prev.id) || !prev.points?.length || !failed.has(prev.attrs?.dataset ?? '')) continue
          const kept: Series = { ...prev, points: since(prev.points, ctx.historyStart) }
          kept.attrs = { ...(prev.attrs ?? {}), refresh: `kept from previous run (${[...failed].join(', ')} unavailable)` }
          list.push(kept)
          carried.push(prev.id)
        }
      }
      if (carried.length) notes.push(`${carried.length} series kept from the previous run`)
    }
    diagnostics.carriedForward = carried
    diagnostics.seriesSource = used
    diagnostics.latest = Object.fromEntries([...region, ...state].map((s) => [s.id, latestDate([s]) ?? null]))

    for (const err of errors) log.warn(err)
    const message = [
      errors.length ? `Partial refresh: ${errors.join('; ')}` : '',
      notes.length ? `Fallbacks: ${notes.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join(' — ')
    return {
      datasets: [
        { source: SOURCE, dataset: DS_REGION, series: region },
        { source: SOURCE, dataset: DS_STATE, series: state },
      ],
      message: message || undefined,
      diagnostics,
    }
  },
}
