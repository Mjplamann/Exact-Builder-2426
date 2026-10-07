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
import type { Forecast, ForecastFile, Manifest, SeriesFile, SourceStatus } from '../shared/types.ts'
import { addDays, toISODate } from '../shared/mmwr.ts'
import { createLogger } from './lib/log.ts'
import { latestDate } from './lib/series.ts'
import type { SourceContext, SourceModule } from './types.ts'
import { SOURCES } from './sources/index.ts'
import { runAnalysis } from './analysis/index.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const SERIES_DIR = path.join(DATA_DIR, 'series')
const DIAG_DIR = path.join(DATA_DIR, 'diagnostics')
const CACHE_DIR = path.join(ROOT, 'pipeline', '.cache')
/** Keep ~5 seasons of weekly history for baselines and projections. */
const HISTORY_YEARS = 5
/** A source whose newest data is older than this is flagged stale. */
const STALE_DAYS = 21

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

async function loadSeriesFiles(): Promise<SeriesFile[]> {
  if (!existsSync(SERIES_DIR)) return []
  const out: SeriesFile[] = []
  for (const f of (await readdir(SERIES_DIR)).filter((f) => f.endsWith('.json')).sort()) {
    const sf = await readJson<SeriesFile>(path.join(SERIES_DIR, f))
    if (sf?.series) out.push(sf)
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
    const nonEmpty = result.datasets.filter((d) => d.series.some((s) => s.points.length > 0))
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
    const all = nonEmpty.flatMap((d) => d.series)
    const newest = latestDate(all)
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
        datasets: nonEmpty.map((d) => d.dataset),
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

  const ctx: SourceContext = { now, log, historyStart, cacheDir: CACHE_DIR, rootDir: ROOT }
  const statuses: SourceStatus[] = []
  const sourceForecasts: Forecast[] = []

  for (const mod of SOURCES) {
    const prev = prevStatus.get(mod.meta.id)
    if (analysisOnly || (only && !only.includes(mod.meta.id))) {
      const kept = prev ?? { ...mod.meta, state: 'pending' as const, seriesCount: 0, datasets: [] }
      statuses.push({ ...kept, ...mod.meta })
      sourceForecasts.push(...prevForecasts.filter((f) => f.source !== 'mn-pulse' && sourceOf(f) === mod.meta.id))
      continue
    }
    const { status, forecasts } = await runSource(mod, ctx, prev)
    statuses.push(status)
    // Keep previous forecasts from a source whose refresh failed.
    sourceForecasts.push(
      ...(forecasts ?? prevForecasts.filter((f) => f.source !== 'mn-pulse' && sourceOf(f) === mod.meta.id)),
    )
  }

  const seriesFiles = await loadSeriesFiles()
  log.info(`analysis: ${seriesFiles.length} dataset files, ${seriesFiles.reduce((n, f) => n + f.series.length, 0)} series`)
  const { pulse, forecasts } = runAnalysis(seriesFiles, sourceForecasts, { now, log: log.child('analysis') })
  await writeJson(path.join(DATA_DIR, 'pulse.json'), pulse)
  await writeJson(path.join(DATA_DIR, 'forecasts.json'), { generatedAt: now, forecasts } satisfies ForecastFile)

  const files: Manifest['files'] = []
  for (const sf of seriesFiles) {
    const rel = `series/${seriesFileName(sf.source, sf.dataset)}`
    files.push({ path: rel, source: sf.source, dataset: sf.dataset, series: sf.series.length, bytes: (await stat(path.join(DATA_DIR, rel))).size })
  }
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
