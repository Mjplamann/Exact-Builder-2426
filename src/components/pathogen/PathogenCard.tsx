// One illness in the library grid. The whole card is a link to the illness page.
import type { MouseEvent } from 'react'
import type { PathogenPulse } from '../../../shared/types'
import type { PathogenProfile } from '../../content/types'
import { formatDate } from '../../lib/format'
import { LevelBadge, TrendPill } from '../ui'
import { CATEGORY_LABEL, KIND_LABEL } from './meta'
import { MonthStrip, peakPhrase } from './MonthStrip'

export function LiveDot({ label = 'Live data' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span className="relative inline-flex h-2 w-2" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-accent opacity-30" style={{ transform: 'scale(1.9)' }} />
        <span className="relative inline-block h-2 w-2 rounded-full bg-accent" />
      </span>
      {label}
    </span>
  )
}

export function PathogenCard({
  profile,
  pulse,
  live,
  href,
  onOpen,
  match,
}: {
  profile: PathogenProfile
  pulse?: PathogenPulse
  live: boolean
  href: string
  onOpen: () => void
  /** Why this card matched the search when it was not the name (e.g. a symptom). */
  match?: string
}) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onOpen()
  }
  const titleId = `card-${profile.id}`
  return (
    <article
      aria-labelledby={titleId}
      className="card group relative flex h-full flex-col gap-3 p-4 transition-colors focus-within:border-[var(--focus)] hover:border-line-strong hover:bg-surface-2/40"
    >
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-md border border-line px-1.5 py-0.5 font-medium text-ink-2">{KIND_LABEL[profile.kind]}</span>
        <span className="text-ink-3">{CATEGORY_LABEL[profile.category]}</span>
      </div>

      <div>
        <h3 id={titleId} className="text-base leading-snug font-semibold text-ink-1">
          <a
            href={href}
            onClick={click}
            className="outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--focus)]"
          >
            {profile.shortName}
          </a>
        </h3>
        {profile.name !== profile.shortName && <p className="text-sm text-ink-3">{profile.name}</p>}
      </div>

      <p className="text-sm leading-relaxed text-ink-2">{profile.oneLiner}</p>

      {match && (
        <p className="text-xs text-ink-2">
          <span className="font-semibold text-ink-1">Matches: </span>
          {match}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-1">
        {pulse ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelBadge level={pulse.level} size="sm" />
            <TrendPill trend={pulse.trend} compact />
            {pulse.asOf && <span className="text-xs text-ink-3">week ending {formatDate(pulse.asOf)}</span>}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          {live ? <LiveDot /> : <span className="text-xs text-ink-3">Not tracked weekly in public data</span>}
        </div>
        <div>
          <p className="mb-1 text-xs text-ink-3">
            Usually peaks: <span className="text-ink-2">{peakPhrase(profile.seasonality.peakMonths)}</span>
          </p>
          <MonthStrip months={profile.seasonality.peakMonths} />
        </div>
      </div>
    </article>
  )
}
