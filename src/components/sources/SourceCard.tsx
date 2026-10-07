// One data source: what it measures, where and how often, freshness, status message and attribution.
import type { ReactNode } from 'react'
import type { Manifest, SourceStatus } from '../../../shared/types'
import { daysAgo, formatDate, formatDateTime } from '../../lib/format'
import { ExternalLink } from '../learn/ExternalLink'
import { StatusChip } from './StatusChip'

const BASE = `${import.meta.env.BASE_URL}data/`

export function relativeTime(iso: string | undefined, now = new Date()): string {
  if (!iso) return ''
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'less than an hour ago'
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} days ago`
}

/** File name with soft line-break opportunities after separators (no mid-word breaks). */
export function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=__|[-./])/)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <wbr />}
        </span>
      ))}
    </>
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 py-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="text-sm text-ink-1">{children}</dd>
    </div>
  )
}

export function SourceCard({ source: s, files }: { source: SourceStatus; files: Manifest['files'] }) {
  const age = daysAgo(s.latestData)
  const problem = s.state === 'error' || s.state === 'stale'
  const myFiles = files.filter((f) => f.source === s.id)
  const headingId = `src-${s.id}`
  return (
    <article className="card p-4 sm:p-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-semibold text-ink-1 sm:text-lg">
            {s.name}
          </h3>
          <p className="text-sm text-ink-3">{s.publisher}</p>
        </div>
        <StatusChip state={s.state} />
      </div>

      {s.message && (
        <div
          className={`mt-3 rounded-lg border p-2.5 text-sm ${problem ? 'border-[var(--status-warning)] bg-surface-2 text-ink-1' : 'border-line bg-surface-2 text-ink-2'}`}
          role={problem ? 'note' : undefined}
        >
          {problem && <span className="font-semibold">Note: </span>}
          {s.message}
        </div>
      )}

      <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-ink-3 uppercase">What it measures</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.description}</p>
          {s.attribution && (
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              <span className="font-semibold text-ink-2">Attribution: </span>
              {s.attribution}
            </p>
          )}
          <p className="mt-2 text-sm">
            <ExternalLink href={s.url}>Go to the source</ExternalLink>
          </p>
        </div>
        <dl className="min-w-0 divide-y divide-line self-start rounded-lg border border-line px-3">
          <Fact label="Geography">{s.geography}</Fact>
          <Fact label="Updates">{s.cadence}</Fact>
          <Fact label="Last refreshed">
            {s.lastSuccess ? (
              <>
                {formatDateTime(s.lastSuccess)}
                <span className="block text-xs text-ink-3">{relativeTime(s.lastSuccess)}</span>
              </>
            ) : (
              <span className="text-ink-3">Never</span>
            )}
          </Fact>
          <Fact label="Newest data">
            {s.latestData ? (
              <>
                Week ending {formatDate(s.latestData, true)}
                {age != null && <span className="block text-xs text-ink-3">{age <= 0 ? 'this week' : `${age} days ago`}</span>}
              </>
            ) : (
              <span className="text-ink-3">None yet</span>
            )}
          </Fact>
          <Fact label="Series">
            {s.seriesCount.toLocaleString('en-US')}
            {s.datasets.length > 0 && <span className="block text-xs text-ink-3">{s.datasets.join(', ')}</span>}
          </Fact>
          {myFiles.length > 0 && (
            <Fact label="Data files">
              <ul className="space-y-0.5">
                {myFiles.map((f) => (
                  <li key={f.path}>
                    <a className="text-accent underline decoration-1 underline-offset-2" href={`${BASE}${f.path}`}>
                      <Breakable text={f.path.replace(/^series\//, '')} />
                    </a>
                    <span className="text-xs text-ink-3"> · {formatBytes(f.bytes)}</span>
                  </li>
                ))}
              </ul>
            </Fact>
          )}
        </dl>
      </div>
    </article>
  )
}
