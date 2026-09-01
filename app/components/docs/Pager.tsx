import { Link } from 'react-router'
import type { Neighbours } from '../../lib/nav.ts'

/**
 * Previous and next, in the documentation's own reading order.
 *
 * A missing neighbour keeps its cell and hides it, so the next link stays on
 * the right rather than sliding across when there is nothing before it.
 */
export function Pager({ previous, next }: Neighbours) {
  if (!previous && !next) return null

  return (
    <nav className="docs-pager" aria-label="Pagination">
      {/* `prefetch="intent"` throughout the site's navigation: with
          `ssr: false` + prerender every client navigation costs exactly one
          `.data` round trip, and that file carries the page. Fetching it on
          hover or focus leaves the click with nothing to wait for. The
          `<link rel="prefetch">` React Router inserts after the anchor is a
          metadata element, so it is `display: none` and never becomes a grid
          or flex item. */}
      {previous ? (
        <Link to={previous.route} className="docs-pager-cell" prefetch="intent">
          <span className="docs-pager-eyebrow">← previous</span>
          <span className="docs-pager-title">{previous.label}</span>
        </Link>
      ) : (
        <span className="docs-pager-cell" aria-hidden="true" data-empty="true" />
      )}

      {next ? (
        <Link to={next.route} className="docs-pager-cell" data-align="end" prefetch="intent">
          <span className="docs-pager-eyebrow">next →</span>
          <span className="docs-pager-title">{next.label}</span>
        </Link>
      ) : (
        <span className="docs-pager-cell" aria-hidden="true" data-empty="true" />
      )}
    </nav>
  )
}
