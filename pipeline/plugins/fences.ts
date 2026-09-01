/**
 * Everything that operates on fenced code blocks.
 *
 * The order these run in is load-bearing: untagged fences are normalised first
 * so the generated reference joins the same path as the hand-written pages,
 * docs-test directives are consumed before the HTML they live in is dropped,
 * and pairing runs last so it sees the normalised tags.
 */

import type { Code, Html, Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { VFile } from 'vfile'
import type { DocsTest } from '../types.ts'

/**
 * The languages the corpus uses. Anything else fails the build.
 *
 * Counted across all 37 fetched files: python 281, text 220, bash 18, toml 2,
 * markdown 2. `console` has no occurrences yet -- the library's docs harness
 * reserves it for type-checker diagnostics -- and is listed so the first page
 * to use it renders styled rather than bare.
 */
export const KNOWN_LANGUAGES = new Set(['python', 'bash', 'toml', 'console', 'text', 'markdown'])

/**
 * Give every untagged fence the `text` tag.
 *
 * The generated reference emits its captured failure messages with no language
 * tag, while the hand-written pages use `text`. Normalising here is what lets
 * the reference's examples pair up like everyone else's instead of needing a
 * special case downstream. Verified against the corpus: no untagged fence in a
 * hand-written page directly follows a python fence, so this cannot invent a
 * pairing that was not meant.
 */
export const remarkNormalizeFences: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'code', (node: Code) => {
    if (node.lang === null || node.lang === undefined) node.lang = 'text'
  })
}

const DOCS_TEST = /^<!--\s*docs-test:\s*(skip|expect-error)\s*-\s*([\s\S]*?)\s*-->$/

/**
 * Consume the `<!-- docs-test: ... -->` comments and attach them to the block
 * they describe.
 *
 * These are the only HTML in the corpus and they carry meaning a reader wants:
 * several mark code the type checker is *supposed* to reject, which is the
 * whole point of the passage around them. Raw HTML is disabled in this
 * pipeline, so without this they would be dropped silently and those sections
 * would lose their punchline.
 *
 * Matched with a regex on the raw node value rather than an HTML parser,
 * because one comment contains a bare `--`, which is invalid inside an HTML
 * comment and confuses strict parsers.
 */
export const remarkDocsTestDirectives: Plugin<[], Root> = () => (tree, file: VFile) => {
  const found: Array<{ index: number; parent: { children: unknown[] } }> = []

  visit(tree, 'html', (node: Html, index, parent) => {
    if (index === undefined || !parent) return
    const match = DOCS_TEST.exec(node.value)
    if (!match) return

    const next = parent.children[index + 1]
    if (next?.type === 'code') {
      const docsTest: DocsTest = {
        kind: match[1] as DocsTest['kind'],
        reason: match[2] ?? '',
      }
      next.data = { ...next.data, docsTest }
    }
    found.push({ index, parent: parent as unknown as { children: unknown[] } })
  })

  // Removed back to front so the earlier indices stay valid.
  for (const { index, parent } of found.reverse()) parent.children.splice(index, 1)
  file.data.docsTestDirectives = found.length
}

/**
 * Fail on a language nobody has styled.
 *
 * An unknown language falls through to an unstyled `<pre>`, which is how a
 * block ships looking different from every other block on the site without
 * anyone noticing.
 */
export const remarkCheckLanguages: Plugin<[], Root> = () => (tree, file: VFile) => {
  visit(tree, 'code', (node: Code) => {
    if (node.lang && KNOWN_LANGUAGES.has(node.lang)) return
    const line = node.position?.start.line ?? '?'
    file.fail(
      `unknown code language ${JSON.stringify(node.lang)} at line ${line}.\n` +
        `  Known: ${[...KNOWN_LANGUAGES].join(', ')}.\n` +
        '  Add it to KNOWN_LANGUAGES in pipeline/plugins/fences.ts and give it styling.',
    )
  })
}

/**
 * Join a python block to the `text` block that follows it.
 *
 * This is the project's signature and it is invisible to a generic renderer.
 * The library's test suite executes every python block and byte-compares the
 * text block after it against what the code really printed, so the pair is
 * "an example and its verified output" -- not two snippets that happen to sit
 * next to each other. Rendered as two identical code blocks, a reader has no
 * way to tell the second one is real output rather than more code, and the site
 * throws away its strongest claim.
 *
 * Pairing is strict sibling adjacency, the same rule the library's own harness
 * uses. python followed by python (a continuing session) and python followed by
 * bash must not pair; the sibling-type check handles both.
 */
export const remarkPairExamples: Plugin<[], Root> = () => (tree, file: VFile) => {
  let pairs = 0

  visit(tree, 'code', (node: Code, index, parent) => {
    if (node.lang !== 'python' || index === undefined || !parent) return
    const next = parent.children[index + 1]
    if (next?.type !== 'code' || next.lang !== 'text') return

    const docsTest = (node.data as { docsTest?: DocsTest } | undefined)?.docsTest ?? null
    parent.children.splice(index, 2, {
      type: 'verifiedExample',
      source: node.value,
      output: next.value,
      docsTest,
    })
    pairs += 1
  })

  file.data.verifiedExamples = pairs
}
