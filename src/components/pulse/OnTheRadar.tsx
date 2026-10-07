// "On the radar this season": illnesses that typically peak in Minnesota this month or next and are not
// already on the watch list. Based on seasonality in the pathogen profiles — explicitly NOT current data.
import type { PathogenId } from '../../../shared/types'
import { PROFILES } from '../../content'
import { useAppState } from '../../lib/state'
import { hrefFor, monthRanges } from './util'

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
]

export function OnTheRadar({ exclude, now = new Date() }: { exclude: PathogenId[]; now?: Date }) {
  const { state, go } = useAppState()
  const month = now.getMonth() + 1
  const next = (month % 12) + 1
  const skip = new Set(exclude)
  const items = PROFILES.filter((p) => !skip.has(p.id) && p.seasonality.peakMonths.some((m) => m === month || m === next)).sort(
    (a, b) => {
      // Peaking this month before peaking next month, then by name.
      const am = a.seasonality.peakMonths.includes(month) ? 0 : 1
      const bm = b.seasonality.peakMonths.includes(month) ? 0 : 1
      return am - bm || a.shortName.localeCompare(b.shortName)
    },
  )

  return (
    <section aria-labelledby="radar-title">
      <div className="mb-3">
        <h2 id="radar-title" className="text-lg font-semibold tracking-tight text-ink-1">
          On the radar this season
        </h2>
        <p className="mt-0.5 text-sm text-ink-2">
          Illnesses that usually peak in Minnesota in {MONTHS_LONG[month - 1]} or {MONTHS_LONG[next - 1]}.{' '}
          <span className="font-medium text-ink-1">Based on typical Minnesota seasonality, not current data.</span>
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
          No other illnesses in our library typically peak this month or next.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="min-w-0">
              <a
                href={hrefFor(state, 'pathogen', p.id)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  go('pathogen', p.id)
                }}
                className="group flex h-full flex-col rounded-xl border border-dashed border-line-strong bg-surface-1 p-4 transition-colors hover:border-solid hover:bg-surface-2"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-1 group-hover:underline">{p.shortName}</span>
                  <span className="shrink-0 text-xs text-ink-3">
                    Usual peak: {monthRanges(p.seasonality.peakMonths)}
                  </span>
                </span>
                <span className="mt-1.5 text-sm leading-snug text-ink-2">{p.oneLiner}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
