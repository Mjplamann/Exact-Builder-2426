// County snapshot shown in the hero when a county is selected: every county-level metric the pipeline
// published (pulse.counties) plus wastewater plants that serve the county (pulse.sites). Nothing is
// estimated here: if the county has no published numbers we say so and keep the statewide view.
import type { CountyMetric, MapLayer, PulseFile } from '../../../shared/types'
import { MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { formatDate, formatValue } from '../../lib/format'
import { LevelBadge, TrendPill } from '../ui'
import { naturalFrequency } from './util'

interface Row {
  key: string
  layer?: MapLayer
  metric: CountyMetric
  where?: string
}

export function CountySummary({ pulse, fips }: { pulse: PulseFile; fips: string }) {
  const county = MN_COUNTY_BY_FIPS[fips]
  const name = county ? `${county.name} County` : 'This county'
  const layers = new Map(pulse.mapLayers.map((l) => [l.id, l]))
  const rows: Row[] = []
  const c = pulse.counties.find((x) => x.fips === fips)
  for (const [key, metric] of Object.entries(c?.metrics ?? {})) rows.push({ key, layer: layers.get(key), metric })
  for (const site of pulse.sites.filter((s) => s.counties?.includes(fips))) {
    for (const [key, metric] of Object.entries(site.metrics)) rows.push({ key: `${site.id}:${key}`, layer: layers.get(key), metric, where: site.name })
  }
  rows.sort((a, b) => (a.layer?.label ?? a.key).localeCompare(b.layer?.label ?? b.key))

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-2 p-3 sm:p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-ink-1">{name}</h2>
        {county && (
          <p className="text-xs text-ink-3">
            {county.schsacRegion} region · population {county.pop.total.toLocaleString('en-US')}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-ink-2">
          No county-level numbers have been published for {name} yet, so the rest of this page shows the statewide picture.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-2">
            Latest local numbers.
            {rows.some((r) => r.layer?.metric === 'ed_visit_pct') &&
              ` County ER figures are CDC estimates for the hospital service area that includes ${name}, so neighboring counties may share a value.`}
            {rows.some((r) => r.where) && ' Wastewater results are for treatment plants that serve part or all of the county.'}
          </p>
          <ul className="mt-3 divide-y divide-line">
            {rows.map((r) => {
              const unit = r.layer?.unit ?? '%'
              const freq = r.layer ? naturalFrequency(r.metric.value, r.layer.metric, unit) : undefined
              return (
                <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-1">
                      {r.layer?.label ?? r.key}
                      {r.where && <span className="font-normal text-ink-2"> · {r.where}</span>}
                    </p>
                    <p className="text-xs text-ink-3">
                      <span className="font-semibold text-ink-1">{formatValue(r.metric.value, unit)}</span>
                      {freq && <> ({freq})</>} · week ending {formatDate(r.metric.date, true)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {r.metric.level && <LevelBadge level={r.metric.level} size="sm" />}
                    {r.metric.trend && <TrendPill trend={r.metric.trend} compact />}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
