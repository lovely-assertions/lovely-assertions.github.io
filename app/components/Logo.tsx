import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { type Motion, mountLogo } from '../lib/motion.ts'

/**
 * The mark: three dots, the wordmark, and a mint check that appears when the
 * "assertion" passes.
 *
 * The dots turn mint and swell, the letters lift in sequence, and the check
 * pops in behind them — the whole gesture is an assertion passing, which is the
 * only thing this library does. It plays once shortly after the page settles,
 * and again on hover.
 *
 * The timeline, the autoplay delay and the replay lock all live in `motion.ts`.
 * This component used to import GSAP to build them, which is what kept the
 * engine on the critical path of every page: it cannot be loaded lazily while
 * three components reach for it by name.
 */

/** U+2011: the wordmark must never break across lines. */
const WORDMARK = 'lovely‑assertions'

export function Logo({ size = 'md', to = '/' }: { size?: 'sm' | 'md'; to?: string }) {
  const root = useRef<HTMLAnchorElement>(null)
  const motion = useRef<Motion | null>(null)

  useEffect(() => {
    const element = root.current
    if (!element) return

    motion.current = mountLogo(element)
    return () => {
      motion.current?.destroy()
      motion.current = null
    }
  }, [])

  return (
    <Link
      to={to}
      className="logo"
      data-size={size}
      ref={root}
      onPointerEnter={() => motion.current?.play()}
      onFocus={() => motion.current?.play()}
      aria-label="lovely-assertions, home"
    >
      <span className="logo-dots" aria-hidden="true">
        <span data-dot="" />
        <span data-dot="" />
        <span data-dot="" />
      </span>
      <span className="logo-name">
        <span className="logo-word">
          {/* Split per character so the letters can lift in sequence. */}
          {[...WORDMARK].map((character, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed string, so position is the identity
            <span key={index} data-letter="">
              {character}
            </span>
          ))}
        </span>
        <span className="logo-check" data-check="" aria-hidden="true">
          ✓
        </span>
      </span>
    </Link>
  )
}
