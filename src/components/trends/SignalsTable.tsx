// "All signals" table for the selected illness, with a CSV export of what is on the chart.
import { formatChange, formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { Card, EmptyState, LevelBadge, SectionTitle } from '../ui'
import type { Series } from '../../../shared/types'
import type { SignalRow } from './model'

export function SignalsTable({
  rows,
  charted,
  who,
  onPick,
  onDownload,
  canDownload,
}: {
  rows: SignalRow[]
  charted: Set<string>
  who: string
  onPick: (s: Series) => void
  onDownload: () => void
  canDownload: boolean
}) {
  const value = (r: SignalRow) => (r.latestValue == null ? '—' : `${formatValue(r.latestValue, r.series.unit)}${UNIT_SUFFIX[r.series.unit]}`)
  const change = (r: SignalRow) => (r.change2w == null ? '—' : formatChange(r.change2w))
  const asOf = (r: SignalRow) => (r.latestDate ? formatDate(r.latestDate, true) : '—')

  return (
    <Card aria-labelledby="all-signals">
      <SectionTitle
        id="all-signals"
        title={`All signals for ${who}`}
        subtitle="Every measure we track for this illness. Select one to chart it."
        right={
          <button
            type="button"
            onClick={onDownload}
            disabled={!canDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-1 px-3 py-1.5 text-sm font-medium text-ink-1 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-describedby="csv-hint"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
            </svg>
            Download CSV
          </button>
        }
      />
      <p id="csv-hint" className="-mt-1 mb-3 text-xs text-ink-3">
        The download contains the lines on the chart above for the selected time range, plus projections when shown.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No signals yet">There is no published data for this illness yet.</EmptyState>
      ) : (
        <>
          {/* Phone: stacked list */}
          <ul className="divide-y divide-[var(--border)] sm:hidden">
            {rows.map((r) => (
              <li key={r.series.id} className="py-3">
                <button
                  type="button"
                  onClick={() => onPick(r.series)}
                  className="text-left text-sm font-medium text-ink-1 underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-current"
                >
                  {r.label}
                </button>
                {charted.has(r.series.id) && <OnChart />}
                <p className="mt-0.5 text-xs text-ink-3">
                  {r.geo} · {r.sourceName}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="tabular font-semibold text-ink-1">{value(r)}</span>
                  <span className="tabular text-ink-2">
                    {change(r)}
                    {r.change2w != null && <span className="text-ink-3"> in 2 wks</span>}
                  </span>
                  <span title={r.levelBasis}>
                    <LevelBadge level={r.level} size="sm" />
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  Week ending {asOf(r)}
                  {r.stale && ' · not updated recently'}
                </p>
              </li>
            ))}
          </ul>

          {/* Tablet and up: table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">All surveillance signals for {who}</caption>
              <thead className="bg-surface-2 text-left text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Measure</th>
                  <th scope="col" className="px-3 py-2 font-medium">Where</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Latest</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">2-week change</th>
                  <th scope="col" className="px-3 py-2 font-medium">Level</th>
                  <th scope="col" className="px-3 py-2 font-medium">As of</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.series.id} className={`border-t border-line ${charted.has(r.series.id) ? 'bg-accent-soft' : ''}`}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <button
                        type="button"
                        onClick={() => onPick(r.series)}
                        className="text-left font-medium text-ink-1 underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-current"
                      >
                        {r.label}
                      </button>
                      {charted.has(r.series.id) && <OnChart />}
                      <span className="block text-xs text-ink-3">{r.sourceName}</span>
                    </th>
                    <td className="px-3 py-2 text-ink-2">{r.geo}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold whitespace-nowrap text-ink-1">{value(r)}</td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink-2">{change(r)}</td>
                    <td className="px-3 py-2" title={r.levelBasis}>
                      <LevelBadge level={r.level} size="sm" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-ink-2">
                      {asOf(r)}
                      {r.stale && <span className="block text-xs text-ink-3">not updated recently</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-ink-3">
        2-week change compares the average of the latest 3 weeks with the same average two weeks earlier. Level uses official
        thresholds when the publisher defines them; otherwise it compares the latest week with that measure’s own past 3 years.
      </p>
    </Card>
  )
}

function OnChart() {
  return (
    <span className="ml-2 inline-flex items-center rounded-md border border-line px-1.5 py-0.5 align-middle text-[11px] font-medium text-ink-2">
      On chart
    </span>
  )
}
