/**
 * The canonical origin, in one place and with no imports.
 *
 * Both sides need it -- the sitemap and the deploy checks at build time, every
 * canonical and `og:url` at render time -- and a second spelling is how a site
 * comes to advertise one host in its markup and another in its sitemap. No
 * imports at all here, deliberately: this file is pulled into the client bundle
 * as well as into Node scripts.
 */
export const SITE_ORIGIN = 'https://lovely-assertions.dev'

/** An absolute URL for a route, which is what every social tag needs. */
export function absolute(route: string): string {
  return `${SITE_ORIGIN}${route}`
}

/**
 * The path of the markdown twin of a route.
 *
 * Here rather than beside the code that writes those files, because the pages
 * have to advertise it in their own `<head>` and that runs in the browser --
 * importing the markdown pipeline to compute a string would pull remark into
 * the client bundle.
 *
 * A route is a directory (`/docs/guides/strings/`), and appending `.md` to a
 * directory gives `/docs/guides/strings/.md`, which is nothing. The trailing
 * slash comes off first, so the answer is what an agent would guess.
 */
export function markdownUrlFor(route: string): string {
  return route === '/' ? '/index.md' : `${route.slice(0, -1)}.md`
}
