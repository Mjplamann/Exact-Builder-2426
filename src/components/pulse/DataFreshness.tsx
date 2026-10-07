// Data freshness: one line when everything is current; chips only for sources that are delayed or failing.
// Sources not yet live ('pending') or paused ('disabled') are left out here (the Sources page lists them).
import type { Manifest, SourceState } from '../../../shared/types'
import { formatDate } from '../../lib/format'
import { useAppState } from '../../lib/state'
import { hrefFor } from './util'

const STATE_TEXT: Record<SourceState, string> = {
  ok: 'Up to date',
  stale: 'Delayed',
  error: 'Not updating',
  disabled: 'Paused',
  pending: 'Coming soon',
}

const STATE_COLOR: Record<SourceState, string> = {
  ok: 'var(--status-good)',
  stale: 'var(--status-warning)',
  error: 'var(--status-critical)',
  disabled: 'var(--muted)',
  pending: 'var(--muted)',
}

/** Status glyph: shape differs per state so meaning never rides on color alone. */
function StatusGlyph({ state }: { state: SourceState }) {
  const c = STATE_COLOR[state]
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      {state === 'ok' && (
        <>
          <circle cx="7" cy="7" r="6" fill={c} />
          <path d="M4 7.2 6 9.2 10 5" fill="none" stroke="var(--surface-1)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {state === 'stale' && (
        <>
          <path d="M7 1.6 12.6 12H1.4Z" fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M7 5.4v3M7 10.2v.1" stroke="var(--ink-1)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {state === 'error' && (
        <>
          <rect x="1" y="1" width="12" height="12" rx="3" fill={c} />
          <path d="m4.5 4.5 5 5m0-5-5 5" stroke="var(--surface-1)" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {(state === 'disabled' || state === 'pending') && <circle cx="7" cy="7" r="5.25" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={state === 'pending' ? '2 2' : undefined} />}
    </svg>
  )
}

export function DataFreshness({ manifest }: { manifest: Manifest }) {
  const { state, go } = useAppState()
  // Sources not live yet ('pending') or switched off on purpose ('disabled') are not counted here.
  const live = manifest.sources.filter((s) => s.state !== 'pending' && s.state !== 'disabled')
  const problems = live
    .filter((s) => s.state === 'stale' || s.state === 'error')
    .sort((a, b) => order(a.state) - order(b.state) || a.name.localeCompare(b.name))
  const ok = live.filter((s) => s.state === 'ok').length
  const sourcesHref = hrefFor(state, 'sources')
  const toSources = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    go('sources')
  }

  return (
    <section className="card px-5 py-4 sm:px-6" aria-labelledby="fresh-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-ink-2">
          <span id="fresh-title" className="font-semibold text-ink-1">
            Data freshness:
          </span>{' '}
          {live.length
            ? `${ok} of ${live.length} source${live.length === 1 ? '' : 's'} up to date · checked ${centralDate(manifest.generatedAt)}`
            : 'No sources have reported yet.'}
        </p>
        <a href={sourcesHref} onClick={toSources} className="inline-block py-1 text-sm font-medium text-accent underline-offset-2 hover:underline">
          About the sources →
        </a>
      </div>
      {problems.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Sources that are delayed or not updating">
          {problems.map((s) => (
            <li key={s.id} className="max-w-full">
              <a
                href={sourcesHref}
                onClick={toSources}
                className="flex max-w-full items-start gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2 hover:bg-surface-2"
              >
                <span className="mt-0.5">
                  <StatusGlyph state={s.state} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium break-words text-ink-1">{s.name}</span>
                  <span className="block text-xs text-ink-3">
                    <span className="font-medium text-ink-2">{STATE_TEXT[s.state]}</span>
                    {s.latestData && <> · data through {formatDate(s.latestData, true)}</>}
                    {!s.latestData && s.lastSuccess && <> · last fetched {centralDate(s.lastSuccess)}</>}
                  </span>
                  {s.message && <span className="mt-0.5 block text-xs break-words text-ink-3">{s.message}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Calendar date in Minnesota time (matches the header's "Updated …" stamp). */
function centralDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return formatDate(iso.slice(0, 10), true)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
}

function order(s: SourceState): number {
  return { error: 0, stale: 1, ok: 2, pending: 3, disabled: 4 }[s]
}
