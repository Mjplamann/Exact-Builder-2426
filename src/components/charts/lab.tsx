// Developer-only chart lab (chartlab.html): renders every chart variant against the real published
// data in public/data so the components can be checked visually in light/dark and phone/desktop.
// Not linked from the app.
import { StrictMode, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles/index.css'
import type { Series } from '../../../shared/types'
import { loadDashboard, type DashboardData } from '../../lib/data'
import { Card, SectionTitle, SourceTag } from '../ui'
import { TrendChart } from './TrendChart'
import { Sparkline } from './Sparkline'
import { LevelScale } from './LevelScale'

function Lab() {
  const [data, setData] = useState<DashboardData>()
  const [err, setErr] = useState<string>()
  useEffect(() => {
    loadDashboard().then(setData, (e: Error) => setErr(e.message))
  }, [])
  if (err) return <p className="p-4 text-ink-1">Error: {err}</p>
  if (!data) return <p className="p-4 text-ink-2">Loading…</p>
  const byId = (id: string) => data.series.find((s) => s.id === id)
  const pick = (id: string) => {
    const s = byId(id)
    return s ? [s] : []
  }
  const fluEdMn = pick('cdc-hubs:nssp-ed-state:influenza:ed_visit_pct:state:27')
  const fluEdUs = pick('cdc-hubs:nssp-ed-state:influenza:ed_visit_pct:national:US')
  const covEdMn = pick('cdc-hubs:nssp-ed-state:covid:ed_visit_pct:state:27')
  const covEdUs = pick('cdc-hubs:nssp-ed-state:covid:ed_visit_pct:national:US')
  const fluRate = pick('cdc-hubs:nhsn-admissions:influenza:hosp_rate:state:27')
  const rsvAdm = pick('cdc-hubs:nhsn-admissions:rsv:hosp_admissions:state:27')
  const covAdm = byId('cdc-hubs:nhsn-admissions:covid:hosp_admissions:state:27')
  // Lab only: the same real values with the provisional flag set on the last 3 weeks, to check styling.
  const covAdmProv: Series[] = covAdm
    ? [{ ...covAdm, provisionalFrom: covAdm.points[covAdm.points.length - 3][0] }]
    : []
  const empty: Series[] = fluEdMn.length ? [{ ...fluEdMn[0], id: 'lab:empty', points: [] }] : []
  const fc = data.forecasts.forecasts

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink-1">Chart lab</h1>
        <ThemeSwitch />
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="COVID — ER visits, MN vs U.S. (1 yr)" sub="CDC + MN Pulse forecasts → source toggle; thresholds">
          <TrendChart
            ariaLabel="COVID share of emergency department visits, Minnesota compared with the U.S."
            series={[
              ...covEdMn.map((s) => ({ series: s, name: 'Minnesota' })),
              ...covEdUs.map((s) => ({ series: s, name: 'United States', muted: true })),
            ]}
            forecasts={fc}
            range="1y"
          />
        </Panel>
        <Panel title="Flu — ER visits, MN vs U.S. (2 yr)" sub="MN Pulse projection only; thresholds">
          <TrendChart
            ariaLabel="Flu share of emergency department visits, Minnesota compared with the U.S."
            series={[
              ...fluEdMn.map((s) => ({ series: s, name: 'Minnesota' })),
              ...fluEdUs.map((s) => ({ series: s, name: 'United States', muted: true })),
            ]}
            forecasts={fc}
            range="2y"
          />
        </Panel>
        <Panel title="Flu — hospitalizations per 100k (5 yr)" sub="per100k unit, thresholds, projection">
          <TrendChart ariaLabel="Flu hospitalizations per 100,000" series={fluRate.map((s) => ({ series: s, name: 'Minnesota' }))} forecasts={fc} range="5y" />
        </Panel>
        <Panel title="RSV — hospital admissions (3 mo)" sub="count unit, CDC forecast toggle">
          <TrendChart ariaLabel="RSV hospital admissions per week" series={rsvAdm.map((s) => ({ series: s, name: 'Minnesota' }))} forecasts={fc} range="3m" height={240} />
        </Panel>
        <Panel title="Flu — ER visits by season" sub="compareSeasons, 5 yr">
          <TrendChart ariaLabel="Flu ER visits by season" series={fluEdMn.map((s) => ({ series: s }))} compareSeasons range="5y" />
        </Panel>
        <Panel title="COVID — admissions, provisional flag (lab)" sub="6 mo, last 3 weeks flagged provisional">
          <TrendChart ariaLabel="COVID hospital admissions" series={covAdmProv.map((s) => ({ series: s, name: 'Minnesota' }))} range="6m" />
        </Panel>
        <Panel title="Table view" sub="defaultView = table">
          <TrendChart
            ariaLabel="COVID ER visits table"
            series={covEdMn.map((s) => ({ series: s, name: 'Minnesota' }))}
            forecasts={fc}
            range="3m"
            height={260}
            defaultView="table"
          />
        </Panel>
        <Panel title="Empty state" sub="series with no points">
          <TrendChart ariaLabel="Empty" series={empty.map((s) => ({ series: s }))} />
        </Panel>
      </div>

      <Card>
        <SectionTitle title="Sparklines" subtitle="Inline SVG, last 16 weeks" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.series.slice(0, 9).map((s) => (
            <li key={s.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line p-2">
              <span className="min-w-0 truncate text-xs text-ink-2">{s.label}</span>
              <span className="shrink-0 text-[var(--series-1)]">
                <Sparkline points={s.points.slice(-16)} label={`${s.label}, last 16 weeks`} area />
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 rounded-lg border border-line p-2">
            <span className="text-xs text-ink-2">Gaps (RSV, early weeks null)</span>
            <span className="shrink-0 text-ink-2">
              <Sparkline points={rsvAdm[0]?.points.slice(60, 85) ?? []} label="RSV with gaps" />
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 rounded-lg border border-line p-2">
            <span className="text-xs text-ink-2">No data</span>
            <Sparkline points={[]} label="No data" />
          </li>
        </ul>
      </Card>

      <Card>
        <SectionTitle title="Level scale" />
        <div className="space-y-4">
          <LevelScale title="Activity level" active="moderate" />
          <LevelScale />
          <LevelScale variant="chips" title="Chips" active="high" />
          <LevelScale variant="chips" showUnknown />
        </div>
      </Card>
    </div>
  )
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <Card>
      <SectionTitle title={title} subtitle={<span className="inline-flex flex-wrap items-center gap-2">{sub} <SourceTag>lab</SourceTag></span>} />
      {children}
    </Card>
  )
}

function ThemeSwitch() {
  const [t, setT] = useState<'system' | 'light' | 'dark'>('system')
  useEffect(() => {
    if (t === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', t)
  }, [t])
  return (
    <div className="flex overflow-hidden rounded-lg border border-line" role="radiogroup" aria-label="Theme">
      {(['system', 'light', 'dark'] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={t === id}
          onClick={() => setT(id)}
          className={`px-2.5 py-1 text-sm ${t === id ? 'bg-accent text-accent-ink' : 'bg-surface-1 text-ink-2'}`}
        >
          {id}
        </button>
      ))}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
)
