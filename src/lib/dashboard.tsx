// Loads all dashboard data once and shares it through context.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { invalidateData, loadDashboard, type DashboardData } from './data'

interface Ctx {
  data?: DashboardData
  error?: Error
  loading: boolean
  refresh: () => void
}

const DashboardContext = createContext<Ctx>({ loading: true, refresh: () => {} })

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Ctx, 'refresh'>>({ loading: true })
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    loadDashboard().then(
      (data) => setState({ data, loading: false }),
      (error: Error) => setState((s) => ({ ...s, error, loading: false })),
    )
  }, [])
  useEffect(load, [load])
  const refresh = useCallback(() => {
    invalidateData()
    load()
  }, [load])
  return <DashboardContext.Provider value={{ ...state, refresh }}>{children}</DashboardContext.Provider>
}

export const useDashboard = () => useContext(DashboardContext)
