/**
 * The animated colours, in one place.
 *
 * Everything else on this site is oklch and lives only in `tokens.css`. These
 * five are hex because they are tweened, and GSAP interpolates hex — which
 * means they have to exist in JavaScript as well as in the stylesheet.
 *
 * That is one unavoidable second spelling. It is not licence for a third: the
 * icon generator and the social-card generator each used to type the three dot
 * colours out again, so the brand lived in four files and nothing compared
 * them. `tests/design.test.ts` now asserts these values against `tokens.css`,
 * which makes the stylesheet the source and this file a checked copy of it.
 *
 * No imports, so a Node script can read it without pulling in GSAP or React.
 */

/** The colours the logo dots rest at, in order. */
export const DOT_COLOURS = ['#ea5da9', '#ad8dfd', '#e9c85e'] as const

/** The colour they tween to when the assertion passes. */
export const MINT = '#3fbe93'

export const NAV_INK = '#4e3c48'
export const NAV_INK_HOVER = '#d1519a'

/** The token each of these copies, so the test can compare them by name. */
export const TOKENS: Readonly<Record<string, string>> = {
  '--brand-pink': DOT_COLOURS[0],
  '--brand-lilac': DOT_COLOURS[1],
  '--brand-butter': DOT_COLOURS[2],
  '--brand-mint': MINT,
  '--text-nav': NAV_INK,
  '--text-nav-hover': NAV_INK_HOVER,
}
