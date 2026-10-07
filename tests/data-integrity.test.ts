// Checks the published data in public/data (as committed by the refresh workflow) for internal
// consistency: everything pulse.json and forecasts.json point at must be in a series file the
// manifest lists, and no observation may be dated in the future.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ForecastFile, Manifest, PulseFile, SeriesFile } from '../shared/types'
import { unpublishedSeriesIds } from '../pipeline/analysis/index.ts'

const DATA = path.resolve(__dirname, '..', 'public', 'data')
const has = existsSync(path.join(DATA, 'manifest.json')) && existsSync(path.join(DATA, 'pulse.json'))
const read = <T,>(rel: string) => JSON.parse(readFileSync(path.join(DATA, rel), 'utf8')) as T

describe.skipIf(!has)('published data', () => {
  const manifest = has ? read<Manifest>('manifest.json') : ({ files: [], sources: [] } as unknown as Manifest)
  const files = manifest.files.map((f) => read<SeriesFile>(f.path))
  const ids = new Set(files.flatMap((f) => f.series.map((s) => s.id)))

  it('publishes every series the pulse and forecasts reference', () => {
    const pulse = read<PulseFile>('pulse.json')
    const forecasts = read<ForecastFile>('forecasts.json').forecasts
    expect(unpublishedSeriesIds(pulse, forecasts, ids)).toEqual([])
  })
  it('lists only files that exist, once each', () => {
    const paths = manifest.files.map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of paths) expect(existsSync(path.join(DATA, p))).toBe(true)
  })
  it('has no observations dated more than a week after the data was generated', () => {
    const limit = new Date(new Date(manifest.generatedAt).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)
    const late = files.flatMap((f) => f.series.filter((s) => s.points.some(([d]) => d > limit)).map((s) => s.id))
    expect(late).toEqual([])
  })
})
