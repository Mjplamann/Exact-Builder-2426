// Contract between the orchestrator (pipeline/run.ts) and individual source modules.
import type { Forecast, SeriesFile, SourceStatus } from '../shared/types.ts'
import type { Logger } from './lib/log.ts'

export interface SourceContext {
  /** Pipeline run time (ISO datetime). */
  now: string
  log: Logger
  /** Earliest week to keep (history window) — sources may keep less. */
  historyStart: string
  /** Directory for raw downloads/diagnostics (not published). */
  cacheDir: string
  /** Repository root, for reading manual-import files under data/manual/. */
  rootDir: string
}

export interface SourceResult {
  datasets: Omit<SeriesFile, 'generatedAt'>[]
  forecasts?: Forecast[]
  /** Human-readable notes surfaced on the Sources page (e.g. "3 of 4 MDH CSVs parsed"). */
  message?: string
  /** Machine-readable diagnostics written to public/data/diagnostics/<source>.json (schemas, row counts). */
  diagnostics?: Record<string, unknown>
  /**
   * Publication date of the newest data, when it differs from the newest non-null observation
   * (e.g. NNDSS tables whose current-week cells are often blank). Used for freshness checks.
   */
  latestData?: string
  /**
   * True when the source worked but has nothing to publish yet (e.g. awaiting partner data files).
   * The source is then shown as "pending" with its message instead of as an error.
   */
  awaiting?: boolean
}

export type SourceMeta = Pick<
  SourceStatus,
  'id' | 'name' | 'publisher' | 'url' | 'description' | 'geography' | 'cadence' | 'attribution'
>

export interface SourceModule {
  meta: SourceMeta
  /** Disabled sources are listed but not run (e.g. awaiting permission or manual data). */
  enabled?: boolean
  /** Max runtime before the orchestrator gives up on this source. */
  timeoutMs?: number
  run(ctx: SourceContext): Promise<SourceResult>
}
