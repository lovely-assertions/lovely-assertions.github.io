/**
 * Which modifier key this reader actually has.
 *
 * The search shortcut is `⌘K` on a Mac and `Ctrl+K` everywhere else, and the
 * handler has always accepted both. Only the label was wrong: every one of the
 * 38 prerendered pages carried a literal `⌘K`, so every Windows and Linux
 * reader was shown a key their keyboard does not have, for a shortcut that
 * would have worked had they been told the right one.
 *
 * Stamped by a blocking script rather than corrected in an effect, for the same
 * reason the theme is: this is a fact a static build cannot know, the stylesheet
 * can act on it before the first paint, and React cannot act on it until
 * hydration has run. Both glyphs ship; CSS picks one.
 *
 * `userAgentData.platform` where it exists, `navigator.platform` behind it --
 * deprecated, still the only thing Safari and Firefox answer with.
 */
export const PLATFORM_SCRIPT =
  `try{var p=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||'';` +
  `if(/mac|iphone|ipad|ipod/i.test(p))document.documentElement.dataset.platform='mac'}catch(e){}`
