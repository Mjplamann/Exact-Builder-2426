// In-page table of contents. The app routes with the URL hash, so entries scroll with JS instead of
// #anchors (which would change the route).
import { useEffect, useState } from 'react'

export interface TocItem {
  id: string
  label: string
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  const heading = el.querySelector<HTMLElement>('h2')
  if (heading) {
    heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }
}

/** Id of the section currently nearest the top of the viewport. */
export function useActiveSection(ids: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0])
  const key = ids.join('|')
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e)
    if (!els.length || typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        const first = ids.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: '-90px 0px -55% 0px', threshold: 0 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return active
}

function TocList({ items, active, onPick }: { items: TocItem[]; active?: string; onPick?: () => void }) {
  return (
    <ol className="space-y-0.5">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => {
              scrollToSection(it.id)
              onPick?.()
            }}
            aria-current={active === it.id ? 'location' : undefined}
            className={`block w-full rounded-md border-l-2 px-3 py-1.5 text-left text-sm transition-colors ${
              active === it.id
                ? 'border-accent bg-surface-2 font-semibold text-ink-1'
                : 'border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink-1'
            }`}
          >
            {it.label}
          </button>
        </li>
      ))}
    </ol>
  )
}

/** Sticky sidebar version (desktop). */
export function TocSidebar({ items, active }: { items: TocItem[]; active?: string }) {
  return (
    <nav aria-label="On this page" className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-4">
      <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-ink-3 uppercase">On this page</p>
      <TocList items={items} active={active} />
    </nav>
  )
}

/** Collapsible version (phones and tablets). */
export function TocDisclosure({ items, active }: { items: TocItem[]; active?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <nav aria-label="On this page" className="card p-0">
      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-[14px] px-4 py-3 text-sm font-semibold text-ink-1 select-none [&::-webkit-details-marker]:hidden">
          On this page
          <span aria-hidden="true" className="text-ink-3">
            {open ? '▴' : '▾'}
          </span>
        </summary>
        <div className="border-t border-line px-1 py-2">
          <TocList items={items} active={active} onPick={() => setOpen(false)} />
        </div>
      </details>
    </nav>
  )
}
