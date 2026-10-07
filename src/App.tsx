import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { Header } from './components/layout/Header'
import { Callout, Disclaimer, EmptyState } from './components/ui'
import { DashboardProvider, useDashboard } from './lib/dashboard'
import { staleNotice } from './lib/freshness'
import { pathogenShort } from '../shared/pathogens'
import { useAppState, VIEW_TITLE, type AppState } from './lib/state'

const PulseView = lazy(() => import('./views/PulseView'))
const MapView = lazy(() => import('./views/MapView'))
const TrendsView = lazy(() => import('./views/TrendsView'))
const PathogensView = lazy(() => import('./views/PathogensView'))
const PathogenView = lazy(() => import('./views/PathogenView'))
const LearnView = lazy(() => import('./views/LearnView'))
const SourcesView = lazy(() => import('./views/SourcesView'))

// After a deploy, an open tab can ask for a lazy chunk that no longer exists. Reload once to pick up the new
// build; the sessionStorage flag stops a reload loop if the chunk is genuinely missing.
const RELOAD_FLAG = 'mnpulse-preload-reload'
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem(RELOAD_FLAG)) return
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
    } catch {
      return // storage blocked: let the error boundary offer a manual reload instead of risking a loop
    }
    event.preventDefault()
    window.location.reload()
  })
  // A successful start clears the flag so a later deploy can reload once again.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG)
    } catch {
      /* storage unavailable */
    }
  }, 10_000)
}

/** Catches render errors in a view so one broken page (or a bad link) never blanks the whole site. */
class ErrorBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View failed to render', error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState title="Something went wrong showing this page">
          <p>The rest of MN Pulse still works. Reloading usually fixes this; if it keeps happening, the link may be out of date.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.props.onHome}
              className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-1 hover:bg-surface-2"
            >
              Go to Pulse
            </button>
          </div>
        </EmptyState>
      </div>
    )
  }
}

function Body() {
  const { state } = useAppState()
  const { data, error, loading } = useDashboard()
  if (error && !data) {
    return (
      <EmptyState title="Data could not be loaded">
        {error.message}. The data pipeline may not have run yet — try again shortly.
      </EmptyState>
    )
  }
  if (!data) return <p className="py-24 text-center text-ink-2">{loading ? 'Loading the latest data…' : ''}</p>
  switch (state.view) {
    case 'map':
      return <MapView />
    case 'trends':
      return <TrendsView />
    case 'pathogens':
      return <PathogensView />
    case 'pathogen':
      return <PathogenView />
    case 'learn':
      return <LearnView />
    case 'sources':
      return <SourcesView />
    default:
      return <PulseView />
  }
}

/** Title for the current route. The illness page uses its profile's short name (same text PathogenView sets). */
async function routeTitle(state: AppState): Promise<string> {
  if (state.view !== 'pathogen') return VIEW_TITLE[state.view]
  if (!state.pathogenId) return VIEW_TITLE.pathogens
  try {
    const { getProfile } = await import('./content')
    const profile = getProfile(state.pathogenId)
    if (profile) return `${profile.shortName}: what to know in Minnesota · MN Pulse`
  } catch {
    /* fall back to the shared short name */
  }
  return `${pathogenShort(state.pathogenId)}: what to know in Minnesota · MN Pulse`
}

/**
 * Route changes (in-app links, back/forward, edited hashes) are announced and move focus to the main region:
 * set document.title, write it to a polite live region, and focus <main> without scrolling past the header.
 * Keyed on the view and illness only, so changing a filter never steals focus.
 */
function useRouteAnnouncer(mainRef: React.RefObject<HTMLElement | null>) {
  const { state } = useAppState()
  const [message, setMessage] = useState('')
  const first = useRef(true)
  const { view, pathogenId } = state
  useEffect(() => {
    let alive = true
    const initial = first.current
    first.current = false
    routeTitle({ ...state, view, pathogenId }).then((title) => {
      if (!alive) return
      document.title = title
      if (initial) return // never steal focus or announce on page load
      setMessage(title.replace(/ · MN Pulse$/, ''))
      // Wait for the new view to render before moving focus.
      requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pathogenId])
  return message
}

function StaleSnapshot() {
  const { data } = useDashboard()
  const notice = data ? staleNotice(data.manifest.generatedAt, data.pulse) : undefined
  if (!notice) return null
  return (
    <div className="mb-5">
      <Callout tone="warn" title="Data may be out of date">
        {notice.message}
      </Callout>
    </div>
  )
}

export function App() {
  const { state, go } = useAppState()
  const mainRef = useRef<HTMLElement>(null)
  const announcement = useRouteAnnouncer(mainRef)
  return (
    <DashboardProvider>
      <a
        href="#main"
        onClick={(e) => {
          // An in-page jump, not a route: keep the current view, filters and URL as they are.
          e.preventDefault()
          const main = mainRef.current
          if (!main) return
          main.focus({ preventScroll: true })
          main.scrollIntoView({ block: 'start' })
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface-1 focus:p-2"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 outline-none">
        <StaleSnapshot />
        <Suspense fallback={<p className="py-24 text-center text-ink-2">Loading…</p>}>
          <ErrorBoundary key={`${state.view}:${state.pathogenId ?? ''}`} onHome={() => go('pulse')}>
            <Body />
          </ErrorBoundary>
        </Suspense>
      </main>
      <footer className="mx-auto max-w-7xl border-t border-line px-4 py-6">
        <Disclaimer />
      </footer>
      {/* Persistent, visually hidden: announces the page title after each route change. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </DashboardProvider>
  )
}
