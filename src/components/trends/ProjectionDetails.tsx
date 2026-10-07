// "Projection details": which model, the 50% / 95% ranges by week, backtest skill, and cautions.
import type { Forecast, Series } from '../../../shared/types'
import { formatDate, formatValue, UNIT_SUFFIX } from '../../lib/format'
import { Callout, Card, SectionTitle } from '../ui'
import { Segmented } from './Controls'
import { forecastSourceName, formatAmount, geoLabel, lastObs, METRIC_TAB, weeksAhead } from './model'

export function ProjectionDetails({
  series,
  forecasts,
  selected,
  onSelect,
  who,
  shownOnChart,
}: {
  series?: Series
  forecasts: Forecast[]
  selected?: Forecast
  onSelect: (id: string) => void
  who: string
  shownOnChart: boolean
}) {
  const unit = series?.unit ?? 'count'
  const fmt = (v: number) => `${formatValue(v, unit)}${UNIT_SUFFIX[unit]}`
  // Compact range: unit only once ("0.23–0.34%").
  const range = (lo: number, hi: number) =>
    `${formatValue(lo, unit).replace(/%$/, '')}–${formatValue(hi, unit)}${UNIT_SUFFIX[unit]}`
  const last = series ? lastObs(series) : null

  if (!series || !selected) {
    return (
      <Card className="min-w-0" aria-labelledby="projection-details">
        <SectionTitle id="projection-details" title="Projection details" />
        <p className="text-sm text-ink-2">
          No projection is available for this measure{series ? ` in ${geoLabel(series.geo)}` : ''}. MN Pulse projects only
          statewide and regional measures with enough history, and CDC publishes forecasts for a few measures (mainly flu,
          COVID-19 and RSV hospital admissions and emergency department visits).
        </p>
      </Card>
    )
  }

  const pts = [...selected.points].sort((a, b) => (a.date < b.date ? -1 : 1)).filter((p) => !last || p.date > last[0])
  const far = pts[pts.length - 1]
  const farAhead = far ? weeksAhead(last?.[0], far.date) : undefined
  const skill = [...(selected.skill ?? [])].sort((a, b) => a.horizon - b.horizon)
  const s1 = skill[0]
  const metricTitle = METRIC_TAB[series.metric]?.title ?? series.metric

  return (
    <Card className="min-w-0" aria-labelledby="projection-details">
      <SectionTitle
        id="projection-details"
        title="Projection details"
        subtitle={`Where ${who} ${metricTitle} in ${geoLabel(series.geo)} may head next`}
      />
      {forecasts.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span>Model</span>
          <Segmented
            label="Projection model"
            options={forecasts.map((f) => ({ id: f.id, label: forecastSourceName(f) }))}
            value={selected.id}
            onChange={onSelect}
          />
        </div>
      )}

      {far && (
        <p className="text-sm text-ink-1">
          The <strong className="font-semibold">{forecastSourceName(selected)}</strong> puts the week ending{' '}
          {formatDate(far.date, true)}
          {farAhead != null && farAhead > 0 ? ` (${farAhead} week${farAhead === 1 ? '' : 's'} after the latest data)` : ''} at about{' '}
          <strong className="font-semibold">{fmt(far.median)}</strong>, most likely between {range(far.lo50, far.hi50)} and very
          likely between {range(far.lo95, far.hi95)}.
        </p>
      )}
      {!shownOnChart && <p className="mt-1 text-xs text-ink-3">Projections are hidden on the chart. Turn on “Show projections” to see them.</p>}

      <div className="mt-3 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {forecastSourceName(selected)} projection for {series.label}, by week
          </caption>
          <thead className="bg-surface-2 text-left text-xs text-ink-2">
            <tr>
              <th scope="col" className="px-2 py-2 font-medium sm:px-3">Week ending</th>
              <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">Most likely</th>
              <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">50% range</th>
              <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">95% range</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {pts.map((p) => {
              const ahead = weeksAhead(last?.[0], p.date)
              return (
                <tr key={p.date} className="border-t border-line">
                  <th scope="row" className="px-2 py-2 text-left font-normal whitespace-nowrap text-ink-1 sm:px-3">
                    {formatDate(p.date)}
                    {ahead != null && <span className="block text-xs text-ink-3 sm:ml-1 sm:inline">+{ahead} wk</span>}
                  </th>
                  <td className="px-2 py-2 text-right font-semibold whitespace-nowrap text-ink-1 sm:px-3">{fmt(p.median)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-ink-2 sm:px-3">{range(p.lo50, p.hi50)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap text-ink-2 sm:px-3">{range(p.lo95, p.hi95)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        The 50% range is where the real number is expected to land about half the time; the 95% range, about 19 times in 20.
      </p>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-ink-1">How accurate has it been?</h3>
        {s1 ? (
          <>
            <p className="mt-1 text-sm text-ink-2">
              In backtests on {s1.n} past weeks, {s1.horizon}-week-ahead projections were off by{' '}
              <strong className="font-semibold text-ink-1">{formatAmount(s1.mae, unit, series.metric)}</strong> on average, and
              the 95% range contained the actual value <strong className="font-semibold text-ink-1">{Math.round(s1.coverage95 * 100)}%</strong>{' '}
              of the time. {relText(s1.relMae)} Misses tend to be larger around a season’s peak, when numbers are high and
              change quickly, and smaller in quiet weeks.
            </p>
            {skill.length > 1 && (
              <details className="group mt-2 rounded-xl border border-line">
                <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-sm font-medium text-ink-1 hover:bg-surface-2">
                  <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">
                    ›
                  </span>
                  Accuracy by weeks ahead
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Backtest accuracy by weeks ahead</caption>
                    <thead className="text-left text-xs text-ink-2">
                      <tr>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Weeks ahead</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">Average miss</th>
                        <th scope="col" className="py-1.5 pr-3 text-right font-medium">In 95% range</th>
                        <th scope="col" className="py-1.5 text-right font-medium">vs. “no change”</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {skill.map((k) => (
                        <tr key={k.horizon} className="border-t border-line">
                          <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-1">
                            {k.horizon}
                          </th>
                          <td className="py-1.5 pr-3 text-right text-ink-2">{formatAmount(k.mae, unit, series.metric)}</td>
                          <td className="py-1.5 pr-3 text-right text-ink-2">{Math.round(k.coverage95 * 100)}%</td>
                          <td className="py-1.5 text-right text-ink-2">{relShort(k.relMae)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-ink-3">
                    “vs. no change” compares the average miss with simply assuming every future week equals the latest week.
                  </p>
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-2">
            {selected.source === 'mn-pulse'
              ? 'There is not yet enough history to backtest this projection.'
              : 'MN Pulse does not compute accuracy for CDC ensemble forecasts; CDC evaluates its forecast hubs each season.'}
          </p>
        )}
      </div>

      {(selected.method || selected.note) && (
        <details className="group mt-4 rounded-xl border border-line">
          <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-sm font-medium text-ink-1 hover:bg-surface-2">
            <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            How this projection is made
          </summary>
          <div className="space-y-1 px-3 pb-3 text-sm text-ink-2">
            {selected.method && <p>{selected.method}</p>}
            {selected.note && <p>{selected.note}</p>}
            <p className="text-xs text-ink-3">
              Model: {selected.model}. Issued {formatDate(selected.issuedAt, true)};{' '}
              {selected.source === 'mn-pulse' ? 'uses data through the week ending' : 'forecast reference week ending'}{' '}
              {formatDate(selected.referenceDate, true)}.
            </p>
          </div>
        </details>
      )}

      <div className="mt-4">
        <Callout title="Use projections with care">
          Projections assume recent patterns continue. They can miss sudden changes, such as a new variant, holiday gatherings
          or the start of school. Trust the range more than the single “most likely” number, and check back each week as new
          data arrive.
        </Callout>
      </div>
    </Card>
  )
}

function relText(rel: number): string {
  if (!Number.isFinite(rel)) return ''
  const pct = Math.round((1 - rel) * 100)
  if (pct >= 5) return `That is about ${pct}% smaller error than simply assuming next week will look like this week.`
  if (pct > -5) return 'That is about as accurate as simply assuming next week will look like this week.'
  return `That is less accurate than simply assuming next week will look like this week (${Math.abs(pct)}% larger error).`
}

function relShort(rel: number): string {
  if (!Number.isFinite(rel)) return '—'
  const pct = Math.round((1 - rel) * 100)
  if (pct > 0) return `${pct}% smaller error`
  if (pct < 0) return `${Math.abs(pct)}% larger error`
  return 'same'
}
