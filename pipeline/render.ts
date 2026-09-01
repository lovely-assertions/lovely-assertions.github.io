/**
 * One markdown file in, one page of HTML plus its metadata out.
 *
 * The whole pipeline runs at build time and none of it reaches the browser: a
 * reader downloads HTML that is already parsed, already highlighted and already
 * linked, with no markdown machinery behind it.
 */

import rehypeShiki from '@shikijs/rehype'
import type { Element, Root as HastRoot } from 'hast'
import type { Code, Root as MdRoot } from 'mdast'
// Imported for its side effect on the type system: it is what declares
// `hProperties` on an mdast node's `data`.
import type {} from 'mdast-util-to-hast'
import { toString as textOf } from 'mdast-util-to-string'
import rehypeAutolinkHeadings, { type Options as AutolinkOptions } from 'rehype-autolink-headings'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { rehypeCallouts, rehypeCommandTabs } from './plugins/callouts.ts'
import { rehypeCodeChrome } from './plugins/codeblocks.ts'
import {
  remarkCheckLanguages,
  remarkDocsTestDirectives,
  remarkNormalizeFences,
  remarkPairExamples,
} from './plugins/fences.ts'
import { remarkRewriteLinks } from './plugins/links.ts'
import {
  remarkExtractDescription,
  remarkExtractFooter,
  remarkExtractTitle,
  remarkReferenceSubheadings,
} from './plugins/structure.ts'
import type { Heading, RenderedPage, VerifiedExample, WorkedExample } from './types.ts'

/**
 * Descriptions the corpus cannot supply.
 *
 * There used to be ten of these, and nine of them were this site writing an
 * opening the documentation should have had: a page beginning with a heading has
 * no first paragraph to lift, and one beginning with a colon -- "Four subjects,
 * for four different types:" -- has one that reads as a fragment torn off
 * mid-thought once the design sets it apart from whatever it introduced. Those
 * nine openings were fixed upstream at 0.2.0, so the pages now describe
 * themselves and the entries are gone.
 *
 * What remains is the one file that is genuinely not a documentation page.
 * `SECURITY.md` opens on a heading because it is a policy, and rewriting it to
 * suit a standfirst would be this site editing a legal notice.
 *
 * `pipeline/build.ts` is what keeps the number honest: every description must be
 * a sentence between 50 and 160 characters, so a page that arrives with a weak
 * opening fails the build rather than quietly shipping a fragment. Adding a row
 * here is the fix of last resort -- fixing the page upstream is the first one.
 */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  'SECURITY.md':
    'How to report a vulnerability, and what lovely-assertions does on the failure path.',
}

const REFERENCE = 'docs/reference/assertions.md'

/** A one-line `class Foo:` heading. A signature, not a statement. */
const CLASS_SIGNATURE = /^class\s+\w[^\n]*:\s*$/

/**
 * Whether the browser should offer to run this block.
 *
 * Not a judgement about the interpreter -- both exclusions run *fine* in
 * Pyodide, which is the problem. A class signature raises `IndentationError`,
 * and an `expect-error` block executes cleanly while the passage around it is
 * about a type checker refusing it.
 */
function isRunnable(source: string, docsTest: string | undefined): boolean {
  if (docsTest === 'skip' || docsTest === 'expect-error') return false
  return !CLASS_SIGNATURE.test(source.trim())
}

/**
 * Record a block's position in the page's example list, on the node itself.
 *
 * `data.hProperties` survives into the emitted element, so the DOM index and
 * the `examples[]` index are written in the same pass over the same tree and
 * cannot drift. Deriving them separately is how a Run button comes to execute
 * the block above the one it sits on.
 */
function stamp(node: VerifiedExample | Code, index: number, runnable: boolean): void {
  node.data ??= {}
  const data = node.data
  data.hProperties = {
    ...(data.hProperties ?? {}),
    'data-example': String(index),
    // Every block is indexed, runnable or not: replaying a page means replaying
    // the same sequence the parity gate does, and a block that raises still
    // occupies its position in that sequence. Only the button is withheld.
    ...(runnable ? {} : { 'data-runnable': 'false' }),
  }
}

/**
 * The syntax palette, from the design.
 *
 * Only the roles the corpus actually uses are named. Every colour was checked
 * against the code surface it sits on; the comment tone in particular is
 * lighter than a conventional grey so it clears AA at 13.5px.
 */
const SYNTAX_THEME = {
  name: 'lovely-assertions',
  type: 'dark' as const,
  colors: { 'editor.background': '#3a2b39', 'editor.foreground': '#f3ecf1' },
  settings: [
    { scope: ['keyword', 'storage', 'keyword.control'], settings: { foreground: '#c9a4ff' } },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call'],
      settings: { foreground: '#ff9ecb' },
    },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#8fe3c4' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#8fd7ff' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#b9a5b6' } },
    {
      scope: ['entity.name.class', 'support.class', 'entity.name.type'],
      settings: { foreground: '#ffd79a' },
    },
  ],
}

function element(
  tagName: string,
  properties: Element['properties'],
  children: Element['children'],
) {
  return { type: 'element', tagName, properties, children } satisfies Element
}

/**
 * Render a python + text pair as one unit.
 *
 * Two panes inside one border, because they are one thought: this code, and
 * what it really printed. The source keeps its `language-python` class so the
 * highlighter picks it up; the output deliberately does not, because it is a
 * transcript rather than a listing and colouring it would suggest otherwise.
 */
function verifiedExampleHandler(_state: unknown, node: VerifiedExample): Element {
  // The source pane carries the marks as well as the figure: the chrome step
  // reads them from the pane whose bar it is building, and from there the
  // figure is not in reach.
  const marks = { ...(node.data?.hProperties ?? {}) }

  const panes: Element[] = [
    element('div', { className: ['example-source'], ...marks }, [
      element('pre', {}, [
        element('code', { className: ['language-python'] }, [{ type: 'text', value: node.source }]),
      ]),
    ]),
    element('div', { className: ['example-output'] }, [
      element('pre', {}, [{ type: 'text', value: node.output }]),
    ]),
  ]

  if (node.docsTest) {
    panes.unshift(
      element('p', { className: ['example-note'], 'data-kind': node.docsTest.kind }, [
        { type: 'text', value: node.docsTest.reason },
      ]),
    )
  }

  // The index lives on the source pane, not here. One marker per block: the
  // pane is what the chrome step reads and what a Run button finds by climbing
  // out of the bar, and a second copy on the figure only creates two answers to
  // the same question.
  return element('figure', { className: ['example'], 'data-verified': 'true' }, panes)
}

/** Every table gets a scroll container, so the page body never scrolls sideways. */
/**
 * Decide which code blocks a keyboard reader should be able to reach.
 *
 * Shiki puts `tabindex="0"` on every `<pre>` it writes, for a good reason that
 * does not apply here: it is meant to let a keyboard reader scroll a block that
 * overflows. Nothing on this site overflows -- the blocks wrap -- so on every
 * other block the attribute only creates a stop that takes a focus ring and
 * does nothing with the keys pressed on it. On the reference page that is fifty
 * of them.
 *
 * It stays where focus means something: a block with a Run, where landing on it
 * opens the editor. It goes from the rest.
 *
 * Found from the container down rather than from the `<pre>` up, because Shiki
 * rebuilds the block and the parent it hands back is not the wrapper the chrome
 * step made.
 */
function rehypeCodeFocus() {
  return (tree: HastRoot): void => {
    const editable = new Set<Element>()

    visit(tree, 'element', (node: Element) => {
      const classes = node.properties?.className
      const names = Array.isArray(classes) ? classes.map(String) : []
      if (!names.includes('code-block') && !names.includes('example-source')) return

      let runs = false
      visit(node, 'element', (child: Element) => {
        if (child.properties && 'data-run' in child.properties) runs = true
      })
      if (!runs) return

      visit(node, 'element', (child: Element) => {
        if (child.tagName === 'pre') editable.add(child)
      })
    })

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre' || !node.properties) return
      // Shiki writes the attribute in lowercase, as a string.
      if (editable.has(node)) node.properties.tabindex = '0'
      else delete node.properties.tabindex
    })
  }
}

function rehypeTableScroll() {
  return (tree: HastRoot): void => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined) return
      parent.children[index] = element(
        'div',
        // tabindex makes a scrollable region reachable by keyboard.
        { className: ['table-scroll'], tabIndex: 0 },
        [node],
      )
    })
  }
}

/**
 * Mark the tables the house style writes with blank header cells.
 *
 * Three tables have an entirely empty header row -- a row of blank `<th>` is a
 * visible defect -- and nine more have only the first cell blank, where the
 * column holds an assertion signature and needs no label.
 */
function rehypeTableShape() {
  return (tree: HastRoot): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'table') return
      const head = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'thead',
      )
      const row = head?.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'tr',
      )
      if (!row) return

      const cells = row.children.filter(
        (child): child is Element => child.type === 'element' && child.tagName === 'th',
      )
      const empty = cells.map((cell) => textOf(cell).trim() === '')
      if (empty.length > 0 && empty.every(Boolean)) {
        node.properties = { ...node.properties, 'data-headerless': 'true' }
      } else if (empty[0]) {
        node.properties = { ...node.properties, 'data-blank-lead': 'true' }
      }
    })
  }
}

/** Collect the h2/h3 set for the on-page table of contents. */
function rehypeCollectHeadings(into: Heading[]) {
  return (tree: HastRoot): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'h2' && node.tagName !== 'h3') return
      const id = node.properties?.id
      if (typeof id !== 'string') return

      const siteGenerated = node.properties?.['data-site-generated'] === 'true'
      into.push({
        depth: node.tagName === 'h2' ? 2 : 3,
        // The autolink plugin appends a link inside the heading; drop it from
        // the text the table of contents shows.
        text: textOf(node).replace(/\s+/g, ' ').trim(),
        id,
        ...(siteGenerated ? { siteGenerated } : {}),
      })
    })
  }
}

export interface RenderOptions {
  readonly repoPath: string
  readonly corpus: ReadonlySet<string>
  readonly source: { readonly repo: string; readonly ref: string }
}

export async function renderPage(
  markdown: string,
  { repoPath, corpus, source }: RenderOptions,
): Promise<RenderedPage> {
  const headings: Heading[] = []
  const examples: WorkedExample[] = []

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkNormalizeFences)
    .use(remarkDocsTestDirectives)
    .use(remarkCheckLanguages)
    .use(remarkExtractTitle)
    .use(remarkExtractDescription, { override: DESCRIPTIONS[repoPath] })
    // Links are rewritten before the footer is lifted out, or the footer's own
    // links would keep their .md targets and 404.
    .use(remarkRewriteLinks, { repoPath, corpus, source })
    .use(remarkExtractFooter)
    .use(remarkPairExamples)
    // Harvest every runnable block as data too. The playground's parity gate
    // replays these against the real library, so it reads them from this parse
    // rather than from a regex over the source.
    //
    // Unpaired blocks are collected as well, and that is not incidental: a page
    // is one session, and the block that imports `expect` often prints nothing.
    // Skip only what the docs marked as not-to-be-run, which is the same rule
    // the library's own harness applies.
    .use(() => (tree: MdRoot) => {
      visit(tree, ['verifiedExample', 'code'], (node) => {
        if (node.type === 'verifiedExample') {
          const example = node as VerifiedExample
          if (example.docsTest?.kind === 'skip') return
          const canRun = isRunnable(example.source, example.docsTest?.kind)
          stamp(example, examples.length, canRun)
          examples.push({
            repoPath,
            source: example.source,
            output: example.output,
            runnable: canRun,
          })
          return
        }
        const code = node as Code
        if (code.lang !== 'python' || code.data?.docsTest?.kind === 'skip') return
        const canRunCode = isRunnable(code.value, code.data?.docsTest?.kind)
        stamp(code, examples.length, canRunCode)
        examples.push({
          repoPath,
          source: code.value,
          output: null,
          runnable: canRunCode,
        })
      })
    })

  if (repoPath === REFERENCE) processor.use(remarkReferenceSubheadings)

  const file = await processor
    .use(remarkRehype, {
      allowDangerousHtml: false,
      handlers: { verifiedExample: verifiedExampleHandler },
    })
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      // A real link to the section, so it is reachable by keyboard and named
      // when it gets there. Hiding it from assistive technology would make the
      // CSS that reveals it on focus unreachable.
      properties: { className: ['heading-anchor'], ariaLabel: 'Link to this section' },
    } satisfies AutolinkOptions)
    // Before Shiki, which replaces the `language-*` class with its own and
    // would leave nothing to read the language from.
    .use(rehypeCodeChrome)
    .use(rehypeShiki, {
      /*
       * One theme, carrying the design's own syntax colours.
       *
       * Code surfaces are dark on both site themes, so a light/dark pair would
       * be two names for the same thing. The GitHub themes were also wrong on
       * two counts: they colour keywords pink and calls purple, which is the
       * reverse of this design, and their comment grey measures 3.3:1 on the
       * code ground -- under AA for 13.5px text, across every sample.
       */
      theme: SYNTAX_THEME,
    })
    .use(rehypeCallouts)
    // After the code chrome, which is what wraps a block into `.code-block`.
    .use(rehypeCommandTabs)
    .use(rehypeTableShape)
    .use(rehypeCodeFocus)
    .use(rehypeTableScroll)
    .use(() => rehypeCollectHeadings(headings))
    .use(rehypeStringify)
    .process({ value: markdown, path: repoPath })

  return {
    html: String(file),
    title: file.data.title ?? null,
    lead: file.data.lead ?? null,
    description: file.data.description ?? null,
    footer: file.data.footer ?? null,
    headings,
    examples,
    verifiedExamples: file.data.verifiedExamples ?? 0,
    docsTestDirectives: file.data.docsTestDirectives ?? 0,
    internalLinks: file.data.internalLinks ?? [],
    sourceLinks: file.data.sourceLinks ?? [],
  }
}
