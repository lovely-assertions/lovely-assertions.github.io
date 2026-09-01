/**
 * The search index, loaded on demand.
 *
 * Pagefind is generated after the site is built, so it does not exist during
 * development and must never be resolved by the bundler -- hence the ignored
 * dynamic import of an absolute URL. Nothing here runs until a reader opens
 * search, so the index costs a reader who never searches exactly nothing.
 */

export interface SearchSubResult {
  readonly url: string
  readonly title: string
  readonly excerpt: string
}

export interface SearchResult {
  readonly url: string
  readonly title: string
  readonly excerpt: string
  readonly subResults: readonly SearchSubResult[]
}

interface PagefindFragment {
  url: string
  excerpt: string
  meta: { title?: string }
  sub_results?: Array<{ url: string; title: string; excerpt: string }>
}

interface PagefindApi {
  options(config: Record<string, unknown>): Promise<void>
  debouncedSearch(
    term: string,
    options?: Record<string, unknown>,
    debounceMs?: number,
  ): Promise<{ results: Array<{ data(): Promise<PagefindFragment> }> } | null>
}

let loading: Promise<PagefindApi | null> | undefined

/**
 * Held in a variable on purpose.
 *
 * The index is written after the site is built, so neither TypeScript nor the
 * bundler can resolve this path -- and neither should try. A literal here is a
 * build error; a variable is a runtime URL.
 */
const INDEX_URL = '/pagefind/pagefind.js'

async function load(): Promise<PagefindApi | null> {
  try {
    const api = (await import(/* @vite-ignore */ INDEX_URL)) as unknown as PagefindApi
    await api.options({ excerptLength: 24 })
    return api
  } catch {
    // No index: this is a dev server, or the search step did not run. Search
    // stays inert rather than throwing at a reader.
    return null
  }
}

export function pagefind(): Promise<PagefindApi | null> {
  loading ??= load()
  return loading
}

/** Strip the trailing `index.html` Pagefind reports, so links match our routes. */
function toRoute(url: string): string {
  return url.replace(/index\.html$/, '').replace(/\.html$/, '/')
}

export async function search(term: string, limit = 8): Promise<SearchResult[]> {
  const api = await pagefind()
  if (!api) return []

  const response = await api.debouncedSearch(term)
  // A null response means a newer keystroke superseded this search.
  if (!response) return []

  const fragments = await Promise.all(response.results.slice(0, limit).map((hit) => hit.data()))

  return fragments.map((fragment) => ({
    url: toRoute(fragment.url),
    title: fragment.meta.title ?? fragment.url,
    excerpt: fragment.excerpt,
    subResults: (fragment.sub_results ?? []).slice(0, 3).map((sub) => ({
      url: toRoute(sub.url),
      title: sub.title,
      excerpt: sub.excerpt,
    })),
  }))
}
