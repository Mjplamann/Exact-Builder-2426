// Overview ("Pulse"): the statewide picture, what to do this week, the watch list, seasonal radar,
// a mini map, key trends and data freshness — top to bottom, calm and scannable.
import type { ActivityLevel, MetricKind } from '../../shared/types'
import { maxLevel } from '../../shared/risk'
import { MN_COUNTY_BY_FIPS } from '../../shared/geo/mnCounties'
import { bandForLevel } from '../content/actions'
import { ActionsPanel } from '../components/pulse/ActionsPanel'
import { DataFreshness } from '../components/pulse/DataFreshness'
import { KeyTrends } from '../components/pulse/KeyTrends'
import { MiniMap, pickDefaultLayer } from '../components/pulse/MiniMap'
import { OnTheRadar } from '../components/pulse/OnTheRadar'
import { PulseHero } from '../components/pulse/PulseHero'
import { WatchList } from '../components/pulse/WatchList'
import { rankPathogens } from '../components/pulse/util'
import { Callout } from '../components/ui'
import { useDashboard } from '../lib/dashboard'
import { LEVEL_LABEL, METRIC_LABEL } from '../lib/format'
import { useAppState } from '../lib/state'
import { pathogenName } from '../content'

const BAND_RANK = { low: 0, elevated: 1, high: 2 } as const
/** County measures whose level is not an activity level (growth estimates, running totals). */
const NO_LEVEL: MetricKind[] = ['rt', 'cases_ytd', 'cases']

export default function PulseView() {
  const { data, warnings } = useDashboard()
  const { state } = useAppState()
  if (!data) return null
  const { pulse, manifest } = data
  const ranked = rankPathogens(pulse)
  const top = ranked[0]?.pathogen
  const hasMap = !!pickDefaultLayer(pulse, top)

  // Guidance follows the statewide level. A selected county raises it (err toward caution) only when one of its
  // measures carries an official publisher level (agency category or cut-points, e.g. MDH RESP-NET) that falls in
  // a higher guidance band. Levels ranked against a county's own history, and MDH's 3-level floor ("Low") next to
  // CDC's "Very low", are different scales and never escalate guidance on their own.
  const statewide = pulse.statewide.level
  let level: ActivityLevel = statewide
  let levelNote: string | undefined
  if (state.geo.type === 'county') {
    const fips = state.geo.code
    const byId = new Map(data.series.map((s) => [s.id, s]))
    const layers = new Map(pulse.mapLayers.map((l) => [l.id, l]))
    const official = Object.entries(pulse.counties.find((c) => c.fips === fips)?.metrics ?? {})
      .map(([key, m]) => {
        const series = byId.get(m.seriesId)
        // The publisher's own level (category, or the analysis level when it came from publisher cut-points).
        const level = series?.official?.level ?? (series?.thresholds ? m.level : undefined)
        return { level, layer: layers.get(key), series }
      })
      .filter((x): x is typeof x & { level: ActivityLevel } => !!x.level && x.level !== 'unknown' && !(x.layer && NO_LEVEL.includes(x.layer.metric)))
    if (official.length) {
      const local = maxLevel(official.map((x) => x.level))
      if (statewide !== 'unknown' && BAND_RANK[bandForLevel(local)] > BAND_RANK[bandForLevel(statewide)]) {
        const which = official.find((x) => x.level === local)
        const what = which?.layer ? `${pathogenName(which.layer.pathogen)} ${METRIC_LABEL[which.layer.metric].toLowerCase()}` : 'local activity'
        const by = which?.series?.official?.by ?? which?.series?.thresholds?.by?.replace(/\s*\(.*$/, '')
        level = local
        levelNote = `${what} in ${MN_COUNTY_BY_FIPS[fips]?.name ?? 'this'} County ${by ? `is rated ${LEVEL_LABEL[local].toLowerCase()} by ${by}` : `is ${LEVEL_LABEL[local].toLowerCase()}`}`
      }
    }
  }
  if (!levelNote && level !== 'unknown') levelNote = `respiratory activity is ${LEVEL_LABEL[level].toLowerCase()} statewide`
  if (level === 'unknown') levelNote = 'not enough current data, so these are everyday steps'

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        {warnings.length > 0 && (
          <Callout tone="warn" title={warnings.length === 1 ? 'Some data is missing' : `${warnings.length} problems loading data`}>
            {warnings.length === 1 ? (
              warnings[0]
            ) : (
              <ul className="list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </Callout>
        )}
        <PulseHero data={data} />
        <ActionsPanel level={level} levelNote={levelNote} extraPathogens={ranked.slice(0, 3).map((p) => p.pathogen)} />
      </div>

      <WatchList pulse={pulse} manifest={manifest} />

      <OnTheRadar exclude={pulse.pathogens.map((p) => p.pathogen)} />

      {hasMap ? (
        <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
          <div className="min-w-0">
            <MiniMap pulse={pulse} top={top} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <KeyTrends data={data} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <MiniMap pulse={pulse} top={top} />
          <KeyTrends data={data} />
        </div>
      )}

      <DataFreshness manifest={manifest} />
    </div>
  )
}
