// Watch list: one card per tracked pathogen, ordered by composite score (level first, trend nudges).
import { useState } from 'react'
import type { Manifest, PathogenPulse, PulseFile } from '../../../shared/types'
import { pathogenName } from '../../content'
import { formatDate } from '../../lib/format'
import { useAppState } from '../../lib/state'
import { Sparkline } from '../charts/Sparkline'
import { EmptyState, LevelBadge, SourceTag, TrendPill } from '../ui'
import { cardFigure, hrefFor, naturalFrequency, outlookSentence, rankPathogens } from './util'

const TOP = 6

export function WatchList({ pulse, manifest }: { pulse: PulseFile; manifest: Manifest }) {
  const [showAll, setShowAll] = useState(false)
  const ranked = rankPathogens(pulse)
  const shown = showAll ? ranked : ranked.slice(0, TOP)

  return (
    <section aria-labelledby="watch-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="watch-title" className="text-lg font-semibold tracking-tight text-ink-1">
            Watch list
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">Illnesses with current Minnesota data, highest activity first. Select one for details.</p>
        </div>
      </div>
      {ranked.length === 0 ? (
        <EmptyState title="No current illness data yet">The data pipeline hasn’t published any illness summaries. Check back soon.</EmptyState>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <li key={p.pathogen} className="min-w-0">
                <WatchCard p={p} manifest={manifest} />
              </li>
            ))}
          </ul>
          {ranked.length > TOP && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="rounded-full border border-line bg-surface-1 px-4 py-1.5 text-sm font-medium text-ink-1 hover:bg-surface-2"
              >
                {showAll ? 'Show fewer' : `Show all ${ranked.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function WatchCard({ p, manifest }: { p: PathogenPulse; manifest: Manifest }) {
  const { state, go } = useAppState()
  const name = pathogenName(p.pathogen)
  const s = p.primary
  const rising = p.trend === 'rising' || p.trend === 'rising-fast'
  const freq = s ? naturalFrequency(s.latestValue, s.metric, s.unit) : undefined
  const outlook = outlookSentence(p)
  const fig = s ? cardFigure(s, name) : undefined

  return (
    <a
      href={hrefFor(state, 'pathogen', p.pathogen)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        go('pathogen', p.pathogen)
      }}
      className={`card group flex h-full flex-col p-4 transition-colors hover:bg-surface-2 sm:p-5 ${
        rising ? 'border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] shadow-[inset_3px_0_0_var(--accent)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-1 group-hover:underline">{name}</h3>
        <span aria-hidden="true" className="text-ink-3 transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LevelBadge level={p.level} size="sm" />
        <TrendPill trend={p.trend} />
      </div>

      {s ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl leading-none font-semibold tracking-tight text-ink-1">{fig?.figure}</p>
              <p className="mt-1.5 text-sm leading-snug text-ink-2">{fig?.caption}</p>
            </div>
            <div className="shrink-0 pb-1">
              <Sparkline points={s.spark} width={104} height={36} color="var(--accent)" label={`${name}, last ${s.spark.length} weeks`} />
            </div>
          </div>
          {freq && <p className="mt-2 text-sm text-ink-1">≈ {freq}</p>}
          {s.stale && <p className="mt-2 text-xs font-medium text-ink-2">⚠ This number may be out of date.</p>}
        </>
      ) : (
        <p className="mt-4 text-sm text-ink-2">No current Minnesota measurement.</p>
      )}

      {outlook && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
          <span className="font-medium text-ink-1">Outlook: </span>
          {outlook}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-xs text-ink-3">
        {s && <SourceTag>{s.sourceName ?? manifest.sources.find((m) => m.id === s.source)?.name ?? s.source}</SourceTag>}
        {(p.asOf ?? s?.latestDate) && <span>Week ending {formatDate(p.asOf ?? s?.latestDate, true)}</span>}
      </div>
    </a>
  )
}
