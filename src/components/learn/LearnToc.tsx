// "On this page" navigation: sticky side list on desktop, collapsible list on phones.
// Uses in-page scrolling (not hash links) because the app's hash is its router.
import { useEffect, useState } from 'react'

export interface TocItem {
  id: string
  label: string
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Scroll a section into view and move keyboard focus to its heading. */
export function jumpToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  const heading = el.querySelector<HTMLElement>('h2, h3')
  if (heading) {
    heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }
}

/** Tracks which section is currently near the top of the viewport. */
export function useActiveSection(ids: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, boolean>()
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = ids.find((id) => visible.get(id))
        if (first) setActive(first)
      },
      { rootMargin: '-110px 0px -55% 0px', threshold: 0 },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [ids])
  return active
}

function TocList({ items, active, onPick }: { items: TocItem[]; active?: string; onPick: (id: string) => void }) {
  return (
    <ol className="space-y-0.5 text-sm">
      {items.map((it, i) => {
        const on = it.id === active
        return (
          <li key={it.id}>
            <a
              href="#/learn"
              onClick={(e) => {
                e.preventDefault()
                onPick(it.id)
              }}
              aria-current={on ? 'location' : undefined}
              className={`flex gap-2 rounded-md border-l-2 py-1 pr-2 pl-2.5 leading-snug transition-colors ${
                on ? 'border-accent bg-surface-2 font-semibold text-ink-1' : 'border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink-1'
              }`}
            >
              <span className="tabular w-5 shrink-0 text-ink-3" aria-hidden="true">
                {i + 1}.
              </span>
              <span>{it.label}</span>
            </a>
          </li>
        )
      })}
    </ol>
  )
}

export function LearnToc({ items, active }: { items: TocItem[]; active?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* Desktop: sticky side navigation */}
      <nav aria-label="On this page" className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pb-6 lg:block">
        <p className="mb-2 px-2.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">On this page</p>
        <TocList items={items} active={active} onPick={jumpToSection} />
      </nav>
      {/* Phone / tablet: collapsible list */}
      <details
        className="card mb-6 lg:hidden"
        open={open}
        onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink-1 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>On this page · {items.length} topics</span>
            <span aria-hidden="true" className={`text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </span>
        </summary>
        <div className="border-t border-line px-2 py-2">
          <TocList
            items={items}
            active={active}
            onPick={(id) => {
              setOpen(false)
              // Wait for the list to collapse so the scroll target is measured after the layout shift.
              requestAnimationFrame(() => requestAnimationFrame(() => jumpToSection(id)))
            }}
          />
        </div>
      </details>
    </>
  )
}
