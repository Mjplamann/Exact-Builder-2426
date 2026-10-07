// Global app state (view + filters), synced to the URL hash so every view is shareable:
//   #/map?geo=county:27053&range=1y&for=seniors
// Parsing and serialising the hash lives in ./route (pure and unit-tested); this file holds the React side.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PathogenId } from '../../shared/types'
import { isAppHash, parseHash, toHash, type AppState, type View } from './route'

export { DEFAULT_STATE, RANGE_WEEKS, VIEW_TITLE, isAppHash, parseHash, toHash } from './route'
export type { AppState, GeoSelection, TimeRange, View } from './route'

interface Ctx {
  state: AppState
  update: (patch: Partial<AppState>) => void
  /** Navigate to a view, keeping filters. */
  go: (view: View, pathogenId?: PathogenId) => void
}

const AppStateContext = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHash = () => {
      // In-page anchors (e.g. "#main" from a skip link or a table of contents) are not routes: ignore them
      // instead of resetting the app to Pulse with every filter dropped.
      const hash = window.location.hash
      if (!isAppHash(hash)) return
      const next = parseHash(hash)
      setState((prev) => (toHash(prev) === toHash(next) ? prev : next))
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  const update = useCallback((patch: Partial<AppState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      const hash = toHash(next)
      if (hash !== window.location.hash) window.history.pushState(null, '', hash)
      return next
    })
  }, [])

  const go = useCallback(
    (view: View, pathogenId?: PathogenId) => {
      update({ view, pathogenId })
      window.scrollTo({ top: 0 })
    },
    [update],
  )

  const value = useMemo(() => ({ state, update, go }), [state, update, go])
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): Ctx {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}

// ── Theme ────────────────────────────────────────────────────────────────────

export type ThemePref = 'system' | 'light' | 'dark'

function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem('mnpulse-theme')
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function useTheme(): [ThemePref, (t: ThemePref) => void, 'light' | 'dark'] {
  const [pref, setPref] = useState<ThemePref>(readThemePref)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    if (pref === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', pref)
    try {
      if (pref === 'system') localStorage.removeItem('mnpulse-theme')
      else localStorage.setItem('mnpulse-theme', pref)
    } catch {
      /* storage unavailable */
    }
  }, [pref])
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  return [pref, setPref, resolved]
}
