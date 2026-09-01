import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { navLinkEnter, navLinkLeave, setNavbarScrolled } from '../lib/motion.ts'
import { Logo } from './Logo.tsx'

/**
 * The marketing navbar.
 *
 * Transparent at rest, so the page halo shows through it. Past 18px of scroll a
 * translucent cream plate fades in, a gradient hairline draws itself from the
 * left, the row tightens from 24px of padding to 13px, and the logo dots hop.
 *
 * Each direction has its own tweens rather than one timeline played backwards:
 * the hairline retracts in half the time it takes to draw, and the dots hop
 * only on the way in.
 */

const SCROLLED_AT = 18

/**
 * Three destinations of three kinds, and the kind decides the element.
 *
 * A route gets a router link, so following it keeps the app it is already
 * running instead of tearing it down and fetching every chunk again. The
 * fragment stays an anchor because it does not leave the page -- the browser's
 * own same-document scroll is what should happen, not a navigation. The
 * external one has no choice.
 */
const LINKS = [
  { label: 'Docs', href: '/docs/', kind: 'route' },
  { label: 'Install', href: '/#install', kind: 'fragment' },
  { label: 'GitHub', href: 'https://github.com/lovely-assertions/lovely-assertions', kind: 'away' },
] as const

export function MarketingHeader() {
  const header = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = header.current
    if (!element) return

    // Deliberately not `false`: the first call has to settle the header
    // whichever way the page loads, including a reload part-way down.
    let scrolled: boolean | null = null

    const onScroll = () => {
      const past = window.scrollY > SCROLLED_AT
      if (past === scrolled) return
      scrolled = past
      element.toggleAttribute('data-scrolled', past)
      setNavbarScrolled(element, past)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    // No `gsap.context` around this any more. It existed to revert the inline
    // styles these tweens write, and the only thing that unmounts this header
    // is leaving the marketing page -- which takes the element with it. Keeping
    // it meant importing the engine here, which is what pinned GSAP to the
    // critical path of every page on the site.
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className="site-head" ref={header}>
      <span className="site-head-plate" data-plate="" aria-hidden="true" />
      <span className="site-head-line" data-line="" aria-hidden="true" />
      <div className="site-head-row" data-row="">
        <Logo />
        <nav className="site-head-nav" aria-label="Main">
          {LINKS.map((link) => {
            // The same four handlers whichever element it is: `Link` forwards
            // them to the anchor it renders, so the hover animation does not
            // know the difference.
            const motion = {
              onPointerEnter: (event: React.PointerEvent<HTMLAnchorElement>) =>
                navLinkEnter(event.currentTarget),
              onPointerLeave: (event: React.PointerEvent<HTMLAnchorElement>) =>
                navLinkLeave(event.currentTarget),
              onFocus: (event: React.FocusEvent<HTMLAnchorElement>) =>
                navLinkEnter(event.currentTarget),
              onBlur: (event: React.FocusEvent<HTMLAnchorElement>) =>
                navLinkLeave(event.currentTarget),
            }

            return link.kind === 'route' ? (
              <Link key={link.href} to={link.href} {...motion}>
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} {...motion}>
                {link.label}
              </a>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
