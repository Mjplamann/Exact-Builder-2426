// Illness detail page: current Minnesota signals + plain-language guide from the pathogen profile.
import { useMemo, type ReactNode } from 'react'
import type { PathogenPulse, Series } from '../../shared/types'
import type { PathogenProfile } from '../content/types'
import { getProfile } from '../content'
import { useDashboard } from '../lib/dashboard'
import { useAppState } from '../lib/state'
import { formatDate, formatValue } from '../lib/format'
import { Card, EmptyState, LevelBadge, SectionTitle, TrendPill } from '../components/ui'
import {
  basisSentence, CATEGORY_LABEL, inlineName, isCaseMetric, KIND_LABEL, pulseFor, regionTitle, sourceShort, summaryOf, yearToDateOf, ytdHeadline,
} from '../components/pathogen/meta'
import { buildSignals } from '../components/pathogen/signals'
import { hasLiveSignals, SignalSection } from '../components/pathogen/SignalSection'
import { LiveDot } from '../components/pathogen/PathogenCard'
import {
  hasEverydayNumbers, NumbersForYou, Prevention, ReadingGuide, RiskGroups, Sources, SpreadAndCare, Symptoms, translateValue, Treatment, WatchNotes,
} from '../components/pathogen/ProfileSections'
import { scrollToSection, TocDisclosure, TocSidebar, useActiveSection, type TocItem } from '../components/pathogen/Toc'

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 sm:scroll-mt-20">
      <SectionTitle id={`${id}-title`} title={title} subtitle={subtitle} />
      {children}
    </Card>
  )
}

const isoToText = (s: string) => s.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => formatDate(d, true))

/**
 * The pipeline headline for a case-count illness starts with the year-to-date count the hero already shows
 * ("Measles: 21 Minnesota cases so far in 2026 (as of …); not detected at …"); keep only what follows.
 */
function afterCaseClause(headline: string): string | undefined {
  const m = /^[^:]+: [\d,]+ Minnesota cases? so far in \d{4}(?: \([^)]*\))?(?:;\s*|\.\s*|$)/.exec(headline)
  if (!m) return headline
  const rest = headline.slice(m[0].length).trim()
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : undefined
}

/** "This week in Minnesota" status box at the top of an illness page. */
function StatusBox({ pulse, profile, series }: { pulse: PathogenPulse; profile: PathogenProfile; series?: Series[] }) {
  const p = pulse.primary
  const caseCount = isCaseMetric(p?.metric) && pulse.level === 'unknown'
  const ytd = caseCount ? yearToDateOf(p, series) : undefined
  const region = regionTitle(p?.geo)
  const date = p?.latestDate ?? pulse.asOf
  // MN Pulse's own year-to-date sentence from another source (e.g. CDC NNDSS next to MDH's count).
  const otherSummary = caseCount
    ? series?.find((s) => s.pathogen === pulse.pathogen && s.geo.type === 'state' && s.id !== p?.seriesId && !s.age && summaryOf(s))
    : undefined
  const everyday =
    p && !caseCount && p.unit === '%'
      ? translateValue({ key: p.seriesId, metric: p.metric, value: p.latestValue, date: p.latestDate, geo: p.geo, pathogen: pulse.pathogen }, profile)
      : null
  const headline = caseCount ? afterCaseClause(pulse.headline) : pulse.headline
  const basis = caseCount || p?.metric === 'rt' ? undefined : basisSentence(p?.levelBasis)
  const label = caseCount ? 'Reported cases in Minnesota' : region ? `This week · ${region}` : 'This week in Minnesota'
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
        {label}
        {date ? ` · ${caseCount && p?.metric === 'cases_ytd' ? 'as of' : 'week ending'} ${formatDate(ytd?.asOf ?? date, true)}` : ''}
      </p>
      {caseCount ? (
        <>
          {ytd && (
            <p className="text-2xl leading-tight font-semibold text-ink-1">
              {ytdHeadline(ytd)}
              {ytd.prev != null && (
                <span className="text-lg font-normal text-ink-2"> · {formatValue(ytd.prev, 'count')} at this point last year</span>
              )}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-line-strong px-2.5 py-1 text-sm font-medium text-ink-2">
              Case counts — no activity level
            </span>
            {pulse.trend !== 'unknown' && <TrendPill trend={pulse.trend} />}
          </div>
          {ytd && (
            <p className="mt-2 text-sm text-ink-2">
              {ytd.source === 'cdc-nndss' ? 'Counted in CDC’s weekly NNDSS table for Minnesota' : `Reported to ${sourceShort(ytd.source)}`}. A
              year-to-date count only goes up, so it shows how much has happened this year, not whether spread is rising right now.
            </p>
          )}
          {otherSummary && (
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-medium text-ink-1">From {sourceShort(otherSummary.source)} data: </span>
              {summaryOf(otherSummary)}.{' '}
              {ytd && /\d/.test(summaryOf(otherSummary) ?? '') && (
                <span className="text-ink-3">Sources count at different times and may use different case definitions, so totals can differ.</span>
              )}
            </p>
          )}
          {headline && <p className="mt-1 text-sm text-ink-2">{isoToText(headline)}</p>}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {p?.metric !== 'rt' && <LevelBadge level={pulse.level} size="lg" />}
            <TrendPill trend={pulse.trend} />
          </div>
          <p className="mt-2 text-sm text-ink-1">{isoToText(pulse.headline)}</p>
          {everyday && (
            <p className="mt-1 text-sm text-ink-2">
              In everyday terms: <strong className="font-semibold text-ink-1">{everyday.strong}</strong>
              {everyday.body}.
            </p>
          )}
        </>
      )}
      {pulse.outlook && (
        <p className="mt-1 text-sm text-ink-2">
          <span className="font-medium text-ink-1">Outlook: </span>
          {pulse.outlook.text}
        </p>
      )}
      {basis && (
        <p className="mt-2 text-xs text-ink-3">
          <span className="font-medium text-ink-2">How the level is set: </span>
          {basis}
        </p>
      )}
      <button type="button" onClick={() => scrollToSection('sec-now')} className="mt-2 text-sm font-medium text-accent hover:underline">
        See this week’s data <span aria-hidden="true">↓</span>
      </button>
    </div>
  )
}

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

  const live = result ? hasLiveSignals(result) : false
  // A separate "What the numbers mean" section only when there is a current percentage to translate;
  // otherwise its reading guide joins "Right now in Minnesota" so the page has no near-empty section.
  const everyday = result ? hasEverydayNumbers(result) : false
  const toc: TocItem[] = useMemo(() => {
    if (!profile) return []
    return [
      { id: 'sec-symptoms', label: 'Symptoms' },
      { id: 'sec-risk', label: 'Who is most at risk' },
      { id: 'sec-treatment', label: 'Treatment' },
      { id: 'sec-now', label: 'Right now in Minnesota' },
      ...(everyday ? [{ id: 'sec-numbers', label: 'What the numbers mean' }] : []),
      { id: 'sec-prevention', label: 'Prevention' },
      { id: 'sec-spread', label: 'Spread, testing and care' },
      ...(profile.watchNotes?.length ? [{ id: 'sec-watch', label: 'What’s new' }] : []),
      { id: 'sec-sources', label: 'Sources' },
    ]
  }, [profile, everyday])
  const active = useActiveSection(toc.map((t) => t.id))

  // document.title is owned by App's route announcer (routeTitle), which uses the same profile lookup.
  // A local set/restore here raced it: the lazy view unmounts after the next route's title is set.

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

  return (
    <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <div className="hidden lg:block">
        <TocSidebar items={toc} active={active} />
      </div>

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

          {pulse && <StatusBox pulse={pulse} profile={profile} series={data?.series} />}

          <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-2">{profile.overview}</p>
          <p className="mt-3 text-xs text-ink-3">Guide reviewed {formatDate(profile.lastReviewed, true)} · Educational, not medical advice</p>
        </header>

        <div className="lg:hidden">
          <TocDisclosure items={toc} active={active} />
        </div>

        <Section id="sec-symptoms" title="Symptoms">
          <Symptoms profile={profile} />
        </Section>

        <Section id="sec-risk" title="Who is most at risk" subtitle="Risk of serious illness by group, and what each group can do.">
          <RiskGroups profile={profile} audience={state.audience} />
        </Section>

        <Section id="sec-treatment" title="Treatment">
          <Treatment profile={profile} />
        </Section>

        <Section
          id="sec-now"
          title="Right now in Minnesota"
          subtitle={
            live
              ? `Weekly public surveillance data: the main measure for ${inlineName(profile)} in full, other measures summarized below.`
              : undefined
          }
        >
          <SignalSection profile={profile} result={result} manifest={data?.manifest} />
          {!everyday && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink-1">Reading {inlineName(profile)} numbers when you see them</h3>
              <ReadingGuide profile={profile} />
            </div>
          )}
        </Section>

        {everyday && (
          <Section id="sec-numbers" title="What the numbers mean for you">
            <NumbersForYou profile={profile} result={result} />
          </Section>
        )}

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
