// Overview ("Pulse"): the statewide picture, what to do this week, the watch list, seasonal radar,
// a mini map, key trends and data freshness — top to bottom, calm and scannable.
import type { ActivityLevel } from '../../shared/types'
import { LEVELS, maxLevel } from '../../shared/risk'
import { MN_COUNTY_BY_FIPS } from '../../shared/geo/mnCounties'
import { ActionsPanel } from '../components/pulse/ActionsPanel'
import { DataFreshness } from '../components/pulse/DataFreshness'
import { KeyTrends } from '../components/pulse/KeyTrends'
import { MiniMap } from '../components/pulse/MiniMap'
import { OnTheRadar } from '../components/pulse/OnTheRadar'
import { PulseHero } from '../components/pulse/PulseHero'
import { WatchList } from '../components/pulse/WatchList'
import { rankPathogens } from '../components/pulse/util'
import { useDashboard } from '../lib/dashboard'
import { LEVEL_LABEL } from '../lib/format'
import { useAppState } from '../lib/state'

export default function PulseView() {
  const { data } = useDashboard()
  const { state } = useAppState()
  if (!data) return null
  const { pulse, manifest } = data
  const ranked = rankPathogens(pulse)

  // Guidance follows the statewide level, or a selected county's level when it is higher (err toward caution).
  const statewide = pulse.statewide.level
  let level: ActivityLevel = statewide
  let levelNote: string | undefined
  if (state.geo.type === 'county') {
    const fips = state.geo.code
    const levels = Object.values(pulse.counties.find((c) => c.fips === fips)?.metrics ?? {})
      .map((m) => m.level)
      .filter((l): l is ActivityLevel => !!l && l !== 'unknown')
    const local = levels.length ? maxLevel(levels) : 'unknown'
    if (local !== 'unknown' && LEVELS.indexOf(local) > LEVELS.indexOf(statewide)) {
      level = local
      levelNote = `activity in ${MN_COUNTY_BY_FIPS[fips]?.name ?? 'this'} County is ${LEVEL_LABEL[local].toLowerCase()}`
    }
  }
  if (!levelNote && level !== 'unknown') levelNote = `respiratory activity is ${LEVEL_LABEL[level].toLowerCase()} statewide`
  if (level === 'unknown') levelNote = 'not enough current data, so these are everyday steps'

  return (
    <div className="space-y-10">
      <div className="space-y-5">
        <PulseHero data={data} />
        <ActionsPanel level={level} levelNote={levelNote} extraPathogens={ranked.slice(0, 3).map((p) => p.pathogen)} />
      </div>

      <WatchList pulse={pulse} manifest={manifest} />

      <OnTheRadar exclude={pulse.pathogens.map((p) => p.pathogen)} />

      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        <div className="min-w-0">
          <MiniMap pulse={pulse} top={ranked[0]?.pathogen} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <KeyTrends data={data} />
        </div>
      </div>

      <DataFreshness manifest={manifest} />
    </div>
  )
}
