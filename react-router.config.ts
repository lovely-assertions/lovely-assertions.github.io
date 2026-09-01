import type { Config } from '@react-router/dev/config'
import { siteRoutes } from './pipeline/site-routes.ts'

/**
 * Every page is pre-rendered to its own HTML file.
 *
 * This is not a preference. GitHub Pages serves static files and nothing else,
 * so a client-rendered app answers every deep link with a 404 status -- the
 * 404.html fallback paints a page but does not change the status -- and search
 * engines only queue 200 responses for rendering. A documentation site that
 * ships as a single-page app is structurally unindexable, one route deep.
 *
 * No `basePath`: the site is served from the apex domain, so every route is
 * absolute from `/`.
 *
 * Node APIs only in this file. The React Router CLI runs under Node -- React's
 * Bun server build has no `renderToPipeableStream` -- so anything Vite loads
 * has to work there, whatever installed the packages.
 */
export default {
  ssr: false,

  // The same list the sitemap is built from, so the two cannot disagree about
  // what this site publishes.
  prerender: () => siteRoutes(import.meta.dirname),
} satisfies Config
