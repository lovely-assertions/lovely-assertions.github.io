/**
 * The markdown an agent gets, built from the same corpus the HTML is built from.
 *
 * Every page is published twice: once as the designed HTML a person reads, and
 * once as `.md` at the same address. The second one exists because an agent
 * asking a question about this library does not want a navigation sidebar, a
 * syntax-highlighted `<pre>` split across forty `<span>`s, or a theme script --
 * it wants the sentence. Measured over this corpus the markdown is a tenth of
 * the bytes the HTML costs, and `check-agents.ts` prints that number on every
 * run rather than leaving it as a claim in a comment.
 *
 * The links are the only thing rewritten. They have to be: the corpus is a
 * repository, so its hrefs are relative paths between files, and a fetched
 * `.md` has no repository around it to resolve them against. They go through
 * `remarkRewriteLinks` -- the same plugin the HTML uses -- so a link cannot
 * mean one thing on the page and another in the markdown beside it, and then
 * become absolute, because an agent that quotes a link has to quote one that
 * works from anywhere.
 *
 * Bodies point at the canonical HTML route rather than at another `.md`. That
 * is the URL an agent should show a person, and the header on every file says
 * how to get the markdown for it in one step.
 */

import type { Link, Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { markdownUrlFor, SITE_ORIGIN } from './origin.ts'
import { remarkRewriteLinks } from './plugins/links.ts'
import type { Page } from './types.ts'

/** All a served markdown file needs to know about the page it mirrors. */
export type MarkdownPage = Pick<Page, 'route' | 'repoPath' | 'mode' | 'title' | 'description'>

export interface MarkdownContext {
  /** Every file in the fetched corpus, so a link can be told from a dead end. */
  readonly corpus: ReadonlySet<string>
  readonly source: { readonly repo: string; readonly ref: string }
  /** ISO date of the commit the corpus was taken from. */
  readonly updated: string
}

/**
 * The two files a route's markdown is written to.
 *
 * Both, deliberately. An agent holding `…/strings/` appends `.md` and asks for
 * `…/strings/.md`; one holding `…/strings` asks for `…/strings.md`. Guessing
 * which guess to serve is a coin toss played against every agent that will ever
 * read this site, and the second copy costs a few hundred kilobytes once.
 */
export function markdownPathsFor(route: string): readonly string[] {
  // The first is the one every page advertises in its `<head>`, taken from
  // there rather than spelled again, so the file written and the file promised
  // are the same file by construction.
  const advertised = markdownUrlFor(route).slice(1)
  if (route === '/') return [advertised]
  return [advertised, `${route.replace(/^\/|\/$/g, '')}/index.md`]
}

/** Site-relative hrefs become absolute, so a quoted link works out of context. */
function absolutiseLinks() {
  return (tree: Root) => {
    visit(tree, 'link', (node: Link) => {
      if (node.url.startsWith('/')) node.url = `${SITE_ORIGIN}${node.url}`
    })
  }
}

/**
 * YAML frontmatter, quoted so a colon in a title cannot end the document.
 *
 * The set is small on purpose: what the page is, where it lives, which release
 * it describes, and where the markdown came from. `version` earns its place --
 * an agent answering about a library has to know which one it read.
 */
function frontmatter(fields: Readonly<Record<string, string>>): string {
  const lines = Object.entries(fields)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  return `---\n${lines.join('\n')}\n---\n`
}

/**
 * One page, as the markdown served at its `.md` address.
 *
 * `text` is the corpus file, not the rendered HTML: this is the same input the
 * page was built from, which is what makes the two impossible to contradict.
 */
export async function pageMarkdown(
  page: MarkdownPage,
  text: string,
  context: MarkdownContext,
): Promise<string> {
  const head = frontmatter({
    title: page.title ?? 'lovely-assertions',
    description: page.description ?? '',
    url: `${SITE_ORIGIN}${page.route}`,
    library: 'lovely-assertions',
    version: context.source.ref.replace(/^v/, ''),
    source: `https://github.com/${context.source.repo}/blob/${context.source.ref}/${page.repoPath}`,
    updated: context.updated,
  })

  // The licence is not markdown and must never enter the markdown pipeline --
  // the same rule `pipeline/build.ts` follows for the same file.
  if (page.mode === 'verbatim') return `${head}\n${text.trimEnd()}\n`

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRewriteLinks, {
      repoPath: page.repoPath,
      corpus: context.corpus,
      source: context.source,
    })
    .use(absolutiseLinks)
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      resourceLink: false,
      rule: '-',
    })
    .process(text)

  return `${head}\n${String(file).trimEnd()}\n`
}
