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
    minimal: `under ${fmtCut(t.low)}`,
    low: fmtCut(t.low),
    moderate: fmtCut(t.moderate),
    high: fmtCut(t.high),
    'very-high': fmtCut(t.veryHigh),
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
    <div className="mt-5 overflow-hidden rounded-xl border border-line bg-surface-1">
      <table className="w-full text-left text-xs sm:text-sm">
        <caption className="border-b border-line bg-surface-2 px-3 py-2 text-left">
          <span className="block text-sm font-semibold text-ink-1">{title}</span>
          <span className="block text-xs text-ink-2">{unitNote}. Each number is where that level starts.</span>
        </caption>
        <thead>
          <tr className="text-ink-3">
            <th scope="col" className="px-2 pt-2 pb-1 font-medium sm:px-3">
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
              <th scope="row" className="px-2 py-1.5 font-normal whitespace-nowrap sm:px-3">
                <LevelBadge level={lvl} size="sm" />
              </th>
              {cols.map((c) => (
                <td key={c.key} className="tabular px-2 py-1.5 text-right whitespace-nowrap text-ink-2 sm:px-3">
                  {cells(c.series)[lvl]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {showLatest && latest.some(Boolean) && (
        <div className="border-t border-line px-3 py-2.5">
          <p className="text-xs font-semibold text-ink-1">
            Minnesota now{latestDates.length > 0 && <> · week ending {latestDates.map((d) => formatDate(d, true)).join(' / ')}</>}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {cols.map((c, i) => {
              const l = latest[i]
              if (!l) return null
              return (
                <li key={c.key} className="flex items-center gap-1.5 text-sm text-ink-2">
                  <span>{pathogenName(c.series.pathogen)}</span>
                  <span className="tabular font-semibold text-ink-1">
                    {formatValue(l.value, c.series.unit)}
                    {UNIT_SUFFIX[c.series.unit]}
                  </span>
                  <LevelBadge level={l.level} size="sm" />
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <p className="border-t border-line px-3 py-2 text-xs text-ink-3">Source: {byNotes.join('; ')}.</p>
    </div>
  )
}
