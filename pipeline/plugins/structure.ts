/**
 * Plugins that reshape a page's structure: its title, its description, its
 * footer, and the sub-headings the generated reference does not have.
 */

import GithubSlugger, { slug } from 'github-slugger'
import type { Heading as MdHeading, Paragraph, Root, RootContent } from 'mdast'
import { toString as textOf } from 'mdast-util-to-string'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import type { VFile } from 'vfile'
import type { FooterLink } from '../types.ts'

/**
 * Lift the H1 out of the body and record it as the page title.
 *
 * Every file in the corpus opens with its H1 on line 1. The page shell renders
 * it, so leaving it in the body would print the title twice, and taking the
 * title from anywhere else would let the heading and the browser tab drift
 * apart.
 */
export const remarkExtractTitle: Plugin<[], Root> = () => (tree, file: VFile) => {
  const index = tree.children.findIndex(
    (node): node is MdHeading => node.type === 'heading' && node.depth === 1,
  )
  if (index === -1) {
    file.data.title = null
    return
  }
  file.data.title = textOf(tree.children[index])
  tree.children.splice(index, 1)
}

export interface DescriptionOptions {
  readonly override?: string | undefined
}

/** Trim to something that fits a meta description without cutting mid-word. */
function summarise(text: string): string {
  if (text.length <= 160) return text
  const sentence = text.slice(0, 160).lastIndexOf('. ')
  return sentence > 60
    ? text.slice(0, sentence + 1)
    : `${text.slice(0, text.lastIndexOf(' ', 157))}…`
}

/**
 * Lift the opening paragraph out of the body and make it the page's lead.
 *
 * The design sets the first paragraph larger than the prose that follows, as a
 * standfirst under the title. Leaving it in the body as well would print it
 * twice, so it is extracted here -- the same way the H1 is.
 *
 * The meta description is derived from it, trimmed. Two pages open with a
 * heading and have no lead to derive from; those supply one by hand rather than
 * shipping an empty meta tag.
 */
export const remarkExtractDescription: Plugin<[DescriptionOptions], Root> =
  ({ override }) =>
  (tree, file: VFile) => {
    const index = tree.children.findIndex((node): node is Paragraph => node.type === 'paragraph')
    const paragraph = index === -1 ? null : (tree.children[index] as Paragraph)

    // Only a paragraph that actually opens the page is a lead. One that follows
    // a heading belongs to that section.
    const opensThePage =
      index !== -1 && tree.children.slice(0, index).every((node) => node.type !== 'heading')

    if (paragraph && opensThePage) {
      const text = textOf(paragraph).replace(/\s+/g, ' ').trim()
      file.data.lead = text
      file.data.description = override ?? summarise(text)
      tree.children.splice(index, 1)
      return
    }

    file.data.lead = null
    file.data.description = override ?? null
  }

const FOOTER_LEAD = /^(see also|next)\s*:?\s*$/i

/**
 * Lift the "See also" / "Next" trailer out of the body.
 *
 * Five spellings of the same idea exist across the corpus. Rendering them as
 * they come would put five different-looking footers on 25 pages; extracting
 * them lets one component render all of them alike, and lets the page decide
 * where a footer belongs rather than having it wired into the prose.
 */
export const remarkExtractFooter: Plugin<[], Root> = () => (tree, file: VFile) => {
  const children = tree.children
  const last = children.at(-1)
  if (!last) return

  let from = -1
  let kind: 'see-also' | 'next' = 'see-also'

  // "## What to read next" followed by a list.
  if (last.type === 'list' && children.length >= 2) {
    const heading = children.at(-2)
    if (heading?.type === 'heading' && /what to read next/i.test(textOf(heading))) {
      from = children.length - 2
    }
  }

  // A trailing paragraph opening with "See also:" or "Next:".
  if (from === -1 && last.type === 'paragraph') {
    const lead = last.children[0]
    const leadText =
      lead?.type === 'strong' ? textOf(lead) : lead?.type === 'text' ? lead.value : ''
    const match = FOOTER_LEAD.exec(leadText.trim())
    if (match) {
      from = children.length - 1
      if (/next/i.test(match[1] ?? '')) kind = 'next'
    }
  }

  if (from === -1) return

  const links: FooterLink[] = []
  for (const node of children.slice(from)) {
    visit(node, 'link', (link) => {
      links.push({ label: textOf(link), href: link.url })
    })
  }
  if (links.length === 0) return

  children.splice(from)
  // The rule that separated the footer from the body goes with it.
  if (children.at(-1)?.type === 'thematicBreak') children.pop()

  file.data.footer = { kind, links }
}

/**
 * Give the generated reference the sub-headings it does not have.
 *
 * The reference is 1832 lines with 25 headings and no h3 at all: its only
 * sub-structure is whole-line bold paragraphs, which render as ordinary text,
 * get no anchor, and are invisible to a table of contents. Twenty of them read
 * "What a failure looks like", so the id is namespaced by the subject class it
 * sits under or the anchors collide.
 *
 * These ids are site-only and are never written back into the markdown: that
 * file is generated, and the library's tests compare it byte for byte against a
 * fresh run of its generator.
 */
export const remarkReferenceSubheadings: Plugin<[], Root> = () => (tree) => {
  // The stateful slugger numbers repeats, which is right for the h2 sections
  // and wrong for the h3s: each repeated sub-heading wants its own
  // class-prefixed id, not a running counter. Sections use the slugger,
  // sub-headings use the pure function.
  const slugger = new GithubSlugger()
  let section = ''

  for (const node of tree.children as RootContent[]) {
    if (node.type === 'heading' && node.depth === 2) {
      section = slugger.slug(textOf(node))
      continue
    }
    if (node.type !== 'paragraph' || node.children.length !== 1) continue

    const only = node.children[0]
    if (only?.type !== 'strong') continue

    const text = textOf(only)
    if (!/^[A-Z]/.test(text)) continue

    const heading = node as unknown as MdHeading
    heading.type = 'heading'
    heading.depth = 3
    heading.children = only.children
    heading.data = {
      ...heading.data,
      hProperties: { id: `${section}-${slug(text)}`, 'data-site-generated': 'true' },
    }
  }
}
