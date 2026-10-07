// The latest value of the charted measure, with its level, trend, date, source and a plain-words meaning.
import { formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { LevelBadge, SourceTag, TrendPill } from '../ui'
import { changeDisplay, plainMeaning, publisherTrendText, type SignalRow } from './model'

export function LatestSummary({ row, who }: { row: SignalRow; who: string }) {
  const s = row.series
  if (row.latestValue == null || !row.latestDate) {
    return <p className="text-sm text-ink-2">No values have been reported for this measure yet.</p>
  }
  const change = changeDisplay(row)
  const pubTrend = publisherTrendText(row)
  // Rt and running totals have no activity level: show the direction (or nothing) instead of "Not enough data".
  const showLevel = s.metric !== 'rt' && s.metric !== 'cases_ytd'
  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div>
          <p className="text-xs font-medium text-ink-3">Latest week</p>
          <p className="text-3xl leading-tight font-semibold tracking-tight text-ink-1">
            {formatValue(row.latestValue, s.unit)}
            {UNIT_SUFFIX[s.unit] && <span className="ml-1 text-base font-medium text-ink-2">{UNIT_SUFFIX[s.unit].trim()}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-1">
          {showLevel && (
            <span title={row.levelBasis}>
              <LevelBadge level={row.level} size="sm" />
            </span>
          )}
          {row.trend !== 'unknown' && <TrendPill trend={row.trend} />}
          {pubTrend && <span className="text-xs text-ink-2">{pubTrend}</span>}
          {change.kind !== 'none' && (
            <span className="tabular text-xs text-ink-2">
              {change.text}{' '}
              <span className="text-ink-3">3-week average vs. 2 weeks earlier</span>
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-1">{plainMeaning(s, row.latestValue, who)}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span>Week ending {formatDate(row.latestDate, true)}</span>
        <span aria-hidden="true">·</span>
        <SourceTag>Source: {row.sourceName}</SourceTag>
        {s.official?.label && s.official.by && !pubTrend && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {s.official.by} says “{s.official.label}”
            </span>
          </>
        )}
      </p>
    </div>
  )
}
