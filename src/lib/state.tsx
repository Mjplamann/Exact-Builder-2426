// Global app state (view + filters), synced to the URL hash so every view is shareable:
//   #/map?geo=county:27053&range=1y&for=seniors
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AgeGroupId, PathogenCategory, PathogenId } from '../../shared/types'

export type View = 'pulse' | 'map' | 'trends' | 'pathogens' | 'pathogen' | 'learn' | 'sources'
export type TimeRange = '3m' | '6m' | '1y' | '2y' | '5y'
export type GeoSelection = { type: 'state'; code: '27' } | { type: 'county'; code: string } | { type: 'mdh-region'; code: string }

export interface AppState {
  view: View
  pathogenId?: PathogenId
  geo: GeoSelection
  range: TimeRange
  audience: AgeGroupId
  category: PathogenCategory | 'all'
}

export const DEFAULT_STATE: AppState = {
  view: 'pulse',
  geo: { type: 'state', code: '27' },
  range: '1y',
  audience: 'all',
  category: 'all',
}

export const RANGE_WEEKS: Record<TimeRange, number> = { '3m': 13, '6m': 26, '1y': 52, '2y': 104, '5y': 261 }

const VIEWS: View[] = ['pulse', 'map', 'trends', 'pathogens', 'pathogen', 'learn', 'sources']

export function parseHash(hash: string): AppState {
  const [pathPart, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const segs = pathPart.split('/').filter(Boolean)
  const s: AppState = { ...DEFAULT_STATE, geo: { ...DEFAULT_STATE.geo } }
  if (segs[0] === 'pathogens' && segs[1]) {
    s.view = 'pathogen'
    s.pathogenId = decodeURIComponent(segs[1]) as PathogenId
  } else if (VIEWS.includes(segs[0] as View)) {
    s.view = segs[0] as View
  }
  const q = new URLSearchParams(query)
  const geo = q.get('geo')
  if (geo) {
    const [type, code] = geo.split(':')
    if (type === 'county' && /^27\d{3}$/.test(code)) s.geo = { type: 'county', code }
    else if (type === 'mdh-region' && code) s.geo = { type: 'mdh-region', code: decodeURIComponent(code) }
  }
  const range = q.get('range') as TimeRange | null
  if (range && range in RANGE_WEEKS) s.range = range
  const aud = q.get('for') as AgeGroupId | null
  if (aud) s.audience = aud
  const cat = q.get('cat') as AppState['category'] | null
  if (cat) s.category = cat
  return s
}

export function toHash(s: AppState): string {
  const path = s.view === 'pathogen' && s.pathogenId ? `pathogens/${encodeURIComponent(s.pathogenId)}` : s.view
  const q = new URLSearchParams()
  if (s.geo.type !== 'state') q.set('geo', `${s.geo.type}:${s.geo.code}`)
  if (s.range !== DEFAULT_STATE.range) q.set('range', s.range)
  if (s.audience !== 'all') q.set('for', s.audience)
  if (s.category !== 'all') q.set('cat', s.category)
  const qs = q.toString()
  return `#/${path}${qs ? `?${qs}` : ''}`
}

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
    const onHash = () => setState(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
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
