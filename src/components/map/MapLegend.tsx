// Legends for the county map: activity levels (color + text + glyph), value bins, no-data hatch,
// and wastewater plant markers. Text always uses ink tokens; color sits in the swatch beside it.
import type { ActivityLevel, MapLayer, Unit } from '../../../shared/types'
import { pathogenName } from '../../content'
import { LEVEL_LABEL, LEVEL_VAR } from '../../lib/format'
import { LevelGlyph } from '../ui'
import { binLabel, LEGEND_LEVELS, type ValueBin } from './mapData'

export function HatchSwatch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 rounded-[3px]">
      <rect width="14" height="14" style={{ fill: 'var(--surface-3)' }} />
      <path d="M-2 4 L4 -2 M-2 10 L10 -2 M-2 16 L16 -2 M4 16 L16 4 M10 16 L16 10" style={{ stroke: 'var(--muted)', strokeWidth: 1, opacity: 0.55 }} />
    </svg>
  )
}

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="inline-block h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ background: color }} />
}

function Item({ swatch, label, count }: { swatch: React.ReactNode; label: string; count?: number }) {
  return (
    <li className="flex items-center gap-1.5 text-xs text-ink-2">
      {swatch}
      <span className="text-ink-1">{label}</span>
      {count != null && <span className="tabular text-ink-3">({count})</span>}
    </li>
  )
}

export function LevelLegend({
  counts,
  noData,
  showUnknown,
  title = 'Activity level',
}: {
  counts?: Partial<Record<ActivityLevel, number>>
  noData?: number
  showUnknown?: boolean
  title?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-3">{title}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label={`${title} legend`}>
        {LEGEND_LEVELS.map((l) => (
          <li key={l} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-5 items-center justify-center rounded-[3px]"
              style={{ background: LEVEL_VAR[l], color: `var(--level-ink-${l})` }}
            >
              <LevelGlyph level={l} />
            </span>
            <span className="text-ink-1">{LEVEL_LABEL[l]}</span>
            {counts && <span className="tabular text-ink-3">({counts[l] ?? 0})</span>}
          </li>
        ))}
        {showUnknown && (
          <Item swatch={<Swatch color={LEVEL_VAR.unknown} />} label={LEVEL_LABEL.unknown} count={counts?.unknown} />
        )}
        {noData != null && noData > 0 && <Item swatch={<HatchSwatch />} label="No data" count={noData} />}
      </ul>
    </div>
  )
}

export function ValueLegend({ bins, unit, counts, noData, title }: { bins: ValueBin[]; unit: Unit; counts?: number[]; noData?: number; title: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-3">{title}</p>
      {/* Contiguous ramp so the order reads at a glance; labels sit below each step. */}
      <ul className="flex flex-wrap items-start gap-y-1.5" aria-label={`${title} legend`}>
        {bins.map((b, i) => (
          <li key={i} className="flex min-w-16 flex-col gap-1 pr-0.5 text-xs">
            <span aria-hidden="true" className="block h-3 w-full" style={{ background: b.color, borderRadius: i === 0 ? '3px 0 0 3px' : i === bins.length - 1 ? '0 3px 3px 0' : 0 }} />
            <span className="tabular text-ink-1">{binLabel(b, unit)}</span>
            {counts && <span className="tabular -mt-1 text-ink-3">{counts[i] ?? 0} {counts[i] === 1 ? 'county' : 'counties'}</span>}
          </li>
        ))}
        {noData != null && noData > 0 && (
          <li className="ml-3 flex flex-col gap-1 text-xs">
            <HatchSwatch size={12} />
            <span className="text-ink-1">No data</span>
            <span className="tabular -mt-1 text-ink-3">{noData}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

export function SiteLegend({ layer, located, unlocated }: { layer: MapLayer; located: number; unlocated: number }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-3">Wastewater treatment plants</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <svg width="34" height="18" viewBox="0 0 34 18" aria-hidden="true">
            <circle cx="7" cy="9" r="5" style={{ fill: 'var(--ink-3)', stroke: 'var(--surface-1)', strokeWidth: 2 }} />
            <circle cx="23" cy="9" r="8" style={{ fill: 'var(--ink-3)', stroke: 'var(--surface-1)', strokeWidth: 2 }} />
          </svg>
          <span>
            Dot color = {pathogenName(layer.pathogen)} wastewater level; bigger dot = more people served
          </span>
        </span>
        <span className="text-ink-3">
          {located} plant{located === 1 ? '' : 's'} shown
          {unlocated > 0 ? `; ${unlocated} without a known location not drawn` : ''}
        </span>
      </div>
    </div>
  )
}
