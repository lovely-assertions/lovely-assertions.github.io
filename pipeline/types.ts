/**
 * The shapes that travel from the markdown corpus to a rendered page.
 *
 * The custom `verifiedExample` node is declared into mdast's own maps rather
 * than cast in at the point of use, so a plugin that mishandles it is a type
 * error instead of a runtime surprise.
 */

import type { Data as MdastData } from 'mdast'
// Imported for its side effect on the type system: it is what declares
// `hProperties` on an mdast node's `data`.
import type {} from 'mdast-util-to-hast'
import type { Data, Node } from 'unist'

/** How a source file becomes a page. */
export type RenderMode =
  /** The whole file becomes the page body. */
  | 'rendered'
  /** Parsed by the same pipeline, but only named sections are consumed by a designed page. */
  | 'extracted'
  /** Not markdown; emitted inside a single `<pre>`. */
  | 'verbatim'

export interface RouteEntry {
  /** Repo-relative path in the library repository. */
  readonly repoPath: string
  /** Site path, always with a trailing slash. */
  readonly route: string
  readonly mode: RenderMode
  /** `getting-started`, `guides`, `concepts`, `reference`, `docs` or `root`. */
  readonly section: string
  /** Set when the file is machine-written, so the page can say so. */
  readonly generated?: string
}

export interface Heading {
  readonly depth: 2 | 3
  readonly text: string
  readonly id: string
  /** True for sub-headings this site synthesised rather than the author writing. */
  readonly siteGenerated?: boolean
}

export interface FooterLink {
  readonly label: string
  readonly href: string
}

export interface PageFooter {
  /** `next` is a single forward step; `see-also` is a list of siblings. */
  readonly kind: 'see-also' | 'next'
  readonly links: readonly FooterLink[]
}

/**
 * A runnable block from the docs, and the output the library really produced.
 *
 * `output` is null for a block the page runs but quotes nothing from -- usually
 * the imports the blocks after it depend on. Those are executed and not
 * compared, exactly as the library's own docs harness treats them.
 */
export interface WorkedExample {
  readonly repoPath: string
  readonly source: string
  readonly output: string | null
  /**
   * Whether a reader can run this in the browser.
   *
   * Two kinds are excluded, and neither is a limitation of the interpreter.
   * A one-line `class Foo:` heading in the reference is a signature, not a
   * statement, and raises `IndentationError`. An `expect-error` block is there
   * because a *type checker* rejects it -- Pyodide runs it without complaint,
   * so a green result beside it would teach the opposite of the passage.
   */
  readonly runnable: boolean
}

export interface RenderedPage {
  readonly html: string
  readonly title: string | null
  /** The opening paragraph, shown as a standfirst rather than as body prose. */
  readonly lead: string | null
  readonly description: string | null
  readonly footer: PageFooter | null
  readonly headings: readonly Heading[]
  readonly examples: readonly WorkedExample[]
  readonly verifiedExamples: number
  readonly docsTestDirectives: number
  readonly internalLinks: readonly string[]
  /** Links to repo files that are not published here, sent to GitHub instead. */
  readonly sourceLinks: readonly string[]
}

export type Page = RouteEntry & RenderedPage

/** A `docs-test:` directive the library's own harness consumes. */
export interface DocsTest {
  readonly kind: 'skip' | 'expect-error'
  readonly reason: string
}

/**
 * A python example joined to the real output it produces.
 *
 * The library's test suite executes the example and byte-compares the output,
 * so the two belong together: this is not two code blocks that happen to be
 * adjacent, it is a claim and its evidence.
 */
export interface VerifiedExample extends Node {
  type: 'verifiedExample'
  source: string
  output: string
  docsTest: DocsTest | null
  /**
   * mdast's `Data`, not unist's.
   *
   * `mdast-util-to-hast` augments the mdast one with `hProperties`, which is
   * how this node carries its example index into the emitted element. A plain
   * unist `Data` here silently loses that.
   */
  data?: MdastData
}

declare module 'mdast' {
  interface RootContentMap {
    verifiedExample: VerifiedExample
  }
  interface BlockContentMap {
    verifiedExample: VerifiedExample
  }
  /** A docs-test directive rides on the code block it describes. */
  interface CodeData {
    docsTest?: DocsTest
  }
}

/** What the plugins hang off the vfile as they go. */
export interface PipelineData extends Data {
  title?: string | null
  lead?: string | null
  description?: string | null
  footer?: PageFooter | null
  verifiedExamples?: number
  docsTestDirectives?: number
  internalLinks?: string[]
  sourceLinks?: string[]
}

declare module 'vfile' {
  interface DataMap extends PipelineData {}
}

/** The committed manifest that says which repo, which ref, and what must be there. */
export interface SourceConfig {
  readonly repo: string
  readonly ref: string
  readonly include: readonly string[]
  readonly expect: {
    readonly minFiles: number
    readonly requiredPaths: readonly string[]
    readonly minLines: Readonly<Record<string, number>>
    readonly signaturePairs: number
  }
}

/** What the fetch step records about the corpus it put on disk. */
export interface CorpusMeta {
  readonly source: {
    readonly kind: 'github' | 'local'
    readonly repo: string
    readonly path: string | null
    readonly ref: string
    readonly sha: string | null
    readonly resolvedFrom?: string
    /** ISO 8601. The commit the corpus was taken from, used as `lastmod`. */
    readonly committedAt: string
  }
  readonly files: number
  readonly sha256: string
  readonly corpus: readonly string[]
}

/** One entry in the sidebar. */
export interface NavItem {
  readonly label: string
  readonly route: string
  /** The h3 the docs index filed it under, when there is one. */
  readonly subgroup?: string
  /**
   * The tool that writes this page, when one does.
   *
   * The same field `RouteEntry` carries, brought through so the sidebar's
   * "generated" badge is the pipeline's own answer. It used to be re-derived in
   * the component from a hardcoded route, and the two had already diverged:
   * `/changelog/` is generated by git-cliff and says so in its own meta line,
   * but the sidebar knew about one generated page and gave it no badge.
   */
  readonly generated?: string
}

/** One h2 section of the docs index, as a sidebar group. */
export interface NavGroup {
  readonly title: string
  readonly items: NavItem[]
}
