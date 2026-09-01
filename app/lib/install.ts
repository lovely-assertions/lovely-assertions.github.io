/**
 * The install tool the reader has chosen.
 *
 * One piece of state for the whole page. The hero selector, the hero command
 * pill, the install band's selector and the install band's command block all
 * read it — two local copies would drift the moment someone changed one of
 * them, and the page would show `uv` in one place and `pip` in another.
 */

export type InstallTool = 'uv' | 'pip' | 'pyproject'

export const INSTALL_TOOLS: readonly InstallTool[] = ['uv', 'pip', 'pyproject']

/** What the segmented control shows for each option. */
export const TOOL_LABELS: Readonly<Record<InstallTool, string>> = {
  uv: 'uv',
  pip: 'pip',
  pyproject: 'pyproject.toml',
}

/**
 * The command, exactly as displayed and exactly as copied.
 *
 * U+2011 is deliberately absent here: these strings are copied into a terminal,
 * where a non-breaking hyphen is not a hyphen and the command fails.
 */
export const COMMANDS: Readonly<Record<InstallTool, string>> = {
  uv: 'uv add --dev lovely-assertions',
  pip: 'pip install lovely-assertions',
  pyproject: '[dependency-groups]\ndev = ["pytest>=8.4", "lovely-assertions"]',
}

/** The short form shown on the hero pill, which has one line to work with. */
export const PILL_LABELS: Readonly<Record<InstallTool, string>> = {
  uv: 'uv add --dev lovely‑assertions',
  pip: 'pip install lovely‑assertions',
  pyproject: 'dev = ["pytest>=8.4", "lovely‑assertions"]',
}

export const COPY_LABELS: Readonly<Record<InstallTool, string>> = {
  uv: 'Copy the install command',
  pip: 'Copy the install command',
  pyproject: 'Copy the pyproject.toml dependency group',
}
