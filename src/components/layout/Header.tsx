import { useAppState, useTheme, type View } from '../../lib/state'
import { useDashboard } from '../../lib/dashboard'
import { formatDateTime } from '../../lib/format'

const NAV: { view: View; label: string }[] = [
  { view: 'pulse', label: 'Pulse' },
  { view: 'map', label: 'Map' },
  { view: 'trends', label: 'Trends' },
  { view: 'pathogens', label: 'Illnesses' },
  { view: 'learn', label: 'Understand the numbers' },
  { view: 'sources', label: 'Sources' },
]

export function Header() {
  const { state, go } = useAppState()
  const { data, loading, refresh } = useDashboard()
  const [pref, setPref, resolved] = useTheme()
  const active = state.view === 'pathogen' ? 'pathogens' : state.view
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--page)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <button type="button" onClick={() => go('pulse')} className="flex items-center gap-2" aria-label="MN Pulse home">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M4 17h6l3-8 5 15 3-9 2 2h5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-bold tracking-tight">MN Pulse</span>
        </button>
        <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {NAV.map((n) => (
            <button
              key={n.view}
              type="button"
              onClick={() => go(n.view)}
              aria-current={active === n.view ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${
                active === n.view ? 'bg-surface-3 font-semibold text-ink-1' : 'text-ink-2 hover:bg-surface-2'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          <span className="hidden md:inline" title="When the data pipeline last ran">
            {data ? `Updated ${formatDateTime(data.manifest.generatedAt)}` : loading ? 'Loading…' : ''}
          </span>
          <button type="button" onClick={refresh} className="rounded-md border border-line px-2 py-1 hover:bg-surface-2" aria-label="Reload data">
            ↻
          </button>
          <button
            type="button"
            onClick={() => setPref(pref === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : pref === 'dark' ? 'light' : 'dark')}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
          >
            {resolved === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>
    </header>
  )
}
