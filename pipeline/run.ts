// MN Pulse data pipeline orchestrator.
//
//   npm run pipeline                # fetch all enabled sources, rebuild analytics
//   npm run pipeline -- --only=cdc-hubs,cdc-nssp
//   npm run pipeline -- --analysis-only   # recompute pulse/forecasts from existing data
//
// Each source runs in isolation with a timeout. A failing source never wipes data: its previous
// files in public/data/series/ are kept and its status is marked "stale"/"error" with the reason,
// so the dashboard can show exactly how fresh every number is.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Forecast, ForecastFile, Manifest, Series, SeriesFile, SourceStatus } from '../shared/types.ts'
import { addDays, toISODate } from '../shared/mmwr.ts'
import { createLogger } from './lib/log.ts'
import { dropFuturePoints, latestDate } from './lib/series.ts'
import type { SourceContext, SourceModule } from './types.ts'
import { SOURCES } from './sources/index.ts'
import { derivedFiles, isCumulative, runAnalysis, unpublishedSeriesIds } from './analysis/index.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const SERIES_DIR = path.join(DATA_DIR, 'series')
const DIAG_DIR = path.join(DATA_DIR, 'diagnostics')
const CACHE_DIR = path.join(ROOT, 'pipeline', '.cache')
/** Keep ~5 seasons of weekly history for baselines and projections. */
const HISTORY_YEARS = 5
/** A source whose newest data is older than this is flagged stale. */
const STALE_DAYS = 21
/** Source forecasts kept from an earlier run are dropped once their reference date is this old. */
const MAX_FORECAST_AGE_DAYS = 21

const args = process.argv.slice(2)
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',')
const analysisOnly = args.includes('--analysis-only')
const log = createLogger()

function seriesFileName(source: string, dataset: string) {
  return `${source}__${dataset}.json`
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(data) + '\n')
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

/** Newest observation among series that are weekly measures (cumulative year-to-date snapshots excluded). */
function latestWeekly(series: Series[]): string | undefined {
  return latestDate(series.filter((s) => !isCumulative(s)))
}

interface LoadedFile {
  name: string
  file: SeriesFile
}

async function loadSeriesFiles(): Promise<LoadedFile[]> {
  if (!existsSync(SERIES_DIR)) return []
  const out: LoadedFile[] = []
  for (const name of (await readdir(SERIES_DIR)).filter((f) => f.endsWith('.json')).sort()) {
    const sf = await readJson<SeriesFile>(path.join(SERIES_DIR, name))
    if (sf?.series) out.push({ name, file: sf })
  }
  return out
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function runSource(
  mod: SourceModule,
  ctx: SourceContext,
  prev: SourceStatus | undefined,
): Promise<{ status: SourceStatus; forecasts: Forecast[] | null }> {
  const now = ctx.now
  const base: SourceStatus = {
    ...mod.meta,
    state: 'pending',
    seriesCount: prev?.seriesCount ?? 0,
    datasets: prev?.datasets ?? [],
    lastSuccess: prev?.lastSuccess,
    latestData: prev?.latestData,
    lastAttempt: now,
  }
  if (mod.enabled === false) {
    return { status: { ...base, state: 'disabled', message: prev?.message ?? 'Not enabled' }, forecasts: null }
  }
  const slog = log.child(mod.meta.id)
  const started = Date.now()
  try {
    const result = await withTimeout(mod.run({ ...ctx, log: slog }), mod.timeoutMs ?? 10 * 60_000, mod.meta.id)
    for (const ds of result.datasets) dropFuturePoints(ds.series, now, `${mod.meta.id}/${ds.dataset}`, slog)
    const nonEmpty = result.datasets.filter((d) => d.series.some((s) => s.points.length > 0))
    if (nonEmpty.length === 0 && result.awaiting) {
      slog.info(`awaiting data: ${result.message ?? ''}`)
      return { status: { ...base, state: 'pending', message: result.message }, forecasts: [] }
    }
    if (nonEmpty.length === 0) throw new Error(result.message ?? 'Source returned no data')
    for (const ds of nonEmpty) {
      const target = path.join(SERIES_DIR, seriesFileName(ds.source, ds.dataset))
      // Leave the file untouched when the data did not change, so refreshes only commit real updates.
      const prevFile = await readJson<SeriesFile>(target)
      if (prevFile && JSON.stringify(prevFile.series) === JSON.stringify(ds.series)) continue
      const file: SeriesFile = { ...ds, generatedAt: now }
      await writeJson(target, file)
    }
    if (result.diagnostics) await writeJson(path.join(DIAG_DIR, `${mod.meta.id}.json`), result.diagnostics)
    // A dataset the module still produces but that came back empty this run (e.g. one endpoint failed)
    // keeps its previous file; a dataset the module no longer returns at all is retired.
    const kept = result.datasets
      .filter((d) => !nonEmpty.includes(d) && (prev?.datasets ?? []).includes(d.dataset))
      .map((d) => d.dataset)
    if (kept.length) slog.info(`keeping previous file(s) for ${kept.join(', ')} (no new data this run)`)
    const all = nonEmpty.flatMap((d) => d.series)
    // Year-to-date snapshots are dated by their report, not by the week measured: they must not
    // make a source look fresher than its weekly data.
    const observed = latestWeekly(all)
    const newest = result.latestData && (!observed || result.latestData > observed) ? result.latestData : observed
    const stale = !!newest && newest < addDays(now.slice(0, 10), -STALE_DAYS)
    slog.info(
      `ok: ${nonEmpty.length} dataset(s), ${all.length} series, latest ${newest ?? 'n/a'} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
    )
    return {
      status: {
        ...base,
        state: stale ? 'stale' : 'ok',
        lastSuccess: now,
        latestData: newest,
        seriesCount: all.length,
        datasets: [...nonEmpty.map((d) => d.dataset), ...kept],
        message: stale ? `Newest data is from ${newest}. ${result.message ?? ''}`.trim() : result.message,
      },
      forecasts: result.forecasts ?? [],
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    slog.error(msg)
    return {
      status: {
        ...base,
        state: prev?.lastSuccess ? 'stale' : 'error',
        message: `Last refresh failed: ${msg}${prev?.lastSuccess ? ` — showing data from ${prev.lastSuccess.slice(0, 10)}` : ''}`,
      },
      forecasts: null,
    }
  }
}

async function main() {
  const now = new Date().toISOString()
  const historyStart = toISODate(new Date(Date.UTC(new Date().getUTCFullYear() - HISTORY_YEARS, 6, 1)))
  await mkdir(SERIES_DIR, { recursive: true })
  await mkdir(CACHE_DIR, { recursive: true })

  const prevManifest = await readJson<Manifest>(path.join(DATA_DIR, 'manifest.json'))
  const prevStatus = new Map(prevManifest?.sources.map((s) => [s.id, s]) ?? [])
  const prevForecasts = (await readJson<ForecastFile>(path.join(DATA_DIR, 'forecasts.json')))?.forecasts ?? []
  const forecastCutoff = addDays(now.slice(0, 10), -MAX_FORECAST_AGE_DAYS)
  /** Previous source forecasts for a module, minus any that are too old to describe the coming weeks. */
  const keptForecasts = (id: string) => {
    const kept = prevForecasts.filter((f) => f.source !== 'mn-pulse' && sourceOf(f) === id)
    const fresh = kept.filter((f) => f.referenceDate >= forecastCutoff)
    if (fresh.length < kept.length) log.info(`${id}: dropped ${kept.length - fresh.length} kept forecast(s) with reference dates before ${forecastCutoff}`)
    return fresh
  }

  const ctx: SourceContext = { now, log, historyStart, cacheDir: CACHE_DIR, rootDir: ROOT }
  const statuses: SourceStatus[] = []
  const sourceForecasts: Forecast[] = []
  /** Sources whose status was carried over without running (analysis-only or not selected). */
  const carried = new Set<string>()

  for (const mod of SOURCES) {
    const prev = prevStatus.get(mod.meta.id)
    if (analysisOnly || (only && !only.includes(mod.meta.id))) {
      const kept = prev ?? { ...mod.meta, state: 'pending' as const, seriesCount: 0, datasets: [] }
      statuses.push({ ...kept, ...mod.meta })
      carried.add(mod.meta.id)
      sourceForecasts.push(...keptForecasts(mod.meta.id))
      continue
    }
    const { status, forecasts } = await runSource(mod, ctx, prev)
    statuses.push(status)
    // Keep previous forecasts from a source whose refresh failed.
    sourceForecasts.push(...(forecasts ?? keptForecasts(mod.meta.id)))
  }

  // Only files a source status lists are analysed and published; anything else in the directory is a
  // leftover (renamed or retired dataset) and is reported instead of silently shown.
  const expected = new Set(statuses.flatMap((s) => s.datasets.map((d) => seriesFileName(s.id, d))))
  const loaded = await loadSeriesFiles()
  const inputs: LoadedFile[] = []
  for (const f of loaded) {
    if (f.file.derived) continue
    if (!expected.has(f.name)) {
      log.warn(`series/${f.name} is not listed by any source status; left out of the analysis and the manifest`)
      continue
    }
    inputs.push(f)
  }
  const seriesFiles = inputs.map((f) => f.file)
  for (const f of seriesFiles) dropFuturePoints(f.series, now, `series/${seriesFileName(f.source, f.dataset)}`, log)

  // Freshness of carried-over statuses: recompute from the files so year-to-date snapshots never count.
  for (const st of statuses) {
    if (!carried.has(st.id) || !st.latestData) continue
    const own = seriesFiles.filter((f) => f.source === st.id).flatMap((f) => f.series)
    if (!own.some((s) => isCumulative(s))) continue
    const weekly = latestWeekly(own)
    if (weekly && weekly < st.latestData) {
      log.info(`${st.id}: latest weekly data ${weekly} (was ${st.latestData}, set by a year-to-date snapshot)`)
      st.latestData = weekly
    }
  }

  log.info(`analysis: ${seriesFiles.length} dataset files, ${seriesFiles.reduce((n, f) => n + f.series.length, 0)} series`)
  const alog = log.child('analysis')
  const { pulse, forecasts, derived, diagnostics } = runAnalysis(seriesFiles, sourceForecasts, { now, log: alog })

  // Derived series (statewide wastewater rollups) are published as their own files.
  const outFiles = derivedFiles(derived, now)
  const derivedNames = new Set(outFiles.map((f) => seriesFileName(f.source, f.dataset)))
  for (const f of outFiles) {
    const target = path.join(SERIES_DIR, seriesFileName(f.source, f.dataset))
    const prevFile = await readJson<SeriesFile>(target)
    if (prevFile && JSON.stringify(prevFile.series) === JSON.stringify(f.series)) continue
    await writeJson(target, f)
  }
  for (const f of loaded) {
    if (f.file.derived && !derivedNames.has(f.name)) log.warn(`series/${f.name} is a derived file no longer produced; left out of the manifest`)
  }

  const published = [...seriesFiles, ...outFiles]
  const missing = unpublishedSeriesIds(pulse, forecasts, new Set(published.flatMap((f) => f.series.map((s) => s.id))))
  if (missing.length) {
    diagnostics.warnings.push(`${missing.length} series referenced by pulse/forecasts are not in any published file: ${missing.slice(0, 10).join(', ')}`)
  }
  for (const w of diagnostics.warnings) alog.warn(w)

  await writeJson(path.join(DATA_DIR, 'pulse.json'), pulse)
  await writeJson(path.join(DATA_DIR, 'forecasts.json'), { generatedAt: now, forecasts } satisfies ForecastFile)
  await writeJson(path.join(DIAG_DIR, 'analysis.json'), { generatedAt: now, ...diagnostics, unpublishedSeriesIds: missing })

  const files: Manifest['files'] = []
  for (const sf of published) {
    const rel = `series/${seriesFileName(sf.source, sf.dataset)}`
    files.push({ path: rel, source: sf.source, dataset: sf.dataset, series: sf.series.length, bytes: (await stat(path.join(DATA_DIR, rel))).size })
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1))
  const manifest: Manifest = { generatedAt: now, files, sources: statuses }
  await writeJson(path.join(DATA_DIR, 'manifest.json'), manifest)

  const failed = statuses.filter((s) => s.state === 'error' || s.state === 'stale')
  log.info(
    `done: ${statuses.filter((s) => s.state === 'ok').length} ok, ${failed.length} stale/error, ${statuses.filter((s) => s.state === 'disabled').length} disabled`,
  )
  for (const s of statuses) log.info(`  ${s.state.padEnd(8)} ${s.id.padEnd(16)} latest=${s.latestData ?? '-'} ${s.message ?? ''}`)
  // Exit non-zero only if nothing at all could be produced.
  if (seriesFiles.length === 0) process.exitCode = 1
}

/** Forecast ids are prefixed with their source module id ("cdc-hubs:..."). */
function sourceOf(f: Forecast): string {
  return f.id.split(':')[0]
}

main().catch((e) => {
  log.error(e instanceof Error ? (e.stack ?? e.message) : String(e))
  process.exitCode = 1
})
