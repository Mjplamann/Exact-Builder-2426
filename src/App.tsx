import { lazy, Suspense } from 'react'
import { Header } from './components/layout/Header'
import { Disclaimer, EmptyState } from './components/ui'
import { DashboardProvider, useDashboard } from './lib/dashboard'
import { useAppState } from './lib/state'

const PulseView = lazy(() => import('./views/PulseView'))
const MapView = lazy(() => import('./views/MapView'))
const TrendsView = lazy(() => import('./views/TrendsView'))
const PathogensView = lazy(() => import('./views/PathogensView'))
const PathogenView = lazy(() => import('./views/PathogenView'))
const LearnView = lazy(() => import('./views/LearnView'))
const SourcesView = lazy(() => import('./views/SourcesView'))

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

export function App() {
  return (
    <DashboardProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-1 focus:p-2">
        Skip to content
      </a>
      <Header />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        <Suspense fallback={<p className="py-24 text-center text-ink-2">Loading…</p>}>
          <Body />
        </Suspense>
      </main>
      <footer className="mx-auto max-w-7xl border-t border-line px-4 py-6">
        <Disclaimer />
      </footer>
    </DashboardProvider>
  )
}
