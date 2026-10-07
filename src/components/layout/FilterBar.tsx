// One filter row above the content it scopes (geography, time range, audience).
import type { AgeGroupId } from '../../../shared/types'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { useAppState, type TimeRange } from '../../lib/state'

export const AUDIENCES: { id: AgeGroupId; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'infants', label: 'Infants (<1)' },
  { id: 'children', label: 'Children (1–17)' },
  { id: 'adults', label: 'Adults (18–49)' },
  { id: 'older-adults', label: 'Adults 50–64' },
  { id: 'seniors', label: '65 and older' },
  { id: 'pregnant', label: 'Pregnant' },
  { id: 'immunocompromised', label: 'Immunocompromised' },
]

const RANGES: { id: TimeRange; label: string }[] = [
  { id: '3m', label: '3 mo' },
  { id: '6m', label: '6 mo' },
  { id: '1y', label: '1 yr' },
  { id: '2y', label: '2 yr' },
  { id: '5y', label: 'All' },
]

export function FilterBar({ showRange = true, showGeo = true, showAudience = true }: { showRange?: boolean; showGeo?: boolean; showAudience?: boolean }) {
  const { state, update } = useAppState()
  const geoValue = state.geo.type === 'county' ? state.geo.code : '27'
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filters">
      {showGeo && (
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Where
          <select
            value={geoValue}
            onChange={(e) =>
              update({ geo: e.target.value === '27' ? { type: 'state', code: '27' } : { type: 'county', code: e.target.value } })
            }
            className="min-w-44 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1"
          >
            <option value="27">All of Minnesota</option>
            {MN_COUNTIES.map((c) => (
              <option key={c.fips} value={c.fips}>
                {c.name} County
              </option>
            ))}
          </select>
        </label>
      )}
      {showRange && (
        <div className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Time range
          <div className="flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={state.range === r.id}
                onClick={() => update({ range: r.id })}
                className={`px-2.5 py-1.5 text-sm ${state.range === r.id ? 'bg-accent text-accent-ink' : 'bg-surface-1 text-ink-2 hover:bg-surface-2'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {showAudience && (
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Guidance for
          <select
            value={state.audience}
            onChange={(e) => update({ audience: e.target.value as AgeGroupId })}
            className="min-w-44 rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1"
          >
            {AUDIENCES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {state.geo.type === 'county' && MN_COUNTY_BY_FIPS[state.geo.code] && (
        <button type="button" onClick={() => update({ geo: { type: 'state', code: '27' } })} className="mb-1 text-sm text-accent underline">
          Clear county
        </button>
      )}
    </div>
  )
}
