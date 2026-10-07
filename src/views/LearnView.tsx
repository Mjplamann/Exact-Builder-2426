// "Understand the numbers": a plain-language explainer for every measure on MN Pulse, with live
// examples (latest values, official thresholds, projection skill) read from the published data.
import { useEffect, useMemo, type ReactNode } from 'react'
import type { DashboardData } from '../lib/data'
import type { MetricKind, PathogenId, Series } from '../../shared/types'
import { addDays } from '../../shared/mmwr'
import { GLOSSARY, LEARN_INTRO, LEARN_SECTIONS } from '../content/learn'
import { pathogenName } from '../content'
import { useDashboard } from '../lib/dashboard'
import { useAppState } from '../lib/state'
import { lastPoint } from '../lib/series'
import { TrendChart } from '../components/charts/TrendChart'
import { EmptyState } from '../components/ui'
import { LearnToc, jumpToSection, useActiveSection, type TocItem } from '../components/learn/LearnToc'
import { Glossary, LearnSectionBlock, SectionShell } from '../components/learn/LearnSection'
import { LatestTable, latestRows, sourceName } from '../components/learn/LatestTable'
import { PositivityExplorer, type PositivityPreset } from '../components/learn/PositivityExplorer'
import { LevelScale } from '../components/learn/LevelScale'
import { ThresholdTable, type ThresholdColumn } from '../components/learn/ThresholdTable'
import { TrendRules } from '../components/learn/TrendRules'
import { CdcEnsembles, ProjectionSkill } from '../components/learn/ProjectionSkill'

const PATHOGEN_ORDER: PathogenId[] = ['influenza', 'covid', 'rsv', 'respiratory-combined']
const byPathogen = (a: Series, b: Series) => {
  const ia = PATHOGEN_ORDER.indexOf(a.pathogen)
  const ib = PATHOGEN_ORDER.indexOf(b.pathogen)
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.id.localeCompare(b.id)
}

/** First Minnesota statewide, all-ages series with official thresholds for each pathogen. */
function thresholdColumns(series: Series[], metric: MetricKind, geoType: Series['geo']['type'] = 'state'): ThresholdColumn[] {
  const seen = new Set<PathogenId>()
  const cols: ThresholdColumn[] = []
  for (const s of [...series].sort(byPathogen)) {
    if (s.metric !== metric || !s.thresholds || s.age || s.geo.type !== geoType) continue
    if (geoType === 'state' && s.geo.code !== '27') continue
    if (seen.has(s.pathogen)) continue
    seen.add(s.pathogen)
    cols.push({ key: s.id, series: s })
  }
  return cols
}

/** Live positivity / detection-rate presets for the icon array (recent data only, one per pathogen). */
function positivityPresets(data: DashboardData): PositivityPreset[] {
  const cutoff = addDays(data.manifest.generatedAt.slice(0, 10), -35)
  const rows = latestRows(data.series, { metrics: ['test_positivity', 'detection_rate'], geoTypes: ['state', 'hhs-region', 'census-region'] })
    .filter((r) => r.date >= cutoff)
    .sort((a, b) => {
      // Minnesota first, then the region-level sources; higher values first within each.
      const ga = a.series.geo.type === 'state' ? 0 : 1
      const gb = b.series.geo.type === 'state' ? 0 : 1
      return ga - gb || b.value - a.value
    })
  const seen = new Set<string>()
  const out: PositivityPreset[] = []
  for (const r of rows) {
    if (seen.has(r.series.pathogen)) continue
    seen.add(r.series.pathogen)
    const where =
      r.series.metric === 'detection_rate'
        ? 'Midwest BioFire'
        : r.series.geo.type === 'hhs-region'
          ? 'Region 5 labs'
          : 'MN labs'
    out.push({
      id: r.series.id,
      label: `${pathogenName(r.series.pathogen)} · ${where}`,
      detail: r.series.label,
      value: r.value,
      date: r.date,
      source: sourceName(data.manifest, r.series.source),
    })
    if (out.length >= 4) break
  }
  return out
}

function Facts({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm text-ink-2">{children}</p>
}

function LiveData({ id, data }: { id: string; data: DashboardData }) {
  const { manifest, series, pulse, forecasts } = data
  switch (id) {
    case 'positivity':
      return <PositivityExplorer presets={positivityPresets(data)} />

    case 'biofire':
      return (
        <LatestTable
          rows={latestRows(series, { metrics: ['detection_rate'], geoTypes: ['census-region'] })}
          manifest={manifest}
          caption="BioFire detection rates in MN Pulse now · Midwest region"
          emptyTitle="No BioFire data loaded right now"
          emptyText="Midwest detection rates appear here when bioMérieux reports or partner-lab exports are available."
        />
      )

    case 'ed-visits': {
      const countyIds = new Set(pulse.mapLayers.filter((l) => l.kind === 'county' && l.metric === 'ed_visit_pct').map((l) => l.id))
      const fromPulse = pulse.counties.filter((c) => Object.keys(c.metrics).some((k) => countyIds.has(k))).length
      const fromSeries = new Set(series.filter((s) => s.metric === 'ed_visit_pct' && s.geo.type === 'county').map((s) => s.geo.code)).size
      const counties = Math.max(fromPulse, fromSeries)
      return (
        <>
          <LatestTable
            rows={latestRows(series, { metrics: ['ed_visit_pct'], geoTypes: ['state'], geoCodes: ['27'] })}
            manifest={manifest}
            caption="Minnesota ED visit percentages in MN Pulse now"
            emptyTitle="No emergency department data loaded right now"
            emptyText="Statewide NSSP values appear here when CDC's data are available."
            sort="none"
          />
          <Facts>
            {counties > 0
              ? `County view: ${counties} Minnesota counties currently have ED estimates, shared within each health service area.`
              : 'County-level ED estimates are not loaded right now.'}
          </Facts>
        </>
      )
    }

    case 'hospital': {
      const ages = [...new Set(series.filter((s) => s.age && (s.metric === 'hosp_rate' || s.metric === 'hosp_admissions')).map((s) => s.age!))]
      return (
        <>
          <LatestTable
            rows={latestRows(series, { metrics: ['hosp_rate', 'hosp_admissions'], geoTypes: ['state'], geoCodes: ['27'] }).sort(
              (a, b) => byPathogen(a.series, b.series) || a.series.metric.localeCompare(b.series.metric),
            )}
            manifest={manifest}
            caption="Minnesota hospital measures in MN Pulse now"
            emptyTitle="No hospital data loaded right now"
            emptyText="NHSN admissions and RESP-NET rates appear here when CDC's data are available."
            sort="none"
            limit={8}
          />
          <Facts>
            {ages.length > 0
              ? `Age-specific RESP-NET rates are available for ${ages.length} age groups (${ages.slice(0, 6).join(', ')}${ages.length > 6 ? ', …' : ''}).`
              : 'Age-specific hospitalization rates are not loaded right now.'}
          </Facts>
        </>
      )
    }

    case 'wastewater': {
      const sites = pulse.sites.length
      const sewersheds = new Set(series.filter((s) => s.geo.type === 'sewershed').map((s) => s.geo.code)).size
      const wvalCols = thresholdColumns(series, 'wastewater_level', 'state')
      const wvalAny = wvalCols.length ? wvalCols : thresholdColumns(series, 'wastewater_level', 'sewershed')
      return (
        <>
          <LatestTable
            rows={latestRows(series, { metrics: ['wastewater_level', 'ww_detections'], geoTypes: ['state'] })}
            manifest={manifest}
            caption="Minnesota wastewater measures in MN Pulse now"
            emptyTitle="No statewide wastewater data loaded right now"
            emptyText="CDC wastewater levels and detection counts appear here when the data are available."
            sort="none"
          />
          <Facts>
            {sewersheds > 0 || sites > 0
              ? `Treatment plants with data in MN Pulse: ${Math.max(sites, sewersheds)}. Each represents only the homes and businesses on its sewer system.`
              : 'Plant-level wastewater data are not loaded right now.'}
          </Facts>
          {wvalAny.length > 0 && (
            <ThresholdTable
              title="CDC wastewater level cut-points"
              unitNote="Wastewater Viral Activity Level (unitless; each plant compared with its own baseline)"
              columns={wvalAny}
              showLatest={wvalCols.length > 0}
            />
          )}
        </>
      )
    }

    case 'lab-positivity':
      return (
        <LatestTable
          rows={latestRows(series, { metrics: ['test_positivity'], geoTypes: ['hhs-region'] })}
          manifest={manifest}
          caption="HHS Region 5 lab positivity in MN Pulse now"
          emptyTitle="No regional lab positivity loaded right now"
          emptyText="NREVSS percent positive for Region 5 appears here when CDC's data are available."
        />
      )

    case 'rt':
      return (
        <LatestTable
          rows={latestRows(series, { metrics: ['rt'], geoTypes: ['state'], geoCodes: ['27'] }).sort((a, b) => byPathogen(a.series, b.series))}
          manifest={manifest}
          caption="Minnesota Rt estimates in MN Pulse now"
          emptyTitle="No Rt estimates loaded right now"
          emptyText="CDC's Minnesota Rt estimates and epidemic-trend calls appear here when available."
          sort="none"
        />
      )

    case 'activity-levels': {
      const ed = thresholdColumns(series, 'ed_visit_pct')
      const hosp = thresholdColumns(series, 'hosp_rate')
      const example = ed[0]?.series
      return (
        <>
          {ed.length || hosp.length ? (
            <>
              <h3 className="mt-6 text-base font-semibold text-ink-1">CDC’s official cut-points for Minnesota</h3>
              <ThresholdTable title="Emergency department visits" unitNote="Percent of all ED visits in Minnesota (NSSP)" columns={ed} />
              <ThresholdTable title="Hospital admissions" unitNote="New lab-confirmed admissions per 100,000 Minnesotans per week (NHSN)" columns={hosp} />
            </>
          ) : (
            <div className="mt-5">
              <EmptyState title="Official cut-points are not loaded right now">
                CDC’s Minnesota thresholds appear here when the forecast-hub data are available.
              </EmptyState>
            </div>
          )}
          <LevelScale />
          <TrendRules />
          {example && lastPoint(example.points) && (
            <figure className="mt-6">
              <figcaption className="mb-2">
                <span className="block text-sm font-semibold text-ink-1">Example: {example.label}, with CDC’s level bands</span>
                <span className="block text-xs text-ink-3">
                  {example.geo.name} · {sourceName(manifest, example.source)}
                </span>
              </figcaption>
              <TrendChart
                series={[{ series: example }]}
                range="2y"
                height={260}
                showThresholds
                ariaLabel={`${example.label} over the past two years with CDC activity-level bands`}
              />
            </figure>
          )}
        </>
      )
    }

    case 'projections': {
      // Example chart: a Minnesota measure with both a CDC ensemble and the MN Pulse projection if possible.
      const mn = data.series.filter((s) => s.geo.type === 'state' && s.geo.code === '27' && !s.age)
      const withBoth = mn.find(
        (s) => forecasts.forecasts.some((f) => f.seriesId === s.id && f.source === 'mn-pulse') && forecasts.forecasts.some((f) => f.seriesId === s.id && f.source !== 'mn-pulse'),
      )
      const ex = withBoth ?? mn.find((s) => forecasts.forecasts.some((f) => f.seriesId === s.id))
      const exForecasts = ex ? forecasts.forecasts.filter((f) => f.seriesId === ex.id) : []
      return (
        <>
          <CdcEnsembles forecasts={forecasts.forecasts} />
          <ProjectionSkill forecasts={forecasts.forecasts} series={series} />
          {ex && (
            <figure className="mt-6">
              <figcaption className="mb-2">
                <span className="block text-sm font-semibold text-ink-1">Example: {ex.label}, with projections</span>
                <span className="block text-xs text-ink-3">
                  {ex.geo.name} · {sourceName(manifest, ex.source)} · shaded bands show the 50% and 95% ranges
                </span>
              </figcaption>
              <TrendChart
                series={[{ series: ex }]}
                forecasts={exForecasts}
                range="6m"
                height={260}
                showThresholds={false}
                ariaLabel={`${ex.label} over the past six months with projections for the next weeks`}
              />
            </figure>
          )}
        </>
      )
    }

    default:
      return null
  }
}

const BIOFIRE = 'biofire'

/** Short placeholder for the BioFire explainer while MN Pulse has no BioFire series (kept last, not second). */
function BiofireComingSoon({ index }: { index: number }) {
  const { go } = useAppState()
  return (
    <SectionShell id={BIOFIRE} index={index} title="BioFire detection rates: coming soon">
      <p className="leading-relaxed text-ink-2">
        BioFire panels test one sample for many germs at once; a “detection rate” is the share of panels that found a given germ. Public
        figures cover only the Midwest region and the U.S., not Minnesota by itself.
      </p>
      <p className="mt-2 leading-relaxed text-ink-2">
        MN Pulse doesn’t have BioFire data yet. When bioMérieux or a partner lab shares exports, Midwest detection rates will appear here
        and on the illness pages.
      </p>
      <p className="mt-3">
        <button
          type="button"
          onClick={() => {
            go('sources')
            requestAnimationFrame(() => requestAnimationFrame(() => jumpToSection('biofire-data')))
          }}
          className="text-sm font-medium text-accent hover:underline"
        >
          How a lab can contribute BioFire data <span aria-hidden="true">→</span>
        </button>
      </p>
    </SectionShell>
  )
}

export default function LearnView() {
  const { data } = useDashboard()
  // The BioFire explainer moves to the end as a short note until BioFire series exist.
  const hasBiofire = !!data?.series.some((s) => s.metric === 'detection_rate')
  const sections = useMemo(
    () => (hasBiofire ? LEARN_SECTIONS : LEARN_SECTIONS.filter((s) => s.id !== BIOFIRE)),
    [hasBiofire],
  )
  const toc: TocItem[] = useMemo(
    () => [
      ...sections.map((s) => ({ id: s.id, label: s.short })),
      ...(hasBiofire ? [] : [{ id: BIOFIRE, label: 'BioFire (coming soon)' }]),
      { id: 'glossary', label: 'Glossary' },
    ],
    [sections, hasBiofire],
  )
  const ids = useMemo(() => toc.map((t) => t.id), [toc])
  const active = useActiveSection(ids)

  // Optional deep link: #/learn?section=activity-levels (on load and on later hash changes).
  useEffect(() => {
    const follow = () => {
      const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      const target = q.get('section')
      if (target && ids.includes(target)) requestAnimationFrame(() => jumpToSection(target))
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [ids])

  return (
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
      {/* Phones: the page title comes first, outside any landmark; desktop shows it in the article. */}
      <div className="lg:hidden">
        <Intro />
      </div>
      {/* Not an <aside>: the nav inside is already labelled "On this page". */}
      <div className="min-w-0">
        <LearnToc items={toc} active={active} />
      </div>
      <article className="min-w-0 max-w-3xl">
        <div className="hidden lg:block">
          <Intro />
        </div>
        <div className="space-y-8">
          {sections.map((s, i) => (
            <LearnSectionBlock key={s.id} section={s} index={i + 1}>
              {data && <LiveData id={s.id} data={data} />}
            </LearnSectionBlock>
          ))}
          {!hasBiofire && <BiofireComingSoon index={sections.length + 1} />}
          <SectionShell id="glossary" index={toc.length} title="Glossary">
            <p className="mb-4 leading-relaxed text-ink-2">Short definitions of terms used across MN Pulse.</p>
            <Glossary entries={GLOSSARY} />
          </SectionShell>
        </div>
      </article>
    </div>
  )
}

function Intro() {
  return (
    <header className="mb-8">
      <p className="text-sm font-semibold text-accent">{LEARN_INTRO.eyebrow}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-1 sm:text-3xl">{LEARN_INTRO.title}</h1>
      <p className="mt-3 leading-relaxed text-ink-2">{LEARN_INTRO.lede}</p>
      <ul className="card mt-5 divide-y divide-line sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {LEARN_INTRO.keyIdeas.map((k, i) => (
          <li key={k.title} className="flex gap-3 p-4">
            <span
              aria-hidden="true"
              className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-ink-2"
            >
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-1">{k.title}</p>
              <p className="mt-1 text-sm text-ink-2">{k.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </header>
  )
}
