// Live backtest skill of the MN Pulse projection (Forecast.skill), explained in plain words,
// plus a list of the CDC ensemble forecasts currently loaded.
import { useId, useMemo, useState } from 'react'
import { METRIC_UNITS, type Forecast, type MetricKind, type PathogenId, type Series, type Unit } from '../../../shared/types'
import { pathogenName } from '../../content'
import { formatDate, METRIC_LABEL } from '../../lib/format'
import { EmptyState } from '../ui'

const PATHOGEN_ORDER: PathogenId[] = ['influenza', 'covid', 'rsv']
const METRIC_ORDER: MetricKind[] = ['ed_visit_pct', 'hosp_rate', 'hosp_admissions']

function rank<T>(order: T[], v: T) {
  const i = order.indexOf(v)
  return i === -1 ? order.length : i
}

function fmtNum(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString('en-US')
  if (v >= 10) return v.toFixed(0)
  if (v >= 1) return v.toFixed(1)
  return v.toFixed(2)
}

/** Mean absolute error in the measure's own units, in words. */
function fmtMiss(mae: number, unit: Unit): string {
  if (unit === '%') return `± ${fmtNum(mae)} pts`
  return `± ${fmtNum(mae)}`
}

/** What the typical-miss numbers are measured in, for the notes. */
function missUnit(unit: Unit, metric: MetricKind): string {
  if (unit === '%') return 'percentage points (pts)'
  if (unit === 'per100k') return 'admissions per 100,000 residents'
  if (metric === 'hosp_admissions') return 'admissions per week'
  return 'the measure’s own units'
}

const pctRange = (xs: number[]) => {
  const lo = Math.round(Math.min(...xs) * 100)
  const hi = Math.round(Math.max(...xs) * 100)
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`
}

function fmtRel(rel: number): { text: string; better: boolean } {
  const d = Math.round((1 - rel) * 100)
  if (Math.abs(d) < 2) return { text: 'About the same', better: false }
  return d > 0 ? { text: `${d}% smaller`, better: true } : { text: `${-d}% larger`, better: false }
}

const measureLabel = (f: Forecast, series: Series[]) =>
  series.find((s) => s.id === f.seriesId)?.label ?? `${pathogenName(f.pathogen)} — ${METRIC_LABEL[f.metric]}`

export function ProjectionSkill({ forecasts, series }: { forecasts: Forecast[]; series: Series[] }) {
  const ours = useMemo(
    () =>
      forecasts
        .filter((f) => f.source === 'mn-pulse' && f.geo.type === 'state' && f.skill?.length)
        .sort(
          (a, b) =>
            rank(PATHOGEN_ORDER, a.pathogen) - rank(PATHOGEN_ORDER, b.pathogen) ||
            rank(METRIC_ORDER, a.metric) - rank(METRIC_ORDER, b.metric) ||
            a.id.localeCompare(b.id),
        ),
    [forecasts],
  )
  const [pick, setPick] = useState<string | undefined>(undefined)
  const selectId = useId()
  const f = ours.find((x) => x.id === pick) ?? ours[0]

  if (!f) {
    return (
      <div className="mt-5">
        <EmptyState title="No projection skill numbers yet">
          Backtest results appear here once MN Pulse has projected at least one Minnesota measure.
        </EmptyState>
      </div>
    )
  }

  // Summary across all Minnesota measures at 1 and the longest horizon.
  const h1 = ours.map((x) => x.skill!.find((s) => s.horizon === 1)).filter((s) => !!s)
  const cov = ours.flatMap((x) => x.skill!.map((s) => s.coverage95))
  const unit = series.find((s) => s.id === f.seriesId)?.unit ?? METRIC_UNITS[f.metric]
  const rel1 = h1.map((s) => s.relMae)
  const better1 = rel1.filter((r) => r < 1).length

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-1">
      <div className="border-b border-line bg-surface-2 px-3 py-2">
        <h3 className="text-sm font-semibold text-ink-1">How accurate has the MN Pulse projection been?</h3>
        <p className="text-xs text-ink-2">
          From backtests over the past ~2 years, updated with every data refresh.
          {h1.length > 0 && (
            <>
              {' '}
              One week ahead, it beat a simple “no change” guess for {better1} of {h1.length} Minnesota measures; its 95% ranges
              contained {pctRange(cov)} of actual outcomes.
            </>
          )}
        </p>
      </div>
      <div className="px-3 pt-3">
        <label htmlFor={selectId} className="block text-xs font-medium text-ink-2">
          Measure
        </label>
        <select
          id={selectId}
          value={f.id}
          onChange={(e) => setPick(e.target.value)}
          className="mt-1 w-full max-w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1"
        >
          {ours.map((x) => (
            <option key={x.id} value={x.id}>
              {measureLabel(x, series)}
            </option>
          ))}
        </select>
      </div>
      <table className="mt-2 w-full text-left text-xs sm:text-sm">
        <caption className="sr-only">Backtest accuracy of the MN Pulse projection for {measureLabel(f, series)}</caption>
        <thead>
          <tr className="text-ink-3">
            <th scope="col" className="px-3 py-1.5 font-medium">
              Weeks ahead
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Typical miss
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">
              Error vs. “no change”
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Inside 95% range
            </th>
          </tr>
        </thead>
        <tbody>
          {f.skill!.map((s) => {
            const rel = fmtRel(s.relMae)
            return (
              <tr key={s.horizon} className="border-t border-line">
                <th scope="row" className="tabular px-3 py-2 font-medium text-ink-1">
                  {s.horizon}
                </th>
                <td className="tabular px-2 py-2 text-right whitespace-nowrap text-ink-1">{fmtMiss(s.mae, unit)}</td>
                <td className={`tabular px-2 py-2 text-right whitespace-nowrap ${rel.better ? 'font-medium text-ink-1' : 'text-ink-2'}`}>{rel.text}</td>
                <td className="tabular px-3 py-2 text-right text-ink-1">{Math.round(s.coverage95 * 100)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="space-y-1 border-t border-line px-3 py-2 text-xs text-ink-3">
        <li>
          <span className="font-medium text-ink-2">Typical miss</span> is the average distance between the projection’s middle
          value and what actually happened, in {missUnit(unit, f.metric)}.
        </li>
        <li>
          <span className="font-medium text-ink-2">Error vs. “no change”</span> compares that miss with simply assuming the
          next weeks equal this week. Smaller is better.
        </li>
        <li>
          <span className="font-medium text-ink-2">Inside 95% range</span> is how often the actual value landed inside the 95%
          range; it should be close to 95%. Based on{' '}
          {Math.min(...f.skill!.map((s) => s.n))}–{Math.max(...f.skill!.map((s) => s.n))} past weeks; data through{' '}
          {formatDate(f.referenceDate, true)}.
        </li>
      </ul>
    </div>
  )
}

/** The CDC ensemble forecasts currently loaded, grouped by model. */
export function CdcEnsembles({ forecasts }: { forecasts: Forecast[] }) {
  const groups = new Map<string, Forecast[]>()
  for (const f of forecasts) {
    if (f.source === 'mn-pulse') continue
    if (!groups.has(f.model)) groups.set(f.model, [])
    groups.get(f.model)!.push(f)
  }
  if (!groups.size) {
    return (
      <p className="mt-4 text-sm text-ink-3">
        No CDC ensemble forecasts are loaded right now (hubs publish weekly during each respiratory season).
      </p>
    )
  }
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-ink-1">CDC ensemble forecasts loaded now</h3>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {[...groups.entries()].map(([model, fs]) => {
          const pathogens = [...new Set(fs.map((f) => pathogenName(f.pathogen)))].join(', ')
          const ref = fs.map((f) => f.referenceDate).sort().at(-1)
          return (
            <li key={model} className="rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-xs text-ink-2">
              <span className="font-semibold text-ink-1">{model}</span> · {pathogens} · {fs.length} forecast
              {fs.length === 1 ? '' : 's'} · reference week {formatDate(ref, true)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
