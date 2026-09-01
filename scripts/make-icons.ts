/**
 * Draw the site icon, at the sizes browsers actually ask for.
 *
 * The mark is the three dots the logo opens with -- pink, lilac, butter -- on
 * the marketing cream. The wordmark and the mint check are dropped: at 16px a
 * word is a smudge, and the check only means something once you have seen the
 * dots turn mint.
 *
 * Drawn here rather than commissioned, for the same reason as the social card:
 * the design ships no image assets, so the icon is built from the same tokens
 * as everything else and cannot drift from them.
 *
 * A missing icon is not cosmetic. Every browser requests `/favicon.ico`
 * unprompted, so without one the host answers a 404 on every first load, and
 * search results show the generic globe beside the entry.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { DOT_COLOURS } from '../app/lib/palette.ts'
import { ROOT } from '../pipeline/corpus.ts'

/**
 * The mark: the logo's three dots, in a row, on nothing.
 *
 * No plate behind them. A transparent ground lets whatever the browser paints
 * behind a tab show through, so the mark sits in a light chrome and a dark one
 * alike instead of carrying a cream square into both.
 *
 * Centred with a dot of air at each end, so at sixteen pixels the three read as
 * a group rather than as a stripe running edge to edge.
 */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="lovely-assertions">
  <circle cx="12" cy="32" r="9" fill="${DOT_COLOURS[0]}"/>
  <circle cx="32" cy="32" r="9" fill="${DOT_COLOURS[1]}"/>
  <circle cx="52" cy="32" r="9" fill="${DOT_COLOURS[2]}"/>
</svg>
`

/**
 * The one raster a browser asks for that SVG does not cover.
 *
 * No 192/512 pair: those exist for a web app manifest, and this is a
 * documentation site with nothing to install.
 */
const RASTERS = [{ file: 'apple-touch-icon.png', size: 180 }] as const

/**
 * iOS composites a home-screen icon onto black, so a transparent one arrives as
 * three dots in a void. That tile is the one place the mark keeps a ground.
 */
const TILE_GROUND = '#fdf6f3'

const ICO_SIZES = [16, 32, 48] as const

/**
 * Pack PNGs into an ICO.
 *
 * ICO is a directory of images rather than a format of its own, and PNG entries
 * are legal in it, so this is a header and an offset table -- not an encoder.
 */
function ico(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries: Buffer[] = []

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    // 0 in the width and height bytes means 256; every size here is smaller.
    entry.writeUInt8(size, 0)
    entry.writeUInt8(size, 1)
    entry.writeUInt8(0, 2) // palette size, 0 for a true-colour image
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

async function main(): Promise<void> {
  const puppeteer = await import('puppeteer')
  const out = path.join(ROOT, 'public')

  await writeFile(path.join(out, 'icon.svg'), ICON, 'utf8')

  const browser = await puppeteer.launch()
  try {
    const page = await browser.newPage()

    async function raster(size: number, ground = 'transparent'): Promise<Buffer> {
      const clear = ground === 'transparent'
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
      await page.setContent(
        `<!doctype html><meta charset="utf-8">` +
          `<style>html,body{margin:0;padding:0;background:${ground}}` +
          `svg{display:block;width:${size}px;height:${size}px}</style>${ICON}`,
        { waitUntil: 'load' },
      )
      return Buffer.from(await page.screenshot({ type: 'png', omitBackground: clear }))
    }

    for (const { file, size } of RASTERS) {
      await writeFile(path.join(out, file), await raster(size, TILE_GROUND))
    }

    const packed: { size: number; png: Buffer }[] = []
    for (const size of ICO_SIZES) packed.push({ size, png: await raster(size) })
    await writeFile(path.join(out, 'favicon.ico'), ico(packed))

    console.log(
      `\n  icons: icon.svg, favicon.ico (${ICO_SIZES.join('/')}), ` +
        `${RASTERS.map((entry) => entry.file).join(', ')}\n`,
    )
  } finally {
    await browser.close()
  }
}

await main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
