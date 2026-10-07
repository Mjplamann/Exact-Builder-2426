// Shared UI primitives. Every view composes these so the dashboard reads as one system.
import type { ReactNode } from 'react'
import type { ActivityLevel, TrendDirection } from '../../shared/types'
import { LEVEL_INK_VAR, LEVEL_LABEL, LEVEL_VAR, TREND_ARROW, TREND_LABEL } from '../lib/format'

export function Card({
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`card p-4 sm:p-5 ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function SectionTitle({ title, subtitle, right, id }: { title: string; subtitle?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-ink-1">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/** Activity level chip: color swatch + text label (never color alone). */
export function LevelBadge({ level, size = 'md', prefix }: { level: ActivityLevel; size?: 'sm' | 'md' | 'lg'; prefix?: string }) {
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'lg' ? 'px-3 py-1.5 text-base' : 'px-2.5 py-1 text-sm'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ${pad}`}
      style={{ background: LEVEL_VAR[level], color: LEVEL_INK_VAR[level] }}
    >
      <LevelGlyph level={level} />
      {prefix ? `${prefix} ` : ''}
      {LEVEL_LABEL[level]}
    </span>
  )
}

/** Small bar-meter glyph whose filled bars encode the level (redundant with the label). */
export function LevelGlyph({ level }: { level: ActivityLevel }) {
  const n = { unknown: 0, minimal: 1, low: 2, moderate: 3, high: 4, 'very-high': 5 }[level]
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={i * 3}
          y={10 - i * 2.2}
          width="2"
          height={2 + i * 2.2}
          rx="0.6"
          fill="currentColor"
          opacity={i < n ? 1 : 0.3}
        />
      ))}
    </svg>
  )
}

export function TrendPill({ trend, compact = false }: { trend: TrendDirection; compact?: boolean }) {
  const up = trend === 'rising' || trend === 'rising-fast'
  const down = trend === 'falling' || trend === 'falling-fast'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        up ? 'border-line-strong text-ink-1' : 'border-line text-ink-2'
      }`}
      title={TREND_LABEL[trend]}
    >
      <span aria-hidden="true" className={up ? 'font-bold' : ''}>
        {TREND_ARROW[trend]}
      </span>
      {compact ? (down || up ? TREND_LABEL[trend].split(' ')[0] : TREND_LABEL[trend]) : TREND_LABEL[trend]}
    </span>
  )
}

export function SourceTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
      {children}
    </span>
  )
}

export function Pill({ active, children, onClick, title }: { active?: boolean; children: ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active ? 'border-transparent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface-1 text-ink-2 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-6 text-center">
      <p className="font-medium text-ink-1">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  )
}

export type CalloutTone = 'info' | 'warn' | 'critical'

const CALLOUT_CLASS: Record<CalloutTone, string> = {
  info: 'border-line bg-accent-soft',
  warn: 'border-[var(--status-warning)] bg-surface-2',
  // Critical (e.g. emergency warning signs): a heavy status-coloured left rule plus an icon, never colour alone.
  critical: 'border-line border-l-4 border-l-[var(--status-critical)] bg-surface-2',
}

export function Callout({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: CalloutTone
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border p-3 text-sm ${CALLOUT_CLASS[tone]} ${className}`} role={tone === 'info' ? undefined : 'note'}>
      {title && (
        <p className="mb-0.5 flex items-center gap-1.5 font-semibold text-ink-1">
          {tone !== 'info' && <StatusIcon tone={tone} />}
          {title}
        </p>
      )}
      <div className={tone === 'critical' ? 'text-ink-1' : 'text-ink-2'}>
        {!title && tone !== 'info' && (
          <span className="mr-1.5 inline-block align-[-3px]">
            <StatusIcon tone={tone} />
          </span>
        )}
        {children}
      </div>
    </div>
  )
}

/** Warning triangle (warn) or alert triangle with a solid fill (critical); decorative, paired with text. */
export function StatusIcon({ tone, size = 16 }: { tone: 'warn' | 'critical'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {tone === 'critical' ? (
        <>
          <path d="M10 2.2 18.4 17H1.6Z" fill="var(--status-critical)" />
          <path d="M10 7.4v4.4M10 14.2v.1" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M10 2.6 18 16.6H2Z" fill="none" stroke="var(--status-warning)" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M10 7.6v4M10 14v.1" stroke="var(--ink-1)" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function Disclaimer() {
  return (
    <p className="text-xs text-ink-3">
      MN Pulse summarizes public surveillance data for awareness. It is not medical advice. If you are sick or worried,
      contact a health care provider; for emergencies call 911.
    </p>
  )
}
