import { Link } from 'react-router'
import { docsLinkEnter, docsLinkLeave } from '../../lib/motion.ts'
import { CloseIcon, MenuIcon, SearchIcon } from '../icons.tsx'
import { Logo } from '../Logo.tsx'
import { ThemeToggle } from '../ThemeToggle.tsx'

/**
 * The documentation header: sticky, 62px, and the only place the drawer and the
 * theme can be reached.
 */

/** Both site links lift and turn pink the same way; focus counts as hover. */
const lift = {
  onPointerEnter: (event: React.PointerEvent<HTMLElement>) => docsLinkEnter(event.currentTarget),
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => docsLinkLeave(event.currentTarget),
  onFocus: (event: React.FocusEvent<HTMLElement>) => docsLinkEnter(event.currentTarget),
  onBlur: (event: React.FocusEvent<HTMLElement>) => docsLinkLeave(event.currentTarget),
}

export function DocsHeader({
  version,
  drawerOpen,
  drawerId,
  toggleRef,
  onDrawerToggle,
  onSearchOpen,
}: {
  readonly version: string
  readonly drawerOpen: boolean
  /** The panel this header's toggle controls, for `aria-controls`. */
  readonly drawerId: string
  /** So the shell can hand focus back here when the drawer closes. */
  readonly toggleRef: React.Ref<HTMLButtonElement>
  readonly onDrawerToggle: () => void
  readonly onSearchOpen: () => void
}) {
  return (
    <header className="docs-head">
      <div className="docs-head-row">
        <button
          ref={toggleRef}
          type="button"
          className="docs-drawer-toggle"
          onClick={onDrawerToggle}
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          aria-label={drawerOpen ? 'Close the navigation' : 'Open the navigation'}
        >
          {drawerOpen ? <CloseIcon size={16} /> : <MenuIcon size={16} />}
        </button>

        <Logo size="sm" />

        <span className="docs-version">v{version}</span>

        <button type="button" className="docs-search-trigger" onClick={onSearchOpen}>
          <SearchIcon size={15} />
          <span className="docs-search-label">Search the docs</span>
          {/* Both spellings ship and the stylesheet picks one, from the
              `data-platform` the head script stamped. The handler has always
              taken either key — it was only the label that told most readers
              to press something they do not have. */}
          <kbd data-key="ctrl">Ctrl K</kbd>
          <kbd data-key="mac">⌘K</kbd>
        </button>

        <nav className="docs-head-nav" aria-label="Site">
          <Link to="/" {...lift}>
            Home
          </Link>
          <a href="https://github.com/lovely-assertions/lovely-assertions" {...lift}>
            GitHub
          </a>
        </nav>

        <ThemeToggle />
      </div>
    </header>
  )
}
