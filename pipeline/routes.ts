/**
 * The one table that maps a file in the library repo to a URL on this site.
 *
 * It is a function rather than a hand-maintained list, so a page added to
 * docs/ appears on the site without anyone editing this repo -- the docs are
 * the source of truth, and that has to include which pages exist. What is
 * hand-maintained is the *shape*: an unrecognised path fails the build instead
 * of being silently dropped or silently published.
 */

import type { RouteEntry } from './types.ts'

/** Files that are fetched but deliberately never become a page. */
const EXCLUDED = new Set(['CLAUDE.md'])

/** Root files that get a route of their own, spelled out one by one. */
const ROOT_ROUTES = new Map<string, Omit<RouteEntry, 'repoPath' | 'section'>>([
  ['README.md', { route: '/', mode: 'extracted' }],
  ['CHANGELOG.md', { route: '/changelog/', mode: 'rendered', generated: 'git-cliff' }],
  ['CONTRIBUTING.md', { route: '/contributing/', mode: 'rendered' }],
  ['CODE_OF_CONDUCT.md', { route: '/code-of-conduct/', mode: 'rendered' }],
  ['SECURITY.md', { route: '/security/', mode: 'rendered' }],
  ['LICENSE', { route: '/license/', mode: 'verbatim' }],
])

export class UnmappedSource extends Error {
  readonly repoPath: string

  constructor(repoPath: string) {
    super(
      `${repoPath} has no route.\n` +
        '  A file reached this site that it does not know how to publish.\n' +
        '  Add it to ROOT_ROUTES or EXCLUDED in pipeline/routes.ts.',
    )
    this.name = 'UnmappedSource'
    this.repoPath = repoPath
  }
}

/**
 * The route for a repo-relative path, or null if the file is deliberately excluded.
 *
 * Order matters: the section-index rule is tried before the generic page rule,
 * or docs/reference/README.md becomes /docs/reference/README/ instead of the
 * section index.
 */
export function routeFor(repoPath: string): RouteEntry | null {
  if (EXCLUDED.has(repoPath)) return null

  const root = ROOT_ROUTES.get(repoPath)
  if (root) return { repoPath, section: 'root', ...root }

  if (repoPath === 'docs/README.md') {
    return { repoPath, route: '/docs/', mode: 'rendered', section: 'docs' }
  }

  const index = /^docs\/([^/]+)\/README\.md$/.exec(repoPath)
  if (index?.[1]) {
    return { repoPath, route: `/docs/${index[1]}/`, mode: 'rendered', section: index[1] }
  }

  const page = /^docs\/([^/]+)\/([^/]+)\.md$/.exec(repoPath)
  if (page?.[1] && page[2]) {
    const generated =
      repoPath === 'docs/reference/assertions.md' ? { generated: 'generate_reference.py' } : {}
    return {
      repoPath,
      route: `/docs/${page[1]}/${page[2]}/`,
      mode: 'rendered',
      section: page[1],
      ...generated,
    }
  }

  throw new UnmappedSource(repoPath)
}

/**
 * Resolve a relative markdown href against the page that contains it.
 *
 * Resolving before mapping is what makes the three spellings of the changelog
 * -- CHANGELOG.md, ../CHANGELOG.md and ../../CHANGELOG.md -- all land on
 * /changelog/, and what makes ../README.md from a getting-started page resolve
 * to the docs index rather than to the marketing home page.
 */
export function resolveHref(fromRepoPath: string, href: string): string {
  const segments = fromRepoPath.split('/').slice(0, -1)
  for (const part of href.split('/')) {
    if (part === '.' || part === '') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }
  return segments.join('/')
}
