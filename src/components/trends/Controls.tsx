// Controls for the Trends explorer: illness picker, metric tabs, option switches, small selects.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { MetricKind, PathogenId } from '../../../shared/types'
import { SegmentedRadio } from '../charts/SegmentedRadio'
import { METRIC_TAB, type PathogenGroup } from './model'

const SELECT = 'max-w-full rounded-lg border border-line bg-surface-1 px-2.5 py-1.5 text-sm text-ink-1 hover:border-line-strong'

export function LabeledSelect({
  label,
  value,
  onChange,
  children,
  minWidth = 'min-w-44',
  id,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
  minWidth?: string
  id?: string
}) {
  return (
    <label className="flex max-w-full flex-col gap-1 text-xs font-medium text-ink-2" htmlFor={id}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${SELECT} ${minWidth}`}>
        {children}
      </select>
    </label>
  )
}

export function PathogenSelect({
  groups,
  value,
  onChange,
}: {
  groups: PathogenGroup[]
  value: PathogenId
  onChange: (id: PathogenId) => void
}) {
  return (
    <LabeledSelect label="Illness" value={value} onChange={(v) => onChange(v as PathogenId)} id="trends-pathogen">
      {groups.map((g) => (
        <optgroup key={g.category} label={g.label}>
          {g.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </optgroup>
      ))}
    </LabeledSelect>
  )
}

/** ARIA tabs (roving tabindex, arrow keys) that wrap instead of scrolling on small screens. */
export function MetricTabs({
  metrics,
  value,
  onChange,
  panelId,
}: {
  metrics: MetricKind[]
  value: MetricKind
  onChange: (m: MetricKind) => void
  panelId: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % metrics.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + metrics.length) % metrics.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = metrics.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(metrics[next])
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label="Measure" className="flex flex-wrap gap-1.5">
      {metrics.map((m, i) => {
        const active = m === value
        return (
          <button
            key={m}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`tab-${m}`}
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(m)}
            onKeyDown={(e) => onKey(e, i)}
            className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active
                ? 'border-transparent bg-accent font-semibold text-accent-ink'
                : 'border-line bg-surface-1 text-ink-2 hover:border-line-strong hover:bg-surface-2'
            }`}
          >
            {METRIC_TAB[m].label}
          </button>
        )
      })}
    </div>
  )
}

/** Accessible on/off switch with a visible text label. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 rounded-lg py-1 pr-1 text-left text-sm text-ink-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
          checked ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-3'
        }`}
      >
        <span
          className={`absolute left-0.5 h-4 w-4 rounded-full transition-transform ${
            checked ? 'translate-x-4 bg-[var(--accent-ink)]' : 'bg-[var(--ink-3)]'
          }`}
        />
      </span>
      {label}
    </button>
  )
}

/**
 * Small segmented control (radio group) used for choosing a projection model: one tab stop, arrow keys /
 * Home / End move and select, inset focus ring (see SegmentedRadio).
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return <SegmentedRadio label={label} options={options} value={value} onChange={onChange} />
}
