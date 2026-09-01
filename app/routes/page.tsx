import { data, Link } from 'react-router'
import { absolute, markdownUrlFor } from '../../pipeline/origin.ts'
import { CopyButton } from '../components/CopyButton.tsx'
import { DocBody } from '../components/DocBody.tsx'
import { DocsShell } from '../components/docs/DocsShell.tsx'
import { DocsToc } from '../components/docs/DocsToc.tsx'
import { Pager } from '../components/docs/Pager.tsx'
import { ErrorPage } from '../components/ErrorPage.tsx'
import { PencilIcon } from '../components/icons.tsx'
import { PageFooterLinks } from '../components/PageFooterLinks.tsx'
import { loadCorpusMeta, loadPage } from '../lib/content.server.ts'
import { socialMeta } from '../lib/meta.ts'
import { neighboursOf } from '../lib/nav.ts'
import type { Route } from './+types/page'

/** Roughly 220 words a minute, which is the usual reading estimate. */
function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).length
  return Math.max(1, Math.round(words / 220))
}

export async function loader({ params }: Route.LoaderArgs) {
  const splat = params['*'] ?? ''
  const route = `/${splat.replace(/^\/|\/$/g, '')}/`.replace('//', '/')

  const page = await loadPage(route)
  if (!page) throw data(`No page at ${route}`, { status: 404 })

  const meta = await loadCorpusMeta()
  return {
    page,
    // Deliberately no `nav` and no `neighbours`. Both are derived from
    // `.generated/nav.json`, which `app/lib/nav.ts` imports statically and which
    // is therefore already in the client bundle. Returning them here serialised
    // a second copy into every prerendered document -- and gave the sidebar and
    // the pager a second source for a fact the module already owned.
    version: meta.source.ref.replace(/^v/, ''),
    sourceUrl: `https://github.com/${meta.source.repo}/blob/${meta.source.ref}/${page.repoPath}`,
    minutes: readingTime(page.html),
    // The commit the corpus was taken from. Every page was last touched then,
    // and one honest date beats thirty-seven invented ones.
    updated: meta.source.committedAt,
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  // Reached for real now that this route exports an ErrorBoundary: without one
  // the nearest boundary was `root`, React Router truncated the match list
  // before running any `meta`, and a client-side 404 came out with no <title>
  // and no tags at all.
  if (!loaderData) return [{ title: 'Not found · lovely-assertions' }]
  const { page, updated, version } = loaderData
  const neighbours = neighboursOf(page.route)
  const title = page.title ?? 'lovely-assertions'
  const url = absolute(page.route)

  // The crumb trail the page already draws, said again in a form a machine can
  // read. Built from the same `neighbours` the visible one uses, so the two
  // cannot disagree about where this page sits.
  const trail = [
    { name: 'Documentation', item: absolute('/docs/') },
    ...(neighbours.current ? [{ name: neighbours.current.group, item: url }] : []),
    { name: title, item: url },
  ]

  return [
    ...socialMeta({
      title: `${title} · lovely-assertions`,
      cardTitle: title,
      description: page.description ?? '',
      route: page.route,
      type: 'article',
    }),
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'TechArticle',
            '@id': url,
            headline: title,
            description: page.description ?? '',
            url,
            inLanguage: 'en',
            // One date, from the commit this corpus was fetched at. A page has
            // no history here -- the tarball does not carry one -- and guessing
            // a per-page date would be a fabrication a crawler would believe.
            dateModified: updated,
            isPartOf: { '@type': 'WebSite', name: 'lovely-assertions', url: absolute('/') },
            about: {
              '@type': 'SoftwareSourceCode',
              name: 'lovely-assertions',
              programmingLanguage: 'Python',
              softwareVersion: version,
              codeRepository: 'https://github.com/lovely-assertions/lovely-assertions',
            },
            // The markdown twin, declared where a crawler that reads JSON-LD
            // but not `<link>` tags will still find it.
            encoding: {
              '@type': 'MediaObject',
              encodingFormat: 'text/markdown',
              contentUrl: absolute(markdownUrlFor(page.route)),
            },
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: trail.map((crumb, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: crumb.name,
              item: crumb.item,
            })),
          },
        ],
      },
    },
  ]
}

/**
 * The boundary for every documentation route.
 *
 * Exported here rather than left to `root` so that this module stays in the
 * match list when its loader throws, which is what lets its `meta()` run and
 * give the error page a title.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} />
}

export default function DocPage({ loaderData }: Route.ComponentProps) {
  const { page, version, sourceUrl, minutes } = loaderData
  const neighbours = neighboursOf(page.route)

  return (
    <DocsShell current={page.route} version={version} aside={<DocsToc headings={page.headings} />}>
      <article className="doc" data-pagefind-body>
        <nav className="docs-crumbs" aria-label="Breadcrumb">
          <Link to="/docs/" prefetch="intent">
            Docs
          </Link>
          {neighbours.current ? (
            <>
              <span aria-hidden="true">/</span>
              <span>{neighbours.current.group}</span>
            </>
          ) : null}
          <span aria-hidden="true">/</span>
          <span className="docs-crumbs-here">{page.title}</span>
        </nav>

        <h1 className="doc-title">{page.title}</h1>
        {page.lead ? <p className="doc-lead">{page.lead}</p> : null}

        {/* Chrome, not prose. Inside `data-pagefind-body` and unmarked, its
            words became page content: "min read" matched 36 of 37 pages, and a
            search for "reset" returned excerpts that opened mid-toolbar. */}
        <div className="doc-meta" data-pagefind-ignore>
          <span>{minutes} min read</span>
          {page.generated ? (
            <>
              <span aria-hidden="true">·</span>
              <span>generated by {page.generated}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          {/* The same bytes an agent would fetch from the `.md` address in the
              head of this page -- not a rendering of the DOM. What the reader
              pastes and what a crawler reads are one file. */}
          <CopyButton
            from={markdownUrlFor(page.route)}
            className="doc-copy"
            size={13}
            label="Copy for an agent — this page as markdown"
          >
            Copy for an agent
          </CopyButton>
          <span aria-hidden="true">·</span>
          <a href={sourceUrl} className="doc-edit">
            <PencilIcon size={13} />
            Edit this page
          </a>
        </div>

        {/* Keyed by route on purpose. A documentation page is one namespace
            and one set of edits, and React would otherwise reuse this instance
            across a client navigation -- carrying the previous page's edits
            into the next one, where they would be substituted into its blocks
            by index. */}
        <DocBody key={page.route} html={page.html} examples={page.examples} />

        {/* The corpus ends 27 of its 37 pages with a "See also" or "What to
            read next" trailer. `remarkExtractFooter` lifts those nodes out of
            the body so they can be styled as an affordance rather than as a
            paragraph -- but nothing rendered the result, so the links were
            being spliced out of the page and dropped. The markdown twin, built
            from the corpus text, kept them, and the two disagreed. */}
        {page.footer ? <PageFooterLinks footer={page.footer} /> : null}

        <Pager {...neighbours} />
      </article>
    </DocsShell>
  )
}
