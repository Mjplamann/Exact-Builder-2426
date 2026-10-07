// Data access for the published JSON in public/data (produced by the pipeline).
// Files are fetched once per session and cached; series files load lazily on demand.
import { useEffect, useState } from 'react'
import type { ForecastFile, Manifest, PulseFile, Series, SeriesFile } from '../../shared/types'

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

/** Load every series file listed in the manifest (they are small; total is typically < 3 MB). */
export async function loadAllSeries(): Promise<Series[]> {
  const m = await loadManifest()
  const files = await Promise.all(m.files.map((f) => loadSeriesFile(f.path).catch(() => null)))
  return files.flatMap((f) => f?.series ?? [])
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
}

export async function loadDashboard(): Promise<DashboardData> {
  const [manifest, pulse, forecasts, series] = await Promise.all([
    loadManifest(),
    loadPulse(),
    loadForecasts(),
    loadAllSeries(),
  ])
  return { manifest, pulse, forecasts, series }
}
