// A 12-month strip marking an illness's typical peak months in Minnesota, with "now" outlined.
import { MONTH_LONG, MONTH_SHORT } from './meta'

/** "December to February" style phrase for a set of months (handles wrap-around the new year). */
export function peakPhrase(months: number[]): string {
  const set = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b)
  if (!set.length) return 'No clear seasonal peak'
  if (set.length === 12) return 'Year-round'
  // Find runs of consecutive months, treating Dec→Jan as consecutive.
  const has = (m: number) => set.includes(((m - 1 + 12) % 12) + 1)
  const starts = set.filter((m) => !has(m - 1))
  if (!starts.length) return 'Year-round'
  const runs = starts.map((s) => {
    let e = s
    while (has(e + 1) && ((e % 12) + 1) !== s) e = (e % 12) + 1
    return [s, e] as const
  })
  return runs
    .map(([s, e]) => (s === e ? MONTH_LONG[s - 1] : `${MONTH_LONG[s - 1]} to ${MONTH_LONG[e - 1]}`))
    .join(', ')
}

/** Full sentence about the usual peak, e.g. "In Minnesota it usually peaks from December to February." */
export function seasonSentence(months: number[]): string {
  const p = peakPhrase(months)
  if (p === 'No clear seasonal peak') return 'It has no clear seasonal peak in Minnesota, so it can show up any time of year.'
  if (p === 'Year-round') return 'It circulates year-round in Minnesota.'
  return `In Minnesota it usually peaks ${p.includes(' to ') && !p.includes(',') ? 'from ' : 'in '}${p}.`
}

export function MonthStrip({ months, now = new Date(), size = 'sm' }: { months: number[]; now?: Date; size?: 'sm' | 'md' }) {
  const current = now.getMonth() + 1
  const peaks = new Set(months)
  const h = size === 'md' ? 'h-7 text-xs' : 'h-5 text-[10px]'
  return (
    <div>
      <p className="sr-only">
        Usually peaks: {peakPhrase(months)}. It is now {MONTH_LONG[current - 1]}.
      </p>
      <ol className="flex gap-0.5" aria-hidden="true">
        {MONTH_SHORT.map((m, i) => {
          const month = i + 1
          const peak = peaks.has(month)
          const isNow = month === current
          return (
            <li
              key={m}
              title={`${MONTH_LONG[i]}${peak ? ' — usual peak' : ''}${isNow ? ' (now)' : ''}`}
              className={`flex min-w-0 flex-1 items-center justify-center rounded-[4px] font-semibold leading-none ${h} ${
                peak ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3'
              } ${isNow ? 'ring-2 ring-ink-1 ring-offset-1 ring-offset-[var(--surface-1)]' : ''}`}
            >
              {size === 'md' ? (
                <>
                  <span className="xl:hidden">{m.charAt(0)}</span>
                  <span className="hidden xl:inline">{m}</span>
                </>
              ) : (
                m.charAt(0)
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
