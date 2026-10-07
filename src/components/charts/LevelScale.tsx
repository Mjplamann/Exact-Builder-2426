// Horizontal legend for the five activity levels: color swatch + text label (never color alone).
import type { ActivityLevel } from '../../../shared/types'
import { LEVELS } from '../../../shared/risk'
import { LEVEL_INK_VAR, LEVEL_LABEL, LEVEL_VAR } from '../../lib/format'
import { LevelGlyph } from '../ui'

export interface LevelScaleProps {
  /** Highlight the level that currently applies. */
  active?: ActivityLevel
  /** 'bar' = joined segments with labels underneath (default); 'chips' = a wrapping row of small badges. */
  variant?: 'bar' | 'chips'
  /** Visible caption, e.g. "Activity level". Omit for none. */
  title?: string
  /** Include the grey "Not enough data" swatch (e.g. for maps with unreported counties). */
  showUnknown?: boolean
  className?: string
}

export function LevelScale({ active, variant = 'bar', title, showUnknown = false, className = '' }: LevelScaleProps) {
  const levels: ActivityLevel[] = showUnknown ? [...LEVELS, 'unknown'] : LEVELS
  const label = title ?? 'Activity level scale'

  if (variant === 'chips') {
    // Every chip keeps its full color (a faded chip would fail contrast and read as "disabled"); the level
    // that applies gets an outline ring and bolder text instead.
    return (
      <div className={className}>
        {title && <p className="mb-1 text-xs font-medium text-ink-2">{title}</p>}
        <ul className={`flex flex-wrap gap-1.5 ${active ? 'p-1' : ''}`} aria-label={label}>
          {levels.map((l) => {
            const on = active === l
            return (
              <li
                key={l}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${on ? 'font-bold' : 'font-medium'}`}
                style={{
                  background: LEVEL_VAR[l],
                  color: LEVEL_INK_VAR[l],
                  boxShadow: on ? '0 0 0 2px var(--surface-1), 0 0 0 3.5px var(--ink-1)' : undefined,
                }}
                aria-current={on ? 'true' : undefined}
              >
                <LevelGlyph level={l} />
                {LEVEL_LABEL[l]}
                {on && <span className="sr-only"> (current)</span>}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className={className}>
      {title && <p className="mb-1 text-xs font-medium text-ink-2">{title}</p>}
      <ol className="flex w-full max-w-md gap-0.5" aria-label={label}>
        {levels.map((l, i) => {
          const on = active === l
          return (
            <li key={l} className="min-w-0 flex-1" aria-current={on ? 'true' : undefined}>
              <span
                className={`block h-2.5 ${i === 0 ? 'rounded-l-full' : ''} ${i === levels.length - 1 ? 'rounded-r-full' : ''} ${on ? 'rounded-sm' : ''}`}
                style={{
                  background: LEVEL_VAR[l],
                  boxShadow: on ? '0 0 0 2px var(--surface-1), 0 0 0 3.5px var(--ink-1)' : undefined,
                  position: 'relative',
                  zIndex: on ? 1 : undefined,
                }}
                aria-hidden="true"
              />
              <span
                className={`mt-1 block text-center text-[10px] leading-tight min-[400px]:text-[11px] ${on ? 'font-semibold text-ink-1' : 'text-ink-2'}`}
              >
                {LEVEL_LABEL[l]}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
