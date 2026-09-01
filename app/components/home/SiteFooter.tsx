import { Link } from 'react-router'

/**
 * The licence is passed in rather than typed here.
 *
 * It was typed here, it said MIT, and it went on saying MIT after the library
 * relicensed. The release knows which licence its own artifact carries; this
 * component does not, and now does not pretend to.
 */
export function SiteFooter({ licence }: { readonly licence: string }) {
  return (
    <footer className="site-foot">
      <p className="site-foot-note">
        {licence}. Written in Python, about Python, for the ten seconds after a test goes red.
      </p>
      {/* Every page the site publishes is reachable from somewhere. The three
          added here had no inbound link at all, which made them invisible to a
          crawler and to anyone not typing URLs. */}
      <nav className="site-foot-nav" aria-label="Footer">
        <Link to="/docs/">Documentation</Link>
        <Link to="/playground/">Playground</Link>
        <a href="https://github.com/lovely-assertions/lovely-assertions">GitHub</a>
        <Link to="/changelog/">Changelog</Link>
        <Link to="/license/">Licence</Link>
        <Link to="/security/">Security</Link>
      </nav>
    </footer>
  )
}
