// Map controls: which layer to draw (grouped by measure), how to color it, and the plant overlay.
import type { MapLayer } from '../../../shared/types'
import { pathogenName } from '../../content'
import { groupLayers, type MapMode } from './mapData'

const selectCls = 'min-w-0 max-w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1'

export function LayerPicker({ layers, value, onChange }: { layers: MapLayer[]; value?: string; onChange: (id: string) => void }) {
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
              <option key={l.id} value={l.id}>
                {pathogenName(l.pathogen)} — {g.title.replace(/ \(.*\)$/, '').toLowerCase()}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

export function ModeToggle({ value, onChange, disabled }: { value: MapMode; onChange: (m: MapMode) => void; disabled?: boolean }) {
  const opts: { id: MapMode; label: string }[] = [
    { id: 'level', label: 'Activity level' },
    { id: 'value', label: 'Value' },
  ]
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      <span id="map-mode-label">Color by</span>
      <div className="flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-labelledby="map-mode-label">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`px-2.5 py-1.5 text-sm whitespace-nowrap disabled:opacity-50 ${
              value === o.id ? 'bg-accent text-accent-ink' : 'bg-surface-1 text-ink-2 hover:bg-surface-2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
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
