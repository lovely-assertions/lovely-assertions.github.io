/**
 * Draw the social card.
 *
 * The design ships no image assets at all — everything is type and CSS
 * gradients — so the card is drawn the same way rather than commissioned: the
 * same palette, the same fonts, the same halo. It renders in the same browser
 * the layout check uses, so what is published is what a browser paints.
 *
 * It shows a failure message, because that is the product. A card showing the
 * library's name would say less than one showing what it does.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { DOT_COLOURS } from '../app/lib/palette.ts'
import { ROOT } from '../pipeline/corpus.ts'

const WIDTH = 1200
const HEIGHT = 630

async function main(): Promise<void> {
  const puppeteer = await import('puppeteer')

  // The fonts are already downloaded for the site; inline them so the renderer
  // needs no network and cannot silently fall back to a system face.
  const [display, mono] = await Promise.all([
    readFile(path.join(ROOT, 'public/fonts/bricolage-grotesque.woff2')),
    readFile(path.join(ROOT, 'public/fonts/jetbrains-mono.woff2')),
  ])

  const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: "Bricolage Grotesque";
    src: url(data:font/woff2;base64,${display.toString('base64')}) format("woff2");
    font-weight: 400 700;
  }
  @font-face {
    font-family: "JetBrains Mono";
    src: url(data:font/woff2;base64,${mono.toString('base64')}) format("woff2");
    font-weight: 400 700;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    display: flex; flex-direction: column; justify-content: center; gap: 40px;
    padding: 72px 80px;
    background-color: oklch(0.975 0.014 340);
    background-image:
      radial-gradient(820px 620px at 12% -60px, oklch(0.90 0.075 350 / 0.85) 0%, transparent 62%),
      radial-gradient(760px 560px at 88% 20px, oklch(0.90 0.065 285 / 0.80) 0%, transparent 60%),
      radial-gradient(980px 520px at 50% 300px, oklch(0.94 0.070 95 / 0.55) 0%, transparent 68%);
    background-repeat: no-repeat;
    font-family: "Bricolage Grotesque", sans-serif;
    color: oklch(0.27 0.035 340);
  }
  .mark { display: flex; align-items: center; gap: 14px; }
  .dots { display: flex; gap: 6px; }
  .dots span { width: 14px; height: 14px; border-radius: 999px; }
  .wordmark { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
  h1 {
    font-size: 66px; font-weight: 700; line-height: 1.02; letter-spacing: -0.038em;
    max-width: 15em;
  }
  .marker { position: relative; display: inline-block; margin: 0 0.26em; isolation: isolate; }
  .marker span { position: relative; z-index: 1; }
  .marker::before {
    content: ""; position: absolute; left: -0.17em; right: -0.17em; top: -0.02em; bottom: 0.02em;
    z-index: 0; border-radius: 999px;
    background-image: linear-gradient(100deg, oklch(0.86 0.12 350) 0%, oklch(0.86 0.11 300) 42%, oklch(0.90 0.12 95) 100%);
  }
  .failure {
    padding: 26px 30px; border-radius: 18px;
    background-image: linear-gradient(140deg, oklch(0.28 0.055 330) 0%, oklch(0.24 0.05 290) 100%);
    font-family: "JetBrains Mono", monospace; font-size: 21px; line-height: 1.6;
    color: oklch(0.96 0.01 340);
  }
  .subject { color: oklch(0.82 0.15 350); }
  .actual { color: oklch(0.86 0.13 92); }
</style>
<div class="mark">
  <span class="dots">
    ${DOT_COLOURS.map((dot) => `<span style="background:${dot}"></span>`).join('\n    ')}
  </span>
  <span class="wordmark">lovely&#8209;assertions</span>
</div>
<h1>Your tests will fail. They may as well be<span class="marker"><span>lovely</span></span>about it.</h1>
<div class="failure">
  Expected <span class="subject">order_totals</span> to be sorted, but
  <span class="actual">1</span> at index 1 came after <span class="actual">3</span>:
  <span class="actual">[3, 1, 2]</span>.
</div>`

  const browser = await puppeteer.launch()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    // The fonts are data URIs, but the face still has to be parsed before paint.
    await page.evaluateHandle('document.fonts.ready')
    const png = await page.screenshot({ type: 'png' })
    await writeFile(path.join(ROOT, 'public/og.png'), png)
    console.log(`\n  og.png  ${WIDTH}×${HEIGHT}  ${(png.length / 1024).toFixed(0)} KiB\n`)
  } finally {
    await browser.close()
  }
}

try {
  await main()
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
