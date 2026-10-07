// Overview hero: statewide respiratory activity level, trend, headline, dates and the filter row.
import type { DashboardData } from '../../lib/data'
import { useAppState } from '../../lib/state'
import { formatDate, formatDateTime, LEVEL_LABEL } from '../../lib/format'
import { FilterBar } from '../layout/FilterBar'
import { LevelBadge, TrendPill } from '../ui'
import { CountySummary } from './CountySummary'
import { LevelScale } from './LevelScale'
import { latestWeek, LEVEL_MEANING, rankPathogens } from './util'

export function PulseHero({ data }: { data: DashboardData }) {
  const { state } = useAppState()
  const { pulse, manifest } = data
  const sw = pulse.statewide
  const week = latestWeek(pulse)
  const basis = rankPathogens(pulse).find((p) => p.primary)?.primary?.levelBasis
  const hasData = pulse.pathogens.length > 0

  return (
    <section className="card relative overflow-hidden p-5 sm:p-7" aria-labelledby="pulse-title">
      <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">
        Minnesota{week ? ` · Week ending ${formatDate(week, true)}` : ''}
      </p>
      <h1 id="pulse-title" className="mt-1 text-2xl leading-tight font-bold tracking-tight text-balance text-ink-1 sm:text-[2rem]">
        Minnesota’s infectious disease pulse
      </h1>
      <p className="mt-1.5 max-w-prose text-ink-2">
        A weekly read on what’s going around, so you can be aware and act in advance.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:items-start md:gap-8">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-medium text-ink-2">Respiratory activity</span>
            <LevelBadge level={sw.level} size="lg" />
            <TrendPill trend={sw.trend} />
          </div>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-1 sm:text-lg">{sw.headline}</p>
          <p className="mt-3 text-xs text-ink-3">
            {week ? `Week ending ${formatDate(week, true)}` : 'No weekly data yet'} · updated {formatDateTime(manifest.generatedAt)}
          </p>
        </div>

        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-sm text-ink-1">
            <span className="font-semibold">{LEVEL_LABEL[sw.level]}</span>
            {sw.level !== 'unknown' && <span className="text-ink-2"> — what it means for you</span>}
          </p>
          <p className="mt-1 text-sm text-ink-2">{LEVEL_MEANING[sw.level]}</p>
          {sw.level !== 'unknown' && <LevelScale level={sw.level} className="mt-4" />}
          {hasData && (
            <details className="group mt-3 text-sm">
              <summary className="cursor-pointer rounded text-accent underline-offset-2 hover:underline">How is this level set?</summary>
              <div className="mt-2 space-y-2 text-ink-2">
                <p>
                  The statewide level is the highest current level among flu, COVID-19 and RSV. Each one is compared with
                  official cut-points when a public health agency publishes them
                  {basis ? <> (here: {basis})</> : null}.
                </p>
                <p>
                  When no official cut-points exist, a measure is compared with its own last ~3 seasons. “Very high” then
                  means higher than all but about 1 in 40 weeks in recent years.
                </p>
              </div>
            </details>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <FilterBar showRange={false} />
      </div>
      {state.geo.type === 'county' && <CountySummary pulse={pulse} fips={state.geo.code} />}
    </section>
  )
}
