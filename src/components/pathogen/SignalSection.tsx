// "Right now in Minnesota": the illness's main measure charted in full, the other measures as compact tiles,
// full charts for those (and age groups) behind "More data", and a one-line note for measures that have
// stopped updating. Illnesses with no weekly public number get an honest "what to watch for" note instead.
import { useId, useState, type ReactNode } from 'react'
import type { Forecast, Manifest, PathogenId, Point, SignalSummary, Unit } from '../../../shared/types'
import type { PathogenProfile } from '../../content/types'
import { pathogenName } from '../../content'
import { useAppState } from '../../lib/state'
import { formatDate, formatValue, isCumulative, METRIC_LABEL, metricMeaning } from '../../lib/format'
import { FilterBar, AUDIENCES } from '../layout/FilterBar'
import { TrendChart } from '../charts/TrendChart'
import { Sparkline } from '../charts/Sparkline'
import { LineKey } from '../charts/ForecastLegend'
import { Callout, LevelBadge, SourceTag, TrendPill } from '../ui'
import {
  ageDisplay, basisSentence, inlineName, isCaseMetric, MEASURE_AXIS, MEASURE_EXPLAINER, regionTitle, seriesNoun, sourceName,
  sourceShort, TILE_CAPTION, wherePhrase,
} from './meta'
import { seasonSentence } from './MonthStrip'
import { datasetAbbr, latestOf, sparkOf, STALE_WEEKS, type AgeGroupChart, type BuildResult, type Entry, type Latest, type SignalGroup } from './signals'

const FORECAST_SOURCE: Record<string, string> = {
  'mn-pulse': 'MN Pulse statistical projection',
  'cdc-flusight': 'CDC FluSight ensemble forecast',
  'cdc-covidhub': 'CDC COVID-19 Forecast Hub ensemble',
  'cdc-rsvhub': 'CDC RSV Forecast Hub ensemble',
}

const forecastName = (f: Forecast) => FORECAST_SOURCE[f.source] ?? f.model

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

/** Neutral chip used where a level would sit but none applies (case counts). */
function NeutralChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink-2">
      {children}
    </span>
  )
}

/**
 * Level + trend chips for one latest value. Rt never gets a level; weekly case counts get a neutral chip; a running
 * total for the year (cases so far this year) only goes up, so it gets neither a level nor a trend arrow.
 */
function Chips({ metric, l }: { metric: SignalGroup['metric']; l: Latest }) {
  if (isCumulative(metric)) return <NeutralChip>Running total · no trend or level</NeutralChip>
  const showLevel = metric !== 'rt' && !!l.level && l.level !== 'unknown'
  return (
    <>
      {showLevel && <LevelBadge level={l.level!} size="sm" />}
      {!showLevel && isCaseMetric(metric) && <NeutralChip>Case counts — no activity level</NeutralChip>}
      {l.trend && l.trend !== 'unknown' && <TrendPill trend={l.trend} />}
    </>
  )
}

function LevelLine({ e, manifest }: { e: Entry; manifest?: Manifest }) {
  const l = latestOf(e)
  if (!l) return null
  const metric = e.series.metric
  const rt = metric === 'rt'
  const basis = rt ? undefined : basisSentence(l.basis)
  return (
    <div className="space-y-1.5 text-xs text-ink-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Chips metric={metric} l={l} />
        {rt && l.officialLabel && (
          <span>
            {e.series.official?.by?.startsWith('CDC') ? 'CDC’s estimate' : 'Publisher’s estimate'}: “{l.officialLabel}”.
          </span>
        )}
        {rt && <span>Rt shows direction of spread, not amount.</span>}
        <SourceTag>Source: {sourceName(manifest, e.series)}</SourceTag>
        {l.stale && <SourceTag>Not updated in recent weeks</SourceTag>}
      </div>
      {basis && !(isCaseMetric(metric) && (!l.level || l.level === 'unknown')) && (
        <p>
          <span className="font-medium text-ink-1">How the level is set: </span>
          {basis}
        </p>
      )}
      {!rt && l.officialLabel && !(l.basis ?? '').includes(`“${l.officialLabel}”`) && (
        <p>
          <span className="font-medium text-ink-1">Publisher’s assessment: </span>“{l.officialLabel}”
          {e.series.official?.by ? ` (${e.series.official.by})` : ''}.
        </p>
      )}
      {l.summary && (
        <p>
          <span className="font-medium text-ink-1">From {sourceShort(e.series.source, e.series.dataset)} data: </span>
          {l.summary}.
        </p>
      )}
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
        {thresholds && (
          <p className="text-ink-3">Activity levels use cut-points from {thresholds.by.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (d) => formatDate(d, true))}.</p>
        )}
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

// ── Compact tiles ───────────────────────────────────────────────────────────

interface TileProps {
  /** Small label above the figure (the measure, or the series name for "also measured" tiles). */
  label: string
  /** Second line: place / system. */
  sub?: string
  metric: SignalGroup['metric']
  unit: Unit
  latest: Latest
  spark: Point[]
  source: string
  dataset?: string
  /** Extra caption, e.g. "Weekly history isn't published for this measure". */
  note?: string
  action?: ReactNode
}

function Tile({ label, sub, metric, unit, latest: l, spark, source, dataset, note, action }: TileProps) {
  const sparkPts = spark.filter((p) => p[1] != null)
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface-1 p-3">
      <div className="min-w-0">
        <p className="text-sm leading-snug font-medium text-ink-1">{label}</p>
        {sub && <p className="text-xs text-ink-3">{sub}</p>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="min-w-0 leading-tight">
          <span className="text-xl font-semibold text-ink-1">{formatValue(l.value, unit)}</span>{' '}
          <span className="text-xs text-ink-2">{TILE_CAPTION[metric]}</span>
        </p>
        {sparkPts.length >= 3 && (
          <Sparkline points={spark} width={88} height={28} color="var(--series-1)" label={`${label}${sub ? `, ${sub}` : ''}: last ${spark.length} weeks`} className="shrink-0" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chips metric={metric} l={l} />
      </div>
      {metric === 'rt' && <p className="text-xs text-ink-2">Rt shows direction of spread, not amount.</p>}
      {l.summary && (
        <p className="text-xs text-ink-2">
          From {sourceShort(source, dataset)} data: {l.summary}.
        </p>
      )}
      <p className="mt-auto text-xs text-ink-3">
        {isCumulative(metric) ? 'As of' : 'Week ending'} {formatDate(l.date, true)} · {sourceShort(source, dataset)}
      </p>
      {note && <p className="text-xs text-ink-3">{note}</p>}
      {action}
    </li>
  )
}

function EntryTile({ e, label, sub, action }: { e: Entry; label: string; sub?: string; action?: ReactNode }) {
  const l = latestOf(e)
  if (!l) return null
  return (
    <Tile
      label={label}
      sub={sub}
      metric={e.series.metric}
      unit={e.series.unit}
      latest={l}
      spark={sparkOf(e)}
      source={e.series.source}
      dataset={e.series.dataset}
      action={action}
    />
  )
}

function OrphanTile({ s, profile, pathogen }: { s: SignalSummary; profile: PathogenProfile; pathogen: PathogenId }) {
  const l: Latest = { date: s.latestDate, value: s.latestValue, level: s.level, trend: s.trend, basis: s.levelBasis }
  return (
    <Tile
      label={METRIC_LABEL[s.metric]}
      sub={`${pathogen !== profile.id ? `${pathogenName(pathogen)}, ` : ''}${regionTitle(s.geo) ?? s.geo.name}`}
      metric={s.metric}
      unit={s.unit}
      latest={l}
      spark={s.spark}
      source={s.source}
      note="Weekly history isn’t published for this measure."
    />
  )
}

/** Place / sub-type line for a group's lead tile (the source is in the tile's footer; plant counts in its title). */
const leadSub = (e: Entry) =>
  regionTitle(e.series.geo) ??
  e.name
    .split(', ')
    .filter((p) => !/^median of /.test(p))
    .join(', ')

/** Measure families: the first tiles show one measure from each before a second from any. */
const FAMILY: Partial<Record<SignalGroup['metric'], string>> = {
  ed_visit_pct: 'visits',
  ili_pct: 'visits',
  test_positivity: 'tests',
  detection_rate: 'tests',
  wastewater_level: 'wastewater',
  wastewater_conc: 'wastewater',
  ww_detections: 'wastewater',
  hosp_rate: 'hospital',
  hosp_admissions: 'hospital',
  cases: 'cases',
  cases_ytd: 'cases',
}

/** Which kinds of measure an average reader most needs in the first tiles (Rt and counts of outbreaks come later). */
const FAMILY_PRIORITY = ['tests', 'wastewater', 'hospital', 'visits', 'cases']
const familyRank = (g: SignalGroup) => {
  const i = FAMILY_PRIORITY.indexOf(FAMILY[g.metric] ?? g.metric)
  return i === -1 ? FAMILY_PRIORITY.length : i
}

/** Order groups so the first few cover different kinds of measure (e.g. lab tests, wastewater, hospital). */
function diverse(groups: SignalGroup[], skip?: SignalGroup): SignalGroup[] {
  const seen = new Set<string>(skip ? [FAMILY[skip.metric] ?? skip.metric] : [])
  const first: SignalGroup[] = []
  const rest: SignalGroup[] = []
  for (const g of groups) {
    const f = FAMILY[g.metric] ?? g.metric
    if (seen.has(f)) rest.push(g)
    else {
      seen.add(f)
      first.push(g)
    }
  }
  return [...first.sort((a, b) => familyRank(a) - familyRank(b)), ...rest]
}

// ── Full chart for one measure ──────────────────────────────────────────────

function GroupCard({
  group,
  profile,
  manifest,
  anchorId,
  primary = false,
}: {
  group: SignalGroup
  profile: PathogenProfile
  manifest?: Manifest
  anchorId?: string
  primary?: boolean
}) {
  const { state, go } = useAppState()
  const titleId = useId()
  const { lead } = group
  const l = latestOf(lead)
  const us = group.entries.find((e) => e.muted)
  const usLatest = us ? latestOf(us) : undefined
  const countLatest = lead.count ? latestOf({ series: lead.count }) : undefined
  const fewPoints = lead.series.points.filter((p) => p[1] != null).length < 3 && group.entries.length === 1
  const Heading = primary ? 'h3' : 'h4'
  return (
    <article id={anchorId} aria-labelledby={titleId} className="scroll-mt-28 sm:scroll-mt-20">
      <Heading id={titleId} className="text-base font-semibold text-ink-1 outline-none">
        {group.title}
      </Heading>
      <p className="text-xs text-ink-3">
        {MEASURE_AXIS[group.metric]}
        {group.subtitle ? ` · ${group.subtitle}` : ''}
      </p>
      {l && (
        <p className="mt-2 text-sm text-ink-1">
          <span className="text-ink-2">
            {lead.name}, {isCumulative(group.metric) ? 'as of' : 'week ending'} {formatDate(l.date, true)}:{' '}
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
        </p>
      )}
      {regionNote(lead) && <p className="mt-1 text-xs text-ink-3">{regionNote(lead)}</p>}
      <div className="mt-2">
        <LevelLine e={lead} manifest={manifest} />
      </div>
      {fewPoints ? (
        <p className="mt-3 text-xs text-ink-3">
          Only {lead.series.points.filter((p) => p[1] != null).length === 1 ? 'one value is' : 'a few values are'} published for this measure,
          so there is no trend line to draw.
        </p>
      ) : (
        <div className="mt-3">
          <TrendChart
            series={group.entries.map((e) => ({ series: e.series, name: e.name, color: e.color, muted: e.muted }))}
            forecasts={group.forecasts}
            range={state.range}
            height={primary ? 280 : 240}
            showThresholds={group.showThresholds}
            ariaLabel={`${group.title} for ${profile.shortName}, weekly: ${group.entries.map((e) => e.name).join(', ')}`}
          />
        </div>
      )}
      {group.alternates.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-ink-3 uppercase">Also measured</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {group.alternates.map((e) =>
              // Same place and sub-type as the chart's line: name the system instead ("MDH RESP-NET").
              e.name === lead.name ? (
                <EntryTile key={e.series.id} e={e} label={datasetAbbr(e.series)} sub={e.name} />
              ) : (
                <EntryTile key={e.series.id} e={e} label={e.name} sub={sourceName(manifest, e.series)} />
              ),
            )}
          </ul>
        </div>
      )}
      {group.hidden > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          {group.hidden} more related {group.hidden === 1 ? 'series is' : 'series are'} on the{' '}
          <button type="button" onClick={() => go('trends')} className="text-accent underline">
            Trends page
          </button>
          .
        </p>
      )}
      <MeasureDetails group={group} entries={[...group.entries, ...group.alternates]} forecasts={group.forecasts} />
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
    <article aria-labelledby={titleId}>
      <h4 id={titleId} className="text-base font-semibold text-ink-1">
        By age: {METRIC_LABEL[chart.metric].toLowerCase()}
        {multiple ? ` (${pathogenName(lead.series.pathogen)})` : ''}
      </h4>
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
            <LineKey color={e.color ?? 'var(--series-muted)'} width={16} />
            <span className={e.highlight ? 'font-semibold text-ink-1' : 'text-ink-2'}>{ageDisplay(e.series.age ?? e.name)}</span>
            <span className="tabular font-semibold text-ink-1">{l ? formatValue(l.value, chart.unit) : '—'}</span>
            {e.highlight && <span className="text-xs font-medium text-ink-1">Your group</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-2">
        {chart.emphasis
          ? `${audienceLabel ?? 'Your group'} is highlighted; other ages are shown in fainter blue for comparison.`
          : `Lines step from the faintest blue (youngest) to the strongest blue (oldest). ${
              state.audience === 'pregnant' || state.audience === 'immunocompromised'
                ? 'Age data can’t show risk during pregnancy or with a weakened immune system. See “Who is most at risk” above.'
                : 'Pick your group under “Who is most at risk” to highlight it here.'
            }`}{' '}
        Rates for a single age group rest on few patients and can jump from week to week.
      </p>
      <div className="mt-2">
        <SourceTag>Source: {sourceName(manifest, lead.series)}</SourceTag>
      </div>
      <div className="mt-3">
        <TrendChart
          series={chart.entries.map((e) => ({ series: e.series, name: ageDisplay(e.series.age ?? e.name), color: e.color, muted: e.muted }))}
          range={state.range}
          height={240}
          showThresholds={false}
          ariaLabel={`${METRIC_LABEL[chart.metric]} for ${profile.shortName} by age group, weekly`}
        />
      </div>
      <MeasureDetails group={chart} entries={chart.entries} />
    </article>
  )
}

// ── No weekly data ──────────────────────────────────────────────────────────

const WATCH_BY_CATEGORY: Record<PathogenProfile['category'], string> = {
  'respiratory-viral': 'Check overall respiratory illness on the Pulse page; this virus often rises along with other cold-weather viruses.',
  'respiratory-bacterial': 'Watch for notices from your child’s school or child care, and MDH updates about outbreaks in your area.',
  gastrointestinal: 'Watch for outbreak notices, food recalls, and boil-water or beach advisories from MDH and your city.',
  'vaccine-preventable': 'Watch for MDH exposure and outbreak notices, and check that your family’s vaccines are up to date.',
  'vector-borne': 'Ticks and mosquitoes are active from spring through fall — use repellent and check for ticks.',
  zoonotic: 'Watch for MDH and Minnesota Board of Animal Health notices about sick birds or animals near you.',
  syndrome: 'Check overall illness levels on the Pulse page.',
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
        <li>The symptoms and emergency warning signs listed above.</li>
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

function StaleLine({ result }: { result: BuildResult }) {
  const { go } = useAppState()
  if (!result.stale.length) return null
  return (
    <p className="text-xs text-ink-3">
      <span className="font-medium text-ink-2">Not updated in the last {STALE_WEEKS} weeks: </span>
      {result.stale.map((s, i) => (
        <span key={s.key}>
          {i > 0 ? '; ' : ''}
          {s.title} ({s.name}, {sourceShort(s.source)}), last value week ending {formatDate(s.date, true)}
        </span>
      ))}
      . Their history is on the{' '}
      <button type="button" onClick={() => go('trends')} className="text-accent underline">
        Trends page
      </button>
      .
    </p>
  )
}

/** True when the section has anything current to show (charts, tiles or age charts). */
export const hasLiveSignals = (r: BuildResult) => r.groups.length > 0 || r.ages.length > 0 || r.orphans.length > 0

const VISIBLE_TILES = 3

export function SignalSection({ profile, result, manifest }: { profile: PathogenProfile; result: BuildResult; manifest?: Manifest }) {
  const { go } = useAppState()
  const [open, setOpen] = useState(false)
  const drawerId = useId()
  const { groups, ages, orphans, hasMap, countyName } = result
  if (!hasLiveSignals(result)) {
    return (
      <div className="space-y-4">
        <NoDataCallout profile={profile} />
        <StaleLine result={result} />
      </div>
    )
  }
  const primary = groups[0]
  const others = diverse(groups.slice(1), primary)
  const anchor = (g: SignalGroup) => `chart-${profile.id}-${g.key.replace(/[^a-z0-9]+/gi, '-')}`
  const openChart = (g: SignalGroup) => {
    setOpen(true)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(anchor(g))
        if (!el) return
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
        const h = el.querySelector<HTMLElement>('h3, h4')
        if (h) {
          h.setAttribute('tabindex', '-1')
          h.focus({ preventScroll: true })
        }
      }),
    )
  }
  type TileItem = { key: string; node: ReactNode }
  const tiles: TileItem[] = [
    ...others.map((g) => ({
      key: g.key,
      node: (
        <EntryTile
          key={g.key}
          e={g.lead}
          label={g.title}
          sub={leadSub(g.lead)}
          action={
            <button type="button" onClick={() => openChart(g)} className="self-start text-xs font-medium text-accent hover:underline">
              See chart<span className="sr-only">: {g.title}</span> <span aria-hidden="true">↓</span>
            </button>
          }
        />
      ),
    })),
    ...orphans.map((o) => ({
      key: o.signal.seriesId,
      node: <OrphanTile key={o.signal.seriesId} s={o.signal} profile={profile} pathogen={o.pathogen} />,
    })),
  ]
  const shownTiles = tiles.slice(0, VISIBLE_TILES)
  const extraTiles = tiles.slice(VISIBLE_TILES).filter((t) => orphans.some((o) => o.signal.seriesId === t.key))
  const drawerCount = others.length + ages.length + extraTiles.length
  const charts = (primary ? 1 : 0) + others.length + ages.length
  return (
    <div className="space-y-5">
      {charts > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterBar showGeo={false} showAudience={false} />
          {countyName && <p className="text-xs text-ink-3">Showing {countyName} (selected on the Map) next to statewide data.</p>}
        </div>
      )}
      {primary && <GroupCard group={primary} profile={profile} manifest={manifest} primary />}

      {shownTiles.length > 0 && (
        <section aria-labelledby={`${drawerId}-other`} className="border-t border-line pt-4">
          <h3 id={`${drawerId}-other`} className="mb-2 text-sm font-semibold text-ink-1">
            {primary ? 'Other measures' : 'Latest figures'}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{shownTiles.map((t) => t.node)}</ul>
        </section>
      )}

      {drawerCount > 0 && (
        <div className="border-t border-line pt-4">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={drawerId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-1 hover:bg-surface-2"
          >
            More data ({drawerCount})
            <span aria-hidden="true" className="text-ink-3">
              {open ? '▾' : '▸'}
            </span>
          </button>
          <span className="ml-3 text-xs text-ink-3">
            {[
              others.length ? `charts for ${others.length === 1 ? 'the other measure' : `all ${others.length} other measures`}` : '',
              ages.length ? 'rates by age group' : '',
              extraTiles.length ? 'more figures' : '',
            ]
              .filter(Boolean)
              .join(', ')
              .replace(/^./, (c) => c.toUpperCase())}
          </span>
          {open && (
            <div id={drawerId} className="mt-4 space-y-6">
              {extraTiles.length > 0 && <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{extraTiles.map((t) => t.node)}</ul>}
              {others.map((g) => (
                <div key={g.key} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
                  <GroupCard group={g} profile={profile} manifest={manifest} anchorId={anchor(g)} />
                </div>
              ))}
              {ages.map((a) => (
                <div key={a.key} className="border-t border-line pt-5 first:border-t-0 first:pt-0">
                  <AgeCard chart={a} profile={profile} manifest={manifest} multiple={ages.length > 1} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <StaleLine result={result} />
      <p className="text-sm text-ink-2">
        Every series for {inlineName(profile)}, with downloads, is on the{' '}
        <button type="button" onClick={() => go('trends')} className="font-medium text-accent underline">
          Trends page
        </button>
        {hasMap ? (
          <>
            ; county and wastewater-plant detail is on the{' '}
            <button type="button" onClick={() => go('map')} className="font-medium text-accent underline">
              Map
            </button>
          </>
        ) : null}
        .
      </p>
    </div>
  )
}
