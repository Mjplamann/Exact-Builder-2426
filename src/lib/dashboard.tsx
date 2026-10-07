// Loads all dashboard data once and shares it through context.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { invalidateData, loadDashboard, type DashboardData } from './data'

interface Ctx {
  data?: DashboardData
  /** The last load failed. When `data` is also set, an earlier snapshot is still being shown. */
  error?: Error
  loading: boolean
  /** Non-fatal load problems (missing forecast or series files), in plain language. */
  warnings: string[]
  refresh: () => void
}

const DashboardContext = createContext<Ctx>({ loading: true, warnings: [], refresh: () => {} })

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Ctx, 'refresh' | 'warnings'>>({ loading: true })
  // Each load gets an id; only the newest one may write state, so a slow earlier response can never
  // overwrite a newer refresh.
  const reqId = useRef(0)
  const load = useCallback(() => {
    const id = ++reqId.current
    setState((s) => ({ ...s, loading: true }))
    loadDashboard().then(
      (data) => {
        if (id === reqId.current) setState({ data, loading: false })
      },
      (error: unknown) => {
        if (id !== reqId.current) return
        const err = error instanceof Error ? error : new Error(String(error))
        setState((s) => ({ ...s, error: err, loading: false }))
      },
    )
  }, [])
  useEffect(load, [load])
  const refresh = useCallback(() => {
    invalidateData()
    load()
  }, [load])
  const warnings = state.data?.warnings ?? []
  return <DashboardContext.Provider value={{ ...state, warnings, refresh }}>{children}</DashboardContext.Provider>
}

export const useDashboard = () => useContext(DashboardContext)
