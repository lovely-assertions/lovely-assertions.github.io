import navGroups from '../../.generated/nav.json' with { type: 'json' }
import type { NavGroup, NavItem } from '../../pipeline/types.ts'

/**
 * The sidebar, built at build time from the documentation index.
 *
 * Imported as JSON so it is part of the module graph: a build cannot succeed
 * with a navigation that failed to generate.
 *
 * That import is also why nothing here belongs in a loader. The whole list is
 * already in the client bundle, unconditionally, because the search overlay and
 * the home page call `flatPages()` in the browser. A loader returning it would
 * only serialise a second copy into every prerendered document -- measured at
 * roughly 190 KB across the 38 routes, for bytes the browser has already parsed
 * out of a JS chunk.
 */
const GROUPS = navGroups as NavGroup[]

export function buildNav(): NavGroup[] {
  return GROUPS
}

export interface FlatPage extends NavItem {
  /** The sidebar group it belongs to, for the breadcrumb. */
  readonly group: string
}

/**
 * One flat list, in reading order.
 *
 * The sidebar, the breadcrumb and the pager all read this, so they cannot
 * disagree about what comes next or which group a page is in.
 *
 * Flattened once. It is derived from a frozen JSON import, so rebuilding it per
 * render would produce an identical array with a new identity -- which is all it
 * takes to defeat a memo downstream.
 */
const FLAT: FlatPage[] = GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title })),
)

export function flatPages(): FlatPage[] {
  return FLAT
}

export interface Neighbours {
  readonly previous: FlatPage | null
  readonly next: FlatPage | null
  readonly current: FlatPage | null
}

export function neighboursOf(route: string): Neighbours {
  const pages = flatPages()
  const at = pages.findIndex((page) => page.route === route)
  if (at === -1) return { previous: null, next: null, current: null }

  return {
    previous: pages[at - 1] ?? null,
    next: pages[at + 1] ?? null,
    current: pages[at] ?? null,
  }
}
