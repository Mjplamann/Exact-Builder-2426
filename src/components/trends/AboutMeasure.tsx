// "About this measure": what the charted number means, who publishes it, how fresh it is,
// caveats, and the publisher's official activity thresholds when they exist.
import type { ActivityLevel, Series, SourceStatus } from '../../../shared/types'
import { levelFromCuts } from '../../../shared/risk'
import { formatDate, formatDateTime, formatValue, LEVEL_LABEL, UNIT_SUFFIX } from '../../lib/format'
import { Card, LevelBadge, SectionTitle } from '../ui'
import { MEASURE_INFO, geoExplainer, geoLabel, lastObs, type SignalRow } from './model'

const isHttp = (u?: string) => !!u && /^https?:\/\//i.test(u)

export function AboutMeasure({
  series,
  row,
  source,
  who,
  reading,
}: {
  series: Series
  row?: SignalRow
  source?: SourceStatus
  /** Short pathogen name, e.g. "Flu". */
  who: string
  /** Profile text on how to read this pathogen's numbers. */
  reading?: string
}) {
  const info = MEASURE_INFO[series.metric]
  const last = lastObs(series)
  const geoNote = geoExplainer(series.geo)
  const t = series.thresholds
  const fmt = (v: number) => `${formatValue(v, series.unit)}${UNIT_SUFFIX[series.unit]}`
  const bands: { level: ActivityLevel; text: string }[] = t
    ? [
        { level: 'minimal', text: `below ${fmt(t.low)}` },
        { level: 'low', text: `${fmt(t.low)} to under ${fmt(t.moderate)}` },
        { level: 'moderate', text: `${fmt(t.moderate)} to under ${fmt(t.high)}` },
        { level: 'high', text: `${fmt(t.high)} to under ${fmt(t.veryHigh)}` },
        { level: 'very-high', text: `${fmt(t.veryHigh)} or more` },
      ]
    : []
  const currentBand = t && last ? levelFromCuts(last[1], [t.low, t.moderate, t.high, t.veryHigh]) : undefined

  return (
    <Card className="min-w-0" aria-labelledby="about-measure">
      <SectionTitle id="about-measure" title="About this measure" subtitle={series.label} />
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="font-medium text-ink-1">What it measures</dt>
        <dd className="text-ink-2">{info.what}</dd>
        <dt className="font-medium text-ink-1">Why it matters</dt>
        <dd className="text-ink-2">{info.why}</dd>
        <dt className="font-medium text-ink-1">Where</dt>
        <dd className="text-ink-2">
          {geoLabel(series.geo)}
          {series.age ? ` · ages ${series.age}` : ''}
          {geoNote && <span className="block text-ink-3">{geoNote}</span>}
        </dd>
        <dt className="font-medium text-ink-1">Source</dt>
        <dd className="text-ink-2">
          {source && isHttp(source.url) ? (
            <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2">
              {source.name}
            </a>
          ) : (
            (source?.name ?? series.source)
          )}
          {source?.publisher && <span className="block text-ink-3">{source.publisher}</span>}
        </dd>
        <dt className="font-medium text-ink-1">Data through</dt>
        <dd className="text-ink-2">
          {last ? `Week ending ${formatDate(last[0], true)}` : 'No reported values yet'}
          {source?.lastSuccess && <span className="block text-ink-3">Checked for updates {formatDateTime(source.lastSuccess)}</span>}
          {source?.cadence && <span className="block text-ink-3">{source.cadence}</span>}
        </dd>
      </dl>

      {(series.provisionalFrom || series.note) && (
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3 text-sm text-ink-2">
          <p className="mb-0.5 font-semibold text-ink-1">{series.provisionalFrom ? 'Keep in mind' : 'Note from the source'}</p>
          {series.provisionalFrom && (
            <p>
              Numbers from the week ending {formatDate(series.provisionalFrom, true)} onward are preliminary and will likely
              change as late reports arrive.
            </p>
          )}
          {series.note && <p className={series.provisionalFrom ? 'mt-1' : ''}>{series.note}</p>}
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-ink-1">How the level is set</h3>
        {t ? (
          <>
            <p className="mt-1 text-sm text-ink-2">
              The publisher defines official activity levels for this exact measure and place.
              {currentBand && last && (
                <>
                  {' '}
                  The latest week ({fmt(last[1])}) is in the <strong className="font-semibold text-ink-1">{LEVEL_LABEL[currentBand]}</strong> range.
                </>
              )}
            </p>
            <ul className="mt-2 grid gap-1.5" aria-label="Official activity levels">
              {bands.map((b) => (
                <li key={b.level} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-28 shrink-0">
                    <LevelBadge level={b.level} size="sm" />
                  </span>
                  <span className={`tabular ${b.level === currentBand ? 'font-semibold text-ink-1' : 'text-ink-2'}`}>
                    {b.text}
                    {b.level === currentBand && <span className="sr-only"> (latest week)</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">Defined by: {t.by}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-2">
            There is no official threshold for this measure, so MN Pulse compares the latest week with this measure’s own
            recent history (about the past 3 years, skipping the unusual pandemic seasons).
            {row && row.level !== 'unknown' && <> Basis for the current level: {row.levelBasis}.</>}
          </p>
        )}
      </div>

      {reading && (
        <details className="group mt-4 rounded-xl border border-line">
          <summary className="cursor-pointer list-none rounded-xl px-3 py-2 text-sm font-medium text-ink-1 hover:bg-surface-2">
            <span aria-hidden="true" className="mr-1.5 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            How to read {who} numbers
          </summary>
          <p className="px-3 pb-3 text-sm text-ink-2">{reading}</p>
        </details>
      )}
    </Card>
  )
}

