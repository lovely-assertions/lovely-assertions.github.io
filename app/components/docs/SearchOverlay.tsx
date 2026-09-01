import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { type FlatPage, flatPages } from '../../lib/nav.ts'
import { type SearchResult, search } from '../../lib/pagefind.ts'
import { SearchIcon } from '../icons.tsx'

/**
 * Search, over the whole corpus.
 *
 * Opens on ⌘K, Ctrl+K or `/`, and the `/` shortcut ignores keystrokes typed
 * into a field — otherwise a reader cannot type a slash in the search box they
 * just opened.
 *
 * With an empty query it lists the first few pages, so the panel is useful
 * before anyone types. Results come from the index built over the HTML that
 * actually ships, so it searches headings and body text, not just titles.
 *
 * The shape is APG's combobox with a listbox popup, which is the pattern this
 * has always been imitating without carrying its attributes: focus stays in the
 * input and `aria-activedescendant` names the highlighted row. Without that
 * pair, arrowing through results announced nothing at all — the rows were
 * marked `aria-selected` while focus never moved, so no screen reader had any
 * reason to speak.
 */

const EMPTY_QUERY_ROWS = 6

/** The listbox's id, so the input can point `aria-controls` at it. */
const LISTBOX_ID = 'docs-search-listbox'

const rowId = (index: number) => `docs-search-row-${index}`

/**
 * One line in the panel.
 *
 * Headings within a page are rows too, rather than a nested list: a flat list
 * is what makes the arrow keys reach them, and the row's URL is taken unchanged.
 * `heading` is what marks them so they can be indented.
 */
interface Row {
  readonly url: string
  readonly title: string
  readonly group: string
  readonly excerpt?: string
  readonly heading?: boolean
}

/** The page list, for the empty query and for each result's group label. */
const PAGES: FlatPage[] = flatPages()

function asRows(pages: FlatPage[]): Row[] {
  return pages.slice(0, EMPTY_QUERY_ROWS).map((page) => ({
    url: page.route,
    title: page.label,
    group: page.group,
  }))
}

export function SearchOverlay({
  open,
  onClose,
}: {
  readonly open: boolean
  readonly onClose: () => void
}) {
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // A native <dialog> in modal mode: the browser supplies Escape, the focus
  // trap, the inert background and the backdrop. Reimplementing those on a div
  // is how a search panel ends up unreachable by keyboard.
  useEffect(() => {
    const element = dialog.current
    if (!element) return

    if (open && !element.open) {
      setTerm('')
      setActive(0)
      setRows(asRows(PAGES))
      element.showModal()
      input.current?.focus()
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    if (term.trim().length < 2) {
      setRows(asRows(PAGES))
      setActive(0)
      return
    }

    let current = true
    void search(term, 12).then((found: SearchResult[]) => {
      if (!current) return
      setRows(
        found.flatMap((result) => {
          const group = PAGES.find((page) => page.route === result.url)?.group ?? 'Docs'
          return [
            { url: result.url, title: result.title, group, excerpt: result.excerpt },
            // The section within the page that actually matched. On the
            // reference -- one URL carrying every assertion -- this is the
            // difference between "Every assertion" and the method asked for.
            ...result.subResults
              .filter((sub) => sub.url !== result.url)
              .map((sub) => ({ url: sub.url, title: sub.title, group: '', heading: true })),
          ]
        }),
      )
      setActive(0)
    })
    return () => {
      current = false
    }
  }, [term, open])

  /**
   * Keep the highlighted row on screen.
   *
   * The panel is 380px over as much as 1324px of results, and arrowing down
   * moved the highlight without moving the scroller: measured, fourteen presses
   * put the selected row at 473px inside a 380px box with `scrollTop` still at
   * zero. Focus never leaves the input, so the browser has no reason to do this
   * by itself.
   */
  useEffect(() => {
    list.current?.querySelector(`#${rowId(active)}`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = useCallback(
    (url: string) => {
      onClose()
      void navigate(url)
    },
    [navigate, onClose],
  )

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (rows.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (index + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (index - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      const chosen = rows[active]
      if (chosen) {
        event.preventDefault()
        go(chosen.url)
      }
    }
  }

  const empty = rows.length === 0

  return (
    <dialog
      ref={dialog}
      className="docs-search-overlay"
      aria-label="Search the documentation"
      onClose={onClose}
      onKeyDown={onKeyDown}
      // A click that lands on the dialog itself landed on the backdrop: the
      // panel inside covers everything else.
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
    >
      <div className="docs-search-panel">
        <div className="docs-search-input">
          <SearchIcon size={17} />
          <input
            ref={input}
            type="search"
            value={term}
            placeholder={`Search ${PAGES.length} pages`}
            aria-label="Search the documentation"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!empty}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={empty ? undefined : rowId(active)}
            onChange={(event) => setTerm(event.target.value)}
          />
          <kbd>esc</kbd>
        </div>

        {empty ? (
          <p className="docs-search-empty">
            Nothing matches that. The reference is generated, so try an assertion name.
          </p>
        ) : null}

        {/* Always rendered, so `aria-controls` always points at something real. */}
        <div
          ref={list}
          id={LISTBOX_ID}
          className="docs-search-results"
          role="listbox"
          aria-label="Results"
          hidden={empty}
        >
          {rows.map((row, index) => (
            // A real link, so Cmd-click, middle-click and "open in new tab" all
            // work and the status bar shows where the row goes. `role="option"`
            // only changes what assistive technology is told; the browser still
            // treats it as the anchor it is.
            <Link
              key={row.url}
              to={row.url}
              id={rowId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              data-heading={row.heading || undefined}
              onClick={onClose}
              onPointerEnter={() => setActive(index)}
            >
              <span className="docs-search-group">{row.group}</span>
              <span className="docs-search-title">{row.title}</span>
            </Link>
          ))}
        </div>

        {/* What the query produced, for a reader who cannot see the list change.
            The empty-state sentence above is written specifically for a failed
            search and was the one thing they never received. */}
        <p className="visually-hidden" role="status">
          {empty
            ? 'No results. The reference is generated, so try an assertion name.'
            : `${rows.length} result${rows.length === 1 ? '' : 's'}`}
        </p>

        <div className="docs-search-foot">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span className="docs-search-foot-end">
            {PAGES.length} pages, every example executed in CI
          </span>
        </div>
      </div>
    </dialog>
  )
}

/** Wire up ⌘K / Ctrl+K / `/`, ignoring keystrokes meant for a field. */
export function useSearchShortcut(onOpen: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpen()
        return
      }
      if (event.key === '/' && !typing) {
        event.preventDefault()
        onOpen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}
