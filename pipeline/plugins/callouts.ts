/**
 * Turn blockquotes into callouts, and adjacent command blocks into tabs.
 *
 * Both shapes exist in the documentation already; neither is marked up as
 * such, because the markdown is written for GitHub and cannot carry site
 * syntax. So the kind is inferred from what the author actually wrote, using
 * signals that are in the text rather than a convention imposed on it.
 *
 * The inference is deliberately narrow. Where a blockquote does not clearly say
 * what it is, it stays a plain note -- a wrong callout is worse than a neutral
 * one, because it tells the reader to worry about something that is not a
 * warning.
 */

import type { Element, Root } from 'hast'
import { toString as textOf } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'

export type CalloutKind = 'note' | 'careful' | 'tip'

/**
 * Which callout a blockquote is.
 *
 * `tip` — it points at the reference. Seven of the corpus's blockquotes open
 * "Full signatures: …" or send the reader to the dispatch table; they are
 * navigation help, not caution.
 *
 * `careful` — it opens with a bold clause. The author bolded the opening
 * sentence precisely because it is the thing that gets missed: "This library
 * never imports `datetime`.", "`all_satisfy` takes an inspector, not a
 * predicate.", "This file is generated."
 *
 * `note` — everything else.
 */
export function kindOf(node: Element): CalloutKind {
  const text = textOf(node as never).trim()

  if (/^(full signatures|looking for)\b/i.test(text)) return 'tip'

  const first = node.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'p',
  )
  const opensBold = first?.children[0]?.type === 'element' && first.children[0].tagName === 'strong'

  return opensBold ? 'careful' : 'note'
}

/** The label shown down the side of the callout. */
const LABELS: Readonly<Record<CalloutKind, string>> = {
  note: 'note',
  careful: 'careful',
  tip: 'tip',
}

export function rehypeCallouts() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'blockquote') return

      const kind = kindOf(node)
      node.properties = { ...node.properties, className: ['callout'], 'data-kind': kind }
      node.children = [
        {
          type: 'element',
          tagName: 'p',
          properties: { className: ['callout-label'] },
          children: [{ type: 'text', value: LABELS[kind] }],
        },
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['callout-body'] },
          children: node.children,
        },
      ]
    })
  }
}

/**
 * Group adjacent command blocks into a tabbed pair.
 *
 * Two shell blocks with nothing between them are the same instruction for two
 * tools -- `pyright tests/` then `mypy tests/`. Showing both stacked asks the
 * reader to work out that they are alternatives; tabs say it.
 *
 * Only *adjacent* blocks group. Where the documentation puts prose between two
 * commands it is explaining why you would pick one, and folding them together
 * would delete that sentence.
 */
export function rehypeCommandTabs() {
  return (tree: Root): void => {
    // Per document, so the ids are stable for a given page and unique within
    // it. A module-level counter would number them by build order instead,
    // which changes the HTML when an unrelated page is added.
    let groupCount = 0

    // The root is a parent too, and top-level code blocks are its direct
    // children -- visiting only elements never reaches them.
    const parents: Array<Root | Element> = [tree]
    visit(tree, 'element', (node: Element) => {
      parents.push(node)
    })

    for (const parent of parents) {
      const children = parent.children
      for (let index = 0; index < children.length - 1; index += 1) {
        const first = children[index]
        if (first?.type !== 'element' || !isCommandBlock(first)) continue

        // The conversion leaves a newline text node between block elements, so
        // "adjacent" means "with nothing but whitespace in between".
        let after = index + 1
        while (after < children.length && isBlank(children[after])) after += 1

        const second = children[after]
        if (second?.type !== 'element' || !isCommandBlock(second)) continue

        const tabs = [first, second].map((block) => ({
          label: commandName(block),
          block,
        }))
        // Two blocks that turn out to be the same tool are not alternatives.
        if (tabs[0]?.label === tabs[1]?.label || !tabs[0]?.label || !tabs[1]?.label) continue

        // Ids, so each tab can name its panel and each panel its tab. The
        // pattern is meaningless without them: APG's tabs require every `tab`
        // to point `aria-controls` at a `tabpanel`, and the pages shipped
        // `role="tablist"` and `role="tab"` over plain divs -- a screen reader
        // was told a tab existed and given nothing it controlled.
        const group = `tabs-${groupCount}`
        groupCount += 1
        const tabId = (position: number) => `${group}-tab-${position}`
        const panelId = (position: number) => `${group}-panel-${position}`

        children.splice(index, after - index + 1, {
          type: 'element',
          tagName: 'div',
          properties: { className: ['tabs'] },
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: {
                className: ['tab-track'],
                role: 'tablist',
                ariaLabel: 'Tool',
                // Chrome, not prose. Unmarked inside `data-pagefind-body` its
                // labels were indexed as page content.
                'data-pagefind-ignore': '',
              },
              children: tabs.map((tab, position) => ({
                type: 'element' as const,
                tagName: 'button',
                properties: {
                  type: 'button',
                  id: tabId(position),
                  role: 'tab',
                  ariaControls: [panelId(position)],
                  'data-tab': tab.label,
                  ariaSelected: position === 0 ? 'true' : 'false',
                  tabIndex: position === 0 ? 0 : -1,
                },
                children: [{ type: 'text' as const, value: tab.label }],
              })),
            },
            ...tabs.map((tab, position) => ({
              type: 'element' as const,
              tagName: 'div',
              properties: {
                className: ['tab-panel'],
                id: panelId(position),
                role: 'tabpanel',
                ariaLabelledBy: [tabId(position)],
                // The panel holds a code block, which is focusable when it is
                // runnable; where it is not, this makes the panel itself
                // reachable so its content can be read.
                tabIndex: 0,
                'data-panel': tab.label,
                // Both panels are in the HTML; the inactive one is hidden by
                // CSS, so the content is there with or without scripting.
                hidden: position === 0 ? undefined : true,
              },
              children: [tab.block],
            })),
          ],
        })
      }
    }
  }
}

/** Whitespace between two block elements, which carries no meaning here. */
function isBlank(node: Root['children'][number] | undefined): boolean {
  return node?.type === 'text' && node.value.trim() === ''
}

/** A wrapped shell block, as `rehypeCodeChrome` leaves it. */
function isCommandBlock(node: Element): boolean {
  const classes = node.properties?.className
  if (!Array.isArray(classes) || !classes.includes('code-block')) return false

  const bar = node.children.find((child): child is Element =>
    child.type === 'element' && Array.isArray(child.properties?.className)
      ? child.properties.className.includes('code-bar')
      : false,
  )
  return bar ? textOf(bar as never).trim() === 'bash' : false
}

/**
 * The tool being run, which is the first word of the command.
 *
 * Searched depth-first rather than among the direct children: the highlighter
 * replaces the `<pre>` with a fragment that wraps it, so it is no longer a
 * child of the block by the time this runs.
 */
function commandName(node: Element): string {
  let pre: Element | undefined
  visit(node, 'element', (child: Element) => {
    if (!pre && child.tagName === 'pre') pre = child
  })
  if (!pre) return ''

  const command = textOf(pre as never)
    .trim()
    .split(/\s+/)[0]
  // A path or a flag is not a tool name.
  return command && /^[a-z][\w-]*$/.test(command) ? command : ''
}
