// The latest value of the charted measure, with its level, trend, date, source and a plain-words meaning.
import { formatChange, formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { LevelBadge, SourceTag, TrendPill } from '../ui'
import { plainMeaning, type SignalRow } from './model'

export function LatestSummary({ row, who }: { row: SignalRow; who: string }) {
  const s = row.series
  if (row.latestValue == null || !row.latestDate) {
    return <p className="text-sm text-ink-2">No values have been reported for this measure yet.</p>
  }
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
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <span title={row.levelBasis}>
            <LevelBadge level={row.level} size="sm" />
          </span>
          <TrendPill trend={row.trend} />
          {row.change2w != null && (
            <span className="tabular text-xs text-ink-2">
              {formatChange(row.change2w)} <span className="text-ink-3">vs. 2 weeks earlier</span>
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-1">{plainMeaning(s, row.latestValue, who)}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <span>Week ending {formatDate(row.latestDate, true)}</span>
        <span aria-hidden="true">·</span>
        <SourceTag>Source: {row.sourceName}</SourceTag>
        {s.official?.label && s.official.by && (
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
