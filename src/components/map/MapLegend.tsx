// Legends for the county map: activity levels (shared LevelScale chips), value bins, no-data hatch, and
// wastewater plant markers drawn with the same <PlantMark> the map uses, so the key always matches the marks.
// Text always uses ink tokens; color sits in the swatch beside it.
import type { ActivityLevel, MapLayer, MetricKind, Unit } from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { pathogenName } from '../../content'
import { LEVEL_LABEL, LEVEL_VAR } from '../../lib/format'
import { LevelScale } from '../charts/LevelScale'
import { binLabel, type ValueBin } from './mapData'

export function HatchSwatch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 rounded-[3px]">
      <rect width="14" height="14" style={{ fill: 'var(--surface-3)' }} />
      <path d="M-2 4 L4 -2 M-2 10 L10 -2 M-2 16 L16 -2 M4 16 L16 4 M10 16 L16 10" style={{ stroke: 'var(--muted)', strokeWidth: 1, opacity: 0.55 }} />
    </svg>
  )
}

/** "No data" chip in the same shape as the LevelScale chips. */
export function NoDataChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-1 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-1">
      <HatchSwatch size={12} />
      No data
    </span>
  )
}

/**
 * How plant marks are drawn. 'ring' when the counties underneath are filled with the same level colors: a
 * surface-colored core with a level-colored ring and a thin ink halo, so a plant never melts into a county of the
 * same level. 'fill' otherwise (value shading, plants-only layers): a level-filled dot with a surface ring.
 */
export type PlantMarkStyle = 'ring' | 'fill'

export function plantRingWidth(r: number): number {
  return Math.min(3.5, Math.max(2.5, r * 0.3))
}

export function PlantMark({ cx, cy, r, level, markStyle }: { cx: number; cy: number; r: number; level: ActivityLevel; markStyle: PlantMarkStyle }) {
  if (markStyle === 'ring') {
    const w = plantRingWidth(r)
    return (
      <>
        {/* Halo: dark on the light theme, light on the dark theme (--ink-1), just outside the colored ring. */}
        <circle cx={cx} cy={cy} r={r + w / 2 + 0.6} style={{ fill: 'none', stroke: 'var(--ink-1)', strokeWidth: 1.2, opacity: 0.75 }} />
        <circle cx={cx} cy={cy} r={r} style={{ fill: 'var(--surface-1)', stroke: LEVEL_VAR[level], strokeWidth: w }} />
      </>
    )
  }
  // Surface ring on the light theme; a light ring on the dark theme so dark level fills (and "not enough data")
  // stay visible on dark counties. The stroke attribute is the fallback where light-dark() is unsupported.
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      stroke="var(--surface-1)"
      style={{ fill: LEVEL_VAR[level], stroke: 'light-dark(var(--surface-1), var(--ink-2))', strokeWidth: 1.75 }}
    />
  )
}

function countsLine(counts: Partial<Record<ActivityLevel, number>>, noData: number | undefined, noun: string): string {
  const parts = [...LEVELS, 'unknown' as const]
    .filter((l) => (counts[l] ?? 0) > 0)
    .map((l) => `${counts[l]} ${LEVEL_LABEL[l].toLowerCase()}`)
  if (noData) parts.push(`${noData} no data`)
  return parts.length ? `${noun}: ${parts.join(' · ')}` : ''
}

export function LevelLegend({
  counts,
  noData,
  showUnknown,
  title = 'Activity level',
  noun = 'Counties this week',
}: {
  counts?: Partial<Record<ActivityLevel, number>>
  noData?: number
  showUnknown?: boolean
  title?: string
  noun?: string
}) {
  const line = counts ? countsLine(counts, noData, noun) : ''
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-2">{title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <LevelScale variant="chips" showUnknown={showUnknown} title={undefined} className="contents" />
        {noData != null && noData > 0 && <NoDataChip />}
      </div>
      {line && <p className="tabular mt-1 text-xs text-ink-3">{line}</p>}
    </div>
  )
}

export function ValueLegend({
  bins,
  unit,
  metric,
  counts,
  noData,
  title,
}: {
  bins: ValueBin[]
  unit: Unit
  metric?: MetricKind
  counts?: number[]
  noData?: number
  title: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-2">{title}</p>
      {/* Contiguous ramp so the order reads at a glance; labels sit below each step. */}
      <ul className="flex flex-wrap items-start gap-y-1.5" aria-label={`${title} legend`}>
        {bins.map((b, i) => (
          <li key={i} className="flex min-w-[4.75rem] flex-1 flex-col gap-1 pr-0.5 text-xs sm:max-w-28">
            <span aria-hidden="true" className="block h-3 w-full" style={{ background: b.color, borderRadius: i === 0 ? '3px 0 0 3px' : i === bins.length - 1 ? '0 3px 3px 0' : 0 }} />
            <span className="tabular text-ink-1">{binLabel(b, unit, metric)}</span>
            {counts && <span className="tabular -mt-1 text-ink-3">{counts[i] ?? 0} {counts[i] === 1 ? 'county' : 'counties'}</span>}
          </li>
        ))}
        {noData != null && noData > 0 && (
          <li className="ml-3 flex flex-col gap-1 text-xs">
            <HatchSwatch size={12} />
            <span className="text-ink-1">No data</span>
            <span className="tabular -mt-1 text-ink-3">{noData} {noData === 1 ? 'county' : 'counties'}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

/** Plant key: one mark per level present (drawn exactly as on the map), with counts, plus the size key. */
export function SiteLegend({
  layer,
  located,
  unlocated,
  counts,
  markStyle,
}: {
  layer: MapLayer
  located: number
  unlocated: number
  counts: Partial<Record<ActivityLevel, number>>
  markStyle: PlantMarkStyle
}) {
  const present = [...LEVELS, 'unknown' as const].filter((l) => (counts[l] ?? 0) > 0)
  const name = pathogenName(layer.pathogen)
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-2">
        Wastewater treatment plants · {markStyle === 'ring' ? `ring color = ${name} wastewater level` : `${name} wastewater level`}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Treatment plants by wastewater level">
        {present.map((l) => (
          <li key={l} className="flex items-center gap-1.5 text-xs">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
              <PlantMark cx={9} cy={9} r={5} level={l} markStyle={markStyle} />
            </svg>
            <span className="text-ink-1">{LEVEL_LABEL[l]}</span>
            <span className="tabular text-ink-3">({counts[l]})</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
        <svg width="34" height="20" viewBox="0 0 34 20" aria-hidden="true" className="shrink-0">
          <circle cx="7" cy="10" r="3.5" style={{ fill: 'var(--surface-1)', stroke: 'var(--ink-3)', strokeWidth: 1.5 }} />
          <circle cx="23" cy="10" r="8" style={{ fill: 'var(--surface-1)', stroke: 'var(--ink-3)', strokeWidth: 1.5 }} />
        </svg>
        <span>Bigger mark = more people served.</span>
        <span>
          {located} plant{located === 1 ? '' : 's'} shown{unlocated > 0 ? `; ${unlocated} without a known location not drawn` : ''}.
        </span>
      </p>
    </div>
  )
}
