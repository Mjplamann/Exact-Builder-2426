import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { toHash, useAppState, useTheme, type View } from '../../lib/state'
import { useDashboard } from '../../lib/dashboard'
import { formatDateTime } from '../../lib/format'

const NAV: { view: View; label: string }[] = [
  { view: 'pulse', label: 'Pulse' },
  { view: 'map', label: 'Map' },
  { view: 'trends', label: 'Trends' },
  { view: 'pathogens', label: 'Illnesses' },
  { view: 'learn', label: 'Learn' },
  { view: 'sources', label: 'Sources' },
]

/** The header only sticks when the viewport is tall enough; otherwise it would cover too much (e.g. 400% zoom). */
const STICKY_QUERY = '(min-height: 560px)'

/** Plain left-clicks navigate in-app; modified clicks (new tab/window) keep the browser's behaviour. */
const isPlainClick = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)

export function Header() {
  const { state, go } = useAppState()
  const { data, error, loading, refresh } = useDashboard()
  const [pref, setPref, resolved] = useTheme()
  const active = state.view === 'pathogen' ? 'pathogens' : state.view
  const headerRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })

  // Publish the header's height as --header-h (used by scroll-padding-top) while it is sticky, so focused
  // controls and in-page targets never land underneath it.
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const mq = window.matchMedia?.(STICKY_QUERY)
    const apply = () => {
      const sticky = mq ? mq.matches : true
      document.documentElement.style.setProperty('--header-h', sticky ? `${Math.ceil(el.getBoundingClientRect().height)}px` : '0px')
    }
    apply()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : undefined
    ro?.observe(el)
    mq?.addEventListener?.('change', apply)
    return () => {
      ro?.disconnect()
      mq?.removeEventListener?.('change', apply)
    }
  }, [])

  // Edge fades show only on the side(s) where more nav items are scrolled out of view.
  const updateFade = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const left = nav.scrollLeft > 2
    const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }))
  }, [])
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    updateFade()
    nav.addEventListener('scroll', updateFade, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateFade) : undefined
    ro?.observe(nav)
    return () => {
      nav.removeEventListener('scroll', updateFade)
      ro?.disconnect()
    }
  }, [updateFade])

  // After each route change, bring the current item into view inside the (possibly scrolling) nav row without
  // moving the page.
  useEffect(() => {
    const nav = navRef.current
    const item = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !item || nav.scrollWidth <= nav.clientWidth) return
    const left = item.offsetLeft - (nav.clientWidth - item.offsetWidth) / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: 'auto' })
    updateFade()
  }, [active, updateFade])

  const mask =
    fade.left || fade.right
      ? `linear-gradient(to right, ${fade.left ? 'transparent 0, #000 28px' : '#000 0'}, ${fade.right ? '#000 calc(100% - 28px), transparent 100%' : '#000 100%'})`
      : undefined
  const homeHref = toHash({ ...state, view: 'pulse', pathogenId: undefined })

  return (
    <header
      ref={headerRef}
      className="top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--page)_88%,transparent)] backdrop-blur [@media(min-height:560px)]:sticky"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pt-2.5 pb-1.5 lg:py-2.5">
        <a
          href={homeHref}
          onClick={(e) => {
            if (!isPlainClick(e)) return
            e.preventDefault()
            go('pulse')
          }}
          className="order-1 flex shrink-0 items-center gap-2 rounded-lg"
          aria-label="MN Pulse home"
        >
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M4 17h6l3-8 5 15 3-9 2 2h5" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-bold tracking-tight">MN Pulse</span>
        </a>
        <nav
          ref={navRef}
          aria-label="Main"
          className="relative order-3 -mx-1 flex w-[calc(100%+0.5rem)] gap-0.5 overflow-x-auto sm:gap-1 px-1 py-1 [scrollbar-width:none] lg:order-2 lg:mx-0 lg:w-auto lg:min-w-0 [&::-webkit-scrollbar]:hidden"
          style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        >
          {NAV.map((n) => {
            const current = active === n.view
            return (
              <a
                key={n.view}
                href={toHash({ ...state, view: n.view, pathogenId: undefined })}
                onClick={(e) => {
                  if (!isPlainClick(e)) return
                  e.preventDefault()
                  go(n.view)
                }}
                aria-current={current ? 'page' : undefined}
                // Phones: six equal-width items in 13px so the whole row fits at 360px; it still scrolls (with edge
                // fades) on anything narrower.
                className={`flex-1 shrink-0 rounded-lg px-1.5 py-1.5 text-center text-[13px] whitespace-nowrap sm:flex-none sm:px-3 sm:text-sm ${
                  current ? 'bg-surface-3 font-semibold text-ink-1' : 'text-ink-2 hover:bg-surface-2 hover:text-ink-1'
                }`}
              >
                {n.label}
              </a>
            )
          })}
        </nav>
        <div className="order-2 ml-auto flex shrink-0 flex-nowrap items-center gap-2 text-xs text-ink-3 lg:order-3">
          <span className="hidden md:inline" title="When the data pipeline last ran">
            {data ? `Updated ${formatDateTime(data.manifest.generatedAt)}` : loading ? 'Loading…' : ''}
          </span>
          <button
            type="button"
            // Not `disabled` while loading: disabling the focused button would drop keyboard focus to <body>.
            onClick={() => {
              if (!loading) refresh()
            }}
            aria-busy={loading || undefined}
            className={`rounded-md border border-line px-2 py-1 hover:bg-surface-2 ${loading ? 'cursor-progress' : ''}`}
            aria-label="Reload data"
            title="Reload data"
          >
            <span aria-hidden="true" className={loading && data ? 'inline-block animate-spin' : 'inline-block'}>
              ↻
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPref(pref === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : pref === 'dark' ? 'light' : 'dark')}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
          >
            <span aria-hidden="true">{resolved === 'dark' ? '☀' : '☾'}</span>
          </button>
        </div>
      </div>
      {/* A failed "Reload data" keeps the earlier snapshot on screen; say so instead of failing silently.
          The live region stays mounted (empty = zero height) so the message is announced when it appears. */}
      <div role="status" className="mx-auto max-w-7xl px-4 text-xs">
        {error && data ? (
          <p className="inline-flex items-center gap-1.5 pb-2 font-medium text-ink-1">
            <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2.6 18 16.6H2Z" fill="none" stroke="var(--status-warning)" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            Couldn’t refresh — showing data from {formatDateTime(data.manifest.generatedAt)}.
          </p>
        ) : null}
      </div>
    </header>
  )
}
