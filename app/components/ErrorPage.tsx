import { isRouteErrorResponse } from 'react-router'

/**
 * What a reader sees when a route fails.
 *
 * The same shape `public/404.html` draws, because they are two ways into one
 * situation: that file answers a hard request GitHub Pages could not resolve,
 * this one answers a client navigation to a route that is not there. A reader
 * who trips one and then the other should not think they hit two different
 * sites.
 *
 * It used to render `<main className="shell">`, and `shell` was defined in no
 * stylesheet at all -- measured `padding: 0`, `max-width: none`, the heading
 * flush against the viewport edge. Next to the designed 404 that read as a
 * broken page rather than a handled one.
 *
 * Plain anchors, not router links: whatever went wrong is in the running app,
 * and a full document load is the point.
 */
export function ErrorPage({ error }: { readonly error: unknown }) {
  const is404 = isRouteErrorResponse(error) && error.status === 404

  return (
    <main className="error-page">
      <p className="error-page-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </p>
      <h1>{is404 ? 'No such page' : 'Something went wrong'}</h1>
      <p className="error-page-lead">
        {is404
          ? 'That page is not part of this documentation.'
          : 'An unexpected error occurred while rendering this page.'}
      </p>
      <nav className="error-page-nav" aria-label="Error recovery">
        <a href="/">Home</a>
        <a href="/docs/">Documentation</a>
        <a href="/playground/">Playground</a>
      </nav>
    </main>
  )
}
