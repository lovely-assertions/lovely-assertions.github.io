import { Link } from 'react-router'
import { docRowEnter, docRowLeave } from '../../lib/motion.ts'
import { flatPages } from '../../lib/nav.ts'

/**
 * The getting-started pages, in the order the documentation itself puts them in.
 *
 * Read from the generated navigation rather than restated here. `pipeline/nav.ts`
 * builds that list from the corpus and says the rule this file used to break --
 * "change it upstream and the sidebar changes, with no second list in this repo
 * to keep in step". A hand-copied route survives an upstream rename, and the
 * home page then offers a 404 as its first invitation to read the docs.
 *
 * What stays here is the decoration, because it is not knowledge about the
 * documentation: the numeral is the position, and the tones are a palette. They
 * cycle, so a fifth page gets a row rather than being dropped on the floor.
 */

const TONES = ['pink', 'lilac', 'butter', 'mint'] as const

/**
 * The count, in words, for the heading.
 *
 * The heading said "Four pages" while the rows below it were being read from the
 * corpus -- so a fifth getting-started page would have appeared in the list and
 * been denied by the sentence above it. Digits fall back in at seven, which this
 * section will never reach and which is still better than a wrong word.
 */
const NUMBER_WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'] as const

function inWords(count: number): string {
  return NUMBER_WORDS[count] ?? String(count)
}

function rows() {
  return flatPages()
    .filter((page) => page.route.startsWith('/docs/getting-started/'))
    .map((page, index) => ({
      n: String(index + 1).padStart(2, '0'),
      label: page.label,
      tone: TONES[index % TONES.length],
      to: page.route,
    }))
}

export function DocsIndex() {
  const pages = rows()

  return (
    <section className="section docs-index" id="docs">
      <div className="docs-index-copy">
        <h2 className="section-title is-panel">
          {inWords(pages.length)} pages, in order, and you are fluent.
        </h2>
        <p className="panel-prose">
          Then the guides, by type and by task, and a reference generated from the source.
        </p>
      </div>

      <ul className="docs-rows">
        {pages.map((row) => (
          <li key={row.to}>
            <Link
              to={row.to}
              className="docs-row"
              prefetch="intent"
              data-tone={row.tone}
              onPointerEnter={(event) => docRowEnter(event.currentTarget)}
              onPointerLeave={(event) => docRowLeave(event.currentTarget)}
              onFocus={(event) => docRowEnter(event.currentTarget)}
              onBlur={(event) => docRowLeave(event.currentTarget)}
            >
              <span className="docs-row-n" data-row-number="">
                {row.n}
              </span>
              <span className="docs-row-label">{row.label}</span>
              <span className="docs-row-arrow" data-row-arrow="" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
