// Source refresh state: icon + text label (status color never carries meaning alone).
import { useId } from 'react'
import type { SourceState } from '../../../shared/types'

export const STATE_LABEL: Record<SourceState, string> = {
  ok: 'Up to date',
  stale: 'Stale',
  error: 'Error',
  disabled: 'Turned off',
  pending: 'Pending',
}

export const STATE_MEANING: Record<SourceState, string> = {
  ok: 'Fetched successfully on the latest run.',
  stale: 'Newest data are over 3 weeks old, or the last refresh failed and earlier data are shown.',
  error: 'Could not be fetched, and no earlier copy is available.',
  disabled: 'Not turned on in the pipeline.',
  pending: 'Not run yet.',
}

const STATE_COLOR: Record<SourceState, string> = {
  ok: 'var(--status-good)',
  stale: 'var(--status-warning)',
  error: 'var(--status-critical)',
  disabled: 'var(--muted)',
  pending: 'var(--muted)',
}

/**
 * The glyph inside each shape is a cut-out (SVG mask), so the surface behind the icon shows through
 * and no fixed ink color is needed in either theme.
 */
export function StatusIcon({ state, size = 16 }: { state: SourceState; size?: number }) {
  const c = STATE_COLOR[state]
  const mid = `st-${useId().replace(/:/g, '')}`
  const cut = { fill: 'none', stroke: 'black', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <defs>
        <mask id={mid} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
          <rect width="16" height="16" fill="white" />
          {state === 'ok' && <path d="M4.6 8.2l2.2 2.2 4.6-4.8" {...cut} />}
          {state === 'stale' && <path d="M8 4.2V8l2.6 1.6" {...cut} />}
          {state === 'error' && (
            <>
              <path d="M8 6v3.4" {...cut} />
              <circle cx="8" cy="11.9" r="1" fill="black" />
            </>
          )}
        </mask>
      </defs>
      {state === 'ok' && <circle cx="8" cy="8" r="7" fill={c} mask={`url(#${mid})`} />}
      {state === 'stale' && <circle cx="8" cy="8" r="7" fill={c} mask={`url(#${mid})`} />}
      {state === 'error' && <path d="M8 1.3l7 12.4H1z" fill={c} strokeLinejoin="round" mask={`url(#${mid})`} />}
      {state === 'disabled' && (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M4.8 8h6.4" stroke={c} strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
      {state === 'pending' && (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke={c} strokeWidth="1.6" strokeDasharray="2.4 2.2" />
          <circle cx="8" cy="8" r="1.4" fill={c} />
        </>
      )}
    </svg>
  )
}

export function StatusChip({ state }: { state: SourceState }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-ink-1"
      title={STATE_MEANING[state]}
    >
      <StatusIcon state={state} />
      {STATE_LABEL[state]}
    </span>
  )
}
