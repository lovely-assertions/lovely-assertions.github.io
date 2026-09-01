/**
 * Turn the repo's relative markdown links into site routes.
 *
 * Runs on the syntax tree, never on the raw text. A regex over the source finds
 * things that look like markdown links but are Python generics -- `Expect[T]`,
 * `CollectionExpect[E, Sequence[E]]` -- and misses the badge links, whose
 * targets hide behind a nested image. Both mistakes ship broken links.
 */

import type { Image, Link, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { VFile } from 'vfile'
import { resolveHref, routeFor, UnmappedSource } from '../routes.ts'

const EXTERNAL = /^(https?:)?\/\//
const MAILTO = /^mailto:/

export interface RewriteLinksOptions {
  /** The file being rendered, repo-relative. */
  readonly repoPath: string
  /** Every file present in the fetched corpus. */
  readonly corpus: ReadonlySet<string>
  /** Repo and ref, for linking to files this site does not publish. */
  readonly source: { readonly repo: string; readonly ref: string }
}

/**
 * A file that lives in the library repo but is not a page here.
 *
 * CONTRIBUTING.md links to fuzz/README.md, which is real, useful, and not
 * something this site publishes. Failing the build would be wrong -- the link
 * is not broken -- and dropping it would lose information, so it goes to the
 * canonical copy on GitHub at the exact ref this site was built from.
 */
function githubBlob(source: RewriteLinksOptions['source'], repoTarget: string): string {
  return `https://github.com/${source.repo}/blob/${source.ref}/${repoTarget}`
}

export const remarkRewriteLinks: Plugin<[RewriteLinksOptions], Root> =
  ({ repoPath, corpus, source }) =>
  (tree, file: VFile) => {
    const broken: string[] = []
    const internal: string[] = []
    const sourceLinks: string[] = []

    visit(tree, ['link', 'image'], (node) => {
      const element = node as Link | Image
      const href = element.url

      // External and mail links pass through byte for byte: one carries a query
      // string and several carry percent-encoding that re-normalising breaks.
      if (EXTERNAL.test(href) || MAILTO.test(href)) return

      if (element.type === 'image') {
        broken.push(`${href} (a local image needs an asset copy step that does not exist)`)
        return
      }

      // A pure fragment is already a site-local anchor.
      if (href.startsWith('#')) return

      const hash = href.indexOf('#')
      const targetPath = hash === -1 ? href : href.slice(0, hash)
      const fragment = hash === -1 ? '' : href.slice(hash)
      if (!targetPath) return

      const repoTarget = resolveHref(repoPath, targetPath)

      if (!corpus.has(repoTarget)) {
        // Not fetched, so this site cannot know whether it exists. The library's
        // own test suite already proves every internal link resolves in the
        // repo, so trust that and point at the canonical copy.
        element.url = githubBlob(source, repoTarget) + fragment
        sourceLinks.push(repoTarget)
        return
      }

      let mapped: ReturnType<typeof routeFor>
      try {
        mapped = routeFor(repoTarget)
      } catch (error) {
        if (error instanceof UnmappedSource) {
          broken.push(`${href} -> ${repoTarget} (that file has no route)`)
          return
        }
        throw error
      }

      if (mapped === null) {
        element.url = githubBlob(source, repoTarget) + fragment
        sourceLinks.push(repoTarget)
        return
      }

      element.url = mapped.route + fragment
      // Marked so one delegated click handler turns these into client-side
      // navigations, with no React component needed per link.
      element.data = {
        ...element.data,
        hProperties: { ...element.data?.hProperties, 'data-internal': '' },
      }
      internal.push(element.url)
    })

    if (broken.length > 0) {
      file.fail(`broken links in ${repoPath}:\n  - ${broken.join('\n  - ')}`)
    }
    file.data.internalLinks = internal
    file.data.sourceLinks = sourceLinks
  }
