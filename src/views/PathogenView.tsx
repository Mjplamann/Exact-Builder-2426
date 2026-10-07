// Illness detail page: current Minnesota signals + plain-language guide from the pathogen profile.
import { useEffect, useMemo, type ReactNode } from 'react'
import { getProfile, pathogenName } from '../content'
import { useDashboard } from '../lib/dashboard'
import { useAppState } from '../lib/state'
import { formatDate } from '../lib/format'
import { Card, EmptyState, LevelBadge, SectionTitle, TrendPill } from '../components/ui'
import { CATEGORY_LABEL, KIND_LABEL, pulseFor } from '../components/pathogen/meta'
import { buildSignals } from '../components/pathogen/signals'
import { SignalSection } from '../components/pathogen/SignalSection'
import { LiveDot } from '../components/pathogen/PathogenCard'
import {
  NumbersForYou, Prevention, RiskGroups, Sources, SpreadAndCare, Symptoms, Treatment, WatchNotes,
} from '../components/pathogen/ProfileSections'
import { scrollToSection, TocDisclosure, TocSidebar, useActiveSection, type TocItem } from '../components/pathogen/Toc'

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <SectionTitle id={`${id}-title`} title={title} subtitle={subtitle} />
      {children}
    </Card>
  )
}

const isoToText = (s: string) => s.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => formatDate(d, true))

export default function PathogenView() {
  const { state, go } = useAppState()
  const { data } = useDashboard()
  const profile = getProfile(state.pathogenId)
  const id = profile?.id

  const result = useMemo(
    () => (id ? buildSignals(data, id, state.geo, state.audience) : undefined),
    [data, id, state.geo, state.audience],
  )
  const pulse = id ? pulseFor(data?.pulse, id) : undefined

  const toc: TocItem[] = useMemo(() => {
    if (!profile) return []
    return [
      { id: 'sec-now', label: 'Right now in Minnesota' },
      { id: 'sec-numbers', label: 'What the numbers mean' },
      { id: 'sec-symptoms', label: 'Symptoms' },
      { id: 'sec-risk', label: 'Who is most at risk' },
      { id: 'sec-treatment', label: 'Treatment' },
      { id: 'sec-prevention', label: 'Prevention' },
      { id: 'sec-spread', label: 'Spread, testing and care' },
      ...(profile.watchNotes?.length ? [{ id: 'sec-watch', label: 'What’s new' }] : []),
      { id: 'sec-sources', label: 'Sources' },
    ]
  }, [profile])
  const active = useActiveSection(toc.map((t) => t.id))

  useEffect(() => {
    if (!profile) return
    const prev = document.title
    document.title = `${profile.shortName}: what to know in Minnesota · MN Pulse`
    return () => {
      document.title = prev
    }
  }, [profile])

  if (!profile || !result) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState title={state.pathogenId ? `We don’t have a guide for “${state.pathogenId}”` : 'No illness selected'}>
          <p>The link may be out of date, or this illness isn’t covered yet.</p>
          <button
            type="button"
            onClick={() => go('pathogens')}
            className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            Browse all illnesses
          </button>
        </EmptyState>
      </div>
    )
  }

  const live = result.groups.length > 0 || result.ages.length > 0 || result.orphans.length > 0
  const pulseName = pulse ? pathogenName(pulse.pathogen) : profile.shortName

  return (
    <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block">
        <TocSidebar items={toc} active={active} />
      </aside>

      <div className="min-w-0 space-y-5">
        <header className="card p-4 sm:p-6">
          <button
            type="button"
            onClick={() => go('pathogens')}
            className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-accent hover:underline"
          >
            <span aria-hidden="true">←</span> All illnesses
          </button>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-line px-1.5 py-0.5 font-medium text-ink-2">{KIND_LABEL[profile.kind]}</span>
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium text-ink-2">{CATEGORY_LABEL[profile.category]}</span>
            {live && <LiveDot />}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-1 sm:text-3xl">{profile.name}</h1>
          {profile.aka?.length ? <p className="mt-1 text-sm text-ink-3">Also called: {profile.aka.join(', ')}</p> : null}
          <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-1 sm:text-lg">{profile.oneLiner}</p>

          {pulse && (
            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
                This week in Minnesota{pulse.asOf ? ` · week ending ${formatDate(pulse.asOf, true)}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <LevelBadge level={pulse.level} size="lg" />
                <TrendPill trend={pulse.trend} />
              </div>
              <p className="mt-2 text-sm text-ink-1">{isoToText(pulse.headline)}</p>
              {pulse.outlook && (
                <p className="mt-1 text-sm text-ink-2">
                  <span className="font-medium text-ink-1">Next 3 weeks: </span>
                  {pulseName} {pulse.outlook.text}
                </p>
              )}
              {pulse.primary?.levelBasis && (
                <p className="mt-2 text-xs text-ink-3">
                  The level compares this week with Minnesota’s usual range for this measure: {pulse.primary.levelBasis}.
                </p>
              )}
              <button type="button" onClick={() => scrollToSection('sec-now')} className="mt-2 text-sm font-medium text-accent hover:underline">
                See the charts <span aria-hidden="true">↓</span>
              </button>
            </div>
          )}

          <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-2">{profile.overview}</p>
          <p className="mt-3 text-xs text-ink-3">Guide reviewed {formatDate(profile.lastReviewed, true)} · Educational, not medical advice</p>
        </header>

        <div className="lg:hidden">
          <TocDisclosure items={toc} active={active} />
        </div>

        <Section
          id="sec-now"
          title="Right now in Minnesota"
          subtitle={live ? 'Weekly public surveillance data. Each chart shows one kind of measure.' : undefined}
        >
          <SignalSection profile={profile} result={result} manifest={data?.manifest} />
        </Section>

        <Section id="sec-numbers" title="What the numbers mean for you">
          <NumbersForYou profile={profile} result={result} />
        </Section>

        <Section id="sec-symptoms" title="Symptoms">
          <Symptoms profile={profile} />
        </Section>

        <Section id="sec-risk" title="Who is most at risk" subtitle="Risk of serious illness by group, and what each group can do.">
          <RiskGroups profile={profile} audience={state.audience} />
        </Section>

        <Section id="sec-treatment" title="Treatment">
          <Treatment profile={profile} />
        </Section>

        <Section id="sec-prevention" title="Prevention">
          <Prevention profile={profile} />
        </Section>

        <Section id="sec-spread" title="How it spreads, testing and when to get care">
          <SpreadAndCare profile={profile} />
        </Section>

        {profile.watchNotes?.length ? (
          <Section id="sec-watch" title="What’s new">
            <WatchNotes profile={profile} />
          </Section>
        ) : null}

        <Section id="sec-sources" title="Sources">
          <Sources profile={profile} />
        </Section>
      </div>
    </div>
  )
}
