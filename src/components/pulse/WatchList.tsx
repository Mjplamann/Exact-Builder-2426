// Watch list: one card per tracked pathogen, ordered by composite score (level first, trend nudges).
import { useState } from 'react'
import type { Manifest, PathogenPulse, PulseFile } from '../../../shared/types'
import { pathogenName } from '../../content'
import { formatDate } from '../../lib/format'
import { useAppState } from '../../lib/state'
import { Sparkline } from '../charts/Sparkline'
import { EmptyState, LevelBadge, SourceTag, TrendPill } from '../ui'
import { cardFigure, hrefFor, isCaseCount, isWiderThanState, naturalFrequency, outlookSentence, rankPathogens, regionLabel } from './util'

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
          <p className="mt-0.5 text-sm text-ink-2">
            Illnesses with current data for Minnesota or its region, highest activity first. Select one for details.
          </p>
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
  const freq = s ? naturalFrequency(s.latestValue, s.metric, s.unit) : undefined
  const outlook = outlookSentence(p)
  const fig = s ? cardFigure(s, name, p) : undefined
  const region = s && isWiderThanState(s.geo) ? regionLabel(s.geo) : undefined
  const sparkPoints = s ? s.spark.filter((pt) => pt[1] != null).length : 0
  // A year-to-date total or a near-empty series has no shape worth drawing.
  const showSpark = !!s && sparkPoints >= 3 && s.metric !== 'cases_ytd'
  const titleId = `watch-${p.pathogen}`

  return (
    <article
      aria-labelledby={titleId}
      className="card group relative flex h-full flex-col p-4 transition-colors focus-within:border-[var(--focus)] hover:bg-surface-2 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={titleId} className="text-base font-semibold text-ink-1">
          <a
            href={hrefFor(state, 'pathogen', p.pathogen)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              go('pathogen', p.pathogen)
            }}
            className="outline-none group-hover:underline after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--focus)]"
          >
            {name}
          </a>
        </h3>
        <span aria-hidden="true" className="text-ink-3 transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!(isCaseCount(s) && p.level === 'unknown') && <LevelBadge level={p.level} size="sm" />}
        {p.trend !== 'unknown' && <TrendPill trend={p.trend} />}
        {region && (
          <span className="inline-flex items-center rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs font-medium text-ink-2">
            {region.chip}
          </span>
        )}
      </div>

      {s ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl leading-none font-semibold tracking-tight text-ink-1">{fig?.figure}</p>
              <p className="mt-1.5 text-sm leading-snug text-ink-2">{fig?.caption}</p>
            </div>
            {showSpark && (
              <span aria-hidden="true" className="shrink-0 pb-1">
                <Sparkline points={s.spark} width={104} height={36} color="var(--accent)" label={`${name}, last ${s.spark.length} weeks`} />
              </span>
            )}
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
        {(p.asOf ?? s?.latestDate) && (
          <span>
            {isCaseCount(s) && s?.metric === 'cases_ytd' ? 'As of' : 'Week ending'} {formatDate(p.asOf ?? s?.latestDate, true)}
          </span>
        )}
      </div>
    </article>
  )
}
