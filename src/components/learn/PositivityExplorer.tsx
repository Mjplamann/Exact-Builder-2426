// Interactive natural-frequency explainer: a 100-dot icon array driven by a slider, plus optional
// one-click presets from live positivity / detection-rate data (never invented values).
import { useId, useState } from 'react'
import { aboutOneIn, formatDate } from '../../lib/format'
import { Pill } from '../ui'

export interface PositivityPreset {
  id: string
  /** Short chip label, e.g. "RSV · Region 5 labs". */
  label: string
  /** Full series label for the caption. */
  detail: string
  value: number
  date: string
  source: string
}

const fmtPct = (v: number) => `${v > 0 && v < 1 ? v.toFixed(2) : v < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.round(v)}%`

/** "About 15 in 100 tests found it (roughly 1 in 7)." */
export function naturalFrequency(pct: number): string {
  if (pct <= 0) return 'None of the tests found it.'
  if (pct >= 100) return 'Every test found it.'
  if (pct < 1) {
    const per1000 = Math.round(pct * 10)
    return per1000 < 1 ? 'Fewer than 1 in 1,000 tests found it.' : `About ${per1000} in 1,000 tests found it.`
  }
  const n = Math.round(pct)
  // Same rounding as everywhere else on MN Pulse (lib/format aboutOneIn), so 7.5% is "1 in 13" on every page.
  const oneIn = pct >= 2.5 && pct < 45 ? aboutOneIn(pct)?.replace(/^about /, 'roughly ') : undefined
  return `About ${n} in 100 tests found it${oneIn && !/ 1 in 1$/.test(oneIn) ? ` (${oneIn})` : ''}.`
}

export function IconArray({ pct, maxWidth = 220 }: { pct: number; maxWidth?: number }) {
  const uid = useId().replace(/:/g, '')
  const clamped = Math.max(0, Math.min(100, pct))
  const full = Math.floor(clamped)
  const frac = clamped - full
  const r = 7
  return (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      style={{ maxWidth }}
      role="img"
      aria-label={`${fmtPct(clamped)}: ${full} of 100 dots filled${frac > 0 ? ' plus part of one more' : ''}.`}
      className="block"
    >
      {frac > 0 && (
        <defs>
          <clipPath id={`frac-${uid}`}>
            <rect x={10 + (full % 10) * 20 - r} y={10 + Math.floor(full / 10) * 20 - r} width={2 * r * frac} height={2 * r} />
          </clipPath>
        </defs>
      )}
      {Array.from({ length: 100 }, (_, i) => {
        const cx = 10 + (i % 10) * 20
        const cy = 10 + Math.floor(i / 10) * 20
        if (i < full) return <circle key={i} cx={cx} cy={cy} r={r} fill="var(--series-1)" />
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r - 0.6} fill="none" stroke="var(--axis)" strokeWidth={1.2} />
            {i === full && frac > 0 && <circle cx={cx} cy={cy} r={r} fill="var(--series-1)" clipPath={`url(#frac-${uid})`} />}
          </g>
        )
      })}
    </svg>
  )
}

const FUNNEL: { label: string; width: number; note?: string; highlight?: boolean }[] = [
  { label: 'Everyone in Minnesota', width: 100 },
  { label: 'People who feel sick', width: 62 },
  { label: 'Sick enough to see a clinician or go to the ED', width: 36 },
  { label: 'Got tested for this germ', width: 20, note: 'Positivity divides by this group', highlight: true },
  { label: 'Tested positive', width: 7, note: '…and counts this group', highlight: true },
]

function Funnel() {
  return (
    <figure className="mt-6">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-ink-1">Who is counted?</span>
        <span className="text-xs text-ink-3">Illustration, not to scale</span>
      </figcaption>
      <ol className="space-y-1.5">
        {FUNNEL.map((f) => (
          <li key={f.label} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="text-sm text-ink-2">
              {f.label}
              {f.note && <span className="block text-xs font-medium text-ink-1">{f.note}</span>}
            </span>
            <span aria-hidden="true" className="block h-3 rounded-full bg-surface-2">
              <span
                className="block h-3 rounded-full"
                style={{ width: `${f.width}%`, background: f.highlight ? 'var(--series-1)' : 'var(--series-muted)' }}
              />
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}

export function PositivityExplorer({ presets }: { presets: PositivityPreset[] }) {
  const [pct, setPct] = useState<number>(presets[0]?.value ?? 15)
  const [presetId, setPresetId] = useState<string | undefined>(presets[0]?.id)
  const preset = presets.find((p) => p.id === presetId)
  const sliderId = useId()
  return (
    <div className="card mt-6 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-ink-1">Try it: turn a percentage into people</h3>
      <p className="mt-1 text-sm text-ink-2">
        Move the slider{presets.length ? ' or pick a current value' : ''} to see what a percent positive means as a count of
        tests.
      </p>

      {presets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Current values from MN Pulse data">
          {presets.map((p) => (
            <Pill
              key={p.id}
              active={p.id === presetId}
              onClick={() => {
                setPresetId(p.id)
                setPct(p.value)
              }}
              title={`${p.detail}, week ending ${formatDate(p.date, true)}`}
            >
              {p.label} · {fmtPct(p.value)}
            </Pill>
          ))}
        </div>
      )}

      <div className="mt-4 grid items-center gap-5 sm:grid-cols-[minmax(0,13.75rem)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[220px]">
          <IconArray pct={pct} />
        </div>
        <div>
          <p className="text-4xl font-semibold tracking-tight text-ink-1">{fmtPct(pct)}</p>
          <p className="text-sm text-ink-3">of tests were positive</p>
          <p className="mt-2 text-base font-medium text-ink-1" aria-live="polite">
            {naturalFrequency(pct)}
          </p>
          <label htmlFor={sliderId} className="mt-4 block text-xs font-medium text-ink-2">
            Percent of tests positive
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(pct)}
            onChange={(e) => {
              setPct(Number(e.target.value))
              setPresetId(undefined)
            }}
            aria-valuetext={`${fmtPct(pct)}. ${naturalFrequency(pct)}`}
            className="mt-1 w-full"
            style={{ accentColor: 'var(--accent)' }}
          />
          <div className="flex justify-between text-[11px] text-ink-3 tabular" aria-hidden="true">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            {preset ? (
              <>
                Current value: {preset.detail}, week ending {formatDate(preset.date, true)}. Source: {preset.source}.
              </>
            ) : presets.length ? (
              'Value set by you. Pick a chip above to see a current value.'
            ) : (
              'Example value set by you. Current lab positivity data are not loaded right now.'
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
        <span className="font-semibold text-ink-1">What it does not mean: </span>
        these are tests on people sick enough to be tested. The share of all Minnesotans with this germ is usually much lower,
        and this number cannot say how much lower.
      </div>

      <Funnel />
    </div>
  )
}
