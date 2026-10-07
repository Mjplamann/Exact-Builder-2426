// "All signals" table for the selected illness, grouped by measure, with a CSV export of what is on the chart.
// Statewide, national and selected-place rows are listed under each measure; finer geographies (MDH
// districts, treatment plants) sit behind a disclosure so they don't bury the headline numbers.
import { Fragment, useId, useState, type ReactNode } from 'react'
import { formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { Card, EmptyState, LevelBadge, SectionTitle, TrendPill } from '../ui'
import type { PathogenId, Series } from '../../../shared/types'
import { pathogenName } from '../../content'
import {
  changeDisplay, groupSignalRows, measureLabel, publisherTrendText, type SignalGroup, type SignalRow, type SignalSubGroup,
} from './model'

export function SignalsTable({
  rows,
  charted,
  who,
  pathogen,
  onPick,
  onDownload,
  canDownload,
}: {
  rows: SignalRow[]
  charted: Set<string>
  who: string
  /** The selected illness; rows for its sub-types (e.g. Flu A) are tagged. */
  pathogen: PathogenId
  onPick: (s: Series) => void
  onDownload: () => void
  canDownload: boolean
}) {
  const uid = useId().replace(/:/g, '')
  const groups = groupSignalRows(rows, pathogen)
  // Sub-groups start collapsed, except one holding the charted line; a toggle flips that default.
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const isOpen = (sg: SignalSubGroup) => sg.rows.some((r) => charted.has(r.series.id)) !== flipped.has(sg.key)
  const flip = (key: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const subId = (sg: SignalSubGroup, kind: 'list' | 'rows') => `sig-${uid}-${kind}-${sg.key.replace(/[^a-z0-9]+/gi, '-')}`

  return (
    <Card aria-labelledby="all-signals">
      <SectionTitle
        id="all-signals"
        title={`All signals for ${who}`}
        subtitle="Every measure we track for this illness, grouped by measure. Select one to chart it."
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
          {/* Phone: stacked list, one section per measure */}
          <div className="space-y-4 sm:hidden">
            {groups.map((g) => (
              <section key={g.metric} aria-label={g.title}>
                <h3 className="border-b border-line pb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">{g.title}</h3>
                <ul className="divide-y divide-[var(--border)]">
                  {g.rows.map((r) => (
                    <PhoneRow key={r.series.id} r={r} pathogen={pathogen} charted={charted.has(r.series.id)} onPick={onPick} />
                  ))}
                </ul>
                {g.subgroups.map((sg) => (
                  <div key={sg.key} className="border-t border-line pt-2">
                    <DisclosureButton sg={sg} open={isOpen(sg)} controls={subId(sg, 'list')} onToggle={() => flip(sg.key)} />
                    <ul id={subId(sg, 'list')} hidden={!isOpen(sg)} className="mt-1 divide-y divide-[var(--border)] border-l-2 border-line pl-3">
                      {sg.rows.map((r) => (
                        <PhoneRow key={r.series.id} r={r} pathogen={pathogen} charted={charted.has(r.series.id)} onPick={onPick} />
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>

          {/* Tablet and up: one table, a header row per measure */}
          <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">All surveillance signals for {who}, grouped by measure</caption>
              <thead className="bg-surface-2 text-left text-xs text-ink-2">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Measure</th>
                  <th scope="col" className="px-3 py-2 font-medium">Where</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Latest</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Change
                    <span className="block font-normal text-ink-3">3-wk avg vs. 2 wks earlier</span>
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">Level</th>
                  <th scope="col" className="px-3 py-2 font-medium">As of</th>
                </tr>
              </thead>
              {groups.map((g) => (
                <GroupBody
                  key={g.metric}
                  g={g}
                  pathogen={pathogen}
                  charted={charted}
                  onPick={onPick}
                  isOpen={isOpen}
                  flip={flip}
                  subId={subId}
                />
              ))}
            </table>
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Change compares the average of the latest 3 weeks with the 3-week average two weeks earlier. Where a percentage would
        mislead — the latest week is 0, or the trend is Steady because the change is tiny in absolute terms — the absolute
        change is shown instead. Level uses official thresholds when the publisher defines them; otherwise it compares the
        latest week with that measure’s own past 3 years. Rt has no level: it shows the direction of spread.
      </p>
    </Card>
  )
}

function GroupBody({
  g,
  pathogen,
  charted,
  onPick,
  isOpen,
  flip,
  subId,
}: {
  g: SignalGroup
  pathogen: PathogenId
  charted: Set<string>
  onPick: (s: Series) => void
  isOpen: (sg: SignalSubGroup) => boolean
  flip: (key: string) => void
  subId: (sg: SignalSubGroup, kind: 'list' | 'rows') => string
}) {
  return (
    <>
      <tbody>
        <tr className="border-t border-line bg-surface-2/50">
          <th scope="colgroup" colSpan={6} className="px-3 pt-3 pb-1 text-left text-xs font-semibold tracking-wide text-ink-2 uppercase">
            {g.title}
          </th>
        </tr>
        {g.rows.map((r) => (
          <TableRow key={r.series.id} r={r} pathogen={pathogen} charted={charted.has(r.series.id)} onPick={onPick} />
        ))}
      </tbody>
      {g.subgroups.map((sg) => (
        <Fragment key={sg.key}>
          <tbody>
            <tr className="border-t border-line">
              <td colSpan={6} className="px-3 py-1.5">
                <DisclosureButton sg={sg} open={isOpen(sg)} controls={subId(sg, 'rows')} onToggle={() => flip(sg.key)} />
              </td>
            </tr>
          </tbody>
          <tbody id={subId(sg, 'rows')} hidden={!isOpen(sg)}>
            {sg.rows.map((r) => (
              <TableRow key={r.series.id} r={r} pathogen={pathogen} charted={charted.has(r.series.id)} onPick={onPick} sub />
            ))}
          </tbody>
        </Fragment>
      ))}
    </>
  )
}

function DisclosureButton({ sg, open, controls, onToggle }: { sg: SignalSubGroup; open: boolean; controls: string; onToggle: () => void }) {
  const top = [...sg.rows].filter((r) => r.latestValue != null).sort((a, b) => (b.latestValue ?? 0) - (a.latestValue ?? 0))[0]
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="flex w-full items-start gap-1.5 rounded-md py-0.5 text-left text-sm font-medium text-ink-1 hover:text-accent"
    >
      <span aria-hidden="true" className={`inline-block w-3 shrink-0 text-center text-ink-2 transition-transform ${open ? 'rotate-90' : ''}`}>
        ›
      </span>
      <span className="min-w-0">
        {sg.label} ({sg.rows.length})
        {!open && top && top.latestValue != null && (
          <span className="ml-2 inline-block text-xs font-normal text-ink-3">
            highest latest: {top.geo} {value(top)}
          </span>
        )}
      </span>
    </button>
  )
}

const value = (r: SignalRow) => (r.latestValue == null ? '—' : `${formatValue(r.latestValue, r.series.unit)}${UNIT_SUFFIX[r.series.unit]}`)
const asOf = (r: SignalRow) => (r.latestDate ? formatDate(r.latestDate, true) : '—')

function RowLabel({ r, pathogen, charted, onPick }: { r: SignalRow; pathogen: PathogenId; charted: boolean; onPick: (s: Series) => void }) {
  const subtype = r.series.pathogen !== pathogen ? pathogenName(r.series.pathogen) : undefined
  return (
    <>
      <button
        type="button"
        onClick={() => onPick(r.series)}
        className="text-left font-medium text-ink-1 underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-current"
      >
        {subtype && <span className="mr-1.5 inline-block rounded bg-surface-3 px-1 py-px text-[11px] font-semibold text-ink-1">{subtype}</span>}
        {measureLabel(r.label)}
      </button>
      {charted && <OnChart />}
    </>
  )
}

function ChangeCell({ r }: { r: SignalRow }) {
  const c = changeDisplay(r)
  return <span title={c.kind === 'abs' ? 'Absolute change of the 3-week average' : undefined}>{c.text}</span>
}

/** Level badge, or for Rt the direction of spread (it has no activity level); nothing for running totals. */
function LevelCell({ r }: { r: SignalRow }): ReactNode {
  const m = r.series.metric
  if (m === 'rt') {
    const pub = publisherTrendText(r)
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        {r.trend !== 'unknown' ? <TrendPill trend={r.trend} compact /> : <span className="text-xs text-ink-2">Direction unclear</span>}
        {pub && <span className="text-xs text-ink-2">{pub}</span>}
      </span>
    )
  }
  if (m === 'cases_ytd') {
    return (
      <span className="text-xs text-ink-2" title={r.levelBasis}>
        No level (running total)
      </span>
    )
  }
  return (
    <span title={r.levelBasis}>
      <LevelBadge level={r.level} size="sm" />
    </span>
  )
}

function TableRow({ r, pathogen, charted, onPick, sub = false }: { r: SignalRow; pathogen: PathogenId; charted: boolean; onPick: (s: Series) => void; sub?: boolean }) {
  // On the highlighted (charted) row, secondary text steps up to ink-2 to keep 4.5:1 on the tinted fill.
  const secondary = charted ? 'text-ink-2' : 'text-ink-3'
  return (
    <tr className={`border-t border-line ${charted ? 'bg-accent-soft' : ''}`}>
      <th scope="row" className={`py-2 pr-3 text-left font-normal ${sub ? 'pl-7' : 'pl-3'}`}>
        <RowLabel r={r} pathogen={pathogen} charted={charted} onPick={onPick} />
        <span className={`block text-xs ${secondary}`}>{r.sourceName}</span>
      </th>
      <td className="px-3 py-2 text-ink-2">{r.geo}</td>
      <td className="tabular px-3 py-2 text-right font-semibold whitespace-nowrap text-ink-1">{value(r)}</td>
      <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink-2">
        <ChangeCell r={r} />
      </td>
      <td className="px-3 py-2">
        <LevelCell r={r} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-ink-2">
        {asOf(r)}
        {r.stale && <span className={`block text-xs ${secondary}`}>not updated recently</span>}
      </td>
    </tr>
  )
}

function PhoneRow({ r, pathogen, charted, onPick }: { r: SignalRow; pathogen: PathogenId; charted: boolean; onPick: (s: Series) => void }) {
  const c = changeDisplay(r)
  return (
    <li className={`py-3 ${charted ? '-mx-2 rounded-lg bg-accent-soft px-2' : ''}`}>
      <div className="text-sm">
        <RowLabel r={r} pathogen={pathogen} charted={charted} onPick={onPick} />
      </div>
      <p className={`mt-0.5 text-xs ${charted ? 'text-ink-2' : 'text-ink-3'}`}>
        {r.geo} · {r.sourceName}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="tabular font-semibold text-ink-1">{value(r)}</span>
        {c.kind !== 'none' && (
          <span className="tabular text-ink-2">
            {c.text}
            <span className={charted ? 'text-ink-2' : 'text-ink-3'}> 3-wk avg vs. 2 wks before</span>
          </span>
        )}
        <LevelCell r={r} />
      </div>
      <p className={`mt-1 text-xs ${charted ? 'text-ink-2' : 'text-ink-3'}`}>
        Week ending {asOf(r)}
        {r.stale && ' · not updated recently'}
      </p>
    </li>
  )
}

function OnChart() {
  return (
    <span className="ml-2 inline-flex items-center rounded-md border border-line px-1.5 py-0.5 align-middle text-[11px] font-medium text-ink-2">
      On chart
    </span>
  )
}
