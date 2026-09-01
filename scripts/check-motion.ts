/**
 * Check that every animation the design specifies actually moves something.
 *
 * The usual failure here is motion that looks right in the source and never
 * fires: a timeline bound to a node that was replaced, a hover handler on an
 * element the pointer cannot reach, a tween on a property already at its
 * target. So each one is triggered in a real browser and observed by sampling
 * the property it should change — which works whatever drives it, rather than
 * trusting one engine's bookkeeping.
 *
 * The second half matters as much: under `prefers-reduced-motion` none of them
 * may run, including the ones driven by script.
 */

import process from 'node:process'
import { serve } from './serve.ts'

const PORT = 4703

interface Check {
  readonly name: string
  /** The element whose movement proves the animation ran. */
  readonly selector: string
  /** The computed property to sample. */
  readonly property: string
  /** Runs in the page to provoke it. */
  readonly trigger: string
  /** How long to sample for, in ms. */
  readonly window?: number
  /** Which page to look at. The home page unless stated. */
  readonly url?: string
}

/** A documentation page with a plain code block, a meta row and a pager. */
const DOC = '/docs/getting-started/first-assertions/'

const CHECKS: readonly Check[] = [
  {
    name: 'logo plays on load',
    selector: '.logo-dots > span',
    property: 'transform',
    trigger: 'await wait(420)',
    window: 500,
  },
  {
    name: 'logo replays on hover',
    selector: '.logo-dots > span',
    property: 'transform',
    // `pointerenter` does not bubble, so React's delegated listener never sees
    // a synthetic one; `pointerover` is what it is actually bound to.
    trigger: `await wait(1600);
      document.querySelector('.logo').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
  },
  {
    name: 'the marker draws itself',
    selector: '.marker-ink',
    property: 'transform',
    trigger: 'await wait(560)',
    window: 700,
  },
  {
    name: 'the status dot pulses',
    selector: '.hero-badge-dot',
    property: 'opacity',
    trigger: 'await wait(100)',
    window: 700,
  },
  {
    name: 'the CTA arrow flies',
    selector: '.cta-arrow',
    property: 'transform',
    trigger: `document.querySelector('.cta').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
  },
  {
    name: 'nav links lift and colour',
    selector: '.site-head-nav a',
    property: 'color',
    trigger: `document.querySelector('.site-head-nav a').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
  },
  {
    name: 'the navbar settles when scrolled',
    selector: '.site-head-plate',
    property: 'opacity',
    trigger: 'window.scrollTo(0, 400); window.dispatchEvent(new Event("scroll"))',
  },
  {
    name: 'doc rows slide under the pointer',
    selector: '.docs-row',
    property: 'transform',
    trigger: `document.querySelector('.docs-row').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
  },
  {
    name: 'the copy button acknowledges',
    selector: '.command-pill',
    property: 'transform',
    trigger: `document.querySelector('.command-pill').click()`,
  },
  {
    name: 'the copy button swaps its icon',
    selector: '.command-pill [data-icon="check"]',
    property: 'opacity',
    trigger: `document.querySelector('.command-pill').click()`,
  },
  {
    name: 'the CTA itself lifts',
    selector: '.cta',
    property: 'transform',
    trigger: `document.querySelector('.cta').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
  },
  {
    name: 'the marker tilts on hover',
    selector: '.marker-ink',
    property: 'transform',
    // After the draw has finished, so the tilt is what is being sampled.
    trigger: `await wait(1800);
      document.querySelector('.marker').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
  },
  // Everything below is a documentation page. These went unwatched once, and
  // the copy buttons there sat dead for it: the attribute they set was read by
  // nothing at all.
  {
    name: 'a docs code block copies',
    selector: '.doc-body .copy-button [data-icon="check"]',
    property: 'opacity',
    trigger: `document.querySelector('.doc-body .copy-button').click()`,
    url: DOC,
  },
  {
    name: 'the docs copy icon returns',
    selector: '.doc-body .copy-button [data-icon="copy"]',
    property: 'opacity',
    // Past the 1.5s hold, to catch a gesture that acknowledges and never
    // comes back.
    trigger: `document.querySelector('.doc-body .copy-button').click(); await wait(1550)`,
    window: 600,
    url: DOC,
  },
  {
    // The meta row's button, which copies the page's markdown rather than a
    // string it already has. It is the same gesture and it has to look it.
    //
    // The icon, not the button: only the buttons a reader presses once hop and
    // throw sparkles, and a meta row is not the place for that. Sampling the
    // button's transform here asserted a movement the design does not have --
    // which this gate said so, immediately.
    name: 'the page copy button acknowledges',
    selector: '.doc-copy [data-icon="check"]',
    property: 'opacity',
    trigger: `document.querySelector('.doc-copy').click()`,
    url: DOC,
  },
  {
    name: 'the page copy icon returns',
    selector: '.doc-copy [data-icon="copy"]',
    property: 'opacity',
    trigger: `document.querySelector('.doc-copy').click(); await wait(1550)`,
    window: 600,
    url: DOC,
  },
  {
    name: 'docs header links lift',
    selector: '.docs-head-nav a',
    property: 'color',
    trigger: `document.querySelector('.docs-head-nav a').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`,
    url: DOC,
  },
  {
    // The way back out is its own animation, not the way in played backwards,
    // so it needs its own check.
    name: 'the navbar unsticks again',
    selector: '.site-head-plate',
    property: 'opacity',
    trigger: `window.scrollTo(0, 400); window.dispatchEvent(new Event('scroll')); await wait(600);
      window.scrollTo(0, 0); window.dispatchEvent(new Event('scroll'))`,
  },
  {
    name: 'a heading anchor glides',
    selector: '',
    property: 'window.scrollY',
    trigger: `document.querySelector('.doc-body h2 a[href^="#"]').click()`,
    window: 700,
    url: DOC,
  },
]

/** Sample a property every frame and report the distinct values it took. */
const SAMPLER = `
  async function sample(selector, property, ms) {
    // A selector of "" means the check reads something that is not a computed
    // style — the scroll position, say — through the property expression.
    const el = selector ? document.querySelector(selector) : document.documentElement
    if (!el) return { found: false, values: [] }
    const read = selector ? () => getComputedStyle(el)[property] : new Function('return ' + property)
    const seen = new Set()
    const until = performance.now() + ms
    while (performance.now() < until) {
      seen.add(String(read()))
      await new Promise(r => requestAnimationFrame(r))
    }
    return { found: true, values: [...seen] }
  }
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
`

async function main(): Promise<void> {
  const { launch } = await import('./browser.ts')
  const server = serve(PORT)
  const browser = await launch({ protocolTimeout: 180_000 })
  const failures: string[] = []

  try {
    for (const check of CHECKS) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1280, height: 900 })
      await page.goto(`http://localhost:${PORT}${check.url ?? '/'}`, { waitUntil: 'networkidle0' })

      const result = (await page.evaluate(`(async () => {
        ${SAMPLER}
        ${check.trigger};
        return sample(${JSON.stringify(check.selector)}, ${JSON.stringify(check.property)}, ${check.window ?? 400})
      })()`)) as { found: boolean; values: string[] }

      if (!result.found) failures.push(`${check.name}: ${check.selector} is not on the page`)
      else if (result.values.length < 2) {
        failures.push(
          `${check.name}: ${check.property} never changed (stayed at ${result.values[0] ?? 'nothing'})`,
        )
      } else {
        console.log(
          `  ✓ ${check.name.padEnd(34)} ${result.values.length} frames of ${check.property}`,
        )
      }
      await page.close()
    }

    // Nothing may move for a reader who asked for less motion.
    const calm = await browser.newPage()
    await calm.setViewport({ width: 1280, height: 900 })
    await calm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await calm.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' })

    const still = (await calm.evaluate(`(async () => {
      ${SAMPLER}
      await wait(1500)
      document.querySelector('.logo').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      const dots = await sample('.logo-dots > span', 'transform', 500)
      return {
        dotFrames: dots.values.length,
        sparkles: document.querySelectorAll('[data-sparkle]').length,
        marker: getComputedStyle(document.querySelector('.marker-ink')).transform,
      }
    })()`)) as { dotFrames: number; sparkles: number; marker: string }

    if (still.dotFrames > 1) failures.push('reduced motion: the logo still animates')
    if (still.sparkles > 0) failures.push(`reduced motion: ${still.sparkles} sparkles were created`)
    // With no timeline to draw it, the highlighter has to be there already.
    if (still.marker.startsWith('matrix(0')) {
      failures.push('reduced motion: the marker is left undrawn')
    }
    console.log(`  ✓ ${'reduced motion stops everything'.padEnd(34)} marker at ${still.marker}`)
    await calm.close()

    // Scrolling is the easy one to get wrong: an explicit `behavior` in the
    // options object beats `scroll-behavior` in the stylesheet, so a hardcoded
    // 'smooth' anywhere survives every CSS rule meant to stop it.
    const quiet = await browser.newPage()
    await quiet.setViewport({ width: 1280, height: 900 })
    await quiet.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await quiet.goto(`http://localhost:${PORT}${DOC}`, { waitUntil: 'networkidle0' })

    const jumps = (await quiet.evaluate(`(async () => {
      ${SAMPLER}
      document.querySelector('.doc-body h2 a[href^="#"]').click()
      const anchor = await sample('', 'window.scrollY', 500)
      window.scrollTo(0, 0)
      await wait(100)
      window.scrollTo(0, 900)
      await wait(100)
      document.querySelector('.docs-toc-top').click()
      const top = await sample('', 'window.scrollY', 500)
      return { anchor: anchor.values.length, top: top.values.length }
    })()`)) as { anchor: number; top: number }

    // One value while it sits still, two if it lands mid-sample: anything more
    // is a glide.
    if (jumps.anchor > 2) failures.push('reduced motion: a heading anchor still glides')
    if (jumps.top > 2) failures.push('reduced motion: back to top still glides')
    console.log(
      `  ✓ ${'reduced motion keeps scrolling flat'.padEnd(34)} anchor and top jump in one step`,
    )
    await quiet.close()
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(`\n  these animations do not run:\n  - ${failures.join('\n  - ')}\n`)
    process.exit(1)
  }
  console.log(`\n  ${CHECKS.length} animations run, and none of them under reduced motion\n`)
}

await main()
