/**
 * The tags every page shares, written once.
 *
 * Three route modules each hand-rolled their own head, and they had drifted:
 * the home page declared `og:type` and the documentation pages did not, none of
 * them declared `og:site_name`, `og:locale` or the image dimensions, and only
 * one carried a Twitter title. A crawler reading two pages of this site would
 * have found two different vocabularies describing the same thing.
 *
 * `og:image:width` and `og:image:height` matter more than they look: without
 * them a card is rendered small on first share, because the scraper will not
 * block on fetching the image to measure it.
 */

import { absolute, markdownUrlFor, SITE_ORIGIN } from '../../pipeline/origin.ts'

/** The one social card, drawn by `scripts/make-og-image.ts`. */
const CARD = `${SITE_ORIGIN}/og.png`
const CARD_WIDTH = '1200'
const CARD_HEIGHT = '630'

const CARD_ALT =
  'A lovely-assertions failure message: expected "unicorn" to contain "corn", but it did not.'

export interface SocialMeta {
  /** What goes in `<title>`. The card and the description use the rest. */
  readonly title: string
  /** The title as it should read on a card, without the site suffix. */
  readonly cardTitle: string
  readonly description: string
  /** The route, leading and trailing slash included. */
  readonly route: string
  /** `website` for the landing page, `article` for a documentation page. */
  readonly type: 'website' | 'article'
  /**
   * Whether this route has a markdown twin to advertise.
   *
   * True for every page built from the corpus, which is all of them but one:
   * the playground is an interpreter, not a document, and pointing an agent at
   * a `.md` that was never written is worse than pointing it nowhere.
   */
  readonly markdown?: boolean
}

/**
 * Every shared tag, in the order a reader of the built HTML would want them.
 *
 * Returns React Router's meta descriptors, so a route can spread this and then
 * append whatever is genuinely its own -- the home page's JSON-LD, say.
 */
export function socialMeta({
  title,
  cardTitle,
  description,
  route,
  type,
  markdown = true,
}: SocialMeta) {
  const url = absolute(route)

  return [
    { title },
    { name: 'description', content: description },

    { property: 'og:type', content: type },
    { property: 'og:site_name', content: 'lovely-assertions' },
    { property: 'og:locale', content: 'en' },
    { property: 'og:title', content: cardTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: CARD },
    { property: 'og:image:width', content: CARD_WIDTH },
    { property: 'og:image:height', content: CARD_HEIGHT },
    { property: 'og:image:alt', content: CARD_ALT },

    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: cardTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: CARD },
    { name: 'twitter:image:alt', content: CARD_ALT },

    { tagName: 'link', rel: 'canonical', href: url },

    // How an agent that has the HTML finds the markdown without guessing.
    // `robots.txt` and `/llms.txt` state the same rule for anything arriving
    // without a page in hand; this is the copy that travels with the page.
    ...(markdown
      ? [
          {
            tagName: 'link',
            rel: 'alternate',
            type: 'text/markdown',
            href: absolute(markdownUrlFor(route)),
            title: `${cardTitle} as markdown`,
          },
        ]
      : []),
  ]
}
