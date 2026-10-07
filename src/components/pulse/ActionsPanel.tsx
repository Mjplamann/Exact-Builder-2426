// "What to do this week": guidance for the selected audience at the current overall activity band.
import type { ActivityLevel, PathogenId } from '../../../shared/types'
import { BAND_LABEL, EMERGENCY_SIGNS, getActions, sectionPathogens } from '../../content/actions'
import { getProfile, pathogenName } from '../../content'
import { formatDate, LEVEL_LABEL } from '../../lib/format'
import { useAppState } from '../../lib/state'
import { AUDIENCES } from '../layout/FilterBar'
import { hrefFor } from './util'

export function ActionsPanel({ level, levelNote, extraPathogens = [] }: { level: ActivityLevel; levelNote?: string; extraPathogens?: PathogenId[] }) {
  const { state, go } = useAppState()
  const section = getActions(level, state.audience)
  const audienceLabel = AUDIENCES.find((a) => a.id === state.audience)?.label ?? 'Everyone'
  const links = [...new Set([...sectionPathogens(section), ...extraPathogens])].filter((id) => getProfile(id)).slice(0, 6)

  return (
    <section className="card p-5 sm:p-7" aria-labelledby="actions-title">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id="actions-title" className="text-xl font-semibold tracking-tight text-ink-1">
              What to do this week
            </h2>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-ink-1">{BAND_LABEL[section.band]}</span>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            For <span className="font-medium text-ink-1">{audienceLabel.toLowerCase() === 'everyone' ? 'everyone' : audienceLabel}</span>
            {' · '}
            {levelNote ?? `respiratory activity is ${LEVEL_LABEL[level].toLowerCase()}`}
            <span className="text-ink-3"> · change “Guidance for” above</span>
          </p>
          <p className="mt-3 max-w-prose text-base text-ink-1">{section.summary}</p>

          <ol className="mt-5 gap-8 md:columns-2">
            {section.actions.map((a, i) => (
              <li key={i} className="mb-4 flex break-inside-avoid gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-ink-1"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 text-sm leading-snug text-ink-1">
                  {a.text}
                  {a.why && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">Why?</summary>
                      <p className="mt-1 text-xs text-ink-2">{a.why}</p>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-line lg:pl-8" aria-label="Warning signs and related pages">
          <div className="rounded-xl bg-surface-2 p-4 text-xs leading-relaxed text-ink-2">
            <p className="mb-1 text-sm font-semibold text-ink-1">When to get help now</p>
            {EMERGENCY_SIGNS.text}
          </div>

          {links.length > 0 && (
            <div>
              <p className="text-xs font-medium text-ink-2">Learn more</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {links.map((id) => (
                  <li key={id}>
                    <a
                      href={hrefFor(state, 'pathogen', id)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                        e.preventDefault()
                        go('pathogen', id)
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-1 hover:bg-surface-2"
                    >
                      {pathogenName(id)}
                      <span aria-hidden="true" className="text-ink-3">
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="text-xs text-ink-3 lg:mt-auto">
            <summary className="cursor-pointer hover:text-ink-2">Sources · reviewed {formatDate(section.lastReviewed, true)}</summary>
            <ul className="mt-2 space-y-1">
              {[...section.sources, EMERGENCY_SIGNS.source].map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                    {src.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2">General guidance for awareness, not medical advice. Ask your clinician what’s right for you.</p>
          </details>
        </aside>
      </div>
    </section>
  )
}
