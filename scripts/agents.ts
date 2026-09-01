/**
 * Publish the site a second time, for readers that are programs.
 *
 * An agent asked about this library does one of two things: it fetches a page
 * it was given, or it looks for an index and works out which page to fetch.
 * Both are served here.
 *
 * - `<route>.md` and `<route>/index.md` for every page, so appending `.md` to
 *   any URL of this site works whichever way the agent spells it.
 * - `/llms.txt`, the index: what this library is, how the site is laid out, and
 *   a link to the markdown of every page with the sentence that describes it.
 * - `/llms-full.txt`, the whole corpus in one file, for a model with the room
 *   to read it rather than crawl it.
 *
 * Written after the build, like the sitemap and for the same reason:
 * `react-router build` clears `build/client` and would take these with it.
 *
 * Nothing here restates the corpus. The summaries are the descriptions the
 * pages already carry -- the ones `pipeline/build.ts` requires to be whole
 * sentences -- and the ordering is the site's own sidebar. A second, hand-kept
 * list of pages is how an index comes to advertise a page that no longer
 * exists, and it would be invisible from either side alone.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { ROOT, readCorpusFile, readCorpusMeta } from '../pipeline/corpus.ts'
import { type MarkdownContext, markdownPathsFor, pageMarkdown } from '../pipeline/markdown.ts'
import { markdownUrlFor, SITE_ORIGIN } from '../pipeline/origin.ts'
import { licenceOf, pythonFloor, type WheelMeta } from '../pipeline/release.ts'
import type { NavGroup, Page, WorkedExample } from '../pipeline/types.ts'

const BUILD = path.join(ROOT, 'build/client')
const GENERATED = path.join(ROOT, '.generated')

type PageSummary = Omit<Page, 'html' | 'examples'>

/**
 * Pages that answer a question about the project rather than about the library.
 *
 * They are published, and they are last: the llms.txt format gives `Optional`
 * a defined meaning -- skip these first when the context is short -- and a
 * licence is exactly what a reader should drop before dropping a guide.
 */
const OPTIONAL = new Set([
  '/changelog/',
  '/contributing/',
  '/security/',
  '/code-of-conduct/',
  '/license/',
])

/** One `- [name](url): note` line, the only shape llms.txt defines for a list. */
function entry(page: PageSummary): string {
  const note = page.description ? `: ${page.description}` : ''
  return `- [${page.title ?? page.route}](${SITE_ORIGIN}${markdownUrlFor(page.route)})${note}`
}

/** What the preamble is allowed to claim, all of it counted rather than typed. */
interface Corpus {
  readonly version: string
  /** The Python floor, from the wheel this build ships. */
  readonly python: string
  /** The SPDX licence of that same wheel, never typed by hand. */
  readonly licence: string
  readonly pages: number
  /** Examples whose printed output the build compares byte for byte. */
  readonly verified: number
  /** Blocks the built pages actually offer a Run button on. */
  readonly runnable: number
}

/**
 * The header both files share.
 *
 * The two conventions an agent cannot guess are stated here rather than left to
 * be discovered: that every page has a markdown twin, and that the output under
 * each example is measured rather than written. The second one is the reason to
 * trust anything quoted from this site, so it does not belong in a footnote.
 */
function preamble({ version, python, licence, pages, verified, runnable }: Corpus): string {
  return `# lovely-assertions

> Fluent, strictly-typed assertions for Python tests. \`expect(x).\` offers only the assertions valid for the type of \`x\`, chains re-type their subject so pyright and mypy both narrow, and a failure reads as a sentence naming the value, the requirement and what it held. ${licence}, no runtime dependencies, Python ${python}.

Install with \`pip install lovely-assertions\`, or \`uv add --dev lovely-assertions\`.
This documentation describes version ${version}.

Every page of this site is also served as markdown: append \`.md\` to the path of
any URL. \`${SITE_ORIGIN}/docs/guides/strings/\` is also
\`${SITE_ORIGIN}/docs/guides/strings.md\`. The links below are those files.

The output printed under a Python example here is not written by hand. All ${verified}
of them are replayed through the real library on every build and compared byte for
byte, so a failure message quoted from these ${pages} pages is the message the library
actually produces rather than an approximation of it. ${runnable} of the examples can
also be run and edited in place, in the browser, on the page they appear on.
`
}

/**
 * How many blocks across the built site carry a Run button.
 *
 * The unescaped spelling only. Every page also embeds its own markup a second
 * time inside the router's hydration payload, where the quotes are backslashed
 * -- counting `data-run=` would report exactly twice the truth, which is the
 * kind of wrong number that looks plausible enough to ship.
 */
async function runButtons(pages: readonly PageSummary[]): Promise<number> {
  let total = 0
  for (const page of pages) {
    const html = await readFile(path.join(BUILD, page.route, 'index.html'), 'utf8')
    total += html.match(/data-run=""/g)?.length ?? 0
  }
  return total
}

async function main(): Promise<void> {
  const [index, nav, meta] = await Promise.all([
    readFile(path.join(GENERATED, 'pages.json'), 'utf8').then(
      (raw) => JSON.parse(raw) as PageSummary[],
    ),
    readFile(path.join(GENERATED, 'nav.json'), 'utf8').then((raw) => JSON.parse(raw) as NavGroup[]),
    readCorpusMeta(),
  ])

  const byRoute = new Map(index.map((page) => [page.route, page]))
  const context: MarkdownContext = {
    corpus: new Set(meta.corpus),
    source: { repo: meta.source.repo, ref: meta.source.ref },
    updated: meta.source.committedAt.slice(0, 10),
  }

  // Every page, in the order the site itself presents them: the two entry
  // points, then the sidebar, then the project files.
  const ordered: PageSummary[] = []
  const sections: { title: string; pages: PageSummary[] }[] = []

  const overview = ['/', '/docs/']
    .map((route) => byRoute.get(route))
    .filter((page): page is PageSummary => page !== undefined)
  sections.push({ title: 'Overview', pages: overview })
  ordered.push(...overview)

  for (const group of nav) {
    const pages = group.items
      .map((item) => byRoute.get(item.route))
      .filter((page): page is PageSummary => page !== undefined)
    sections.push({ title: group.title, pages })
    ordered.push(...pages)
  }

  const optional = index.filter((page) => OPTIONAL.has(page.route))
  sections.push({ title: 'Optional', pages: optional })
  ordered.push(...optional)

  // A page the sidebar does not reach would silently never be published as
  // markdown, which is the same failure the sitemap gate exists to catch.
  const listed = new Set(ordered.map((page) => page.route))
  const missed = index.filter((page) => !listed.has(page.route))
  if (missed.length > 0) {
    console.error(
      `\n  these pages would have no markdown and no entry in llms.txt:\n  - ${missed
        .map((page) => page.route)
        .join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  // The markdown for each page, written to both spellings of its address.
  const markdown = new Map<string, string>()
  let bytes = 0
  let files = 0

  for (const page of ordered) {
    const text = await readCorpusFile(page.repoPath)
    const served = await pageMarkdown(page, text, context)
    markdown.set(page.route, served)
    bytes += served.length

    for (const file of markdownPathsFor(page.route)) {
      files += 1
      const target = path.join(BUILD, file)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, served, 'utf8')
    }
  }

  const examples = JSON.parse(
    await readFile(path.join(GENERATED, 'examples.json'), 'utf8'),
  ) as WorkedExample[]

  const wheel = JSON.parse(
    await readFile(path.join(ROOT, 'public/playground/wheel.json'), 'utf8'),
  ) as WheelMeta

  const head = preamble({
    version: meta.source.ref.replace(/^v/, ''),
    python: pythonFloor(wheel.requiresPython),
    licence: licenceOf(wheel.licence).id,
    pages: ordered.length,
    // Not `examples.length`: a block with no quoted output is executed to build
    // the namespace the next one needs, and comparing nothing is not a check.
    verified: examples.filter((example) => example.output !== null).length,
    // Counted in the HTML that shipped, not in the corpus. The claim is about
    // what a reader can press, and only the built pages know that -- the corpus
    // count is larger, because a page can carry an example it does not offer.
    runnable: await runButtons(ordered),
  })

  const llms = `${head}
${sections
  .filter((section) => section.pages.length > 0)
  .map((section) => `## ${section.title}\n${section.pages.map((page) => entry(page)).join('\n')}`)
  .join('\n\n')}
`
  await writeFile(path.join(BUILD, 'llms.txt'), llms, 'utf8')

  // The same pages, inlined. The rule and the URL between them are what let a
  // model cite one page out of the pile rather than the pile.
  const full = `${head}
${ordered
  .map((page) => `---\n\nSource: ${SITE_ORIGIN}${page.route}\n\n${markdown.get(page.route) ?? ''}`)
  .join('\n')}`
  await writeFile(path.join(BUILD, 'llms-full.txt'), full, 'utf8')

  console.log(
    `\n  markdown: ${ordered.length} pages, ${files} files, ${Math.round(bytes / 1024)} KB` +
      `\n  llms.txt: ${sections.filter((s) => s.pages.length > 0).length} sections, ${ordered.length} links` +
      `\n  llms-full.txt: ${Math.round(full.length / 1024)} KB\n`,
  )
}

await main()
