/**
 * Drive the built site the way somebody without a mouse would.
 *
 * These are the checks an audit turned up, each one written after a real defect
 * that shipped. None of them is visible in a screenshot and none is findable by
 * reading the CSS, which is exactly why they need a gate: a keyboard trap looks
 * like a working page until you try to leave it.
 *
 * Every check runs against `build/client` in a real browser, presses real keys,
 * and asserts on what the accessibility tree and the focus ring actually did.
 *
 * One trap worth knowing before you debug a failure here: Chrome does not
 * dispatch focus events in an unfocused tab, so a check written without
 * `page.bringToFront()` reports that the trap it is looking for does not exist.
 * That is the same shape as the hidden-pane problem in `check-motion.ts`, where
 * `requestAnimationFrame` stops and every tween looks dead.
 */

import process from 'node:process'
import { serve } from './serve.ts'

const PORT = 4321

/** A page with runnable code blocks, tabs, a contents rail and a footer. */
const DOC = '/docs/getting-started/first-assertions/'
const TABS = '/docs/getting-started/installation/'

const failures: string[] = []

function check(name: string, ok: boolean, detail: string): void {
  if (ok) console.log(`  ✓ ${name.padEnd(46)} ${detail}`)
  else failures.push(`${name}: ${detail}`)
}

async function main(): Promise<void> {
  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    console.log('\n  puppeteer is not installed; skipping the accessibility check.\n')
    return
  }

  const server = serve(PORT)
  const browser = await puppeteer.launch()
  const url = (route: string) => `http://localhost:${PORT}${route}`

  try {
    const page = await browser.newPage()
    // Focus events do not fire in a background tab. Without this every focus
    // check below passes by never happening.
    await page.bringToFront()
    await page.setViewport({ width: 1400, height: 900 })

    const focused = () =>
      page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        if (!element) return 'none'
        const first = String(element.className || '').split(' ')[0]
        return `${element.tagName}${first ? `.${first}` : ''}`
      })

    console.log('')

    // ---- a runnable code block can be entered and left ------------------
    {
      await page.goto(url(DOC), { waitUntil: 'networkidle0' })
      const before = await page.evaluate(
        () =>
          document
            .querySelector<HTMLTextAreaElement>('[data-example] pre')
            ?.textContent?.slice(0, 40) ?? '',
      )

      await page.evaluate(() => {
        document.querySelector<HTMLElement>('[data-example] pre[tabindex="0"]')?.focus()
      })
      await page.evaluate(() => new Promise((r) => setTimeout(r, 200)))
      const landed = await focused()
      check('focus on a runnable block opens its editor', landed === 'TEXTAREA.code-editor', landed)

      // The landing pad must stand down once it has done its job, or the
      // editor's own ancestor becomes the tab stop it bounces off.
      const preTab = await page.evaluate(() =>
        document.querySelector('[data-example] pre')?.getAttribute('tabindex'),
      )
      check('and the block stops being a tab stop', preTab === '-1', `tabindex="${preTab}"`)

      await page.keyboard.press('Tab')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 150)))
      const forward = await focused()
      check('Tab leaves the block', forward !== 'TEXTAREA.code-editor', forward)

      const after = await page.evaluate(
        () =>
          document.querySelector<HTMLTextAreaElement>('textarea.code-editor')?.value.slice(0, 40) ??
          '',
      )
      const edited = await page.evaluate(
        () => document.querySelector('[data-example]')?.hasAttribute('data-edited') ?? false,
      )
      check(
        'and does not type into the verified example',
        after === before.replace(/\n$/, '') && !edited,
        edited ? 'the block was marked edited' : 'unchanged',
      )

      await page.evaluate(() =>
        document.querySelector<HTMLTextAreaElement>('textarea.code-editor')?.focus(),
      )
      await page.keyboard.down('Shift')
      await page.keyboard.press('Tab')
      await page.keyboard.up('Shift')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 150)))
      const back = await focused()
      check('Shift+Tab leaves it too', back !== 'TEXTAREA.code-editor', back)
    }

    // ---- the mobile drawer is a modal ------------------------------------
    {
      await page.setViewport({ width: 760, height: 900 })
      await page.goto(url(DOC), { waitUntil: 'networkidle0' })
      await page.click('.docs-drawer-toggle')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 350)))

      const opened = await focused()
      check('opening the drawer moves focus into it', opened.startsWith('A.docs-nav'), opened)

      const inert = await page.evaluate(
        () => document.querySelector('.docs-main')?.hasAttribute('inert') ?? false,
      )
      check('and marks the page behind it inert', inert, String(inert))

      await page.keyboard.press('Escape')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 300)))
      const restored = await focused()
      check(
        'closing it returns focus to the toggle',
        restored === 'BUTTON.docs-drawer-toggle',
        restored,
      )
      await page.setViewport({ width: 1400, height: 900 })
    }

    // ---- search is a combobox over a listbox ----------------------------
    {
      await page.goto(url(DOC), { waitUntil: 'networkidle0' })
      await page.keyboard.press('Slash')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 350)))
      await page.type('.docs-search-input input', 'expect')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 900)))

      const wired = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('.docs-search-input input')
        const listbox = document.querySelector('[role="listbox"]')
        return {
          role: input?.getAttribute('role'),
          controls: input?.getAttribute('aria-controls'),
          listboxId: listbox?.id,
          expanded: input?.getAttribute('aria-expanded'),
        }
      })
      check(
        'the search input is a combobox over its listbox',
        wired.role === 'combobox' &&
          wired.expanded === 'true' &&
          !!wired.controls &&
          wired.controls === wired.listboxId,
        `${wired.role} -> ${wired.controls}`,
      )

      // Fourteen presses is what it took to walk the highlight off the bottom
      // of the 380px panel when nothing scrolled it.
      for (let press = 0; press < 14; press += 1) await page.keyboard.press('ArrowDown')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 250)))

      const walked = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('.docs-search-input input')
        const list = document.querySelector<HTMLElement>('.docs-search-results')
        const active = document.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
        if (!input || !list || !active) return null
        const box = list.getBoundingClientRect()
        const row = active.getBoundingClientRect()
        return {
          names: input.getAttribute('aria-activedescendant') === active.id,
          visible: row.top >= box.top - 1 && row.bottom <= box.bottom + 1,
          isLink: active.tagName === 'A' && !!active.getAttribute('href'),
        }
      })
      check(
        'arrowing names the active row and keeps it visible',
        walked?.names === true && walked.visible,
        walked ? `activedescendant ${walked.names}, on screen ${walked.visible}` : 'no rows',
      )
      check(
        'and every row is a real link',
        walked?.isLink === true,
        walked?.isLink ? 'anchor with href' : 'not an anchor',
      )
      await page.keyboard.press('Escape')
    }

    // ---- tabs own the panels they claim ---------------------------------
    {
      await page.goto(url(TABS), { waitUntil: 'networkidle0' })
      const tabs = await page.evaluate(() =>
        [...document.querySelectorAll('[role="tab"]')].map((tab) => {
          const id = tab.getAttribute('aria-controls')
          const panel = id ? document.getElementById(id) : null
          return {
            controls: !!panel && panel.getAttribute('role') === 'tabpanel',
            labelled: panel?.getAttribute('aria-labelledby') === tab.id,
          }
        }),
      )
      check(
        'every tab controls a real tabpanel',
        tabs.length > 0 && tabs.every((tab) => tab.controls && tab.labelled),
        `${tabs.length} tabs, all paired`,
      )
    }

    // ---- the choice, and its consequence, are announced ------------------
    {
      await page.goto(url('/'), { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.querySelector<HTMLElement>('.segmented button')?.focus())
      await page.keyboard.press('ArrowRight')
      await page.evaluate(() => new Promise((r) => setTimeout(r, 200)))

      const picked = await page.evaluate(() => {
        const group = document.querySelector('.segmented')
        const checked = group?.querySelector('[aria-checked="true"]')
        return {
          radiogroup: group?.getAttribute('role') === 'radiogroup',
          follows: checked === document.activeElement,
          announced:
            document.querySelector('.install-command pre')?.getAttribute('role') === 'status',
        }
      })
      check(
        'the install picker is a radio group',
        picked.radiogroup,
        picked.radiogroup ? 'radiogroup' : 'not a radio group',
      )
      check('whose focus follows its selection', picked.follows, String(picked.follows))
      check('and whose command is announced', picked.announced, String(picked.announced))
    }

    // ---- copying says so, and anchors take focus with them ---------------
    {
      await page.goto(url(DOC), { waitUntil: 'networkidle0' })
      await page.evaluate(() =>
        document.querySelector<HTMLElement>('.doc-body .copy-button')?.click(),
      )
      await page.evaluate(() => new Promise((r) => setTimeout(r, 250)))
      const said = await page.evaluate(() =>
        [...document.querySelectorAll('[role="status"]')]
          .map((region) => region.textContent?.trim())
          .filter(Boolean),
      )
      check(
        'copying a code block is announced',
        said.includes('Copied'),
        said.join(' | ') || 'silence',
      )

      await page.evaluate(() => document.querySelector<HTMLElement>('.docs-toc-list a')?.click())
      await page.evaluate(() => new Promise((r) => setTimeout(r, 700)))
      const onHeading = await page.evaluate(() =>
        /^H[2-6]$/.test(document.activeElement?.tagName ?? ''),
      )
      check('a contents link takes focus to its heading', onHeading, await focused())

      const state = await page.evaluate(() => history.state)
      check(
        "and leaves the router's history state alone",
        state !== null && typeof state === 'object',
        JSON.stringify(state),
      )
    }
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n  these are unreachable without a mouse:\n  - ${failures.join('\n  - ')}\n`)
    process.exit(1)
  }

  console.log('\n  the site is operable by keyboard, and says what it did\n')
}

await main()
