/**
 * Every route the site publishes, in one place.
 *
 * The build reads this to decide what to pre-render and the sitemap reads it to
 * decide what to list. A second spelling of the list is how a sitemap comes to
 * advertise a page that was never built, or to omit one that was -- and neither
 * failure is visible from either side alone.
 *
 * The playground is named rather than discovered: it has no markdown behind it,
 * so nothing in the corpus would produce it.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Page } from './types.ts'

const STANDALONE = ['/playground/'] as const

export async function siteRoutes(
  root = path.resolve(import.meta.dirname, '..'),
): Promise<string[]> {
  let pages: Omit<Page, 'html'>[]
  try {
    pages = JSON.parse(await readFile(path.join(root, '.generated/pages.json'), 'utf8')) as Omit<
      Page,
      'html'
    >[]
  } catch {
    throw new Error('no rendered content. Run `pnpm run content` before building.')
  }

  return [...pages.map((page) => page.route), ...STANDALONE]
}
