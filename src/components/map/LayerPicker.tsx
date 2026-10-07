// Map controls: which layer to draw (grouped by measure), how to color it, and the plant overlay.
import { useId } from 'react'
import type { PulseFile } from '../../../shared/types'
import { groupLayers, layerOptionLabel, type MapMode } from './mapData'

const selectCls = 'min-w-0 max-w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1'

export function LayerPicker({ pulse, value, onChange }: { pulse: PulseFile; value?: string; onChange: (id: string) => void }) {
  const layers = pulse.mapLayers
  const groups = groupLayers(layers)
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-2">
      Show on map
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={!layers.length}
        className={`${selectCls} sm:min-w-60`}
      >
        {!layers.length && <option value="">No map layers published yet</option>}
        {groups.map((g) => (
          <optgroup key={g.title} label={g.title}>
            {g.layers.map((l) => (
              // Measure + program (+ plant count) so look-alike layers read differently, e.g. CDC NWSS levels vs
              // MDH/WastewaterSCAN concentrations for the same virus.
              <option key={l.id} value={l.id}>
                {layerOptionLabel(pulse, l)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

const MODES: { id: MapMode; label: string }[] = [
  { id: 'level', label: 'Activity level' },
  { id: 'value', label: 'Value' },
]

/**
 * Native radios: one tab stop, arrow keys move and select, and the focus ring is drawn inside each segment
 * (no overflow clipping), matching the time-range control in the filter bar.
 */
export function ModeToggle({ value, onChange, disabled }: { value: MapMode; onChange: (m: MapMode) => void; disabled?: boolean }) {
  const name = useId()
  return (
    <fieldset className="flex min-w-0 flex-col gap-1 border-0 p-0 text-xs font-medium text-ink-2" disabled={disabled}>
      <legend className="mb-1 p-0">Color by</legend>
      <div className="flex rounded-lg border border-line">
        {MODES.map((o, i) => {
          const checked = value === o.id
          return (
            <label key={o.id} className={`relative flex ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="radio"
                name={name}
                value={o.id}
                checked={checked}
                onChange={() => onChange(o.id)}
                className="peer sr-only"
              />
              <span
                className={`px-2.5 py-1.5 text-sm whitespace-nowrap peer-focus-visible:z-10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-4px] ${
                  i === 0 ? 'rounded-l-[7px]' : 'border-l border-line'
                } ${i === MODES.length - 1 ? 'rounded-r-[7px]' : ''} ${
                  checked
                    ? 'bg-accent font-semibold text-accent-ink peer-focus-visible:outline-[var(--accent-ink)]'
                    : 'bg-surface-1 text-ink-2 peer-focus-visible:outline-[var(--focus)] hover:bg-surface-2'
                }`}
              >
                {o.label}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function SitesToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-1.5 inline-flex cursor-pointer items-center gap-2 text-sm text-ink-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
      Wastewater plants
    </label>
  )
}
