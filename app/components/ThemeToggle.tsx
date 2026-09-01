import { useEffect, useState } from 'react'
import { currentTheme, THEME_KEY, type Theme } from '../lib/theme.ts'
import { MoonIcon, SunIcon } from './icons.tsx'

/**
 * Light or dark, remembered.
 *
 * Both icons ship, and CSS picks between them from the `data-theme` the head
 * script has already written on `<html>`. That is the whole point: the pages are
 * static HTML shared by every reader, so React cannot render one reader's
 * preference into them -- it starts at `light` and can only correct itself once
 * hydration has run. Measured on a throttled connection, the sun icon sat on a
 * fully dark page for the entire three-second sample and the moon never
 * appeared. The stylesheet has the answer before the first paint; React does
 * not, so the stylesheet draws the icon.
 *
 * The state that remains is only for `aria-pressed`, which is honest: before
 * hydration this button does nothing at all, so there is no window in which a
 * stale `aria-pressed` could mislead anyone about a control that works.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => setTheme(currentTheme()), [])

  function toggle(): void {
    // Read from the document rather than from state: the document is what the
    // head script settled and what the stylesheet is drawing from, so it cannot
    // disagree with what the reader is looking at.
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // A browser refusing storage still gets the visual change.
    }
  }

  return (
    <button
      type="button"
      className="docs-theme-toggle"
      onClick={toggle}
      aria-label="Toggle light or dark theme"
      // Null until hydration, so the attribute is absent rather than wrong.
      aria-pressed={theme === null ? undefined : theme === 'dark'}
    >
      <span className="docs-theme-icon" data-icon="sun">
        <SunIcon size={15} />
      </span>
      <span className="docs-theme-icon" data-icon="moon">
        <MoonIcon size={15} />
      </span>
    </button>
  )
}
