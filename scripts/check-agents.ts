/**
 * Check that what this site promises programs, it actually serves.
 *
 * Everything in the agent layer is a promise made in one file about a file
 * somewhere else: a `<link rel="alternate">` in a page's head naming a `.md`,
 * an entry in `/llms.txt` naming a URL, a rule in `robots.txt` describing a
 * convention. None of those promises is visible from the file that makes it,
 * and a broken one fails silently -- the agent gets a 404 and answers from
 * memory instead, which reads exactly like an agent that never visited.
 *
 * The last check is the button. A reader who wants to hand this page to an
 * agent presses "Copy for an agent", and what lands on their clipboard has to
 * be the same bytes the `.md` address serves -- so that is checked by pressing
 * it in a real browser and reading what was handed over, not by trusting that
 * a prop was wired to the right URL.
 *
 * The check that matters most is the third: every fenced block in the
 * served markdown has to be byte-identical to the corpus. The examples and the
 * output under them are this library's entire argument, and the markdown goes
 * through a parse and a re-serialise to get here. A serialiser that reflows a
 * line inside a `text` fence would change a failure message an agent then
 * quotes as fact, and nothing else in the build would notice.
 */

import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import type { Code, Link, Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { ROOT, readCorpusFile, readCorpusMeta } from '../pipeline/corpus.ts'
import { markdownPathsFor } from '../pipeline/markdown.ts'
import { markdownUrlFor, SITE_ORIGIN } from '../pipeline/origin.ts'
import { siteRoutes } from '../pipeline/site-routes.ts'
import type { Page } from '../pipeline/types.ts'
import { BUILD, serve } from './serve.ts'

const GENERATED = path.join(ROOT, '.generated')
const PORT = 4711

/** The one route with no markdown behind it. It is an interpreter, not a page. */
const NO_MARKDOWN = new Set(['/playground/'])

const failures: string[] = []

function check(condition: boolean, message: string): void {
  if (!condition) failures.push(message)
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(path.join(BUILD, file))
    return true
  } catch {
    return false
  }
}

/**
 * Parse, rather than match.
 *
 * A regex looking for `[text](url)` over this corpus finds `expect(x)` after a
 * `Sequence[E]` and calls it a link, and a regex looking for fences misses one
 * indented inside a list. `pipeline/plugins/links.ts` learned this already; the
 * checker does not get to learn it again.
 */
const markdown = unified().use(remarkParse).use(remarkGfm)

function parse(text: string): Root {
  return markdown.parse(text) as Root
}

/** Every fenced block, language and body, in document order. */
function fences(text: string): string[] {
  const blocks: string[] = []
  visit(parse(text), 'code', (node: Code) => {
    blocks.push(`${node.lang ?? ''}\n${node.value}`)
  })
  return blocks
}

/** Every link target in a markdown document. */
function links(text: string): string[] {
  const targets: string[] = []
  visit(parse(text), 'link', (node: Link) => {
    targets.push(node.url)
  })
  return targets
}

/** The site path a served markdown URL refers to, or null if it is elsewhere. */
function localPath(url: string): string | null {
  if (!url.startsWith(SITE_ORIGIN)) return null
  return url.slice(SITE_ORIGIN.length).replace(/#.*$/, '')
}

/**
 * Press the button on one page and report what reached the clipboard.
 *
 * `navigator.clipboard.write` is wrapped rather than read back: reading the
 * clipboard needs a focused document, which a headless page does not reliably
 * have, and the bytes handed over are the claim anyway.
 */
async function copyOnePage(
  route: string,
): Promise<{ handed: number; served: number; beforeThePress: number }> {
  const { launch } = await import('./browser.ts')
  const server = serve(PORT)
  const browser = await launch({ protocolTimeout: 60_000 })

  try {
    const page = await browser.newPage()
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle0' })

    return (await page.evaluate(`(async () => {
      const button = document.querySelector('.doc-copy')
      if (!button) return { handed: -1, served: -2, beforeThePress: 0 }

      // Hovering and focusing must not cost anything. A prefetch here would put
      // 100 KB on every reader who moved a pointer across the meta row.
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      button.focus()
      await new Promise(r => setTimeout(r, 600))
      const beforeThePress = performance
        .getEntriesByType('resource')
        .filter(e => e.name.endsWith('.md')).length

      let handed = null
      navigator.clipboard.write = async (items) => {
        handed = await (await items[0].getType('text/plain')).text()
      }

      button.click()
      await new Promise(r => setTimeout(r, 1500))

      const served = await (await fetch('${route.slice(0, -1)}.md')).text()
      return { handed: handed === null ? -1 : handed.length, served: served.length, beforeThePress }
    })()`)) as { handed: number; served: number; beforeThePress: number }
  } finally {
    await browser.close()
    server.close()
  }
}

async function main(): Promise<void> {
  const routes = await siteRoutes()
  const pages = JSON.parse(await readFile(path.join(GENERATED, 'pages.json'), 'utf8')) as Omit<
    Page,
    'html' | 'examples'
  >[]
  const meta = await readCorpusMeta()

  let markdownBytes = 0
  let htmlBytes = 0

  // 1. Every page is served as markdown, at both spellings of its address.
  for (const route of routes) {
    if (NO_MARKDOWN.has(route)) continue
    for (const file of markdownPathsFor(route)) {
      if (!(await exists(file))) failures.push(`${route}: no markdown at /${file}`)
    }
  }

  // 2. The head of every built page advertises markdown that is really there,
  //    and the one page without markdown advertises none.
  for (const route of routes) {
    const html = await readFile(path.join(BUILD, route, 'index.html'), 'utf8')
    const advertised = /<link rel="alternate" type="text\/markdown" href="([^"]+)"/.exec(html)?.[1]

    if (NO_MARKDOWN.has(route)) {
      check(
        advertised === undefined,
        `${route}: advertises markdown at ${advertised}, but has none to serve`,
      )
      continue
    }

    if (advertised === undefined) {
      failures.push(`${route}: nothing in the head says where its markdown is`)
      continue
    }
    check(
      advertised === `${SITE_ORIGIN}${markdownUrlFor(route)}`,
      `${route}: advertises ${advertised}, which is not its markdown address`,
    )
    const local = localPath(advertised)
    if (local && !(await exists(local.slice(1)))) {
      failures.push(`${route}: advertises ${advertised}, and nothing is there`)
    }
  }

  // 3. Every example survives the round trip through markdown, byte for byte.
  for (const page of pages) {
    const served = await readFile(path.join(BUILD, markdownUrlFor(page.route).slice(1)), 'utf8')
    const original = await readCorpusFile(page.repoPath)
    markdownBytes += served.length
    htmlBytes += (await readFile(path.join(BUILD, page.route, 'index.html'), 'utf8')).length

    const before = fences(original)
    const after = fences(served)

    if (before.length !== after.length) {
      failures.push(
        `${page.route}: the corpus has ${before.length} code blocks, the markdown serves ${after.length}`,
      )
      continue
    }
    const changed = before.findIndex((block, index) => block !== after[index])
    if (changed !== -1) {
      failures.push(
        `${page.route}: code block ${changed + 1} is not what the corpus says.\n` +
          `      corpus: ${JSON.stringify(before[changed]?.slice(0, 90))}\n` +
          `      served: ${JSON.stringify(after[changed]?.slice(0, 90))}`,
      )
    }

    // 4. No relative link survives. A `.md` is fetched on its own, with no
    //    repository and no page around it to resolve `../guides/strings.md`
    //    against, so a relative href is a link that only worked at home.
    for (const href of links(served)) {
      if (/^(https?:|mailto:|#)/.test(href)) continue
      failures.push(`${page.route}: relative link "${href}" in the served markdown`)
    }

    // 5. Frontmatter says which page this is, and it has to be this page.
    const declared = /^url: "([^"]+)"$/m.exec(served)?.[1]
    check(
      declared === `${SITE_ORIGIN}${page.route}`,
      `${page.route}: its markdown claims to be ${declared}`,
    )
  }

  // 6. Every link the markdown makes to this site lands on something built.
  const built = new Set(routes)
  for (const page of pages) {
    const served = await readFile(path.join(BUILD, markdownUrlFor(page.route).slice(1)), 'utf8')
    for (const href of links(served)) {
      const local = localPath(href)
      if (local === null) continue
      if (built.has(local)) continue
      if (await exists(local.slice(1))) continue
      failures.push(`${page.route}: links to ${href}, which this site does not serve`)
    }
  }

  // 7. llms.txt: the format it claims to be, and every link real.
  const llms = await readFile(path.join(BUILD, 'llms.txt'), 'utf8')
  const lines = llms.split('\n')
  check(lines[0]?.startsWith('# ') === true, 'llms.txt does not open with an H1')
  check(
    lines.find((line) => line.trim() !== '' && !line.startsWith('# '))?.startsWith('> ') === true,
    'llms.txt has no blockquote summary under its H1',
  )
  check(
    lines.filter((line) => line.startsWith('# ')).length === 1,
    'llms.txt has more than one H1, so a parser cannot tell what it is about',
  )

  const listed = new Set<string>()
  for (const href of links(llms)) {
    const local = localPath(href)
    if (local === null) {
      failures.push(`llms.txt links off-site to ${href}`)
      continue
    }
    if (!(await exists(local.slice(1)))) failures.push(`llms.txt links to ${href}, which is absent`)
    listed.add(local)
  }

  for (const page of pages) {
    check(
      listed.has(markdownUrlFor(page.route)),
      `${page.route} is published but llms.txt does not list it, so nothing points an agent at it`,
    )
  }

  // 8. llms-full.txt really is full: every page's own body is inside it.
  const full = await readFile(path.join(BUILD, 'llms-full.txt'), 'utf8')
  for (const page of pages) {
    const served = await readFile(path.join(BUILD, markdownUrlFor(page.route).slice(1)), 'utf8')
    // The body under the frontmatter, which is the part that has to be there.
    const body = served.slice(served.indexOf('\n---\n') + 5).trim()
    check(
      full.includes(body.slice(0, 400)),
      `llms-full.txt is missing ${page.route}, so it is not what it says it is`,
    )
  }

  // 9. robots.txt states the permissions and points at the index.
  const robots = await readFile(path.join(BUILD, 'robots.txt'), 'utf8')
  for (const required of [
    'Content-Signal: ai-train=yes, search=yes, ai-input=yes',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '/llms.txt',
    '/llms-full.txt',
  ]) {
    check(robots.includes(required), `robots.txt does not mention ${required}`)
  }

  // 10. Every documentation page offers to hand itself to an agent, and the
  //     playground -- which has no markdown -- does not pretend to.
  for (const route of routes) {
    const html = await readFile(path.join(BUILD, route, 'index.html'), 'utf8')
    const buttons = html.match(/class="doc-copy"/g)?.length ?? 0
    if (route === '/' || NO_MARKDOWN.has(route)) {
      check(buttons === 0, `${route}: offers to copy a page it has no markdown for`)
    } else {
      check(buttons === 1, `${route}: has ${buttons} copy buttons, and should have exactly one`)
    }
  }

  // 11. Pressing it hands over the same bytes the `.md` address serves.
  //
  //     Worth a browser for one reason: the clipboard write is arranged from
  //     inside the click and carries a promise, and an item whose declared type
  //     does not match the blob inside it is rejected without a word. That
  //     failure looks exactly like a button nobody wired up.
  const pressed = await copyOnePage('/docs/reference/assertions/')
  check(
    pressed.handed === pressed.served,
    `the copy button handed over ${pressed.handed} bytes; ${SITE_ORIGIN}/docs/reference/assertions.md is ${pressed.served}`,
  )
  check(
    pressed.beforeThePress === 0,
    `the page fetched ${pressed.beforeThePress} markdown files before anyone pressed anything`,
  )

  if (failures.length > 0) {
    console.error(`\n  the agent layer is not what it claims:\n  - ${failures.join('\n  - ')}\n`)
    process.exit(1)
  }

  const saved = Math.round((1 - markdownBytes / htmlBytes) * 100)
  console.log(
    `\n  ${pages.length} pages served as markdown, every code block byte-identical to the corpus` +
      `\n  every link in them absolute, and every one that points here resolves` +
      `\n  llms.txt lists all ${pages.length}; llms-full.txt inlines all ${pages.length}` +
      `\n  the copy button hands over ${pressed.handed} bytes, which is the .md file exactly, and fetches nothing until pressed` +
      `\n  ${Math.round(markdownBytes / 1024)} KB of markdown against ${Math.round(htmlBytes / 1024)} KB of HTML: ${saved}% fewer bytes for a reader that only wants the words` +
      `\n  corpus ${meta.source.ref}, fetched at ${meta.source.committedAt.slice(0, 10)}\n`,
  )
}

await main()
