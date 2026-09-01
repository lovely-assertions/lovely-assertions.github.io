/**
 * Give every code block a language bar, a copy button, and -- where the block
 * can honestly be run -- a Run and a Reset.
 *
 * The markdown comes from another repository and cannot carry site markup, so
 * the chrome is added here rather than asked for upstream. The controls are
 * plain HTML; one delegated handler on the article makes all of them work,
 * which is what lets the body stay a single string of HTML instead of a React
 * tree.
 *
 * The copy payload is deliberately NOT an attribute. It used to be, and it was
 * byte-identical to the block's own text on all 294 blocks that carried it --
 * so every listing shipped twice, once as markup and once as an attribute, and
 * again inside the hydration script. Reading the text out of the block instead
 * removes that duplication, and it means a copy after an edit copies what the
 * reader is actually looking at.
 */

import type { Element, Root } from 'hast'
import { visit } from 'unist-util-visit'

function icon(paths: string[], strokeWidth: string, name: string): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['copy-button-icon'], 'data-icon': name },
    children: [
      {
        type: 'element',
        tagName: 'svg',
        properties: {
          width: 14,
          height: 14,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          ariaHidden: 'true',
        },
        children: paths.map((d) => ({
          type: 'element' as const,
          tagName: 'path',
          properties: { d },
          children: [],
        })),
      },
    ],
  }
}

function copyButton(): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: {
      type: 'button',
      className: ['copy-button'],
      'data-copy': '',
      ariaLabel: 'Copy this code',
    },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['copy-button-icons'] },
        children: [
          icon(['M9 9h11v11H9z', 'M5 15V5.5A2.5 2.5 0 0 1 7.5 3H17'], '2', 'copy'),
          icon(['M20 6 9 17l-5-5'], '2.4', 'check'),
        ],
      },
    ],
  }
}

/** A control in the bar, labelled in words rather than by an icon. */
function action(name: string, label: string, extra: Record<string, string> = {}): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: { type: 'button', className: ['code-action'], [`data-${name}`]: '', ...extra },
    children: [{ type: 'text', value: label }],
  }
}

/**
 * The bar above a block.
 *
 * Run and Reset go in here rather than into a row of their own: every block
 * already has this bar, so making a block runnable adds no layout and shifts
 * nothing on the page.
 */
function bar(language: string, runnable: boolean): Element {
  const controls: Element[] = []
  if (runnable) {
    controls.push(
      action('run', 'Run', { ariaLabel: 'Run this example in your browser' }),
      // Present from the start but inert until something has changed, so the
      // bar does not reflow the moment a reader types.
      action('reset', 'Reset', { ariaLabel: 'Restore the verified example', hidden: 'true' }),
    )
  }
  controls.push(copyButton())

  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['code-bar'],
      // Chrome, not prose. This bar sits inside `<article data-pagefind-body>`,
      // so unmarked its words -- the language label, Run, Reset, Copy -- were
      // indexed as page content: measured against the shipped index, a search
      // for "reset" matched 29 of 37 pages and "run" matched 36, and the
      // excerpt rendered for a hit opened mid-toolbar.
      'data-pagefind-ignore': '',
    },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['code-lang'] },
        children: [{ type: 'text', value: language }],
      },
      ...controls,
    ],
  }
}

/**
 * The example index the render step stamped, if this block has one.
 *
 * It arrives on the `<code>`, because that is the element remark-rehype applies
 * `data.hProperties` to. It has to be moved before Shiki runs: Shiki replaces
 * the whole `<pre>` subtree with its own markup, and anything left on the
 * original `<code>` goes with it.
 */
function exampleIndex(node: Element | undefined): string | undefined {
  const value = node?.properties?.['data-example']
  return typeof value === 'string' ? value : undefined
}

/**
 * Whether the render step marked this block as one the browser must not offer
 * to run: a class signature, or an example whose lesson is a type-checker
 * rejection. Both execute in Pyodide, which is exactly why the button is
 * withheld rather than left to fail.
 */
function blocked(node: Element | undefined): boolean {
  return node?.properties?.['data-runnable'] === 'false'
}

/** The language remark-rehype put on the `<code>`. */
function languageOf(element: Element): string {
  const classes = element.properties?.className
  const list = Array.isArray(classes) ? classes.map(String) : []
  return list.find((name) => name.startsWith('language-'))?.replace('language-', '') ?? ''
}

/**
 * Languages that get a bar.
 *
 * `text` deliberately does not: those blocks are program output, and a bar
 * offering to copy them would suggest they are code to run.
 */
const BARRED = new Set(['python', 'bash', 'toml', 'console', 'markdown'])

/**
 * Wrap standalone code blocks, and put a bar on the source pane of a paired
 * example. The output pane never gets one: it is a transcript, and offering to
 * copy it would suggest it is code to run.
 */
export function rehypeCodeChrome() {
  return (tree: Root): void => {
    // Inserting into the tree while walking it means the walker meets the same
    // <pre> again in its new position, so each block records that it has been
    // handled. Without this the visit never terminates.
    const done = new WeakSet<Element>()

    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index === undefined) return
      if (done.has(node)) return
      done.add(node)

      const inExample =
        parent.type === 'element' &&
        Array.isArray(parent.properties?.className) &&
        parent.properties.className.some(
          (name) => name === 'example-source' || name === 'example-output',
        )

      const isOutput =
        parent.type === 'element' &&
        Array.isArray(parent.properties?.className) &&
        parent.properties.className.includes('example-output')

      if (isOutput) return

      const code = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      )
      const language = (code ? languageOf(code) : '') || languageOf(node)
      if (!BARRED.has(language)) return

      // Read before Shiki replaces the <pre> subtree, and moved onto a
      // container it does not touch. A standalone block carries the marks on
      // its <code>; a paired example carries them on its source pane, because
      // that figure is built by hand rather than by the default handler.
      const marked = inExample && parent.type === 'element' ? parent : code
      const example = exampleIndex(marked)
      const runnable = language === 'python' && example !== undefined && !blocked(marked)
      const marks = example === undefined ? {} : { 'data-example': example }

      if (inExample) {
        // The pane already has a wrapper; the bar goes above the <pre> inside it.
        parent.children.splice(index, 0, bar(language, runnable))
        return
      }

      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['code-block'], ...marks },
        children: [bar(language, runnable), node],
      }
    })
  }
}
