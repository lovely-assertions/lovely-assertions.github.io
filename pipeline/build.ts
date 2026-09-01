/**
 * Render the whole corpus into .generated/, which is what the site's routes read.
 *
 * A plain program with no framework import, so it runs in CI without booting a
 * build tool and so a failure here reads as a content problem rather than a
 * bundler problem.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  corpusFiles,
  GENERATED_DIR,
  readCorpusFile,
  readCorpusMeta,
  readSourceConfig,
} from './corpus.ts'
import { buildNav } from './nav.ts'
import { renderPage } from './render.ts'
import { routeFor, UnmappedSource } from './routes.ts'
import type { Page, RenderedPage } from './types.ts'

/**
 * The license is not markdown and must never enter the markdown pipeline.
 *
 * The description names the licence by reading the first line of the very text
 * it is describing. It used to say "the MIT License" from a string typed here,
 * which went on being served after the library relicensed -- beside the page
 * rendering the new licence in full.
 */
function verbatimPage(text: string): RenderedPage {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const opening =
    text
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? 'licence'
  return {
    html: `<pre class="verbatim">${escaped}</pre>`,
    title: 'License',
    lead: null,
    description: `The full text of the ${opening}, the licence lovely-assertions is distributed under.`,
    footer: null,
    headings: [],
    examples: [],
    verifiedExamples: 0,
    docsTestDirectives: 0,
    internalLinks: [],
    sourceLinks: [],
  }
}

/** A route becomes a flat filename, so the site reads one file per page. */
function pageFileName(route: string): string {
  if (route === '/') return 'index'
  return route.replace(/^\/|\/$/g, '').replace(/\//g, '__')
}

async function main(): Promise<void> {
  const [config, meta, files] = await Promise.all([
    readSourceConfig(),
    readCorpusMeta(),
    corpusFiles(),
  ])

  const corpus = new Set(files)
  const source = { repo: meta.source.repo, ref: meta.source.ref }

  const pages: Page[] = []
  const problems: string[] = []

  for (const repoPath of files) {
    let mapped: ReturnType<typeof routeFor>
    try {
      mapped = routeFor(repoPath)
    } catch (error) {
      problems.push(error instanceof UnmappedSource ? error.message : String(error))
      continue
    }
    if (mapped === null) continue

    const text = await readCorpusFile(repoPath)
    try {
      const rendered =
        mapped.mode === 'verbatim'
          ? verbatimPage(text)
          : await renderPage(text, { repoPath, corpus, source })
      pages.push({ ...mapped, ...rendered })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      problems.push(`${repoPath}: ${reason}`)
    }
  }

  const examples = pages.reduce((total, page) => total + page.verifiedExamples, 0)

  // The signature pairs are the site's headline claim: an example beside the
  // output it really produced. Losing them silently -- an upstream edit that
  // puts prose between a fence and its output -- would quietly downgrade every
  // page, so the count is pinned and a change has to be deliberate.
  if (examples !== config.expect.signaturePairs) {
    problems.push(
      `expected ${config.expect.signaturePairs} verified examples, found ${examples}.\n` +
        '  If the docs legitimately changed, update `expect.signaturePairs` in docs.source.json.',
    )
  }

  if (problems.length > 0) {
    console.error(`\n  the corpus did not render:\n\n  - ${problems.join('\n\n  - ')}\n`)
    process.exit(1)
  }

  await fs.rm(GENERATED_DIR, { recursive: true, force: true })
  await fs.mkdir(path.join(GENERATED_DIR, 'pages'), { recursive: true })

  await Promise.all(
    pages.map((page) =>
      fs.writeFile(
        path.join(GENERATED_DIR, 'pages', `${pageFileName(page.route)}.json`),
        JSON.stringify(page),
      ),
    ),
  )

  // Every worked example, for the playground's parity gate.
  const worked = pages.flatMap((page) => page.examples)
  await fs.writeFile(path.join(GENERATED_DIR, 'examples.json'), JSON.stringify(worked, null, 2))

  // The index carries everything except the bodies and the example corpus, so
  // nav, search and the route list never load megabytes to answer a question
  // about structure.
  const index = pages.map(({ html: _html, examples: _examples, ...rest }) => rest)
  await fs.writeFile(path.join(GENERATED_DIR, 'pages.json'), JSON.stringify(index, null, 2))

  // The sidebar is the docs index, not the directory tree.
  const nav = buildNav(await readCorpusFile('docs/README.md'))
  await fs.writeFile(path.join(GENERATED_DIR, 'nav.json'), JSON.stringify(nav, null, 2))

  const linked = new Set(nav.flatMap((group) => group.items.map((item) => item.route)))
  const orphans = pages
    .filter((page) => page.section !== 'root' && page.route !== '/docs/' && !linked.has(page.route))
    .map((page) => page.repoPath)
  if (orphans.length > 0) {
    console.error(
      `\n  these pages are not linked from docs/README.md, so nothing on the site reaches them:\n  - ${orphans.join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  // A description is the one line of this site a search result shows. The
  // corpus supplies most of them from an opening paragraph, and when that
  // paragraph is a colon introducing a table the result is a fragment -- so
  // the shape is asserted rather than hoped for. A new page that trips this
  // needs an entry in DESCRIPTIONS, which is the fix, not the obstacle.
  const weak = pages
    .filter((page) => {
      const text = page.description?.trim() ?? ''
      return text.length < 50 || text.length > 160 || !/[.!?\u2026]$/.test(text)
    })
    .map((page) => `${page.repoPath}: ${page.description ?? '(none)'}`)

  if (weak.length > 0) {
    console.error(
      `\n  these descriptions are not a sentence between 50 and 160 characters, ` +
        `so they would read as fragments in a search result:\n  - ${weak.join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  const directives = pages.reduce((total, page) => total + page.docsTestDirectives, 0)
  console.log(
    `  ${pages.length} pages, ${examples} verified examples, ${directives} docs-test directives\n`,
  )
}

await main()
