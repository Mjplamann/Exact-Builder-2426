// Floating tooltip positioned inside the map container, kept within its bounds.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export function MapTooltip({
  x,
  y,
  bounds,
  compact,
  children,
}: {
  /** Anchor point in container pixels. */
  x: number
  y: number
  bounds: { width: number; height: number }
  compact?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
  })
  const gap = 14
  const maxW = Math.max(160, Math.min(compact ? 220 : 288, bounds.width - 8))
  let left = x - size.w / 2
  left = Math.max(4, Math.min(left, bounds.width - size.w - 4))
  // Above the pointer when there is room, otherwise below.
  let top = y - size.h - gap
  if (top < 4) top = Math.min(y + gap, Math.max(4, bounds.height - size.h - 4))
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-lg border border-line-strong bg-surface-1 p-2.5 text-xs shadow-lg"
      style={{ left, top, maxWidth: maxW, width: 'max-content', visibility: size.w ? 'visible' : 'hidden' }}
    >
      {children}
    </div>
  )
}
