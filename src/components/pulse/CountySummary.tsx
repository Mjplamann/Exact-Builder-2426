// County snapshot shown in the hero when a county is selected: every county-level metric the pipeline
// published (pulse.counties) plus wastewater plants that serve the county (pulse.sites). Nothing is
// estimated here: if the county has no published numbers we say so and keep the statewide view.
import type { CountyMetric, MapLayer, MetricKind, PulseFile } from '../../../shared/types'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { pathogenName } from '../../content'
import { formatDate, formatValue, METRIC_LABEL } from '../../lib/format'
import { LevelBadge, TrendPill } from '../ui'
import { naturalFrequency } from './util'

interface Row {
  key: string
  layer?: MapLayer
  metric: CountyMetric
  where?: string
}

interface Group {
  id: string
  title: string
  note?: string
  rows: Row[]
}

const GROUP_ORDER: MetricKind[] = ['ed_visit_pct', 'hosp_rate', 'test_positivity', 'wastewater_level', 'wastewater_conc', 'cases']

function groupNote(metric: MetricKind | undefined, sites: boolean, county: string): string | undefined {
  if (metric === 'ed_visit_pct') return `CDC estimates for the hospital service area that includes ${county}; neighboring counties may share a value.`
  if (sites) return 'Treatment plants that serve part or all of the county. Wastewater can show changes before people see a doctor.'
  return undefined
}

export function CountySummary({ pulse, fips }: { pulse: PulseFile; fips: string }) {
  const county = MN_COUNTY_BY_FIPS[fips]
  const name = county ? `${county.name} County` : 'This county'
  const layers = new Map(pulse.mapLayers.map((l) => [l.id, l]))

  const groups = new Map<string, Group>()
  const add = (row: Row, site: boolean) => {
    const metric = row.layer?.metric
    const id = `${site ? 'site' : 'county'}:${metric ?? 'other'}`
    if (!groups.has(id)) {
      const title = site ? `Wastewater${metric && metric !== 'wastewater_level' ? ` (${METRIC_LABEL[metric].toLowerCase()})` : ''}` : metric ? METRIC_LABEL[metric] : 'Other measures'
      groups.set(id, { id, title, note: groupNote(metric, site, name), rows: [] })
    }
    groups.get(id)!.rows.push(row)
  }
  const c = pulse.counties.find((x) => x.fips === fips)
  for (const [key, metric] of Object.entries(c?.metrics ?? {})) add({ key, layer: layers.get(key), metric }, false)
  for (const site of pulse.sites.filter((s) => s.counties?.includes(fips))) {
    for (const [key, metric] of Object.entries(site.metrics)) add({ key: `${site.id}:${key}`, layer: layers.get(key), metric, where: site.name }, true)
  }
  const ordered = [...groups.values()].sort((a, b) => {
    const ia = a.id.startsWith('site') ? 100 : GROUP_ORDER.indexOf(a.rows[0].layer?.metric as MetricKind)
    const ib = b.id.startsWith('site') ? 100 : GROUP_ORDER.indexOf(b.rows[0].layer?.metric as MetricKind)
    return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib)
  })
  for (const g of ordered) {
    g.rows.sort((a, b) => label(a).localeCompare(label(b)) || (a.where ?? '').localeCompare(b.where ?? ''))
  }

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-base font-semibold text-ink-1">{name}: latest local numbers</h2>
        {county && (
          <p className="text-xs text-ink-3">
            {county.schsacRegion} region · population {county.pop.total.toLocaleString('en-US')}
          </p>
        )}
      </div>
      {ordered.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">
          No county-level numbers have been published for {name} yet, so the rest of this page shows the statewide picture.
        </p>
      ) : (
        <div className={`mt-3 grid gap-x-8 gap-y-4 ${ordered.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {ordered.map((g) => {
            const dates = [...new Set(g.rows.map((r) => r.metric.date))]
            return (
              <section key={g.id} aria-label={g.title} className="min-w-0">
                <h3 className="text-sm font-semibold text-ink-1">
                  {g.title}
                  {dates.length === 1 && <span className="font-normal text-ink-3"> · week ending {formatDate(dates[0], true)}</span>}
                </h3>
                {g.note && <p className="mt-0.5 text-xs text-ink-3">{g.note}</p>}
                <ul className="mt-1 divide-y divide-line">
                  {g.rows.map((r) => {
                    const unit = r.layer?.unit ?? '%'
                    const freq = r.layer ? naturalFrequency(r.metric.value, r.layer.metric, unit) : undefined
                    return (
                      <li key={r.key} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm text-ink-1">
                            <span className="font-medium">{label(r)}</span>
                            {r.where && <span className="text-ink-2"> · {r.where}</span>}
                          </p>
                          <p className="text-xs text-ink-3">
                            {r.layer?.metric === 'wastewater_level' && 'Viral activity level '}
                            <span className="font-semibold text-ink-1">{formatValue(r.metric.value, unit)}</span>
                            {freq && <> · {freq}</>}
                            {dates.length > 1 && <> · wk ending {formatDate(r.metric.date)}</>}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                          {r.metric.level && <LevelBadge level={r.metric.level} size="sm" />}
                          {r.metric.trend && <TrendPill trend={r.metric.trend} compact />}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function label(r: Row): string {
  return r.layer ? pathogenName(r.layer.pathogen) : r.key
}
