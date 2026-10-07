// Outbound link with a visible "opens in new tab" cue for screen readers and sighted users.
import type { ReactNode } from 'react'

export function ExternalLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-accent underline decoration-1 underline-offset-2 hover:decoration-2 ${className}`}
    >
      {children}
      <span aria-hidden="true" className="ml-0.5 inline-block text-[0.85em]">
        ↗
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
