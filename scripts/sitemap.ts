/**
 * Write the sitemap, from the same route list the build pre-renders.
 *
 * With 38 static files, no server and no way to submit anything, this is the
 * only machine-readable inventory of the site -- and the only discovery path
 * for a page nothing links to.
 *
 * It runs after the build rather than shipping from `public/`, because
 * `react-router build` clears `build/client` and would take the file with it.
 *
 * Every route is checked twice against the HTML that was actually emitted: it
 * has to exist, and something has to link to it. A sitemap that lists a page
 * which does not exist is a promise the host answers with a 404; one that is
 * the only route to a page is a page no reader will ever be shown.
 *
 * The check reads the built HTML rather than the corpus, because half the
 * site's navigation is React components -- the footer, the sidebar -- and a
 * link graph derived from the markdown alone cannot see them. That blind spot
 * is exactly how the playground, the licence and the security page came to have
 * no inbound link at all while a narrower gate in `pipeline/build.ts` passed.
 *
 * Both directions, since only one of them was ever checked. Orphans are pages
 * nothing links to; dead links are the reverse, and they are the more likely
 * failure here -- a component that spells a route by hand keeps spelling it
 * after the corpus renames the page, and the result is a 404 on the busiest
 * page of the site with nothing in the build going red.
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { ROOT, readCorpusMeta } from '../pipeline/corpus.ts'
import { SITE_ORIGIN } from '../pipeline/origin.ts'
import { siteRoutes } from '../pipeline/site-routes.ts'

const BUILD = path.join(ROOT, 'build/client')

/**
 * How much of the site each route is worth, relative to the rest.
 *
 * Deliberately coarse. `priority` is a hint about this site's own shape, not a
 * ranking signal, and inventing five decimal places of it is superstition.
 */
function priority(route: string): string {
  if (route === '/') return '1.0'
  if (route === '/docs/') return '0.9'
  if (route.startsWith('/docs/')) return '0.8'
  if (route === '/playground/') return '0.8'
  return '0.5'
}

async function main(): Promise<void> {
  const routes = await siteRoutes()
  const meta = await readCorpusMeta()

  // The corpus is pinned at one commit, so every documentation page was last
  // touched then. A date per page would need per-file history the tarball does
  // not carry, and inventing one is worse than one honest date.
  const lastmod = meta.source.committedAt.slice(0, 10)

  const missing: string[] = []
  for (const route of routes) {
    try {
      await access(path.join(BUILD, route, 'index.html'))
    } catch {
      missing.push(route)
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n  the sitemap would list pages that were not built:\n  - ${missing.join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  // Every site-relative href the built pages actually carry, and which page
  // carries it -- the page is what makes a dead link findable.
  const linked = new Set<string>()
  const carried = new Map<string, string>()
  for (const route of routes) {
    const html = await readFile(path.join(BUILD, route, 'index.html'), 'utf8')
    for (const match of html.matchAll(/href="(\/[^"#?]*)/g)) {
      const href = match[1]
      if (!href) continue
      linked.add(href.endsWith('/') ? href : `${href}/`)
      if (!carried.has(href)) carried.set(href, route)
    }
  }

  // The landing page is reached by the domain itself, so nothing has to link it.
  const orphans = routes.filter((route) => route !== '/' && !linked.has(route))
  if (orphans.length > 0) {
    console.error(
      `\n  nothing on the site links to these, so no reader and no crawler ` +
        `reaches them:\n  - ${orphans.join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  // And the other way. An href with an extension names a file; anything else
  // names a route, and a route is a directory with an index.html in it.
  const known = new Set(routes)
  const dead: string[] = []
  for (const [href, from] of carried) {
    const named = path.posix.basename(href).includes('.')
    if (named) {
      try {
        await access(path.join(BUILD, href))
      } catch {
        dead.push(`${href} (linked from ${from}) -- no such file`)
      }
      continue
    }
    const target = href.endsWith('/') ? href : `${href}/`
    if (!known.has(target)) dead.push(`${href} (linked from ${from}) -- no such page`)
  }

  if (dead.length > 0) {
    console.error(
      `\n  these links go nowhere, so a reader following them gets a 404:\n  - ${dead.join('\n  - ')}\n`,
    )
    process.exit(1)
  }

  const body = routes
    .map(
      (route) =>
        `  <url>\n` +
        `    <loc>${SITE_ORIGIN}${route}</loc>\n` +
        `    <lastmod>${lastmod}</lastmod>\n` +
        `    <priority>${priority(route)}</priority>\n` +
        `  </url>`,
    )
    .join('\n')

  await writeFile(
    path.join(BUILD, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    'utf8',
  )

  console.log(
    `\n  sitemap: ${routes.length} routes, last modified ${lastmod}` +
      `\n  every route was built, and every route is linked from another page` +
      `\n  and all ${carried.size} links the built pages carry land on something real\n`,
  )
}

await main()
