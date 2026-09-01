/**
 * Make a rendered code block editable, without rebuilding it.
 *
 * The blocks are build-time Shiki markup injected as a string, so there is no
 * React tree to swap an editor into. A transparent `<textarea>` is laid over
 * the `<pre>` instead: the reader types into the textarea, and the `<pre>`
 * underneath supplies every pixel of layout. Nothing is measured or mirrored to
 * position the caret -- the two boxes are the same box, so they cannot drift.
 *
 * That also means Reset is not a re-render. The original children are detached
 * and kept, so restoring them returns the exact bytes the build produced rather
 * than a reconstruction that has to be trusted.
 *
 * Deliberately not an editor library. CodeMirror is ~70 KB better at this, and
 * every one of those kilobytes would be paid by the majority of readers who
 * only ever read. What is actually needed to edit Python is a caret, an
 * auto-indent, and a Tab that inserts spaces -- 194 of the 275 examples in the
 * corpus contain an indented line, so the auto-indent is not a nicety.
 */

/** Everything that decides where a glyph lands. */
const METRICS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'boxSizing',
  'direction',
] as const

/** Python's indent. Four spaces, as every example in the corpus uses. */
const INDENT = '    '

export interface Editor {
  readonly textarea: HTMLTextAreaElement
  /** The bytes the build produced, for Reset. */
  readonly original: string
  /** Put the block back exactly as it shipped. */
  readonly reset: () => void
}

const editors = new WeakMap<HTMLElement, Editor>()

export function editorFor(block: HTMLElement): Editor | undefined {
  return editors.get(block)
}

/**
 * Lay an editor over a block's `<pre>`, once.
 *
 * `onEdit` fires on the first change and on every one after it: the caller
 * decides what a changed block means, which is more than this module should
 * know.
 */
export function attachEditor(
  block: HTMLElement,
  onEdit: (source: string) => void,
): Editor | undefined {
  const existing = editors.get(block)
  if (existing) return existing

  const pre = block.querySelector('pre')
  if (!pre) return undefined

  const original = pre.textContent?.replace(/\n$/, '') ?? ''
  const shiki = [...pre.childNodes]

  const textarea = document.createElement('textarea')
  textarea.className = 'code-editor'
  textarea.value = original
  textarea.spellcheck = false
  textarea.autocapitalize = 'off'
  textarea.setAttribute('autocorrect', 'off')
  textarea.setAttribute('aria-label', 'Edit this example')

  const style = getComputedStyle(pre)
  for (const property of METRICS) textarea.style[property] = style[property]

  pre.append(textarea)

  /*
   * The `<pre>` stops being a tab stop the moment its editor exists.
   *
   * `rehypeCodeFocus` gives a runnable block `tabindex="0"` so that landing on
   * it opens the editor -- a landing pad, and it has done its job by the time we
   * are here. Left in place it is a keyboard trap: the textarea lives *inside*
   * the `<pre>`, a focusable ancestor precedes its descendants in sequential
   * order, so Shift+Tab out of the editor lands back on the `<pre>`, whose
   * focusin fires the redirect again. Measured: three consecutive Shift+Tab
   * presses each left `document.activeElement` as the textarea, on all 285 such
   * blocks across 30 documentation pages. WCAG 2.1.2.
   */
  const preTabIndex = pre.getAttribute('tabindex')
  pre.setAttribute('tabindex', '-1')

  block.dataset.editing = ''

  /** The reader's text, shown under the transparent editor once they type. */
  let mirrored: Text | null = null

  /**
   * Keep the `<pre>` showing what the textarea holds.
   *
   * This is what makes the box grow with the text, and it is why the colours
   * go flat on the first keystroke: the highlighted markup is dropped in favour
   * of the reader's own text. The originals are not destroyed, only detached.
   *
   * The textarea is never removed, not even for an instant. Taking a focused
   * element out of the document blurs it, so replacing the whole child list --
   * even to put the textarea straight back -- ends the reader's typing after
   * one character. Only the text beside it changes.
   */
  function mirror(): void {
    if (!pre) return

    if (!mirrored) {
      for (const node of shiki) node.remove()
      mirrored = document.createTextNode('')
      pre.insertBefore(mirrored, textarea)
    }

    // A trailing newline in a `<pre>` is collapsed, so a block ending in one
    // would have nowhere to put the caret on its last line.
    mirrored.data = textarea.value.endsWith('\n') ? `${textarea.value} ` : textarea.value
  }

  /**
   * Whether the reader has typed into this block, as opposed to passed through it.
   *
   * Only Tab reads it, and only to decide whether Tab belongs to the page or to
   * the block. What "edited" *means* is decided by the caller -- see `onEdit`.
   */
  let touched = false

  textarea.addEventListener('input', () => {
    touched = true
    mirror()
    onEdit(textarea.value)
  })

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      // Carry the current line's indentation, and open a new level after a
      // colon. Without it, writing anything with a `with` or a `def` in it
      // means counting spaces by hand.
      const upto = textarea.value.slice(0, textarea.selectionStart)
      const line = upto.slice(upto.lastIndexOf('\n') + 1)
      const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
      const deeper = /:\s*$/.test(line) ? INDENT : ''
      event.preventDefault()
      insert(textarea, `\n${indent}${deeper}`)
      return
    }

    if (event.key === 'Tab') {
      // Tab belongs to the page until the reader has typed something.
      //
      // Focus arrives here by redirect, not by choice: a keyboard reader
      // traversing the page lands on the block and is handed the editor. Taking
      // Tab from them at that moment inserts four spaces into a verified
      // example -- measured, one press flipped `data-verified` to false, marked
      // four later blocks stale and set the session dirty -- and leaves them no
      // way forward. Once they have typed, the block is theirs and Tab indents.
      //
      // Shift+Tab always leaves, in both states.
      if (event.shiftKey || !touched) return
      event.preventDefault()
      insert(textarea, INDENT)
      return
    }

    if (event.key === 'Escape') textarea.blur()
  })

  const editor: Editor = {
    textarea,
    original,
    reset() {
      // The build's own children, put back. Not re-highlighted, not rebuilt.
      pre?.replaceChildren(...shiki)
      textarea.remove()
      // The landing pad comes back with them: the block has no editor again, so
      // focus arriving on it has to be able to open one.
      if (preTabIndex === null) pre?.removeAttribute('tabindex')
      else pre?.setAttribute('tabindex', preTabIndex)
      delete block.dataset.editing
      editors.delete(block)
    },
  }

  editors.set(block, editor)
  return editor
}

/**
 * The character offset in a block at a point on screen.
 *
 * The click that opens the editor lands on the `<pre>`, and the textarea does
 * not exist yet to receive it. Without this the caret appears at the start of
 * the block and the reader has to find their place again.
 */
export function offsetAt(pre: HTMLElement, x: number, y: number): number {
  const range =
    typeof document.caretRangeFromPoint === 'function' ? document.caretRangeFromPoint(x, y) : null
  if (!range || !pre.contains(range.startContainer)) return 0

  // Sum the text before the node the point landed in.
  const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
  let offset = 0
  let node = walker.nextNode()
  while (node && node !== range.startContainer) {
    offset += node.textContent?.length ?? 0
    node = walker.nextNode()
  }
  return offset + range.startOffset
}

/**
 * Insert text at the caret, through the undo stack.
 *
 * `execCommand` is deprecated and is still the only way to write into a
 * textarea without throwing away the browser's undo history -- setting `value`
 * makes Ctrl+Z clear the whole block instead of stepping back one edit.
 */
function insert(textarea: HTMLTextAreaElement, text: string): void {
  if (!document.execCommand('insertText', false, text)) {
    const { selectionStart: start, selectionEnd: end, value } = textarea
    textarea.value = value.slice(0, start) + text + value.slice(end)
    textarea.selectionStart = textarea.selectionEnd = start + text.length
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  revealCaret(textarea)
}

/**
 * Keep the caret on screen after an insertion this module made.
 *
 * A keystroke the browser handles scrolls the caret into view by itself. One
 * inserted through `execCommand` does not -- so holding Enter walked the caret
 * off the bottom of the window and the reader carried on typing blind.
 *
 * The line is found by counting newlines rather than measured, because a
 * textarea will not report where its caret is. The block wraps, so a line can
 * occupy more than one row; counting undercounts, which errs towards scrolling
 * slightly less than needed rather than jumping past.
 */
function revealCaret(textarea: HTMLTextAreaElement): void {
  const style = getComputedStyle(textarea)
  const lineHeight = Number.parseFloat(style.lineHeight) || 22
  const line = textarea.value.slice(0, textarea.selectionStart).split('\n').length - 1
  const box = textarea.getBoundingClientRect()
  const top = box.top + Number.parseFloat(style.paddingTop) + line * lineHeight

  // A line and a half of air, so the caret is never against an edge.
  const margin = lineHeight * 1.5
  const above = top - margin
  const below = top + lineHeight + margin - window.innerHeight

  if (above < 0) window.scrollBy({ top: above, behavior: 'auto' })
  else if (below > 0) window.scrollBy({ top: below, behavior: 'auto' })
}
