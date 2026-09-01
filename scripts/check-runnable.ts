/**
 * Check that what the site offers to run is exactly what CI has verified.
 *
 * A Run button is a claim: press this and you will see what the page says. Two
 * ways that claim can quietly become false, and this gate exists for both.
 *
 * A button can appear on a block that must not have one. Twenty blocks in the
 * reference are one-line `class Foo:` headings, which raise `IndentationError`;
 * four more are marked `expect-error`, and their lesson is that a *type
 * checker* rejects them -- Pyodide runs them without complaint, so a clean
 * result beside one teaches the opposite of the passage it sits in. Neither is
 * a limitation of the interpreter, which is why neither is visible from the
 * result alone.
 *
 * And a button can point at the wrong code. The index on each block is the
 * position of that block in the page's `examples[]`, stamped in the same pass
 * that builds the list; if the two ever drift, a Run executes a neighbour. So
 * the numbers are read back out of the shipped HTML and compared against the
 * corpus, rather than trusted because they were written correctly once.
 *
 * The second half opens a real browser and drives the editing loop, without
 * Python: an editor over every runnable block, aligned to the pixel, an edit
 * that withdraws the verified claim and marks the blocks below it stale, and a
 * Reset that restores the build's own bytes. What the loop *computes* is
 * already pinned by `gate:parity`, which makes the identical `run_page` call --
 * so this pins the wiring, and that pins the meaning.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { GENERATED_DIR } from '../pipeline/corpus.ts'
import type { Page, WorkedExample } from '../pipeline/types.ts'
import { BUILD, serve } from './serve.ts'

/** A block's container carries its index; the bar inside it carries the button. */
const BLOCK = /<(?:figure|div)\b[^>]*\bdata-example="(\d+)"[^>]*>/g

/** Not `data-runnable`, which is a different attribute on the same elements. */
const RUN = /data-run(?![a-z])/

async function main(): Promise<void> {
  const [pagesRaw, examplesRaw] = await Promise.all([
    readFile(path.join(GENERATED_DIR, 'pages.json'), 'utf8'),
    readFile(path.join(GENERATED_DIR, 'examples.json'), 'utf8'),
  ])

  const pages = JSON.parse(pagesRaw) as Omit<Page, 'html'>[]
  const examples = JSON.parse(examplesRaw) as WorkedExample[]

  const byPath = new Map<string, WorkedExample[]>()
  for (const example of examples) {
    const list = byPath.get(example.repoPath) ?? []
    list.push(example)
    byPath.set(example.repoPath, list)
  }

  const problems: string[] = []
  let offered = 0

  for (const page of pages) {
    // A page rendered in another mode never ships its blocks as a doc body, so
    // its buttons reach no reader and prove nothing.
    if (page.mode !== 'rendered') continue

    const html = await readFile(path.join(BUILD, page.route, 'index.html'), 'utf8')
    const corpus = byPath.get(page.repoPath) ?? []

    // Each block, in document order, with whether its bar carries a Run.
    // Positions first, then the slice between one container and the next: a
    // search for the next marker has to start after this tag, or it finds this
    // tag's own attribute and reports a 24-character block.
    const marks = [...html.matchAll(BLOCK)]
    const seen = marks.map((match, position) => {
      const from = match.index
      const to = marks[position + 1]?.index ?? html.length
      return { index: Number(match[1]), runnable: RUN.test(html.slice(from, to)) }
    })

    for (const { index, runnable } of seen) {
      const example = corpus[index]
      if (!example) {
        problems.push(
          `${page.route}: a block is indexed ${index}, which is past the end of its page`,
        )
        continue
      }
      if (runnable && !example.runnable) {
        problems.push(
          `${page.route}: block ${index} offers to run, but the corpus marks it not runnable`,
        )
      }
      if (!runnable && example.runnable) {
        problems.push(`${page.route}: block ${index} is runnable and offers no way to run it`)
      }
      if (runnable) offered += 1
    }

    // Indices are positions in the page's own list, so they must be exactly
    // 0..n-1 with nothing missing and nothing repeated.
    const indices = seen.map((block) => block.index)
    const expected = corpus.map((_, position) => position)
    if (indices.join(',') !== expected.join(',')) {
      problems.push(
        `${page.route}: the blocks in the HTML are indexed [${indices.join(', ')}] ` +
          `but the page has ${corpus.length} examples`,
      )
    }
  }

  if (problems.length > 0) {
    console.error(`\n  the Run buttons do not match the corpus:\n  - ${problems.join('\n  - ')}\n`)
    process.exit(1)
  }

  // The site paints one outcome red -- the reader's own code raising -- and it
  // can only stay honest while no documented output looks like one.
  const RAISED =
    /^Traceback \(most recent call last\)|^(?:[A-Za-z_][\w.]*\.)?[A-Za-z_]\w*(?:Error|Exception|Exit|Interrupt|Warning):/m
  const looksRaised = examples
    .filter((example) => example.output !== null && RAISED.test(example.output))
    .map((example) => example.repoPath)
  if (looksRaised.length > 0) {
    console.error(
      `\n  these documented outputs read as a raised exception, which the site ` +
        `paints red:\n  - ${[...new Set(looksRaised)].join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  const runnable = examples.filter((example) => example.runnable).length
  const withheld = examples.length - runnable
  console.log(
    `\n  ${offered} blocks offer to run, and every one is a block the parity gate verifies` +
      `\n  ${withheld} withheld: a signature or a type-checker lesson the interpreter cannot teach`,
  )

  await checkEditing()
}

/** The widths the design is verified at, plus the narrowest phone. */
const WIDTHS = [375, 768, 1280] as const

const PORT = 4327

async function checkEditing(): Promise<void> {
  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    console.log('  puppeteer is not installed; skipping the editing check.\n')
    return
  }

  const server = serve(PORT)
  const browser = await puppeteer.launch()
  const failures: string[] = []

  try {
    const page = await browser.newPage()

    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 900 })
      await page.goto(`http://localhost:${PORT}/docs/reference/assertions/`, {
        waitUntil: 'networkidle0',
      })

      const geometry = (await page.evaluate(`(() => {
        let attached = 0
        let worst = 0
        let metrics = true
        for (const block of document.querySelectorAll('[data-example]')) {
          const pre = block.querySelector('pre')
          if (!pre || !block.querySelector('[data-run]')) continue
          pre.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
          const editor = block.querySelector('.code-editor')
          if (!editor) continue
          attached += 1
          const a = pre.getBoundingClientRect()
          const b = editor.getBoundingClientRect()
          worst = Math.max(worst, Math.abs(a.x - b.x), Math.abs(a.y - b.y),
                                  Math.abs(a.width - b.width), Math.abs(a.height - b.height))
          const p = getComputedStyle(pre), e = getComputedStyle(editor)
          if (p.fontFamily !== e.fontFamily || p.fontSize !== e.fontSize ||
              p.lineHeight !== e.lineHeight || p.whiteSpace !== e.whiteSpace) metrics = false
        }
        return { attached, worst, metrics }
      })()`)) as { attached: number; worst: number; metrics: boolean }

      if (geometry.attached === 0) {
        failures.push(`${width}px: no block accepted an editor`)
      }
      // The editor is `inset: 0` on the block, so they are the same box. Any
      // drift at all means something has been given its own geometry.
      if (geometry.worst > 0.5) {
        failures.push(`${width}px: an editor sits ${geometry.worst.toFixed(2)}px off its block`)
      }
      if (!geometry.metrics) {
        failures.push(`${width}px: an editor does not share its block's text metrics`)
      }
    }

    // A page whose runnable blocks are all verified examples, and a fresh load:
    // the sweep above left an editor on every block of the reference page, and
    // reusing it would compare a restored block against a snapshot that already
    // contained an editor.
    await page.setViewport({ width: 1280, height: 900 })
    await page.goto(`http://localhost:${PORT}/docs/getting-started/first-assertions/`, {
      waitUntil: 'networkidle0',
    })

    await checkPagesDoNotBleed(page)

    const loop = (await page.evaluate(`(async () => {
      const settle = () => new Promise(resolve => setTimeout(resolve, 60))
      // A verified example, so the claim it carries is one Reset has to restore.
      const block = [...document.querySelectorAll('[data-example]')]
        .find(b => b.querySelector('[data-run]') && b.closest('.example'))
      if (!block) return { error: 'no runnable verified example' }
      const pre = block.querySelector('pre')
      const shipped = pre.innerHTML
      const index = Number(block.dataset.example)

      pre.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      const editor = block.querySelector('.code-editor')
      if (!editor) return { error: 'no editor attached' }

      editor.value = editor.value + String.fromCharCode(10) + 'print("edited")'
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      await settle()

      const below = [...document.querySelectorAll('[data-example]')]
        .filter(b => Number(b.dataset.example) > index)
      const state = {
        withdrawn: (block.closest('.example') ?? block).getAttribute('data-verified'),
        resetOffered: !block.querySelector('[data-reset]').hidden,
        staleBelow: below.filter(b => b.hasAttribute('data-stale')).length,
        blocksBelow: below.length,
        mirrored: pre.textContent.includes('print("edited")'),
      }

      block.querySelector('[data-reset]').click()
      await settle()
      state.restoredExactly = pre.innerHTML === shipped
      state.staleCleared = document.querySelectorAll('[data-stale]').length === 0
      state.verifiedBack = (block.closest('.example') ?? block).getAttribute('data-verified')
      return state
    })()`)) as Record<string, unknown>

    if (loop.error) failures.push(String(loop.error))
    if (!loop.mirrored) failures.push('an edit does not reach the block it was typed into')
    if (loop.withdrawn === 'true') failures.push('an edited example still claims to be CI-verified')
    if (!loop.resetOffered) failures.push('an edited example offers no way back')
    if (loop.staleBelow !== loop.blocksBelow) {
      failures.push(
        `an edit marked ${String(loop.staleBelow)} of ${String(loop.blocksBelow)} later blocks ` +
          'stale, and a page is one namespace',
      )
    }
    if (!loop.restoredExactly) failures.push('Reset does not restore the bytes the build produced')
    if (!loop.staleCleared) failures.push('Reset leaves later blocks marked stale')
    if (loop.verifiedBack !== 'true') failures.push('Reset does not restore the verified claim')
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n  the editing loop is broken:\n  - ${failures.join('\n  - ')}\n`)
    process.exit(1)
  }

  console.log(
    `  an editor covers its block exactly at ${WIDTHS.join('/')}px, ` +
      'and Reset restores the build\u2019s own bytes',
  )
}

/**
 * An edit made on one page must not reach another.
 *
 * A block's index is a position in *its own* page's example list, so carrying
 * edits across a navigation substitutes one page's code into another's, by
 * number. It happened: `DocBody` was the same React instance for every
 * documentation route, so the ref holding the reader's edits survived the
 * navigation while the DOM around it was replaced -- and a reader who edited a
 * block, moved on and pressed Run elsewhere silently ran the code from the page
 * before, presented as that page's own output.
 *
 * The fix is a route key on the component, and the invariant it creates is what
 * is checked here: one instance per page, which React expresses as a new
 * element. Nothing about the rendered markup changes when this breaks -- the
 * body looked perfectly correct while running the wrong code -- so the identity
 * of the node is the thing to watch, and it needs no interpreter to watch it.
 */
async function checkPagesDoNotBleed(page: import('puppeteer').Page): Promise<void> {
  const A = '/docs/getting-started/first-assertions/'
  const B = '/docs/getting-started/chaining-and-narrowing/'

  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(`http://localhost:${PORT}${A}`, { waitUntil: 'networkidle0' })

  const result = (await page.evaluate(
    `(async () => {
      const block = [...document.querySelectorAll('[data-example]')]
        .find(b => b.querySelector('[data-run]'))
      if (!block) return { error: 'no runnable block on the first page' }

      // Leave an edit behind, the way a reader would.
      const pre = block.querySelector('pre')
      pre.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      const editor = block.querySelector('.code-editor')
      if (!editor) return { error: 'no editor attached' }
      editor.focus()
      editor.setSelectionRange(0, editor.value.length)
      document.execCommand('insertText', false, 'print("left behind")')

      const before = document.querySelector('.doc-body')
      const link = [...document.querySelectorAll('.docs-nav a, .docs-sidebar a')]
        .find(a => a.getAttribute('href') === ${JSON.stringify(B)})
      if (!link) return { error: 'no link to the second page' }
      link.click()

      const until = Date.now() + 20000
      while (Date.now() < until && location.pathname !== ${JSON.stringify(B)}) {
        await new Promise(r => setTimeout(r, 100))
      }
      await new Promise(r => setTimeout(r, 400))

      const after = document.querySelector('.doc-body')
      return {
        path: location.pathname,
        remounted: before !== after,
        editors: document.querySelectorAll('.code-editor').length,
        edited: document.querySelectorAll('[data-edited]').length,
        stale: document.querySelectorAll('[data-stale]').length,
        leaked: (after?.textContent ?? '').includes('left behind'),
      }
    })()`,
  )) as Record<string, unknown>

  if (result.error) throw new Error(`the cross-page check could not run: ${String(result.error)}`)

  const wrong: string[] = []
  if (result.path !== B) wrong.push(`the navigation did not arrive (at ${String(result.path)})`)
  if (!result.remounted) {
    wrong.push(
      'the body was reused across the navigation, so the previous page\u2019s edits ' +
        'are still in scope and would be substituted into this one by index',
    )
  }
  if (result.editors !== 0) wrong.push(`${String(result.editors)} editors survived the navigation`)
  if (result.edited !== 0) wrong.push('a block on the new page is marked edited')
  if (result.stale !== 0) wrong.push('a block on the new page is marked stale')
  if (result.leaked) wrong.push('the previous page\u2019s text is on this page')

  if (wrong.length > 0) {
    console.error(`\n  an edit crosses between pages:\n  - ${wrong.join('\n  - ')}\n`)
    process.exit(1)
  }

  // The route key cannot cover arriving at the page you are already on: React
  // keeps the instance and re-injects the body in place. What makes an edit
  // safe there is that the blocks it was made on are replaced, so the run can
  // tell a retained edit is stale by asking whether its block is still in the
  // document. That replacement is the precondition, so it is what is checked.
  const sameRoute = (await page.evaluate(
    `(async () => {
      const first = () => [...document.querySelectorAll('[data-example]')]
        .find(b => b.querySelector('[data-run]'))
      const before = first()
      const here = location.pathname
      const link = [...document.querySelectorAll('.docs-nav a, .docs-sidebar a')]
        .find(a => a.getAttribute('href') === here)
      if (!link) return { error: 'the page does not link to itself in its own sidebar' }
      link.click()
      await new Promise(r => setTimeout(r, 900))
      const after = first()
      return { replaced: before !== after, editors: document.querySelectorAll('.code-editor').length }
    })()`,
  )) as { error?: string; replaced?: boolean; editors?: number }

  if (sameRoute.error) throw new Error(String(sameRoute.error))
  if (!sameRoute.replaced) {
    console.error(
      '\n  arriving at the current page leaves its blocks in place, so an edit ' +
        'made before it cannot be told from one made after\n',
    )
    process.exit(1)
  }

  console.log('  a page gets its own body, so an edit cannot reach the next one')
  console.log('  and arriving at the page you are on rebuilds its blocks\n')
}

await main()
