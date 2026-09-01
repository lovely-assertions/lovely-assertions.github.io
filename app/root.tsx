import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from 'react-router'
import type { Route } from './+types/root'
import { ErrorPage } from './components/ErrorPage.tsx'
import { PLATFORM_SCRIPT } from './lib/platform.ts'
import { THEME_SCRIPT } from './lib/theme.ts'
import './styles/index.css'

export function Layout({ children }: { children: React.ReactNode }) {
  // The two surfaces sit on different grounds, and only the documentation has a
  // dark theme. Marking the body means an overscroll past the end of a docs
  // page shows the docs' background rather than the marketing cream.
  const { pathname } = useLocation()
  const surface = pathname === '/' ? 'marketing' : 'docs'

  return (
    // On <html>, not on <body>: the root element is the one that owns the page
    // scrollbar, and a theme-aware `scrollbar-color` written as `.docs *` could
    // never reach it. Measured on a dark docs page, the scrollbar stayed a
    // bright pink thumb on a cream track, full height, against a near-black
    // page. `body` inherits it for the overscroll background.
    <html lang="en" data-surface={surface}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* In the static head, not per-route meta: the icon is the same on all
            38 pages, and every browser asks for /favicon.ico unprompted. */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Both faces are referenced only from `@font-face` inside the bundled
            stylesheet, so without these the browser cannot ask for them until
            the stylesheet has arrived and parsed. Measured on a loopback load:
            the CSS at 8 ms, the two woff2 at 21 ms — a strictly serialised
            HTML → CSS → font chain, which is a whole extra round trip on a real
            connection, spent painting headings and every code block in the
            fallback stack. Both are same-origin and used by both surfaces, so
            neither preload is ever wasted. */}
        <link
          rel="preload"
          href="/fonts/bricolage-grotesque.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/jetbrains-mono.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Everything the stylesheet needs to know that the build could not:
            which theme this reader chose, and which modifier key they have.
            Both are stamped on <html> before the first paint, because both are
            drawn — and React cannot answer either until hydration has run. */}
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: two constant strings, and they must run before the stylesheet */}
        <script dangerouslySetInnerHTML={{ __html: `${THEME_SCRIPT}${PLATFORM_SCRIPT}` }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} />
}
