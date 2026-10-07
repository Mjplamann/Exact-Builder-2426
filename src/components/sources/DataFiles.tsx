// "Use the data": links to the published JSON files and the format conventions.
import type { Manifest } from '../../../shared/types'
import { DATA_CONVENTIONS, REPO_URL } from '../../content/learn'
import { ExternalLink } from '../learn/ExternalLink'
import { Breakable, formatBytes } from './SourceCard'

const BASE = `${import.meta.env.BASE_URL}data/`

const CORE: { path: string; what: string }[] = [
  { path: 'manifest.json', what: 'Every data file, plus each source’s status and freshness' },
  { path: 'pulse.json', what: 'Activity levels, trends, headlines and map layers' },
  { path: 'forecasts.json', what: 'CDC ensemble forecasts and MN Pulse projections, with backtest skill' },
]

export function DataFiles({ manifest }: { manifest: Manifest }) {
  const files = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path))
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface-1">
          {CORE.map((f) => (
            <li key={f.path} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3">
              <a href={`${BASE}${f.path}`} className="font-mono text-sm font-semibold text-accent underline decoration-1 underline-offset-2">
                data/{f.path}
              </a>
              <span className="text-sm text-ink-2">{f.what}</span>
            </li>
          ))}
        </ul>
        <details className="group mt-3 rounded-xl border border-line bg-surface-1">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            <span>
              Weekly series files ({files.length})
            </span>
            <span aria-hidden="true" className="text-ink-3 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          {files.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {files.map((f) => (
                <li key={f.path} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2 text-sm">
                  <a href={`${BASE}${f.path}`} className="min-w-0 font-mono text-accent underline decoration-1 underline-offset-2">
                    <Breakable text={`data/${f.path}`} />
                  </a>
                  <span className="tabular text-xs text-ink-3">
                    {f.series} series · {formatBytes(f.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-3">No series files are published yet.</p>
          )}
        </details>
      </div>
      <div className="min-w-0 rounded-xl border border-line bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-ink-1">Format conventions</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-2">
          {DATA_CONVENTIONS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-2">
          Please credit the original publishers listed above when you reuse the data.{' '}
          <ExternalLink href={`${REPO_URL}/blob/main/shared/types.ts`}>Data format (shared/types.ts)</ExternalLink>
        </p>
      </div>
    </div>
  )
}
