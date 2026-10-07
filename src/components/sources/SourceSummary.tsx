// Counts of sources by refresh state, plus a short list of anything needing attention.
import type { Manifest, SourceState } from '../../../shared/types'
import { formatDate, formatDateTime } from '../../lib/format'
import { STATE_LABEL, STATE_MEANING, StatusIcon } from './StatusChip'
import { relativeTime } from './SourceCard'

const ORDER: SourceState[] = ['ok', 'stale', 'error', 'pending', 'disabled']

export function SourceSummary({ manifest, onJump }: { manifest: Manifest; onJump: (id: string) => void }) {
  const counts = new Map<SourceState, number>()
  for (const s of manifest.sources) counts.set(s.state, (counts.get(s.state) ?? 0) + 1)
  const series = manifest.files.reduce((n, f) => n + f.series, 0)
  const newest = manifest.sources.map((s) => s.latestData).filter((d): d is string => !!d).sort().at(-1)
  const attention = manifest.sources.filter((s) => s.state === 'error' || s.state === 'stale')
  const shown = ORDER.filter((st) => st === 'ok' || st === 'stale' || st === 'error' || (counts.get(st) ?? 0) > 0)
  return (
    <section aria-labelledby="summary-h" className="mt-6">
      <h2 id="summary-h" className="sr-only">
        Summary
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
        <li className="card p-3.5">
          <p className="text-xs font-medium text-ink-3">Sources</p>
          <p className="mt-1 text-2xl font-semibold text-ink-1">{manifest.sources.length}</p>
        </li>
        {shown.map((st) => (
          <li key={st} className="card p-3.5" title={STATE_MEANING[st]}>
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <StatusIcon state={st} size={14} />
              {STATE_LABEL[st]}
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink-1">{counts.get(st) ?? 0}</p>
          </li>
        ))}
        <li className="card p-3.5">
          <p className="text-xs font-medium text-ink-3">Data series</p>
          <p className="mt-1 text-2xl font-semibold text-ink-1">{series.toLocaleString('en-US')}</p>
          <p className="text-xs text-ink-3">in {manifest.files.length} files</p>
        </li>
      </ul>
      <p className="mt-3 text-sm text-ink-2">
        Pipeline last ran {formatDateTime(manifest.generatedAt)} ({relativeTime(manifest.generatedAt)})
        {newest && <>; newest data cover the week ending {formatDate(newest, true)}</>}.
      </p>
      {attention.length > 0 && (
        <div className="mt-3 rounded-xl border border-[var(--status-warning)] bg-surface-2 p-3 text-sm" role="note">
          <p className="font-semibold text-ink-1">
            {attention.length} source{attention.length === 1 ? ' needs' : 's need'} attention
          </p>
          <ul className="mt-1 space-y-1">
            {attention.map((s) => (
              <li key={s.id} className="flex items-start gap-1.5 text-ink-2">
                <span className="mt-0.5">
                  <StatusIcon state={s.state} size={14} />
                </span>
                <span>
                  <button type="button" onClick={() => onJump(`src-${s.id}`)} className="text-left font-medium text-accent underline underline-offset-2">
                    {s.name}
                  </button>{' '}
                  ({STATE_LABEL[s.state].toLowerCase()}){s.message ? `: ${s.message}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
