/**
 * Check the built pages at every width the design is verified against.
 *
 * The rule is absolute: nothing on this site scrolls sideways, at any width, on
 * either surface. It is easy to break and invisible until someone opens the
 * site on a phone, so it is measured rather than eyeballed.
 *
 * Runs against the real built output in a real browser engine, because the
 * failure is a layout one: no amount of reading the CSS finds a flex row that
 * happens not to fit.
 *
 * The same sweep also checks the pointer, for the same reason: a control whose
 * cursor was never set looks identical in a screenshot and wrong under the
 * hand. Both directions are checked -- a control without a pointer, and a
 * pointer on something that does nothing.
 */

import process from 'node:process'
import { serve } from './serve.ts'

/** The widths the design names, from desktop down to the smallest phone. */
const WIDTHS = [1520, 1180, 1024, 900, 768, 375]

const ROUTES = [
  '/',
  '/docs/',
  '/docs/guides/strings/',
  '/docs/reference/assertions/',
  '/playground/',
]

const PORT = 4319

interface Overflow {
  readonly route: string
  readonly width: number
  readonly scrollWidth: number
  readonly culprits: string[]
}

/**
 * Everything that acts on a click.
 *
 * `[tabindex="0"]` is deliberately absent: a scrollable code block is focusable
 * so a keyboard reader can reach it, and it is not clickable.
 */
const CLICKABLE = [
  'a[href]',
  'button',
  'summary',
  'label[for]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="option"]',
].join(', ')

async function main(): Promise<void> {
  let launch: typeof import('./browser.ts')['launch']
  try {
    ;({ launch } = await import('./browser.ts'))
  } catch {
    console.log('\n  puppeteer is not installed; skipping the layout check.\n')
    return
  }

  const server = serve(PORT)
  const browser = await launch()
  const problems: Overflow[] = []
  const pointers: string[] = []

  try {
    const page = await browser.newPage()

    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        await page.setViewport({ width, height: 900 })
        await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle0' })

        const result = await page.evaluate(() => {
          const root = document.documentElement
          const culprits = [...document.querySelectorAll('*')]
            .filter((element) => element.getBoundingClientRect().right > root.clientWidth + 1)
            .slice(0, 6)
            .map((element) => `${element.tagName.toLowerCase()}.${element.className || '(none)'}`)
          return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, culprits }
        })

        if (result.scrollWidth > result.clientWidth) {
          problems.push({
            route,
            width,
            scrollWidth: result.scrollWidth,
            culprits: result.culprits,
          })
        }

        // The cursor does not change with the width, so once per route is enough.
        if (width !== WIDTHS[0]) continue

        const cursors = await page.evaluate((selector: string) => {
          const visible = (element: Element) => {
            const style = getComputedStyle(element)
            if (style.display === 'none' || style.visibility === 'hidden') return false
            if (element.closest('[hidden]')) return false
            const box = element.getBoundingClientRect()
            return box.width > 0 || box.height > 0
          }
          const name = (element: Element) =>
            `${element.tagName.toLowerCase()}.${element.className || '(none)'}`

          const blunt: string[] = []
          for (const element of document.querySelectorAll(selector)) {
            if (!visible(element)) continue
            const off =
              (element as HTMLButtonElement).disabled === true ||
              element.getAttribute('aria-disabled') === 'true'
            const pointer = getComputedStyle(element).cursor === 'pointer'
            if (off ? pointer : !pointer) blunt.push(name(element))
          }

          const lying: string[] = []
          for (const element of document.querySelectorAll('*')) {
            if (getComputedStyle(element).cursor !== 'pointer') continue
            if (element.matches(selector) || element.closest(selector)) continue
            if (!visible(element)) continue
            lying.push(name(element))
          }
          return { blunt: [...new Set(blunt)], lying: [...new Set(lying)] }
        }, CLICKABLE)

        for (const control of cursors.blunt) {
          pointers.push(`${route}: ${control} is clickable and shows no pointer`)
        }
        for (const control of cursors.lying) {
          pointers.push(`${route}: ${control} shows a pointer and does nothing`)
        }
      }
    }
  } finally {
    await browser.close()
    server.close()
  }

  if (problems.length > 0) {
    console.error('\n  these pages scroll sideways:\n')
    for (const problem of problems) {
      console.error(
        `  ${problem.route} at ${problem.width}px -> ${problem.scrollWidth}px\n` +
          `    ${problem.culprits.join('\n    ')}\n`,
      )
    }
    process.exit(1)
  }

  if (pointers.length > 0) {
    console.error(`\n  the pointer is wrong here:\n  - ${pointers.join('\n  - ')}\n`)
    process.exit(1)
  }

  console.log(`\n  ${ROUTES.length} routes × ${WIDTHS.length} widths: nothing scrolls sideways`)
  console.log('  every control shows a pointer, and nothing else does\n')
}

await main()
