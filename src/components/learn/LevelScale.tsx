// The history-based activity scale: percentile bands drawn to their true widths, with a legend that
// pairs every level color with its name (LevelBadge) and a plain-language meaning.
import type { ActivityLevel } from '../../../shared/types'
import { LEVELS, PERCENTILE_BANDS } from '../../../shared/risk'
import { LEVEL_VAR } from '../../lib/format'
import { LevelBadge } from '../ui'

const fmtP = (p: number) => `${p}th`

/** Plain meaning of each band, derived from PERCENTILE_BANDS so text and rule cannot drift apart. */
function bandRows() {
  const cuts = [0, ...PERCENTILE_BANDS, 100]
  return LEVELS.map((level, i) => {
    const lo = cuts[i]
    const hi = cuts[i + 1]
    const share = hi - lo
    const weeksPerYear = (share / 100) * 52
    let rule: string
    if (i === 0) rule = `Below the ${fmtP(hi)} percentile: lower than half of recent weeks`
    else if (i === LEVELS.length - 1) rule = `At or above the ${fmtP(lo)} percentile: higher than ${lo}% of recent weeks`
    else rule = `${fmtP(lo)} to ${fmtP(hi)} percentile: higher than at least ${lo}% of recent weeks`
    const n = Math.max(1, Math.round(weeksPerYear))
    const often = `By design, ${share}% of weeks (about ${n} a year) fall at this level.`
    return { level: level as ActivityLevel, lo, hi, share, rule, often }
  })
}

export function LevelScale() {
  const rows = bandRows()
  return (
    <figure className="mt-5">
      <figcaption className="mb-3 text-sm font-semibold text-ink-1">
        History-based levels: where this week ranks among the past ~3 years of weeks
      </figcaption>
      <div className="relative pt-5 pb-5">
        {/* Bands at true widths, separated by a 2px surface gap. */}
        <div className="flex h-4 gap-[2px] overflow-hidden rounded-md" aria-hidden="true">
          {rows.map((r) => (
            <div key={r.level} style={{ width: `${r.share}%`, background: LEVEL_VAR[r.level] }} />
          ))}
        </div>
        {/* Cut-point labels: alternate below/above so the close 90th and 97.5th never collide. */}
        {PERCENTILE_BANDS.map((p, i) => {
          const above = i === PERCENTILE_BANDS.length - 1
          const last = p > 95
          return (
            <span
              key={p}
              aria-hidden="true"
              className={`tabular absolute text-[11px] whitespace-nowrap text-ink-3 ${above ? 'top-0' : 'bottom-0'}`}
              style={last ? { right: 0 } : { left: `${p}%`, transform: 'translateX(-50%)' }}
            >
              {fmtP(p)}
            </span>
          )
        })}
        <span aria-hidden="true" className="tabular absolute bottom-0 left-0 text-[11px] text-ink-3">
          0
        </span>
      </div>
      <table className="mt-2 w-full text-left text-sm">
        <caption className="sr-only">Activity levels and the percentile range each one covers</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Rule</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.level} className="border-t border-line align-top">
              <th scope="row" className="py-2 pr-3 font-normal whitespace-nowrap">
                <LevelBadge level={r.level} size="sm" />
              </th>
              <td className="py-2 text-ink-2">
                {r.rule}
                <span className="block text-xs text-ink-3">{r.often}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
