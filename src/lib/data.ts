// Data access for the published JSON in public/data (produced by the pipeline).
// Files are fetched once per session and cached; series files load lazily on demand.
import { useEffect, useState } from 'react'
import type { ForecastFile, Manifest, PulseFile, Series, SeriesFile } from '../../shared/types'
import { dedupeSeries, keyOfSeries } from '../../shared/dedupe'

const BASE = `${import.meta.env.BASE_URL}data/`
const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`${BASE}${path}`, { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${path} (HTTP ${r.status})`)
      return r.json() as Promise<T>
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}

export const loadManifest = () => load<Manifest>('manifest.json')
export const loadPulse = () => load<PulseFile>('pulse.json')
export const loadForecasts = () => load<ForecastFile>('forecasts.json')
export const loadSeriesFile = (path: string) => load<SeriesFile>(path)

export interface SeriesLoad {
  series: Series[]
  /** Paths of series files listed in the manifest that could not be loaded. */
  failed: string[]
}

/** Load every series file listed in the manifest (they are small; total is typically < 3 MB). */
export async function loadAllSeries(): Promise<SeriesLoad> {
  const m = await loadManifest()
  const failed: string[] = []
  const files = await Promise.all(
    m.files.map(async (f) => {
      try {
        const file = await loadSeriesFile(f.path)
        if (!file || !Array.isArray(file.series)) throw new Error('bad shape')
        return file
      } catch {
        failed.push(f.path)
        return null
      }
    }),
  )
  return { series: files.flatMap((f) => f?.series ?? []), failed }
}

/** Drop cached JSON so the next load refetches (used by the "refresh" button). */
export function invalidateData() {
  cache.clear()
}

export interface AsyncState<T> {
  data?: T
  error?: Error
  loading: boolean
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: true })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export interface DashboardData {
  manifest: Manifest
  pulse: PulseFile
  forecasts: ForecastFile
  series: Series[]
  /** Non-fatal problems while loading (missing series or forecast files), in plain language. */
  warnings: string[]
}

const EMPTY_FORECASTS: ForecastFile = { generatedAt: '', forecasts: [] }

/** Friendly error for files that loaded but are not what the app expects (e.g. a half-written deploy). */
class DataShapeError extends Error {
  constructor(file: string) {
    super(`The published data file ${file} is incomplete or in an unexpected format`)
    this.name = 'DataShapeError'
  }
}

/**
 * Drop mirrored copies of the same measure (e.g. CDC NSSP ER visits published both by data.cdc.gov and the
 * CDC forecast hubs) using the same rules as the pipeline, and re-point any forecast attached to a dropped copy
 * at the copy that was kept, so charts never show the same line twice.
 */
function dedupe(series: Series[], forecasts: ForecastFile): { series: Series[]; forecasts: ForecastFile } {
  const kept = dedupeSeries(series)
  if (kept.length === series.length) return { series, forecasts }
  const keptIds = new Set(kept.map((s) => s.id))
  const keptByKey = new Map(kept.map((s) => [keyOfSeries(s), s.id]))
  const remap = new Map<string, string>()
  for (const s of series) {
    if (keptIds.has(s.id)) continue
    const to = keptByKey.get(keyOfSeries(s))
    if (to) remap.set(s.id, to)
  }
  if (!remap.size) return { series: kept, forecasts }
  const has = new Set(forecasts.forecasts.map((f) => `${f.seriesId}|${f.source}|${f.model}`))
  const out = forecasts.forecasts.flatMap((f) => {
    const to = remap.get(f.seriesId)
    if (!to) return [f]
    // The kept series already carries this model's forecast: drop the duplicate.
    if (has.has(`${to}|${f.source}|${f.model}`)) return []
    has.add(`${to}|${f.source}|${f.model}`)
    return [{ ...f, seriesId: to }]
  })
  return { series: kept, forecasts: { ...forecasts, forecasts: out } }
}

export async function loadDashboard(): Promise<DashboardData> {
  const warnings: string[] = []
  // Manifest and pulse are required; forecasts and individual series files are optional extras.
  const [manifest, pulse, rawForecasts, loaded] = await Promise.all([
    loadManifest(),
    loadPulse(),
    loadForecasts().catch(() => {
      warnings.push('Forecasts could not be loaded, so charts show observed data without projections.')
      return EMPTY_FORECASTS
    }),
    // Never rejects for a single bad file (those are reported in `failed`); only a missing manifest fails it.
    loadAllSeries(),
  ])
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.files) || !Array.isArray(manifest.sources)) {
    throw new DataShapeError('manifest.json')
  }
  if (!pulse || typeof pulse !== 'object' || !Array.isArray(pulse.pathogens) || !pulse.statewide) {
    throw new DataShapeError('pulse.json')
  }
  let forecastFile = rawForecasts
  if (!forecastFile || !Array.isArray(forecastFile.forecasts)) {
    warnings.push('Forecasts are in an unexpected format, so charts show observed data without projections.')
    forecastFile = EMPTY_FORECASTS
  }
  if (loaded.failed.length) {
    const n = loaded.failed.length
    warnings.push(`${n} data file${n === 1 ? '' : 's'} could not be loaded; some charts may be missing.`)
  }
  // Older pulse files may lack these arrays; default them so views can map over them safely.
  const safePulse: PulseFile = {
    ...pulse,
    mapLayers: Array.isArray(pulse.mapLayers) ? pulse.mapLayers : [],
    counties: Array.isArray(pulse.counties) ? pulse.counties : [],
    sites: Array.isArray(pulse.sites) ? pulse.sites : [],
  }
  const { series, forecasts } = dedupe(loaded.series, forecastFile)
  return { manifest, pulse: safePulse, forecasts, series, warnings }
}
