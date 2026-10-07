// "What to do this week": guidance for the selected audience at the current overall activity band.
import type { ActivityLevel, PathogenId } from '../../../shared/types'
import { BAND_LABEL, EMERGENCY_SIGNS, getActions, sectionPathogens } from '../../content/actions'
import { getProfile, pathogenName } from '../../content'
import { formatDate, LEVEL_LABEL } from '../../lib/format'
import { useAppState } from '../../lib/state'
import { AUDIENCES } from '../../lib/audiences'
import { ExternalLink } from '../learn/ExternalLink'
import { StatusIcon } from '../ui'
import { hrefFor } from './util'

/**
 * Split the emergency-signs sentence into a lead-in and a bulleted list so the signs can be scanned:
 * "Call 911 or go to an emergency department for A, B, or C. In babies, …" → lead "Call 911 or go to an emergency
 * department for:", signs [A, B, C], extra "In babies, …". The text itself stays in content/actions; when it no
 * longer matches this shape it is shown unchanged.
 */
function splitSigns(text: string): { lead: string; signs: string[]; extra?: string } | undefined {
  const m = /^(.*?\b(?:for|if you have))\s+([^.]+)\.\s*(.*)$/.exec(text.trim())
  if (!m) return undefined
  const signs = m[2].split(/,\s*(?:or\s+)?/).map((x) => x.trim()).filter(Boolean)
  if (signs.length < 3) return undefined
  return { lead: `${m[1]}:`, signs, extra: m[3] || undefined }
}

function EmergencySigns() {
  const parts = splitSigns(EMERGENCY_SIGNS.text)
  return (
    <div className="rounded-xl border border-line border-l-4 border-l-[var(--status-critical)] bg-surface-2 p-4" role="note" aria-labelledby="help-now-title">
      <h3 id="help-now-title" className="flex items-center gap-2 text-sm font-semibold text-ink-1">
        <StatusIcon tone="critical" size={18} />
        When to get help now
      </h3>
      {parts ? (
        <div className="mt-2 text-sm leading-snug text-ink-1">
          <p className="font-medium">{parts.lead}</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-[var(--status-critical)]">
            {parts.signs.map((sign) => (
              <li key={sign}>{sign.charAt(0).toUpperCase() + sign.slice(1)}</li>
            ))}
          </ul>
          {parts.extra && <p className="mt-2">{parts.extra}</p>}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-snug text-ink-1">{EMERGENCY_SIGNS.text}</p>
      )}
    </div>
  )
}

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
                      <summary className="cursor-pointer text-xs text-ink-3 hover:text-ink-2">
                        Why?<span className="sr-only"> (step {i + 1})</span>
                      </summary>
                      <p className="mt-1 text-xs text-ink-2">{a.why}</p>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-line lg:pl-8" aria-label="Warning signs and related pages">
          <EmergencySigns />

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
            <ul className="mt-1">
              {[...section.sources, EMERGENCY_SIGNS.source].map((src) => (
                <li key={src.url}>
                  <ExternalLink href={src.url} className="inline-block py-1">
                    {src.label}
                  </ExternalLink>
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
