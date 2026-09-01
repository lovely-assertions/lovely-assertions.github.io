/**
 * Build the search index from the HTML that actually ships.
 *
 * Indexing the built output rather than the markdown is the whole point: the
 * index and the page cannot disagree, because they are the same bytes. An index
 * derived separately from the source drifts the first time the renderer changes
 * what it emits, and nothing catches it.
 *
 * The index is sharded, so a reader downloads only the fragments matching what
 * they typed -- and nothing at all until they open search.
 */

import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import * as pagefind from 'pagefind'

const BUILD = path.resolve(import.meta.dirname, '../build/client')

/**
 * Pagefind's own search UI, which this site does not use.
 *
 * `pagefind.js` is the only entry point the site loads, and it pulls
 * `pagefind-worker.js`, the wasm and the sharded index itself -- so those stay.
 * Everything here is a self-contained widget nothing on the site references.
 */
const UNUSED = [
  'pagefind-ui.js',
  'pagefind-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-modular-ui.css',
  'pagefind-component-ui.js',
  'pagefind-component-ui.css',
  'pagefind-highlight.js',
] as const

async function main(): Promise<void> {
  const { index, errors } = await pagefind.createIndex({
    // Identifiers are the thing people search for here -- `contains_no_duplicates`,
    // `expect_raises` -- so the tokeniser must not treat an underscore as a word
    // boundary that hides the whole term.
    forceLanguage: 'en',
  })

  if (errors.length > 0 || !index) {
    console.error(`\n  pagefind could not start:\n  - ${errors.join('\n  - ')}\n`)
    process.exit(1)
  }

  const added = await index.addDirectory({ path: BUILD })
  if (added.errors.length > 0) {
    console.error(`\n  pagefind could not index the build:\n  - ${added.errors.join('\n  - ')}\n`)
    process.exit(1)
  }

  const written = await index.writeFiles({ outputPath: path.join(BUILD, 'pagefind') })
  if (written.errors.length > 0) {
    console.error(`\n  pagefind could not write its index:\n  - ${written.errors.join('\n  - ')}\n`)
    process.exit(1)
  }

  await pagefind.close()

  // A site whose pages all failed to match `data-pagefind-body` indexes nothing
  // and fails silently, so an empty index is a build failure rather than a
  // search box that never finds anything.
  if (added.page_count === 0) {
    console.error('\n  pagefind indexed 0 pages. Is data-pagefind-body still on the article?\n')
    process.exit(1)
  }

  // Pagefind ships its own drop-in search UI alongside the index. This site
  // has its own overlay and loads exactly one file, `pagefind.js`, so those
  // bundles are deployed and never requested. Removing them is not a
  // micro-optimisation: they are four times the size of the index they sit
  // beside.
  let pruned = 0
  for (const file of UNUSED) {
    const full = path.join(BUILD, 'pagefind', file)
    try {
      pruned += (await stat(full)).size
      await rm(full)
    } catch {
      // A future Pagefind may stop shipping one of these. Not finding a file
      // we were going to delete is not a problem.
    }
  }

  console.log(
    `\n  search index: ${added.page_count} pages, ` +
      `${Math.round(pruned / 1024)} KB of unused UI bundles removed\n`,
  )
}

await main()
