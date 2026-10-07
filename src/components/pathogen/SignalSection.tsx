// "Right now in Minnesota": one same-unit trend chart per measure, a "By age" chart when age-specific
// data exist, and an honest empty state when an illness is not tracked weekly.
import { useId } from 'react'
import type { Forecast, Manifest, PathogenId, SignalSummary } from '../../../shared/types'
import type { PathogenProfile } from '../../content/types'
import { pathogenName } from '../../content'
import { useAppState } from '../../lib/state'
import { formatDate, formatValue, METRIC_LABEL, metricMeaning } from '../../lib/format'
import { FilterBar, AUDIENCES } from '../layout/FilterBar'
import { TrendChart } from '../charts/TrendChart'
import { Sparkline } from '../charts/Sparkline'
import { Callout, LevelBadge, SourceTag, TrendPill } from '../ui'
import { ageDisplay, inlineName, MEASURE_AXIS, MEASURE_EXPLAINER, seriesNoun, sourceName, wherePhrase } from './meta'
import { seasonSentence } from './MonthStrip'
import { latestOf, type AgeGroupChart, type BuildResult, type Entry, type SignalGroup } from './signals'

const FORECAST_SOURCE: Record<string, string> = {
  'mn-pulse': 'MN Pulse statistical projection',
  'cdc-flusight': 'CDC FluSight ensemble forecast',
  'cdc-covidhub': 'CDC COVID-19 Forecast Hub ensemble',
  'cdc-rsvhub': 'CDC RSV Forecast Hub ensemble',
}

const forecastName = (f: Forecast) => FORECAST_SOURCE[f.source] ?? f.model

/** Lower-case the first letter unless it starts an acronym ("CDC …" stays). */
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)
const isoToText = (t: string) => t.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => formatDate(d, true))

/** Sentence-case the metric meaning and name the illness instead of "it". */
function meaningFor(e: Entry, profile: PathogenProfile, value: number) {
  return metricMeaning(e.series.metric, value, e.series.unit).replace(/\bit\b/, seriesNoun(profile, e.series.pathogen))
}

/** Region context for non-state places ("HHS Region 5 covers Minnesota and five nearby states"). */
function regionNote(e: Entry): string | null {
  const t = e.series.geo.type
  if (t !== 'hhs-region' && t !== 'census-region') return null
  return `Regional data ${wherePhrase(e.series.geo).replace(/^in /, 'for ')}; MN Pulse has no Minnesota-only figure for this measure.`
}

function LevelLine({ e, manifest }: { e: Entry; manifest?: Manifest }) {
  const l = latestOf(e)
  if (!l) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-2">
      {l.level && l.level !== 'unknown' && <LevelBadge level={l.level} size="sm" />}
      {l.trend && l.trend !== 'unknown' && <TrendPill trend={l.trend} />}
      {l.basis && <span>Level based on {lowerFirst(isoToText(l.basis))}.</span>}
      {l.officialLabel && (
        <span>
          Publisher’s assessment: “{l.officialLabel}”{e.series.official?.by ? ` (${e.series.official.by})` : ''}.
        </span>
      )}
      <SourceTag>Source: {sourceName(manifest, e.series)}</SourceTag>
      {l.stale && <SourceTag>Not updated in recent weeks</SourceTag>}
    </div>
  )
}

function MeasureDetails({
  group,
  entries,
  forecasts = [],
}: {
  group: { metric: SignalGroup['metric'] }
  entries: Entry[]
  forecasts?: Forecast[]
}) {
  const notes = [...new Set(entries.map((e) => e.series.note).filter((n): n is string => !!n))]
  const provisional = entries.map((e) => e.series.provisionalFrom).filter(Boolean).sort()[0]
  const thresholds = entries.find((e) => !e.muted && e.series.thresholds)?.series.thresholds
  const models = [...new Set(forecasts.map(forecastName))]
  return (
    <details className="mt-2 text-sm text-ink-2">
      <summary className="cursor-pointer rounded text-sm font-medium text-accent select-none hover:underline">
        What is this measure?
      </summary>
      <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
        <p>{MEASURE_EXPLAINER[group.metric]}</p>
        {notes.map((n) => (
          <p key={n} className="text-ink-3">
            {n}
          </p>
        ))}
        {thresholds && <p className="text-ink-3">Activity levels use cut-points from {isoToText(thresholds.by)}.</p>}
        {models.length > 0 && (
          <p className="text-ink-3">
            Forecast: {models.join('; ')}. Forecasts look a few weeks ahead and are least reliable when a season is turning.
          </p>
        )}
        {provisional && <p className="text-ink-3">Weeks from {formatDate(provisional, true)} on are preliminary and may be revised.</p>}
      </div>
    </details>
  )
}

function GroupCard({ group, profile, manifest }: { group: SignalGroup; profile: PathogenProfile; manifest?: Manifest }) {
  const { state, go } = useAppState()
  const titleId = useId()
  const lead = group.entries.find((e) => !e.muted) ?? group.entries[0]
  const l = latestOf(lead)
  const us = group.entries.find((e) => e.muted)
  const usLatest = us ? latestOf(us) : undefined
  const countLatest = lead.count ? latestOf({ series: lead.count }) : undefined
  const others = group.entries.filter((e) => !e.muted && e !== lead)
  return (
    <article aria-labelledby={titleId} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 id={titleId} className="text-base font-semibold text-ink-1">
        {METRIC_LABEL[group.metric]}
      </h3>
      <p className="text-xs text-ink-3">{MEASURE_AXIS[group.metric]}</p>
      {l && (
        <p className="mt-2 text-sm text-ink-1">
          <span className="text-ink-2">
            {lead.name}, week ending {formatDate(l.date, true)}:{' '}
          </span>
          <strong className="font-semibold">{meaningFor(lead, profile, l.value)}</strong>
          {countLatest && countLatest.date === l.date && group.metric === 'hosp_rate' && (
            <span className="text-ink-2"> ({formatValue(countLatest.value, 'count')} people admitted)</span>
          )}
          .
          {usLatest && (
            <span className="text-ink-2">
              {' '}
              U.S.: {formatValue(usLatest.value, group.unit)}
              {group.unit === 'per100k' ? ' per 100,000' : ''}.
            </span>
          )}
          {others.map((o) => {
            const ol = latestOf(o)
            return ol ? (
              <span key={o.series.id} className="text-ink-2">
                {' '}
                {o.name}: {formatValue(ol.value, group.unit)}
                {ol.date !== l.date ? ` (week ending ${formatDate(ol.date)})` : ''}.
              </span>
            ) : null
          })}
        </p>
      )}
      {regionNote(lead) && <p className="mt-1 text-xs text-ink-3">{regionNote(lead)}</p>}
      <div className="mt-2">
        <LevelLine e={lead} manifest={manifest} />
      </div>
      <div className="mt-3">
        <TrendChart
          series={group.entries.map((e) => ({ series: e.series, name: e.name, color: e.color, muted: e.muted }))}
          forecasts={group.forecasts}
          range={state.range}
          height={280}
          showThresholds={group.showThresholds}
          ariaLabel={`${METRIC_LABEL[group.metric]} for ${profile.shortName}, weekly: ${group.entries.map((e) => e.name).join(', ')}`}
        />
      </div>
      {group.hidden > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          {group.hidden} more related {group.hidden === 1 ? 'series is' : 'series are'} on the{' '}
          <button type="button" onClick={() => go('trends')} className="text-accent underline">
            Trends page
          </button>
          .
        </p>
      )}
      <MeasureDetails group={group} entries={group.entries} forecasts={group.forecasts} />
    </article>
  )
}

function AgeCard({ chart, profile, manifest, multiple }: { chart: AgeGroupChart; profile: PathogenProfile; manifest?: Manifest; multiple: boolean }) {
  const { state } = useAppState()
  const titleId = useId()
  const latest = chart.entries.map((e) => ({ e, l: latestOf(e) }))
  const date = latest.map((x) => x.l?.date).filter(Boolean).sort().at(-1)
  const audienceLabel = AUDIENCES.find((a) => a.id === state.audience)?.label
  const lead = chart.entries[0]
  return (
    <article aria-labelledby={titleId} className="border-t border-line pt-5">
      <h3 id={titleId} className="text-base font-semibold text-ink-1">
        By age: {METRIC_LABEL[chart.metric].toLowerCase()}
        {multiple ? ` (${pathogenName(lead.series.pathogen)})` : ''}
      </h3>
      <p className="text-xs text-ink-3">
        {MEASURE_AXIS[chart.metric]}, by age group{date ? `, week ending ${formatDate(date, true)}` : ''}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Latest week by age group">
        {latest.map(({ e, l }) => (
          <li
            key={e.series.id}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${
              e.highlight ? 'border-accent bg-accent-soft' : 'border-line bg-surface-1'
            }`}
          >
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-3.5 rounded-full"
              style={{ background: e.muted ? 'var(--series-muted)' : e.color }}
            />
            <span className={e.highlight ? 'font-semibold text-ink-1' : 'text-ink-2'}>{ageDisplay(e.series.age ?? e.name)}</span>
            <span className="tabular font-semibold text-ink-1">{l ? formatValue(l.value, chart.unit) : '—'}</span>
            {e.highlight && <span className="text-xs font-medium text-ink-1">Your group</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-2">
        {chart.emphasis
          ? `${audienceLabel ?? 'Your group'} is highlighted; other ages are shown in gray for comparison.`
          : state.audience === 'pregnant' || state.audience === 'immunocompromised'
            ? 'Age data can’t show risk during pregnancy or with a weakened immune system. See “Who is most at risk” below.'
            : 'Pick your group under “Who is most at risk” to highlight it here.'}{' '}
        Rates for a single age group rest on few patients and can jump from week to week.
      </p>
      <div className="mt-2">
        <SourceTag>Source: {sourceName(manifest, lead.series)}</SourceTag>
      </div>
      <div className="mt-3">
        <TrendChart
          series={chart.entries.map((e) => ({ series: e.series, name: ageDisplay(e.series.age ?? e.name), color: e.color, muted: e.muted }))}
          range={state.range}
          height={280}
          showThresholds={false}
          ariaLabel={`${METRIC_LABEL[chart.metric]} for ${profile.shortName} by age group, weekly`}
        />
      </div>
      <MeasureDetails group={chart} entries={chart.entries} />
    </article>
  )
}

function OrphanSignal({ s, pathogen, profile }: { s: SignalSummary; pathogen: PathogenId; profile: PathogenProfile }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-1">{s.label}</p>
        <p className="text-sm text-ink-2">
          {s.geo.name}, week ending {formatDate(s.latestDate, true)}:{' '}
          {metricMeaning(s.metric, s.latestValue, s.unit).replace(/\bit\b/, seriesNoun(profile, pathogen))}.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {s.level !== 'unknown' && <LevelBadge level={s.level} size="sm" />}
          <TrendPill trend={s.trend} />
        </div>
      </div>
      <Sparkline points={s.spark} label={`${s.label}, last ${s.spark.length} weeks`} />
    </li>
  )
}

const WATCH_BY_CATEGORY: Record<PathogenProfile['category'], string> = {
  'respiratory-viral': 'Overall respiratory illness on the Pulse page. This virus often rises along with other cold-weather viruses.',
  'respiratory-bacterial': 'Notices from your child’s school or child care, and MDH updates about outbreaks in your area.',
  gastrointestinal: 'Outbreak notices, food recalls, and boil-water or beach advisories from MDH and your city.',
  'vaccine-preventable': 'MDH exposure and outbreak notices, and whether your family’s vaccines are up to date.',
  'vector-borne': 'Tick and mosquito season where you live, work and play. Use repellent and check for ticks from spring through fall.',
  zoonotic: 'MDH and Minnesota Board of Animal Health notices about sick birds or animals near you.',
  syndrome: 'Overall illness levels on the Pulse page.',
}

export function NoDataCallout({ profile }: { profile: PathogenProfile }) {
  const mdh = profile.sources.find((s) => /health\.state\.mn\.us/.test(s.url))
  return (
    <Callout title={`${profile.shortName} isn’t tracked week by week in public Minnesota data`}>
      <p>
        There is no weekly Minnesota number for {inlineName(profile)} in the public data MN Pulse uses, so we don’t show a chart. That
        doesn’t mean it isn’t around.
      </p>
      <p className="mt-2 font-medium text-ink-1">What to watch for instead</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>{seasonSentence(profile.seasonality.peakMonths)}</li>
        <li>{WATCH_BY_CATEGORY[profile.category]}</li>
        <li>The symptoms and emergency warning signs listed below.</li>
        {profile.watchNotes?.length ? <li>Current notes under “What’s new” on this page.</li> : null}
      </ul>
      {mdh && (
        <p className="mt-2">
          <a href={mdh.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
            {mdh.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      )}
    </Callout>
  )
}

export function SignalSection({ profile, result, manifest }: { profile: PathogenProfile; result: BuildResult; manifest?: Manifest }) {
  const { go } = useAppState()
  const { groups, ages, orphans, hasMap, countyName } = result
  const any = groups.length > 0 || ages.length > 0 || orphans.length > 0
  if (!any) return <NoDataCallout profile={profile} />
  return (
    <div className="space-y-5">
      {(groups.length > 0 || ages.length > 0) && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterBar showGeo={false} showAudience={false} />
          {countyName && <p className="text-xs text-ink-3">Showing {countyName} (selected on the Map) next to statewide data.</p>}
        </div>
      )}
      {groups.map((g) => (
        <GroupCard key={g.key} group={g} profile={profile} manifest={manifest} />
      ))}
      {ages.map((a) => (
        <AgeCard key={a.key} chart={a} profile={profile} manifest={manifest} multiple={ages.length > 1} />
      ))}
      {orphans.length > 0 && (
        <div className="border-t border-line pt-5">
          <h3 className="text-base font-semibold text-ink-1">Latest figures</h3>
          <p className="mb-2 text-xs text-ink-3">The full history for these measures did not load; showing the latest summary only.</p>
          <ul className="space-y-2">
            {orphans.map((o) => (
              <OrphanSignal key={o.signal.seriesId} s={o.signal} pathogen={o.pathogen} profile={profile} />
            ))}
          </ul>
        </div>
      )}
      {hasMap && (
        <p className="text-sm text-ink-2">
          County and wastewater-plant detail for {inlineName(profile)} is on the{' '}
          <button type="button" onClick={() => go('map')} className="font-medium text-accent underline">
            Map
          </button>
          .
        </p>
      )}
    </div>
  )
}
