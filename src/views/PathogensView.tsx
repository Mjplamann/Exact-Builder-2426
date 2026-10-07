// "Illnesses to know about": searchable, filterable library of every pathogen profile.
import { useDeferredValue, useId, useMemo, useRef, useState } from 'react'
import type { PathogenCategory } from '../../shared/types'
import { PROFILES } from '../content'
import type { PathogenProfile } from '../content/types'
import { useDashboard } from '../lib/dashboard'
import { toHash, useAppState } from '../lib/state'
import { formatDate } from '../lib/format'
import { EmptyState, Pill } from '../components/ui'
import { LiveDot, PathogenCard } from '../components/pathogen/PathogenCard'
import { CATEGORY_FILTERS, CATEGORY_LABEL, hasSeriesFor, pulseFor } from '../components/pathogen/meta'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Returns null when the profile does not match; otherwise the non-name reason it matched (or ''). */
function matchProfile(p: PathogenProfile, q: string): string | null {
  if (!q) return ''
  const terms = norm(q).split(/\s+/).filter(Boolean)
  const nameHay = norm([p.name, p.shortName, ...(p.aka ?? []), p.id.replace(/-/g, ' ')].join(' | '))
  if (terms.every((t) => nameHay.includes(t))) return ''
  const symptoms = [...p.symptoms.common, ...p.symptoms.lessCommon]
  const hit = symptoms.find((s) => terms.every((t) => norm(s).includes(t)))
  if (hit) return hit.length > 90 ? `${hit.slice(0, 88)}…` : hit
  const all = norm([nameHay, ...symptoms, p.oneLiner].join(' | '))
  if (terms.every((t) => all.includes(t))) {
    const sym = symptoms.find((s) => terms.some((t) => norm(s).includes(t)))
    return sym ? (sym.length > 90 ? `${sym.slice(0, 88)}…` : sym) : ''
  }
  return null
}

export default function PathogensView() {
  const { state, update, go } = useAppState()
  const { data } = useDashboard()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim())
  const searchId = useId()
  const searchRef = useRef<HTMLInputElement>(null)
  /** The empty-state buttons unmount once they work, so keep keyboard focus in the search box. */
  const refocus = () => requestAnimationFrame(() => searchRef.current?.focus())

  const items = useMemo(() => {
    return PROFILES.map((profile) => {
      const pulse = pulseFor(data?.pulse, profile.id)
      const live = !!pulse || hasSeriesFor(data?.series, profile.id)
      return { profile, pulse, live }
    }).sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1
      if (a.live) {
        const d = (b.pulse?.score ?? -1) - (a.pulse?.score ?? -1)
        if (d) return d
      }
      return a.profile.shortName.localeCompare(b.profile.shortName)
    })
  }, [data])

  const counts = useMemo(() => {
    const c: Partial<Record<PathogenCategory, number>> = {}
    for (const { profile } of items) c[profile.category] = (c[profile.category] ?? 0) + 1
    return c
  }, [items])

  const visible = useMemo(() => {
    return items
      .filter((it) => state.category === 'all' || it.profile.category === state.category)
      .map((it) => ({ ...it, match: matchProfile(it.profile, deferred) }))
      .filter((it) => it.match !== null)
  }, [items, state.category, deferred])

  const liveCount = items.filter((i) => i.live).length
  const liveVisible = visible.some((v) => v.live)
  const asOf = data?.pulse.pathogens.map((p) => p.asOf).filter(Boolean).sort().at(-1)
  const categoryLabel = state.category === 'all' ? 'all types' : CATEGORY_LABEL[state.category]

  return (
    <div className="space-y-5">
      <header className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink-1 sm:text-3xl">Illnesses to know about</h1>
        <p className="mt-2 text-ink-2">
          Plain-language guides to {PROFILES.length} infections that matter in Minnesota: symptoms, who is most at risk,
          treatment and prevention. {liveCount > 0 && <>Illnesses with live data show this week’s activity level and are listed first.</>}
        </p>
        {asOf && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            <LiveDot label={`${liveCount} with live data`} />
            <span>Latest data: week ending {formatDate(asOf, true)}</span>
          </p>
        )}
      </header>

      <div className="card space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={searchId} className="text-xs font-medium text-ink-2">
            Search by name or symptom
          </label>
          <div className="relative max-w-xl">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4 4" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. flu, rash, diarrhea, tick"
              autoComplete="off"
              className="w-full rounded-lg border border-line bg-surface-1 py-2 pr-3 pl-9 text-base text-ink-1 placeholder:text-ink-3 sm:text-sm"
            />
          </div>
        </div>
        <div
          className="-mx-3 flex gap-2 overflow-x-auto px-3 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
          role="group"
          aria-label="Filter by type of illness"
        >
          <Pill active={state.category === 'all'} onClick={() => update({ category: 'all' })}>
            All <span className={`tabular ${state.category === 'all' ? '' : 'text-ink-3'}`}>{items.length}</span>
          </Pill>
          {CATEGORY_FILTERS.filter((c) => counts[c]).map((c) => (
            <Pill key={c} active={state.category === c} onClick={() => update({ category: c })}>
              {CATEGORY_LABEL[c]} <span className={`tabular ${state.category === c ? '' : 'text-ink-3'}`}>{counts[c]}</span>
            </Pill>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-ink-2" aria-live="polite">
          {visible.length === items.length
            ? `Showing all ${items.length} illnesses`
            : `Showing ${visible.length} of ${items.length} illnesses (${categoryLabel}${deferred ? `, matching “${deferred}”` : ''})`}
        </p>
        <p className="flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-accent" /> Usual peak month
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px] bg-surface-2 ring-2 ring-ink-1 ring-offset-1 ring-offset-[var(--page)]" /> This month
          </span>
        </p>
      </div>

      {visible.length ? (
        <div className="space-y-8">
          {[
            { key: 'live', title: 'Tracked this week', note: 'Minnesota or regional data, highest activity first.', list: visible.filter((v) => v.live) },
            {
              key: 'guide',
              title: liveVisible ? 'More illnesses, A to Z' : 'Illnesses, A to Z',
              note: 'Guides for illnesses without a weekly public Minnesota number.',
              list: visible.filter((v) => !v.live),
            },
          ]
            .filter((sec) => sec.list.length)
            .map((sec) => (
              <section key={sec.key} aria-labelledby={`lib-${sec.key}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h2 id={`lib-${sec.key}`} className="text-lg font-semibold tracking-tight text-ink-1">
                    {sec.title} <span className="text-sm font-normal text-ink-3">{sec.list.length}</span>
                  </h2>
                  <p className="text-xs text-ink-3">{sec.note}</p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sec.list.map(({ profile, pulse, live, match }) => (
                    <li key={profile.id} className="min-w-0">
                      <PathogenCard
                        profile={profile}
                        pulse={pulse}
                        live={live}
                        match={match || undefined}
                        href={toHash({ ...state, view: 'pathogen', pathogenId: profile.id })}
                        onOpen={() => go('pathogen', profile.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      ) : (
        <EmptyState title={deferred ? `No illnesses match “${deferred}”` : 'No illnesses in this group'}>
          <p>Try a different word, such as a symptom (“cough”, “rash”) or another name for the illness.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {deferred && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  refocus()
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-1 hover:bg-surface-2"
              >
                Clear search
              </button>
            )}
            {state.category !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  update({ category: 'all' })
                  refocus()
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-1 hover:bg-surface-2"
              >
                Show all types
              </button>
            )}
          </div>
        </EmptyState>
      )}
    </div>
  )
}
