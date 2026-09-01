import { useEffect, useState } from 'react'
import type { Heading } from '../../../pipeline/types.ts'
import { scrollToAnchor, scrollToTop } from '../../lib/motion.ts'

/**
 * The on-page contents.
 *
 * The active row follows the scroll position — the last heading above the fold
 * line — rather than the last thing clicked, so it still says where the reader
 * is after they scroll away from where they jumped to.
 */

/** How far down the viewport counts as "the section you are reading". */
const FOLD = 140

export function DocsToc({ headings }: { readonly headings: readonly Heading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null)

  useEffect(() => {
    if (headings.length === 0) return

    function onScroll() {
      const line = window.scrollY + FOLD
      let current: string | null = null

      for (const heading of headings) {
        const element = document.getElementById(heading.id)
        if (!element) continue
        if (element.getBoundingClientRect().top + window.scrollY <= line) current = heading.id
        else break
      }

      setActive(current ?? headings[0]?.id ?? null)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [headings])

  if (headings.length < 2) return null

  return (
    <nav className="docs-toc docs-rail" aria-label="On this page" data-pagefind-ignore>
      <p className="docs-toc-label">On this page</p>
      <ul className="docs-toc-list">
        {headings.map((heading) => (
          <li key={heading.id} data-depth={heading.depth}>
            <a
              href={`#${heading.id}`}
              aria-current={heading.id === active ? 'true' : undefined}
              onClick={(event) => {
                const target = document.getElementById(heading.id)
                if (!target) return
                event.preventDefault()
                scrollToAnchor(target)
                // `history.state`, not `null`: React Router keeps
                // `{ usr, key, idx }` in there and derives `location.key` from
                // it. Passing null wiped all three, so every anchored entry
                // collapsed into the shared "default" scroll-restoration bucket
                // and the next push wrote `idx: 1` whatever the real depth was.
                history.replaceState(history.state, '', `#${heading.id}`)
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>

      <button type="button" className="docs-toc-top" onClick={scrollToTop}>
        ↑ Back to top
      </button>
    </nav>
  )
}
