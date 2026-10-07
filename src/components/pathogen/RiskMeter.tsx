// Four-step ordinal meter for relative risk of severe illness. Uses the neutral sequential ramp
// (not activity-level colors) and always shows the text label.
import type { RiskTier } from '../../content/types'
import { RISK_LABEL, RISK_ORDER } from './meta'

const STEP_FILL = ['var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)', 'var(--seq-700)']

export function RiskMeter({ risk, className = '' }: { risk: RiskTier; className?: string }) {
  const n = RISK_ORDER.indexOf(risk) + 1
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {RISK_ORDER.map((t, i) => (
          <span
            key={t}
            className="block w-2.5 rounded-[2px]"
            style={{ height: 6 + i * 3, background: i < n ? STEP_FILL[i] : 'var(--border-strong)' }}
          />
        ))}
      </span>
      <span className="text-sm font-semibold whitespace-nowrap text-ink-1">{RISK_LABEL[risk]}</span>
    </span>
  )
}
