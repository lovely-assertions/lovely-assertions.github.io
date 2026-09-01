/**
 * Facts about the release the site describes, spelled once.
 *
 * No imports, deliberately, for the same reason as `origin.ts`: this is read by
 * Node scripts at build time and pulled into the client bundle by the marketing
 * page, and anything it imported would go with it.
 *
 * These are the facts that move with a release. "No runtime dependencies" is
 * not here, because it is a design commitment rather than release metadata.
 *
 * The licence used to be filed under that same reasoning, and the reasoning was
 * wrong: it moved from MIT to MPL-2.0 at 0.2.0, and the four surfaces that had
 * each typed `MIT` by hand went on saying MIT. So it is read from the release
 * now, like the Python floor beside it, and a page can only ever name the
 * licence of the artifact it is describing.
 */

/** What the fetch step records about the wheel the playground runs. */
export interface WheelMeta {
  readonly package: string
  readonly version: string
  readonly filename: string
  readonly sha256: string
  /** PyPI's `Requires-Python`, verbatim: `>=3.13`. */
  readonly requiresPython: string
  /** PyPI's PEP 639 `License-Expression`, an SPDX identifier: `MPL-2.0`. */
  readonly licence: string | null
}

/**
 * The licences this project has published under, and how each is written out.
 *
 * A table rather than a rendering of the SPDX identifier, because the two
 * surfaces that need more than the identifier need different things: a search
 * engine wants a URL it can resolve, and a sentence wants the name a lawyer
 * would recognise.
 *
 * An identifier with no row here stops the build, the way an unmapped source
 * path does. The alternative is a page that names a licence nobody chose.
 */
const LICENCES: Readonly<Record<string, { readonly name: string; readonly url: string }>> = {
  MIT: { name: 'MIT License', url: 'https://opensource.org/license/mit' },
  'MPL-2.0': {
    name: 'Mozilla Public License 2.0',
    url: 'https://www.mozilla.org/en-US/MPL/2.0/',
  },
}

export interface Licence {
  /** The SPDX identifier, which is what a reader sees: `MPL-2.0`. */
  readonly id: string
  readonly name: string
  readonly url: string
}

/** The licence of the release this build ships, from its PyPI metadata. */
export function licenceOf(expression: string | null): Licence {
  const known = expression === null ? undefined : LICENCES[expression]
  if (!known) {
    throw new Error(
      `no licence row for ${expression ?? 'a release with no License-Expression'}.\n` +
        '  The site states the licence in the footer, in the JSON-LD and in llms.txt.\n' +
        '  Add it to LICENCES in pipeline/release.ts.',
    )
  }
  return { id: expression as string, ...known }
}

/**
 * `>=3.13` as a person reads it: `3.13+`.
 *
 * One rule, because three surfaces state this floor -- the hero badge, the
 * JSON-LD `runtimePlatform`, and the preamble of `llms.txt` -- and before this
 * each of them spelled `3.13` by hand. The next release that raises the floor
 * moves all three or none.
 *
 * An unrecognised specifier is returned as it stands. A wrong-looking string on
 * the page is a smaller failure than a confident lie.
 */
export function pythonFloor(requiresPython: string): string {
  const lower = /^>=\s*(\d+(?:\.\d+)*)$/.exec(requiresPython.trim())
  return lower?.[1] ? `${lower[1]}+` : requiresPython.trim()
}
