import { Link } from 'react-router'
import type { NavGroup } from '../../../pipeline/types.ts'

/**
 * The page list.
 *
 * Its order is the documentation index's order, not the directory tree's, and
 * exactly one row is active — the same row that drives the breadcrumb and the
 * pager.
 */
export function DocsSidebar({
  nav,
  current,
  onNavigate,
}: {
  readonly nav: NavGroup[]
  readonly current: string
  /** Closing the drawer when a page is picked, on narrow viewports. */
  readonly onNavigate?: () => void
}) {
  return (
    <>
      {nav.map((group) => (
        <section key={group.title} className="docs-nav-group">
          <p className="docs-nav-label">{group.title}</p>
          <ul>
            {group.items.map((item, position) => {
              const previous = group.items[position - 1]
              const opensSubgroup = item.subgroup && item.subgroup !== previous?.subgroup

              return (
                <li key={item.route}>
                  {opensSubgroup ? <p className="docs-nav-sublabel">{item.subgroup}</p> : null}
                  <Link
                    to={item.route}
                    className="docs-nav-row"
                    aria-current={item.route === current ? 'page' : undefined}
                    // Hovering or focusing a page fetches it, so the click has
                    // nothing left to wait for. Every navigation here costs one
                    // `.data` round trip and it carries the page: 22 KB for a
                    // guide, 270 KB for the reference.
                    prefetch="intent"
                    onClick={onNavigate}
                  >
                    {item.label}
                    {/* The pipeline's own answer, not a route compared here. */}
                    {item.generated ? <span className="docs-nav-badge">generated</span> : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="docs-nav-foot">
        <Link to="/playground/">Playground</Link>
        <Link to="/changelog/">Changelog</Link>
        <Link to="/contributing/">Contributing</Link>
      </div>
    </>
  )
}
