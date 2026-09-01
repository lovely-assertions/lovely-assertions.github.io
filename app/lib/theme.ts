/**
 * Where the reader's theme choice is kept.
 *
 * One constant, in a module both sides can import. It used to be typed out
 * twice: once in `ThemeToggle`, which writes it, and once inside the blocking
 * script in `root.tsx`, which reads it. Changing one left the toggle writing to
 * a key the head script no longer read -- and the breakage only showed on the
 * *next* load, because the toggle also sets `data-theme` directly, so within a
 * session everything still looked right. The symptom would have been a white
 * flash on all 38 static pages for every reader who had chosen dark.
 *
 * `root.tsx` could not import from `ThemeToggle.tsx` -- a route module pulling a
 * constant out of a component module is how a component ends up in the head --
 * which is why the second spelling was there. This file is that missing home.
 *
 * No imports, so anything can read it: the script builder, the component, and
 * `tests/design.test.ts`, which asserts the built HTML against this value
 * rather than against a string typed a third time.
 */

export const THEME_KEY = 'la-docs-theme'

export type Theme = 'light' | 'dark'

/**
 * The script that settles the theme before the first paint.
 *
 * Built here so the key it reads is the key the toggle writes, by construction.
 * It has to run blocking, in the head, ahead of the stylesheet: every page is
 * static HTML, so without it a reader who chose dark gets a white flash on
 * every navigation.
 *
 * A stored choice wins; with none, the operating system decides. Only the
 * documentation reads the theme -- the marketing page uses tokens that do not
 * flip, so it stays light either way.
 */
export const THEME_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_KEY}');` +
  `if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}` +
  `document.documentElement.dataset.theme=t}catch(e){}`

/** What the document says it is showing, which the head script settled. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}
