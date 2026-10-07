// Official publisher cut-points (e.g. CDC PRISM for Minnesota), read live from Series.thresholds.
// Rows are activity levels (color + text via LevelBadge); columns are pathogens.
import type { ActivityLevel, Series } from '../../../shared/types'
import { levelFromCuts } from '../../../shared/risk'
import { pathogenName } from '../../content'
import { formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { lastPoint } from '../../lib/series'
import { LevelBadge } from '../ui'

export interface ThresholdColumn {
  key: string
  series: Series
}

const fmtCut = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1))

function cells(s: Series): Record<Exclude<ActivityLevel, 'unknown'>, string> {
  const t = s.thresholds!
  return {
    minimal: `< ${fmtCut(t.low)}`,
    low: `${fmtCut(t.low)}–${fmtCut(t.moderate)}`,
    moderate: `${fmtCut(t.moderate)}–${fmtCut(t.high)}`,
    high: `${fmtCut(t.high)}–${fmtCut(t.veryHigh)}`,
    'very-high': `≥ ${fmtCut(t.veryHigh)}`,
  }
}

const ROWS: Exclude<ActivityLevel, 'unknown'>[] = ['minimal', 'low', 'moderate', 'high', 'very-high']

export function ThresholdTable({
  title,
  unitNote,
  columns,
  showLatest = true,
}: {
  title: string
  /** e.g. "Percent of all emergency department visits". */
  unitNote: string
  columns: ThresholdColumn[]
  showLatest?: boolean
}) {
  const cols = columns.filter((c) => c.series.thresholds)
  if (!cols.length) return null
  const byNotes = [...new Set(cols.map((c) => c.series.thresholds!.by))]
  const latest = cols.map((c) => {
    const lp = lastPoint(c.series.points)
    if (!lp) return null
    const t = c.series.thresholds!
    return { date: lp[0], value: lp[1], level: levelFromCuts(lp[1], [t.low, t.moderate, t.high, t.veryHigh]) }
  })
  const latestDates = [...new Set(latest.filter(Boolean).map((l) => l!.date))]
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface-1">
      <table className="w-full min-w-[19rem] text-left text-xs sm:text-sm">
        <caption className="border-b border-line bg-surface-2 px-3 py-2 text-left">
          <span className="block text-sm font-semibold text-ink-1">{title}</span>
          <span className="block text-xs text-ink-2">{unitNote}</span>
        </caption>
        <thead>
          <tr className="text-ink-3">
            <th scope="col" className="px-3 pt-2 pb-1 font-medium">
              Level
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className="px-2 pt-2 pb-1 text-right font-semibold text-ink-1 sm:px-3">
                {pathogenName(c.series.pathogen)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((lvl) => (
            <tr key={lvl} className="border-t border-line">
              <th scope="row" className="px-3 py-1.5 font-normal whitespace-nowrap">
                <LevelBadge level={lvl} size="sm" />
              </th>
              {cols.map((c) => (
                <td key={c.key} className="tabular px-2 py-1.5 text-right whitespace-nowrap text-ink-2 sm:px-3">
                  {cells(c.series)[lvl]}
                </td>
              ))}
            </tr>
          ))}
          {showLatest && (
            <tr className="border-t-2 border-line-strong align-top">
              <th scope="row" className="px-3 py-2 text-left font-semibold text-ink-1">
                Latest week
              </th>
              {cols.map((c, i) => {
                const l = latest[i]
                return (
                  <td key={c.key} className="px-2 py-2 text-right sm:px-3">
                    {l ? (
                      <span className="inline-flex flex-col items-end gap-1">
                        <span className="tabular font-semibold text-ink-1">
                          {formatValue(l.value, c.series.unit)}
                          {UNIT_SUFFIX[c.series.unit]}
                        </span>
                        <LevelBadge level={l.level} size="sm" />
                      </span>
                    ) : (
                      <span className="text-ink-3">No data</span>
                    )}
                  </td>
                )
              })}
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
        Each number is where that level starts. Source: {byNotes.join('; ')}.
        {showLatest && latestDates.length > 0 && <> Latest week ending {latestDates.map((d) => formatDate(d, true)).join(' / ')}.</>}
      </p>
    </div>
  )
}
