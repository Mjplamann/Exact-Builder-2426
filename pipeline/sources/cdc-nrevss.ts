// CDC NREVSS — laboratory test positivity for respiratory viruses, HHS Region 5 and the U.S.
//
// The National Respiratory and Enteric Virus Surveillance System collects weekly counts of NAAT (PCR) tests
// and positives from ~450 clinical, public-health and commercial laboratories. Minnesota is in HHS Region 5
// with IL, IN, MI, OH and WI; CDC publishes the multi-virus data for the nation and the 10 HHS regions.
// It is the closest public analogue to a multiplex respiratory-panel picture (BioFire), minus influenza.
//
//   rgnm-fkqb  weekly % positive for RSV, SARS-CoV-2, hMPV, adenovirus, PIV, RV/EV, HCoV (primary; CI-only)
//   3cxc-4k8q  RSV by HHS region (fallback; PopHIVE GitHub mirror available)
//   gvsb-yw6g  SARS-CoV-2 by HHS region (fallback; CI-only)
//   seuz-s2cv  national % positive for influenza (+ COVID-19/RSV as a last-resort fallback; CI-only)
//
// Regional values in 3cxc-4k8q/gvsb-yw6g are centered 3-week moving averages, whereas rgnm-fkqb carries the
// weekly percent, so the fallbacks are only used when rgnm-fkqb has nothing (or is >= 2 weeks behind) for that
// virus and place, and a 3-week-average series always gets its own id (variant ':3wma') so one id never
// changes meaning between runs. Minnesota state rows in rgnm-fkqb (RSV/SARS-CoV-2 per a third-party catalog;
// encoding and time span UNVERIFIED) are emitted only if present.
// NREVSS publishes no activity categories or trend labels, so no `official` classification is attached.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { GeoRef, PathogenId, Series } from '../../shared/types.ts'
import { addDays } from '../../shared/mmwr.ts'
import { HttpError } from '../lib/http.ts'
import { latestDate, makeSeries, since, STATE_GEO } from '../lib/series.ts'
import type { Logger } from '../lib/log.ts'
import type { SourceContext, SourceModule, SourceResult } from '../types.ts'
import { errText, liveOrMirror, loadMeta, sodaRows, type SocrataView } from '../lib/cdc-nrevss-fetch.ts'
import {
  checkColumns, describesMovingAverage, geoKeyOf, HHS5_GEO, latestObs, parseRegional, parseRgnm, parseSeuz,
  REGIONAL_LAYOUTS, RGNM_OPTIONAL, RGNM_REQUIRED, SEUZ_REQUIRED, selectLatest, toPoints, US_GEO,
  type GeoKey, type Obs, type ParseDiag, type RegionalId, type Selected,
} from '../lib/cdc-nrevss-parse.ts'

const SOURCE = 'cdc-nrevss'
const DS_REGION = 'nrevss-region5'
const DS_STATE = 'nrevss-state'

const GEOS: Record<GeoKey, GeoRef> = { HHS5: HHS5_GEO, US: US_GEO, MN: STATE_GEO }
/** Id variant for series whose values are CDC's centered 3-week moving average. */
const MA_VARIANT = '3wma'
/** A later source in a fallback chain replaces an earlier one only when it is at least this much fresher. */
const FRESHER_BY_DAYS = 14
/** Previous-run series older than this are no longer carried forward. */
const CARRY_MAX_AGE_DAYS = 365
const WHERE: Record<GeoKey, string> = {
  HHS5: 'HHS Region 5 (MN, WI, IL, IN, MI, OH)',
  US: 'the United States',
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

function withMeta(loaded: Loaded, meta: SocrataView | null | undefined): Loaded {
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

/** SoQL for National + Region 5 rows (also tolerates 'HHS Region 5' / 'Region 05'; parsing re-filters). */
const LEVEL_WHERE = "level in('National','Region 5') OR level like '%Region%5'"

/**
 * rgnm-fkqb: National + Region 5 rows of every subtype (component rows are dropped in code, so a renamed
 * 'Combined Type' label cannot silently remove PIV/HCoV server-side), plus Minnesota state rows if present.
 */
async function loadRgnm(): Promise<Loaded> {
  const attempts: { query: string; where: string }[] = [
    {
      query: 'national+region5+MN, all subtypes',
      where: `${LEVEL_WHERE} OR state in('Minnesota','MN','27') OR level in('Minnesota','MN')`,
    },
    // If CDC renames/drops `state` the query 400s; fall back to levels only and filter in code.
    { query: 'national+region5 (fallback query)', where: "level in('National','Region 5')" },
  ]
  let lastErr: unknown
  for (const a of attempts) {
    try {
      const rows = await sodaRows('rgnm-fkqb', a.where)
      if (!rows.length) throw new Error('no rows returned')
      return { rows, via: 'data.cdc.gov', query: a.query }
    } catch (e) {
      lastErr = e
      if (!(e instanceof HttpError && e.status === 400)) break
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function loadRegional(id: RegionalId, log: Logger): Promise<Loaded> {
  const wanted = (r: Record<string, string>) => {
    const g = geoKeyOf(r.level)
    return g === 'HHS5' || g === 'US'
  }
  const res = await liveOrMirror(id, LEVEL_WHERE, wanted, log)
  return withMeta({ rows: res.rows, via: res.via }, res.meta ?? (await loadMeta(id)))
}

async function loadSeuz(): Promise<Loaded> {
  const rows = await sodaRows('seuz-s2cv')
  if (!rows.length) throw new Error('no rows returned')
  return { rows, via: 'data.cdc.gov' }
}

const seriesId = (dataset: string, geo: GeoKey, pathogen: PathogenId, variant?: string) =>
  [SOURCE, dataset, pathogen, 'test_positivity', GEOS[geo].type, GEOS[geo].code, variant].filter(Boolean).join(':')

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
    : from === 'seuz-s2cv'
      ? 'Weekly percent of tests positive.'
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
    // CDC (3cxc-4k8q metadata): "Reporting is less complete for the most recent weeks, but relatively complete
    // (>90%) for the period up to 2 weeks earlier." The last two weeks are provisional; for centered 3-week
    // averages the second-newest value also changes once the following week arrives.
    provisionalFrom: latest ? addDays(latest.week, -7) : undefined,
    note: `Share of tests positive at ${lab}. ${method}${extra} ${NOT_PREVALENCE}`,
    variant: movingAverage ? MA_VARIANT : undefined,
  })
  const attrs: Record<string, string> = { dataset: from, method: movingAverage ? 'centered 3-week moving average' : 'weekly % positive' }
  if (latest?.posted) attrs.posted = latest.posted.slice(0, 10)
  if (latest && geo === 'MN') attrs.field = latest.field
  if (latest?.tests != null) {
    const n = Math.round(latest.tests).toLocaleString('en-US')
    attrs.tests = movingAverage
      ? `~${n} tests/week (3-week average) around ${latest.week}`
      : `${n} tests in week ending ${latest.week}`
  }
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
  // data.cdc.gov fetches are bounded (~3 min worst case each, in parallel) so the mirror is reached in time.
  timeoutMs: 10 * 60_000,
  async run(ctx): Promise<SourceResult> {
    const log = ctx.log
    const errors: string[] = []
    const notes: string[] = []
    const diagnostics: Record<string, unknown> = { historyStart: ctx.historyStart }

    const [rgnmR, rsvR, covR, seuzR] = await Promise.allSettled([
      loadRgnm().then(async (l) => withMeta(l, await loadMeta('rgnm-fkqb'))),
      loadRegional('3cxc-4k8q', log),
      loadRegional('gvsb-yw6g', log),
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
        if (!parsed.diag.geos?.HHS5) {
          log.warn(`rgnm-fkqb: no Region 5 rows (levels seen: ${Object.keys(parsed.diag.levels).slice(0, 12).join(', ')})`)
        }
        if (parsed.diag.componentOnly) {
          const list = Object.entries(parsed.diag.componentOnly).map(([p, subs]) => `${p} [${subs.join(', ')}]`)
          log.warn(`rgnm-fkqb: only component-subtype rows (no NULL or combined aggregate) for ${list.join('; ')} — has CDC renamed 'Combined Type'?`)
        }
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

    // Assemble. Each chain lists sources best first; a later source replaces an earlier one only when the
    // earlier has nothing for that virus/place or its latest week is >= 2 weeks behind (frozen or lagging).
    const region: Series[] = []
    const state: Series[] = []
    const used: Record<string, string> = {}
    const staleSwitches: string[] = []
    const build = (geo: GeoKey, pathogen: PathogenId, from: string): Built | null => {
      const sel = selected[from]
      if (!sel) return null
      const weeks = sel.byGeoPathogen.get(`${geo}|${pathogen}`)
      // rgnm-fkqb: Minnesota series use one field throughout (see parseRgnm); 3cxc/gvsb: regional rows only.
      const ma =
        from === 'rgnm-fkqb'
          ? latestObs(weeks)?.field === 'percent_pos_3wma'
          : from !== 'seuz-s2cv' && geo === 'HHS5' && !!movingAvgRegional[from]
      return buildSeries(geo === 'MN' ? DS_STATE : DS_REGION, geo, pathogen, weeks, ctx, from, ma)
    }
    const pick = (geo: GeoKey, pathogen: PathogenId, chain: string[]): Series[] => {
      const cands: { from: string; built: Built }[] = []
      for (const from of chain) {
        const built = build(geo, pathogen, from)
        if (built) cands.push({ from, built })
      }
      if (!cands.length) return []
      let chosen = cands[0]
      for (const c of cands.slice(1)) {
        const a = chosen.built.latest?.week
        const b = c.built.latest?.week
        if (a && b && b >= addDays(a, FRESHER_BY_DAYS)) {
          staleSwitches.push(`${NAME[pathogen]} (${GEOS[geo].code}): ${chosen.from} latest week ${a} is 2+ weeks behind ${c.from} (${b})`)
          chosen = c
        }
      }
      const out = [chosen.built.series]
      if (chosen.from !== chain[0]) {
        const ma = chosen.built.series.id.endsWith(`:${MA_VARIANT}`)
        notes.push(`${NAME[pathogen]} (${GEOS[geo].code}) from ${chosen.from}${ma ? ' as a separate 3-wk-avg series' : ''}`)
      }
      // A stale primary kept under a different id (the fallback is a 3-week-average variant) is still real
      // data from this run, so publish it too; the analysis prefers the fresher of the two.
      const primary = cands[0]
      if (primary !== chosen && primary.built.series.id !== chosen.built.series.id) out.push(primary.built.series)
      for (const s of out) used[s.id] = s.attrs?.dataset ?? ''
      return out
    }
    for (const geo of ['HHS5', 'US'] as const) {
      for (const p of PATHOGENS) {
        const chain = ['rgnm-fkqb']
        if (p.id === 'rsv') chain.push('3cxc-4k8q')
        if (p.id === 'covid') chain.push('gvsb-yw6g')
        if (geo === 'US' && (p.id === 'rsv' || p.id === 'covid')) chain.push('seuz-s2cv')
        region.push(...pick(geo, p.id, chain))
      }
    }
    region.push(...pick('US', 'influenza', ['seuz-s2cv']))
    // Minnesota state rows (RSV, SARS-CoV-2 per a third-party catalog; unverified), only if rgnm-fkqb has them.
    for (const p of ['rsv', 'covid'] as const) state.push(...pick('MN', p, ['rgnm-fkqb']))
    for (const w of staleSwitches) log.warn(`stale source skipped — ${w}`)
    if (staleSwitches.length) notes.push(...staleSwitches.map((w) => `stale source skipped: ${w}`))
    diagnostics.minnesotaStateRows = state.length
      ? state.map((s) => `${s.id} (${s.points.length} weeks)`)
      : selected['rgnm-fkqb']
        ? 'none — rgnm-fkqb returned no Minnesota state rows'
        : 'not checked (rgnm-fkqb unavailable)'

    // Completeness: every expected weekly series must be built unless its primary dataset failed outright
    // (that failure is already reported). A dataset that loads but lacks a virus/place is reported here.
    const expected = new Map<string, { label: string; primary: string }>()
    for (const geo of ['HHS5', 'US'] as const) {
      for (const p of PATHOGENS) expected.set(seriesId(DS_REGION, geo, p.id), { label: `${p.name} (${GEOS[geo].code})`, primary: 'rgnm-fkqb' })
    }
    expected.set(seriesId(DS_REGION, 'US', 'influenza'), { label: 'Flu (US)', primary: 'seuz-s2cv' })
    const built = new Set([...region, ...state].map((s) => s.id))
    const missing = [...expected].filter(([id]) => !built.has(id))
    const unexplained = new Map<string, string[]>()
    for (const [, e] of missing) {
      if (failed.has(e.primary)) continue
      unexplained.set(e.primary, [...(unexplained.get(e.primary) ?? []), e.label])
    }
    for (const [ds, labels] of unexplained) errors.push(`${ds} loaded but had no current data for ${labels.join(', ')}`)
    diagnostics.missingExpected = missing.map(([id]) => id)

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

    // Keep previous-run series this run could not rebuild, so an outage or a dataset that silently drops a
    // virus/place does not wipe it: series from a dataset that failed, expected series that went missing, and
    // rgnm-fkqb series (incl. Minnesota rows) no longer returned. Not carried: fallback variants whose weekly
    // series is back, unrelated old ids, and anything whose last value is more than a year old.
    const carried: string[] = []
    const oldest = addDays(ctx.now.slice(0, 10), -CARRY_MAX_AGE_DAYS)
    for (const [dataset, list] of [[DS_REGION, region], [DS_STATE, state]] as const) {
      const have = new Set(list.map((s) => s.id))
      for (const prev of await loadPrevious(ctx, dataset)) {
        if (have.has(prev.id) || !prev.points?.length) continue
        const src = prev.attrs?.dataset ?? ''
        if (!failed.has(src) && !expected.has(prev.id) && src !== 'rgnm-fkqb') continue
        if (prev.id.endsWith(`:${MA_VARIANT}`) && have.has(prev.id.slice(0, -MA_VARIANT.length - 1))) continue
        const last = latestDate([prev])
        if (!last || last < oldest) continue
        const kept: Series = { ...prev, points: since(prev.points, ctx.historyStart) }
        const why = failed.has(src) ? `${src} unavailable` : `${src || 'its source'} returned no data for it`
        kept.attrs = { ...(prev.attrs ?? {}), refresh: `kept from previous run (${why})` }
        list.push(kept)
        carried.push(prev.id)
      }
    }
    if (carried.length) notes.push(`${carried.length} series kept from the previous run`)
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
