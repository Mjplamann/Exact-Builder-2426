// Content sections of an illness page, rendered from its PathogenProfile.
import type { ReactNode } from 'react'
import type { AgeGroupId, GeoRef, MetricKind, PathogenId } from '../../../shared/types'
import type { GuidanceGroup, PathogenProfile } from '../../content/types'
import { formatDate, formatValue } from '../../lib/format'
import { AUDIENCES, FilterBar } from '../layout/FilterBar'
import { Callout } from '../ui'
import { GUIDANCE_GROUPS, inlineName, naturalFrequency, seriesNoun, TREATMENT_TYPE_LABEL, wherePhrase } from './meta'
import { MonthStrip, peakPhrase } from './MonthStrip'
import { RiskMeter } from './RiskMeter'
import { latestOf, type BuildResult, type Entry } from './signals'

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const groupLabel = (g: AgeGroupId) => AUDIENCES.find((a) => a.id === g)?.label ?? g

function Bullets({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-sm leading-relaxed text-ink-2">
          <span aria-hidden="true" className="mt-[0.55em] h-1.5 w-1.5 flex-none rounded-full bg-[var(--muted)]" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold tracking-wide text-ink-1">{children}</h3>
}

// ── What the numbers mean for you ────────────────────────────────────────────

interface Translation {
  key: string
  /** Bold lead: "About 1 in 400" or "None"/"No". */
  strong: string
  /** Sentence body without the date, e.g. " emergency department visits in Minnesota were for flu". */
  body: string
  date: string
  /** Raw percentage for reference, omitted when zero. */
  raw?: string
}

/** A test-positivity, panel detection or ER-visit percentage in everyday terms ("About 1 in 400 ER visits …"). */
export function translateValue(
  v: { key: string; metric: MetricKind; value: number; date: string; geo: GeoRef; pathogen: PathogenId },
  profile: PathogenProfile,
): Translation | null {
  const freq = naturalFrequency(v.value)
  if (!freq) return null
  const name = seriesNoun(profile, v.pathogen)
  const where = wherePhrase(v.geo, true)
  const none = freq === 'none'
  const base = { key: v.key, date: v.date, raw: none ? undefined : formatValue(v.value, '%') }
  switch (v.metric) {
    case 'test_positivity':
      return none
        ? { ...base, strong: 'None', body: ` of lab tests for ${name} ${where} came back positive` }
        : { ...base, strong: capital(freq), body: ` lab tests for ${name} ${where} came back positive` }
    case 'detection_rate':
      return none
        ? { ...base, strong: 'None', body: ` of the multi-pathogen panel tests run on sick patients ${where} detected ${name}` }
        : { ...base, strong: capital(freq), body: ` multi-pathogen panel tests run on sick patients ${where} detected ${name}` }
    case 'ed_visit_pct':
      return none
        ? { ...base, strong: 'No', body: ` emergency department visits ${where} were for ${name}` }
        : { ...base, strong: capital(freq), body: ` emergency department visits ${where} were for ${name}` }
    default:
      return null
  }
}

function translate(e: Entry, profile: PathogenProfile): Translation | null {
  const l = latestOf(e)
  if (!l) return null
  const s = e.series
  return translateValue({ key: s.id, metric: s.metric, value: l.value, date: l.date, geo: s.geo, pathogen: s.pathogen }, profile)
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Split long guidance into a short lead (first two sentences) and the rest. */
function splitLead(text: string, n = 2): [string, string] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z(“"])/)
  if (parts.length <= n + 1) return [text, '']
  return [parts.slice(0, n).join(' '), parts.slice(n).join(' ')]
}

/** How to read this illness's numbers (the profile's guide text), with the long part folded away. */
export function ReadingGuide({ profile }: { profile: PathogenProfile }) {
  const [lead, rest] = splitLead(profile.readingTheNumbers)
  return (
    <div className="max-w-prose text-sm leading-relaxed text-ink-2">
      <p>{lead}</p>
      {rest && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-accent select-none hover:underline">
            More on reading {inlineName(profile)} numbers
          </summary>
          <p className="mt-2 border-l-2 border-line pl-3">{rest}</p>
        </details>
      )}
    </div>
  )
}

const TRANSLATABLE = ['test_positivity', 'detection_rate', 'ed_visit_pct'] as const

/** Whether "What the numbers mean for you" has a current percentage to put in everyday terms. */
export const hasEverydayNumbers = (result: BuildResult) => result.groups.some((g) => (TRANSLATABLE as readonly string[]).includes(g.metric))

export function NumbersForYou({ profile, result }: { profile: PathogenProfile; result: BuildResult }) {
  const order = TRANSLATABLE
  const translations = order
    .map((m) => result.groups.find((g) => g.metric === m))
    .map((g) => (g ? translate(g.lead, profile) : null))
    .filter((t): t is Translation => !!t)
  const sameDate = translations.every((t) => t.date === translations[0]?.date)
  return (
    <div className="space-y-4">
      {translations.length > 0 ? (
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">
            This week, in everyday terms{sameDate ? ` · week ending ${formatDate(translations[0].date, true)}` : ''}
          </p>
          <ul className="space-y-2">
            {translations.map((t) => (
              <li key={t.key} className="text-base leading-relaxed text-ink-1">
                <strong className="font-semibold">{t.strong}</strong>
                {t.body}
                {sameDate ? '' : ` in the week ending ${formatDate(t.date, true)}`}
                {t.raw ? <span className="text-ink-2"> ({t.raw})</span> : null}.
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-2">
            These numbers describe people who were already sick enough to get tested or go to an emergency department. They are not
            the chance that any one Minnesotan has {inlineName(profile)} right now. What matters most is the direction: a rising
            number means more of it is going around.
          </p>
        </div>
      ) : (
        <p className="max-w-prose text-sm text-ink-2">
          MN Pulse has no weekly test-positivity or emergency-visit percentage for {inlineName(profile)} to put in everyday terms. Here is
          how to read the numbers you may see in reports:
        </p>
      )}
      <ReadingGuide profile={profile} />
    </div>
  )
}

// ── Symptoms ─────────────────────────────────────────────────────────────────

/** Group "Adults: …" / "Children: …" style items under their prefix when most items use one. */
function groupByPrefix(items: string[]): { label?: string; items: string[] }[] {
  const re = /^([A-Z][A-Za-z ,'’()0-9-]{1,28}):\s+(.+)$/
  const prefixed = items.filter((t) => re.test(t))
  if (prefixed.length < Math.max(3, items.length * 0.6)) return [{ items }]
  const out: { label?: string; items: string[] }[] = []
  for (const t of items) {
    const m = re.exec(t)
    const label = m?.[1]
    const text = m ? m[2].charAt(0).toUpperCase() + m[2].slice(1) : t
    const g = out.find((x) => x.label === label)
    if (g) g.items.push(text)
    else out.push({ label, items: [text] })
  }
  return out
}

export function Symptoms({ profile }: { profile: PathogenProfile }) {
  const { common, lessCommon, emergencyWarningSigns } = profile.symptoms
  const groups = groupByPrefix(emergencyWarningSigns)
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <SubHeading>Common</SubHeading>
          <Bullets items={common} />
        </div>
        {lessCommon.length > 0 && (
          <div>
            <SubHeading>Less common or complications</SubHeading>
            <Bullets items={lessCommon} />
          </div>
        )}
      </div>
      {emergencyWarningSigns.length > 0 && (
        <Callout tone="critical" title="Emergency warning signs: call 911 or go to the ER">
          <p className="mb-2 text-sm text-ink-1">Get emergency care right away for anyone with:</p>
          <div className={groups.length > 2 ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : groups.length > 1 ? 'grid gap-4 md:grid-cols-2' : ''}>
            {groups.map((g) => (
              <div key={g.label ?? 'all'}>
                {g.label && <p className="mb-1 text-sm font-semibold text-ink-1">{g.label}</p>}
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-1 marker:text-ink-1">
                  {g.items.map((t) => (
                    <li key={t}>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Callout>
      )}
    </div>
  )
}

// ── Who is most at risk ─────────────────────────────────────────────────────

export function RiskGroups({ profile, audience }: { profile: PathogenProfile; audience: AgeGroupId }) {
  const selected = GUIDANCE_GROUPS.includes(audience as GuidanceGroup) ? (audience as GuidanceGroup) : undefined
  const order = selected ? [selected, ...GUIDANCE_GROUPS.filter((g) => g !== selected)] : GUIDANCE_GROUPS
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar showGeo={false} showRange={false} />
        <p className="text-xs text-ink-3">
          {selected ? 'Your group is listed first.' : 'Choose a group to see its guidance first.'} Risk means the chance of serious illness
          compared with most people.
        </p>
      </div>
      <ul className="space-y-3">
        {order.map((g) => {
          const info = profile.ageGroups[g]
          if (!info) return null
          const mine = g === selected
          return (
            <li
              key={g}
              className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] md:gap-6 ${
                mine ? 'border-accent bg-accent-soft' : 'border-line'
              }`}
              aria-current={mine ? 'true' : undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 md:flex-col md:items-start md:justify-start">
                <h3 className="text-base font-semibold text-ink-1">
                  {groupLabel(g)}
                  {mine && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 align-middle text-xs font-semibold text-accent-ink">Your group</span>}
                </h3>
                <RiskMeter risk={info.risk} />
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-relaxed text-ink-2">{info.summary}</p>
                {mine ? (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-1 uppercase">What to do</p>
                    <Bullets items={info.actions} className="[&_span]:text-ink-1" />
                  </div>
                ) : (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-accent select-none hover:underline">
                      What to do ({info.actions.length} {info.actions.length === 1 ? 'step' : 'steps'})
                    </summary>
                    <Bullets items={info.actions} className="mt-2" />
                  </details>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Treatment ────────────────────────────────────────────────────────────────

function antibioticText(p: PathogenProfile): { answer: string; text: string } {
  const name = inlineName(p)
  switch (p.treatment.antibioticsHelp) {
    case 'yes':
      return {
        answer: 'Yes',
        text: `Antibiotics can treat ${name}. Take them exactly as prescribed and finish the course unless your clinician tells you otherwise. Never use leftover or someone else’s antibiotics.`,
      }
    case 'sometimes':
      return {
        answer: 'Sometimes',
        text: `Antibiotics help only in some cases, such as severe illness or people at higher risk. Many people get better without them. Your clinician will decide based on your symptoms, test results and health.`,
      }
    default:
      if (p.kind === 'virus')
        return {
          answer: 'No',
          text: `Antibiotics do not work against viruses. They will not make ${name} go away faster or ease symptoms, and they can cause side effects and make future infections harder to treat. A clinician may prescribe them only if a bacterial infection, such as some ear infections or pneumonia, develops on top.`,
        }
      if (p.kind === 'parasite')
        return {
          answer: 'No',
          text: `Ordinary antibiotics are not the treatment for ${name}. When treatment is needed, clinicians use specific medicines that target the parasite.`,
        }
      return {
        answer: 'No',
        text: `Antibiotics are usually not recommended for ${name}. They may not help, and for some infections they can cause harm. Follow your clinician’s advice.`,
      }
  }
}

export function Treatment({ profile }: { profile: PathogenProfile }) {
  const ab = antibioticText(profile)
  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm leading-relaxed text-ink-2">{profile.treatment.summary}</p>
      <Callout title={`Do antibiotics help? ${ab.answer}.`}>{ab.text}</Callout>
      {profile.treatment.options.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {profile.treatment.options.map((o) => (
            <li key={o.name} className="flex flex-col gap-2 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink-2">{TREATMENT_TYPE_LABEL[o.type]}</span>
              </div>
              <h3 className="text-base font-semibold text-ink-1">{o.name}</h3>
              {o.who && (
                <p className="text-sm text-ink-1">
                  <span className="font-medium">For: </span>
                  <span className="text-ink-2">{o.who}</span>
                </p>
              )}
              <p className="text-sm leading-relaxed text-ink-2">{o.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Prevention ───────────────────────────────────────────────────────────────

export function Prevention({ profile }: { profile: PathogenProfile }) {
  const { vaccines, everyday } = profile.prevention
  return (
    <div className="space-y-5">
      <div>
        <SubHeading>Vaccines</SubHeading>
        {vaccines.length ? (
          <>
            <table className="hidden w-full border-collapse text-left text-sm sm:table">
              <caption className="sr-only">Vaccines for {profile.shortName}</caption>
              <thead>
                <tr className="border-b border-line-strong text-xs text-ink-3">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Vaccine
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Who should get it
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {vaccines.map((v) => (
                  <tr key={v.name} className="border-b border-line align-top">
                    <th scope="row" className="py-2.5 pr-4 font-semibold text-ink-1">
                      {v.name}
                    </th>
                    <td className="py-2.5 pr-4 text-ink-2">{v.who}</td>
                    <td className="py-2.5 text-ink-2">{v.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="space-y-3 sm:hidden">
              {vaccines.map((v) => (
                <li key={v.name} className="rounded-xl border border-line p-3 text-sm">
                  <p className="font-semibold text-ink-1">{v.name}</p>
                  <p className="mt-1 text-ink-2">
                    <span className="font-medium text-ink-1">Who: </span>
                    {v.who}
                  </p>
                  {v.notes && <p className="mt-1 text-ink-2">{v.notes}</p>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-ink-2">There is no vaccine for {inlineName(profile)}. The everyday steps below are the best protection.</p>
        )}
      </div>
      {everyday.length > 0 && (
        <div>
          <SubHeading>Everyday steps</SubHeading>
          <ul className="grid gap-2 md:grid-cols-2">
            {everyday.map((t) => (
              <li key={t} className="flex gap-2 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 flex-none text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m3 8.5 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── How it spreads, incubation, testing, when to seek care ──────────────────

function Fact({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line p-4 ${className}`}>
      <SubHeading>{title}</SubHeading>
      <div className="text-sm leading-relaxed text-ink-2">{children}</div>
    </div>
  )
}

export function SpreadAndCare({ profile }: { profile: PathogenProfile }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Fact title="How it spreads">{profile.transmission}</Fact>
      <Fact title="Season in Minnesota">
        <p className="mb-2">
          <span className="font-medium text-ink-1">Usually peaks: </span>
          {peakPhrase(profile.seasonality.peakMonths)}
        </p>
        <MonthStrip months={profile.seasonality.peakMonths} size="md" />
        <p className="mt-2">{profile.seasonality.summary}</p>
      </Fact>
      <Fact title="From exposure to symptoms">{profile.incubation}</Fact>
      <Fact title="How long it’s contagious">{profile.contagiousPeriod}</Fact>
      <Fact title="Testing">{profile.testing}</Fact>
      <Fact title="When to contact a clinician">
        <Bullets items={profile.whenToSeekCare} />
      </Fact>
    </div>
  )
}

// ── Watch notes, sources ────────────────────────────────────────────────────

export function WatchNotes({ profile }: { profile: PathogenProfile }) {
  if (!profile.watchNotes?.length) return null
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-3">As of {formatDate(profile.lastReviewed, true)}</p>
      <Bullets items={profile.watchNotes} />
    </div>
  )
}

export function Sources({ profile }: { profile: PathogenProfile }) {
  return (
    <div className="space-y-4">
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {profile.sources.map((s) => (
          <li key={s.url} className="min-w-0 text-sm">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-words text-accent underline-offset-2 hover:underline">
              {s.label}
              <span aria-hidden="true">{'\u00a0'}↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="block truncate text-xs text-ink-3">{hostOf(s.url)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-3">
        This guide was last checked against these sources on {formatDate(profile.lastReviewed, true)}. Surveillance numbers on this page
        come from the public data sources listed on the Sources page.
      </p>
      <p className="text-xs text-ink-2">
        This guide is general health education. It does not replace advice from your own clinician. If you are worried about symptoms,
        call your clinician or a nurse line; in an emergency, call 911.
      </p>
    </div>
  )
}
