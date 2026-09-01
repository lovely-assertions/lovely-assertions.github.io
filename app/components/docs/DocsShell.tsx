import { useCallback, useEffect, useRef, useState } from 'react'
import { buildNav } from '../../lib/nav.ts'
import { DocsHeader } from './DocsHeader.tsx'
import { DocsSidebar } from './DocsSidebar.tsx'
import { SearchOverlay, useSearchShortcut } from './SearchOverlay.tsx'

/** Below this the sidebar becomes a drawer. */
const DRAWER_BREAKPOINT = 900

/** The drawer's own id, so the toggle can point `aria-controls` at it. */
const DRAWER_ID = 'docs-drawer'

/**
 * The three-column documentation shell.
 *
 * Below 900px the sidebar becomes a drawer that locks body scroll, closes on
 * Escape and on picking a page, and closes itself if the viewport grows past
 * the breakpoint — otherwise a reader who rotates a tablet is left with an
 * invisible overlay eating their clicks.
 *
 * Open, that drawer is a modal dialog in everything but name: fixed, opaque,
 * full height, over a page that cannot scroll. So it owes the three things
 * APG's modal pattern asks for, and used to owe all three. Measured at 760px:
 * focus stayed on the toggle, `.docs-main` was not inert, and six Tab presses
 * were needed to reach the first drawer link — the first five walked the header.
 * Closing it dropped focus to `<body>`.
 *
 * The header stays reachable on purpose: it holds the control that closes the
 * drawer. What sits *behind* the panel — the article and the contents rail — is
 * marked inert, which is the requirement the pattern is actually making.
 */
export function DocsShell({
  current,
  version,
  aside,
  children,
}: {
  readonly current: string
  readonly version: string
  /** The contents rail, when the page has one. */
  readonly aside?: React.ReactNode
  readonly children: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const drawer = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const main = useRef<HTMLElement>(null)

  // Two modals over one page is a stack nobody asked for, and the drawer would
  // still be there — scroll-locked — behind whatever the search navigated to.
  const openSearch = useCallback(() => {
    setDrawerOpen(false)
    setSearchOpen(true)
  }, [])
  useSearchShortcut(openSearch)

  // Body scroll is locked only while the drawer covers the page.
  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [drawerOpen])

  // Focus in on open, back to the control that opened it on close.
  useEffect(() => {
    if (!drawerOpen) return
    drawer.current?.querySelector('a')?.focus()
    return () => toggle.current?.focus()
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    function onResize() {
      if (window.innerWidth > DRAWER_BREAKPOINT) setDrawerOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [drawerOpen])

  /**
   * Send the reader into the page they just chose.
   *
   * A client navigation replaces the whole article without a document load, so
   * nothing tells assistive technology that anything happened: focus stays on
   * the sidebar link, and the reading cursor stays where it was. Moving it to
   * `<main>` is what makes the new page the thing being read, and it puts the
   * next Tab at the top of the content rather than back in the navigation.
   *
   * Not on the first render — arriving at a page is not navigating to one, and
   * stealing focus on load would drop anyone past the skip link.
   */
  const landed = useRef<string | null>(null)
  useEffect(() => {
    const previous = landed.current
    landed.current = current
    // First render, or a re-render that did not change page.
    if (previous === null || previous === current) return
    main.current?.focus({ preventScroll: true })
  }, [current])

  return (
    <div className="docs">
      <a className="skip-link" href="#doc-main">
        Skip to content
      </a>

      <DocsHeader
        version={version}
        drawerOpen={drawerOpen}
        drawerId={DRAWER_ID}
        toggleRef={toggle}
        onDrawerToggle={() => setDrawerOpen((open) => !open)}
        onSearchOpen={openSearch}
      />

      <div className="docs-grid">
        <nav
          id={DRAWER_ID}
          ref={drawer}
          className="docs-sidebar docs-rail"
          aria-label="Documentation"
          data-open={drawerOpen || undefined}
          data-pagefind-ignore
        >
          <DocsSidebar nav={buildNav()} current={current} onNavigate={() => setDrawerOpen(false)} />
        </nav>

        {/* `tabIndex={-1}` so the skip link and the post-navigation focus move
            actually land: without it Safari and iOS VoiceOver ignore the
            fragment and leave focus where it was, which makes "Skip to content"
            a no-op for the readers it exists for. */}
        <main className="docs-main" id="doc-main" ref={main} tabIndex={-1} inert={drawerOpen}>
          {children}
        </main>

        {aside}
      </div>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
