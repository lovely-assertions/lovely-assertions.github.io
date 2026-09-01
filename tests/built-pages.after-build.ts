/**
 * The design, checked against the HTML a reader actually receives.
 *
 * Separate from `design.test.ts` because these read `build/client`, and so they
 * can only run once the build exists. `pnpm test` runs before the build in
 * `ci:before`; this file runs as `gate:built` in `ci:after`, beside the other
 * gates over the built site. Left in the suite it passed on any machine that had
 * built once before and failed on every clean checkout -- which is to say, in
 * CI, on the first run, and nowhere a person would have seen it.
 *
 * Not named `*.test.ts`: that glob is what `pnpm test` collects, and a file
 * collected there is a file running at the wrong time again.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, test } from 'node:test'
import { THEME_KEY } from '../app/lib/theme.ts'

const BUILD = path.resolve(import.meta.dirname, '../build/client')
const STYLES = path.resolve(import.meta.dirname, '../app/styles')

async function page(route: string): Promise<string> {
  return readFile(path.join(BUILD, route, 'index.html'), 'utf8')
}

/** Two of these check that the markup and the stylesheet still agree. */
async function stylesheet(name: string): Promise<string> {
  return readFile(path.join(STYLES, name), 'utf8')
}

describe('the built pages', () => {
  test('self-host both webfonts', async () => {
    const html = await page('')
    assert.ok(!html.includes('fonts.googleapis.com'), 'the page still calls Google Fonts')
    assert.ok(!html.includes('fonts.gstatic.com'))
  })

  test('settle the theme before first paint', async () => {
    const html = await page('docs')
    // Without a blocking script in the head, a reader who chose dark gets a
    // white flash on every navigation, because every page is static HTML.
    //
    // Asserted against the constant, not a string typed here. The key used to
    // be spelled twice -- once in the toggle that writes it, once inside the
    // head script that reads it -- and this test spelled it a third time, so
    // renaming it in one place would have left the test passing while every
    // dark-mode reader flashed white on all 38 pages.
    assert.ok(html.includes(THEME_KEY), `no ${THEME_KEY} in the document`)
    assert.ok(
      html.indexOf(THEME_KEY) < html.indexOf('</head>'),
      'the theme script is not in the head',
    )
  })

  test('draw the theme icon from the stylesheet, not from React', async () => {
    const html = await page('docs')
    // Both glyphs ship and CSS picks one, because the head script knows the
    // theme before the first paint and React does not know it until hydration.
    // Measured on a throttled connection, a state-driven icon left a sun on a
    // fully dark page for the whole three-second sample.
    for (const icon of ['sun', 'moon']) {
      assert.ok(html.includes(`data-icon="${icon}"`), `the ${icon} icon is not in the static HTML`)
    }
    const docs = await stylesheet('docs.css')
    assert.ok(
      docs.includes('[data-theme="dark"] .docs-theme-icon[data-icon="sun"]'),
      'nothing hides the sun in dark mode',
    )
  })

  test('name the modifier key the reader actually has', async () => {
    const html = await page('docs')
    // `⌘K` was baked into all 38 pages. Both spellings ship now, and the same
    // head script stamps `data-platform` for the stylesheet to choose between.
    assert.ok(html.includes('data-key="ctrl"'), 'no Ctrl spelling of the shortcut')
    assert.ok(html.includes('data-key="mac"'), 'no ⌘ spelling of the shortcut')
    // The script writes it as a `dataset` property; the stylesheet reads it as
    // an attribute. Assert both halves, or one can be renamed alone.
    assert.ok(html.includes('dataset.platform'), 'nothing stamps the platform before paint')
    const docs = await stylesheet('docs.css')
    assert.ok(
      docs.includes('[data-platform="mac"] kbd[data-key="mac"]'),
      'the stylesheet never reads the platform',
    )
  })

  test('carry one h1 and no skipped heading levels', async () => {
    for (const route of ['', 'docs', 'docs/guides/strings']) {
      const html = await page(route)
      const h1s = html.match(/<h1[\s>]/g) ?? []
      assert.equal(h1s.length, 1, `${route || '/'} has ${h1s.length} h1 elements`)
      assert.ok(!/<h[456][\s>]/.test(html), `${route || '/'} skips to h4+`)
    }
  })

  test('name every icon-only control', async () => {
    const html = await page('docs/guides/strings')

    // An icon-only button is announced as "button" and nothing else, so each
    // one needs a label. A button is icon-only when its content is markup with
    // no text of its own.
    const unnamed: string[] = []
    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const [, attributes = '', content = ''] = match
      const text = content.replace(/<[^>]+>/g, '').trim()
      if (text === '' && !attributes.includes('aria-label')) {
        unnamed.push(attributes.trim().slice(0, 80))
      }
    }

    assert.deepEqual(unnamed, [])
  })

  test('the skip link comes first in the document', async () => {
    const html = await page('docs')
    const skip = html.indexOf('Skip to content')
    const main = html.indexOf('id="doc-main"')
    assert.ok(skip > 0 && skip < main, 'the skip link must precede the content it skips to')
  })
})
