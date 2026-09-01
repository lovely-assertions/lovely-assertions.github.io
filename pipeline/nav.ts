/**
 * The sidebar, read out of docs/README.md.
 *
 * Not out of the filesystem, because the filesystem gets it wrong. The docs
 * index orders "Start here" 1-4 by hand and says to read them in that order; it
 * groups the guides under two sub-headings that alphabetical order would
 * destroy; and it files docs/guides/migrating.md under "Start here" even though
 * it lives in guides/. Following the directory tree would silently overrule the
 * author on all three.
 *
 * So the docs index is the navigation. Change it upstream and the sidebar
 * changes, with no second list in this repo to keep in step.
 */

import type { Link, Root, RootContent } from 'mdast'
import { toString as textOf } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { resolveHref, routeFor } from './routes.ts'
import type { NavGroup, NavItem } from './types.ts'

/** Headings on the docs index that are page content rather than navigation. */
const NOT_NAVIGATION = /^should you depend on this/i

const INDEX = 'docs/README.md'

/**
 * The only two things the docs index cannot say by itself.
 *
 * Both are in the Reference section, where the two links live in prose rather
 * than in a table. The prose names the big page first and then says to start
 * from the primer "if you have not before" -- which is an instruction to the
 * reader, not a sidebar order. Everything else is pure extraction, and this
 * list should stay this short: an entry here is a place where the site
 * disagrees with the source of truth.
 */
const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  '/docs/reference/': 'How to read it',
}

const GROUP_ORDER: Readonly<Record<string, readonly string[]>> = {
  Reference: ['/docs/reference/', '/docs/reference/assertions/'],
}

/**
 * Every link in a block, in reading order, keeping only those that point at a
 * documentation page.
 */
function itemsIn(node: RootContent, seen: Set<string>): NavItem[] {
  const items: NavItem[] = []

  visit(node, 'link', (link: Link) => {
    const target = resolveHref(INDEX, link.url.split('#')[0] ?? '')
    if (!target.startsWith('docs/')) return

    let mapped: ReturnType<typeof routeFor>
    try {
      mapped = routeFor(target)
    } catch {
      return
    }
    if (!mapped || mapped.route === '/docs/' || seen.has(mapped.route)) return

    seen.add(mapped.route)
    items.push({
      label: LABEL_OVERRIDES[mapped.route] ?? textOf(link),
      route: mapped.route,
      // Spread rather than assigned: `exactOptionalPropertyTypes` treats an
      // explicit `undefined` as a different thing from an absent key.
      ...(mapped.generated ? { generated: mapped.generated } : {}),
    })
  })

  return items
}

/**
 * Parse the docs index into sidebar groups.
 *
 * Runs on its own small processor rather than reusing the page render, because
 * it needs the tree before links are rewritten -- it resolves them itself, in
 * order to tell a documentation page from a link out to the changelog.
 */
export function buildNav(indexMarkdown: string): NavGroup[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(indexMarkdown) as Root

  const groups: NavGroup[] = []
  const seen = new Set<string>()
  let group: NavGroup | null = null
  let subgroup: string | null = null

  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 2) {
      const title = textOf(node)
      group = NOT_NAVIGATION.test(title) ? null : { title, items: [] }
      subgroup = null
      if (group) groups.push(group)
      continue
    }

    if (node.type === 'heading' && node.depth === 3) {
      subgroup = textOf(node)
      continue
    }

    if (!group) continue

    for (const item of itemsIn(node, seen)) {
      group.items.push(subgroup ? { ...item, subgroup } : item)
    }
  }

  for (const candidate of groups) {
    const order = GROUP_ORDER[candidate.title]
    if (!order) continue
    candidate.items.sort((left, right) => order.indexOf(left.route) - order.indexOf(right.route))
  }

  return groups.filter((candidate) => candidate.items.length > 0)
}
