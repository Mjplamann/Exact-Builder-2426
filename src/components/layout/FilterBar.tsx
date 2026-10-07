// One filter row above the content it scopes (geography, time range, audience).
import { useId, useRef } from 'react'
import type { AgeGroupId } from '../../../shared/types'
import { MN_COUNTIES, MN_COUNTY_BY_FIPS } from '../../../shared/geo/mnCounties'
import { AUDIENCES } from '../../lib/audiences'
import { useAppState, type TimeRange } from '../../lib/state'

// Defined in lib/audiences (pure data, also used to validate links); re-exported for existing imports.
export { AUDIENCES }

const RANGES: { id: TimeRange; label: string; long: string }[] = [
  { id: '3m', label: '3 mo', long: '3 months' },
  { id: '6m', label: '6 mo', long: '6 months' },
  { id: '1y', label: '1 yr', long: '1 year' },
  { id: '2y', label: '2 yr', long: '2 years' },
  { id: '5y', label: 'All', long: 'All available weeks' },
]

export function FilterBar({ showRange = true, showGeo = true, showAudience = true }: { showRange?: boolean; showGeo?: boolean; showAudience?: boolean }) {
  const { state, update } = useAppState()
  const geoValue = state.geo.type === 'county' ? state.geo.code : '27'
  const whereRef = useRef<HTMLSelectElement>(null)
  const rangeName = useId()
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filters">
      {showGeo && (
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          Where
          <select
            ref={whereRef}
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
        // Native radios: one tab stop, arrow keys move and select, and the focus ring is drawn inside each
        // segment so nothing clips it.
        <fieldset className="flex min-w-0 flex-col gap-1 border-0 p-0 text-xs font-medium text-ink-2">
          <legend className="mb-1 p-0">Time range</legend>
          <div className="flex rounded-lg border border-line">
            {RANGES.map((r, i) => {
              const checked = state.range === r.id
              return (
                <label key={r.id} className="relative flex cursor-pointer" title={r.long}>
                  <input
                    type="radio"
                    name={rangeName}
                    value={r.id}
                    checked={checked}
                    onChange={() => update({ range: r.id })}
                    className="peer sr-only"
                  />
                  <span
                    // Inset focus ring (nothing can clip it); on the filled, selected segment it uses the text colour so it
                    // still stands out against the accent fill.
                    className={`px-2.5 py-1.5 text-sm peer-focus-visible:z-10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-4px] ${
                      i === 0 ? 'rounded-l-[7px]' : 'border-l border-line'
                    } ${i === RANGES.length - 1 ? 'rounded-r-[7px]' : ''} ${
                      checked
                        ? 'bg-accent font-semibold text-accent-ink peer-focus-visible:outline-[var(--accent-ink)]'
                        : 'bg-surface-1 text-ink-2 peer-focus-visible:outline-[var(--focus)] hover:bg-surface-2'
                    }`}
                  >
                    {r.label}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
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
        <button
          type="button"
          onClick={() => {
            // This button disappears once the county is cleared: hand focus to the "Where" picker first so
            // keyboard and screen reader users are not dropped on <body>.
            whereRef.current?.focus()
            update({ geo: { type: 'state', code: '27' } })
          }}
          className="mb-1 rounded text-sm text-accent underline"
        >
          Clear county
        </button>
      )}
    </div>
  )
}
