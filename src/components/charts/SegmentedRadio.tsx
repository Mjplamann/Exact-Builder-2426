// Small segmented control with radio semantics: one tab stop (roving tabindex), arrow keys / Home / End
// move and select, and an inset focus ring that nothing can clip (same treatment as the time-range
// control in the filter bar).
import { useRef, type KeyboardEvent } from 'react'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
  /** Accessible name when it differs from the visible label. */
  ariaLabel?: string
}

export function SegmentedRadio<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
}: {
  /** Accessible name of the group. */
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = Math.max(0, options.findIndex((o) => o.id === value))

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = options.length
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next].id)
    refs.current[next]?.focus()
  }

  const pad = size === 'xs' ? 'px-2 py-1' : 'px-2.5 py-1'
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex flex-wrap gap-0.5 rounded-lg border border-line p-0.5 ${className}`}>
      {options.map((o, i) => {
        const on = i === current
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`rounded-md text-xs focus-visible:outline-2 focus-visible:outline-offset-[-3px] ${pad} ${
              on
                ? 'bg-accent font-semibold text-accent-ink focus-visible:outline-[var(--accent-ink)]'
                : 'text-ink-2 hover:bg-surface-2 focus-visible:outline-[var(--focus)]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
