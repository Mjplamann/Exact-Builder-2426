// How MN Pulse labels a trend (mirrors shared/risk.ts computeTrend).
import type { TrendDirection } from '../../../shared/types'
import { TrendPill } from '../ui'

// Symmetric log-ratio thresholds: ×1.1 / ×1.4 up, ÷1.1 / ÷1.4 down.
const UP = 1.1
const FAST = 1.4
const pct = (x: number) => Math.round(Math.abs(x - 1) * 100)

const RULES: { trend: TrendDirection; rule: string }[] = [
  { trend: 'rising-fast', rule: `Up ${pct(FAST)}% or more` },
  { trend: 'rising', rule: `Up ${pct(UP)}% to ${pct(FAST)}%` },
  { trend: 'steady', rule: `Within about ${pct(UP)}% either way, or a change too small to matter` },
  { trend: 'falling', rule: `Down about ${pct(1 / UP)}% to ${pct(1 / FAST)}%` },
  { trend: 'falling-fast', rule: `Down about ${pct(1 / FAST)}% or more` },
]

export function TrendRules() {
  return (
    <div className="mt-5 rounded-xl border border-line bg-surface-1">
      <div className="border-b border-line bg-surface-2 px-3 py-2">
        <h3 className="text-sm font-semibold text-ink-1">How trends are labeled</h3>
        <p className="text-xs text-ink-2">
          Average of the latest 3 weeks compared with the 3-week average from two weeks earlier.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Trend labels and the change each one requires</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Trend</th>
            <th scope="col">Change in the 3-week average</th>
          </tr>
        </thead>
        <tbody>
          {RULES.map((r) => (
            <tr key={r.trend} className="border-t border-line first:border-t-0">
              <th scope="row" className="px-3 py-2 font-normal whitespace-nowrap">
                <TrendPill trend={r.trend} />
              </th>
              <td className="px-3 py-2 text-ink-2">{r.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-1 border-t border-line px-3 py-2 text-xs text-ink-3">
        <li>
          Small-change floor: a change smaller than 1.5% of the measure’s usual high point (its 90th percentile) counts as
          Steady, so tiny wiggles at low levels do not read as “rising fast”.
        </li>
        <li>When a publisher gives its own trend call (such as CDC’s Rt epidemic trend), MN Pulse shows that instead.</li>
      </ul>
    </div>
  )
}
