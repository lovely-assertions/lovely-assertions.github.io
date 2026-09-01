import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import type { WorkedExample } from '../../pipeline/types.ts'
import { copyText } from '../lib/clipboard.ts'
import { attachEditor, editorFor, offsetAt } from '../lib/editExample.ts'
import { acknowledgeCopy, buildBootProgress, scrollToAnchor } from '../lib/motion.ts'
import { markEdited, sessionState, subscribe } from '../lib/pythonSession.ts'
import { runExample } from '../lib/runExample.ts'

/**
 * The rendered markdown body.
 *
 * The HTML is built at build time, so it is injected rather than rebuilt into
 * React elements: parsing markdown in the browser would ship a parser, a
 * highlighter and a theme to every reader to reproduce bytes that are already
 * final.
 *
 * One delegated click handler turns every internal link into a client-side
 * navigation. Doing it here rather than with a React component per link is what
 * lets the body stay a plain string.
 */
/**
 * Show the panel a tab names, and hide its siblings.
 *
 * Both panels ship in the HTML, so the content is present with or without
 * scripting; this only changes which one is visible.
 */
function selectTab(button: HTMLElement): void {
  const group = button.closest('.tabs')
  const label = button.dataset.tab
  if (!group || !label) return

  for (const other of group.querySelectorAll<HTMLElement>('[data-tab]')) {
    const selected = other === button
    other.setAttribute('aria-selected', String(selected))
    other.tabIndex = selected ? 0 : -1
  }
  for (const panel of group.querySelectorAll<HTMLElement>('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== label
  }
}

/**
 * The code a control in a bar belongs to.
 *
 * The bar sits either directly above its `<pre>` inside a `.code-block`, or
 * inside the `.example-source` pane of a verified example. Both shapes put the
 * block in the same container as the bar, so one lookup covers them.
 */
function sourceOf(control: HTMLElement): string {
  const block = control.closest('.code-block, .example-source')
  // The editor holds exactly what the reader typed. The `<pre>` under it holds
  // a copy with one space appended when the text ends in a newline, because a
  // `<pre>` swallows a trailing one and the caret would have nowhere to sit --
  // and that space would otherwise be handed to the clipboard.
  const editor = block?.querySelector('textarea.code-editor')
  if (editor instanceof HTMLTextAreaElement) return editor.value
  return block?.querySelector('pre')?.textContent?.replace(/\n$/, '') ?? ''
}

/** A block the reader has changed, and the element it was changed on. */
interface Edit {
  readonly source: string
  readonly block: HTMLElement
}

/**
 * Where a result belongs.
 *
 * A verified example puts it inside the figure, beside the quoted output; a
 * standalone block puts it inside the block. Looking it up and appending it
 * must use the same root -- searching one and appending to the other means the
 * second run cannot find the first run's pane, and quietly adds another.
 */
function paneRoot(container: HTMLElement): HTMLElement {
  return container.closest<HTMLElement>('.example') ?? container
}

/** The reader's result: a sibling of the quoted output, never in place of it. */
function resultPane(container: HTMLElement): HTMLElement {
  const root = paneRoot(container)
  const existing = root.querySelector<HTMLElement>(':scope > .example-result')
  if (existing) return existing

  const pane = document.createElement('div')
  pane.className = 'example-result'
  // The quoted pane is the CI claim. This one is the reader's, and it says so
  // even to someone who cannot see which is which.
  pane.setAttribute('role', 'status')
  root.append(pane)
  return pane
}

/** Say what happened, in the vocabulary the outcome deserves. */
function render(pane: HTMLElement, state: string, label: string, text: string): void {
  pane.dataset.state = state
  pane.replaceChildren()

  const caption = document.createElement('p')
  caption.className = 'example-result-label'
  caption.textContent = label
  pane.append(caption)

  if (text) {
    const listing = document.createElement('pre')
    listing.textContent = text
    pane.append(listing)
  }
}

/**
 * Every runnable block on the page, in document order.
 *
 * The indices on them are positions in the page's example list, so this is how
 * a block index becomes a DOM node when an edit has to reach the blocks below.
 */
function blocksIn(body: HTMLElement): HTMLElement[] {
  // Only blocks that can run. A class signature has no Run and cannot depend on
  // anything, so telling a reader it "depends on an edit above" is nonsense on
  // the twenty of them in the reference.
  return [...body.querySelectorAll<HTMLElement>('[data-example]')].filter((block) =>
    block.querySelector('[data-run]'),
  )
}

/** What each outcome is called, from the reader's side. */
const LABELS: Record<string, string> = {
  printed: 'Your run',
  failure: 'Your run — the assertion failed, which is the message being shown',
  raised: 'Your run raised',
  unavailable: 'Could not run',
}

/**
 * What the first press costs, said plainly.
 *
 * Nothing about Python is fetched until this moment -- not on page load, not on
 * a hover -- so the reader has just asked for a six megabyte download without
 * being told. Telling them, once, is the least this can do.
 */
const BOOTING = 'Starting Python — about 6 MB, once for the whole site'

/** An indeterminate bar, so the wait looks like progress rather than a stall. */
function showBooting(pane: HTMLElement): () => void {
  render(pane, 'booting', BOOTING, '')

  const track = document.createElement('span')
  track.className = 'example-progress'
  const bar = document.createElement('span')
  track.append(bar)
  pane.append(track)

  return buildBootProgress(bar)
}

export function DocBody({
  html,
  examples,
}: {
  readonly html: string
  /** The page's blocks, as the build verified them. The prefix is replayed from here. */
  readonly examples: readonly WorkedExample[]
}) {
  const navigate = useNavigate()

  /**
   * One live region for the copy buttons the pipeline injects.
   *
   * `CopyButton` carries its own, but the buttons inside the rendered body are
   * plain HTML in a string and have no component to hang one off. Without this
   * a screen reader hears nothing at all when a code block is copied -- the
   * icon swap is two `aria-hidden` glyphs and `data-copied` is a CSS hook.
   */
  const announcer = useRef<HTMLParagraphElement>(null)

  /**
   * What the reader has changed on this page, by block index.
   *
   * Per page, and it has to be: an index means nothing outside the page it was
   * taken from. The route key on this component is what guarantees it, and this
   * is the state that made it necessary.
   */
  const edits = useRef(new Map<number, Edit>())

  /**
   * The edits still standing, dropping any whose block has left the page.
   *
   * The route key gives each page its own instance, which covers moving to
   * another page. It does not cover arriving at the page you are already on --
   * a Back, or the sidebar link for the current page -- where React keeps the
   * instance and re-injects the body's HTML in place. The blocks are rebuilt
   * without their editors, so the edit becomes invisible and unresettable while
   * the map still holds it and Run still executes it.
   *
   * Asking the element whether it is still in the document settles that without
   * depending on when React re-renders or on whether a prop kept its identity.
   * Both turned out to be the wrong thing to watch.
   */
  const live = useCallback((): ReadonlyMap<number, string> => {
    const kept = new Map<number, string>()
    for (const [index, edit] of edits.current) {
      if (edit.block.isConnected) kept.set(index, edit.source)
      else edits.current.delete(index)
    }
    return kept
  }, [])

  /**
   * Withdraw the CI claim on a block, and warn the ones that depend on it.
   *
   * On the first keystroke, not on Run: the claim stops being true the moment
   * the code differs from what was verified, and waiting for a result would
   * leave the page asserting something it no longer knows.
   *
   * The blocks below go stale rather than wrong. A page is one namespace, so
   * editing block three changes what block seven prints -- and a reader who
   * scrolls down and runs block seven would otherwise be reading the result of
   * an edit they have forgotten making.
   */
  const withdraw = useCallback((container: HTMLElement, index: number) => {
    markEdited()
    // Every marker of "edited" is written here and cleared in `restore`, so the
    // two are one decision. `data-edited` used to be latched inside the editor
    // on the first keystroke and cleared here, which meant a block typed back to
    // its original and then edited again lost its "· edited" badge for the rest
    // of the visit while every other marker returned.
    container.dataset.edited = ''
    container.closest('.example')?.setAttribute('data-verified', 'false')

    const reset = container.querySelector<HTMLElement>('[data-reset]')
    if (reset) reset.hidden = false

    const body = container.closest<HTMLElement>('.doc-body')
    if (!body) return
    for (const block of blocksIn(body)) {
      if (Number(block.dataset.example) > index) block.dataset.stale = ''
    }
  }, [])

  /**
   * Give a block its claim back.
   *
   * Reached two ways, and they mean the same thing: Reset, and typing the code
   * back to what the build shipped. The claim was withdrawn because the code
   * differed; when it stops differing the claim is true again, and leaving a
   * block marked edited when it is identical says the page cannot tell.
   *
   * Blocks below stay stale only if something above them is still edited.
   */
  const restore = useCallback((container: HTMLElement) => {
    delete container.dataset.edited
    container.closest('.example')?.setAttribute('data-verified', 'true')

    const reset = container.querySelector<HTMLElement>('[data-reset]')
    if (reset) reset.hidden = true

    const body = container.closest<HTMLElement>('.doc-body')
    if (!body) return
    const earliest = Math.min(...edits.current.keys(), Number.POSITIVE_INFINITY)
    for (const block of blocksIn(body)) {
      if (Number(block.dataset.example) > earliest) block.dataset.stale = ''
      else delete block.dataset.stale
    }
  }, [])

  const execute = useCallback(
    async (button: HTMLElement) => {
      const container = button.closest<HTMLElement>('[data-example]')
      const index = Number(container?.dataset.example)
      if (!container || Number.isNaN(index)) return

      const pane = resultPane(container)
      button.setAttribute('disabled', '')

      // Two waits, and they are nothing alike: the first press of the visit
      // fetches a runtime, and every press after it is a few milliseconds. A
      // reader told "Running…" for six megabytes concludes the site is broken.
      let stopBar = () => {}
      let unsubscribe = () => {}
      if (sessionState().booted) {
        render(pane, 'running', 'Running…', '')
      } else {
        stopBar = showBooting(pane)
        unsubscribe = subscribe((session) => {
          if (!session.booted) return
          stopBar()
          render(pane, 'running', 'Running…', '')
          unsubscribe()
        })
      }

      const result = await runExample(examples, index, live())
      stopBar()
      unsubscribe()
      button.removeAttribute('disabled')

      const label =
        result.matched === true
          ? 'Your run — identical to the output above'
          : result.text === '' && result.outcome === 'printed'
            ? // A caption over an empty box says nothing. Nine runnable blocks
              // on this site print nothing at all, and for them "it printed
              // nothing" is the whole result.
              'Your run — nothing printed, so every assertion passed'
            : (LABELS[result.outcome] ?? 'Your run')
      render(pane, result.outcome, label, result.text)
    },
    [examples, live],
  )

  /**
   * Put an editor over a block, without taking the interaction away.
   *
   * Called on approach -- a pointer entering the block, or focus landing on it
   * -- rather than on the press. That ordering is the whole point: by the time
   * a reader presses, the textarea is already the element under the pointer, so
   * the browser runs its own selection drag. Attaching on the press instead
   * meant cancelling that press to steal the caret, and a first drag across a
   * block then selected nothing at all.
   *
   * Only on a block that offers a Run: one that cannot execute an edit has no
   * use for one.
   */
  const prepare = useCallback(
    (target: HTMLElement): HTMLTextAreaElement | null => {
      // The reader's own result sits inside the block on a standalone listing,
      // and its <pre> is not the source. Editing it would type into the code.
      if (target.closest('.example-result')) return null

      const pre = target.closest('pre')
      const container = pre?.closest<HTMLElement>('[data-example]')
      if (!pre || !container?.querySelector('[data-run]')) return null

      const existing = editorFor(container)
      if (existing) return existing.textarea

      const index = Number(container.dataset.example)
      const editor = attachEditor(container, (source) => {
        // Typed back to what the build shipped: the claim was only withdrawn
        // because the code differed, so it comes back with the code.
        if (source === editor?.original) {
          edits.current.delete(index)
          restore(container)
          return
        }
        edits.current.set(index, { source, block: container })
        withdraw(container, index)
      })
      return editor?.textarea ?? null
    },
    [withdraw, restore],
  )

  /**
   * Say something, once, and clear it.
   *
   * The clear matters: copying the same block twice writes the same string, and
   * a live region whose text does not change announces nothing the second time.
   */
  const announce = useCallback((message: string) => {
    const region = announcer.current
    if (!region) return
    region.textContent = ''
    requestAnimationFrame(() => {
      region.textContent = message
    })
  }, [])

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Let the browser handle anything that is not a plain left click, so
      // open-in-new-tab and its keyboard equivalents keep working.
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement

      // The copy buttons are plain HTML inside the rendered body, so they are
      // handled here rather than by a component per block.
      const copy = target.closest<HTMLElement>('[data-copy]')
      if (copy) {
        event.preventDefault()
        // Read from the block rather than from an attribute holding a second
        // copy of it. The listing then ships once instead of twice, and a copy
        // after an edit hands over what the reader is actually looking at.
        copyText(sourceOf(copy))
        // Acknowledge on the click, not on the clipboard promise: a denied
        // write should still look like something happened.
        acknowledgeCopy(copy)
        announce('Copied')
        return
      }

      const run = target.closest<HTMLElement>('[data-run]')
      if (run) {
        event.preventDefault()
        void execute(run)
        return
      }

      const reset = target.closest<HTMLElement>('[data-reset]')
      if (reset) {
        event.preventDefault()
        const container = reset.closest<HTMLElement>('[data-example]')
        if (!container) return
        editorFor(container)?.reset()
        edits.current.delete(Number(container.dataset.example))
        paneRoot(container).querySelector(':scope > .example-result')?.remove()
        restore(container)
        return
      }

      // Tab tracks are plain HTML in the rendered body, so switching panels is
      // handled here rather than by a component per group.
      const tab = target.closest<HTMLElement>('[data-tab]')
      if (tab) {
        event.preventDefault()
        selectTab(tab)
        return
      }

      // A finger never hovers, so its tap is the first the block hears of it.
      // A mouse has already been given an editor by the time it presses, so
      // this finds one and returns it.
      const textarea = prepare(target)
      if (textarea && document.activeElement !== textarea) {
        textarea.focus()
        const caret = offsetAt(textarea, event.clientX, event.clientY)
        textarea.setSelectionRange(caret, caret)
        return
      }

      const link = target.closest('a')
      if (!link) return

      // A heading's own anchor. Left to the browser it jumps; the contents rail
      // scrolls to the same heading, and the two should not disagree.
      const fragment = link.getAttribute('href')
      if (fragment?.startsWith('#')) {
        const heading = document.getElementById(fragment.slice(1))
        if (!heading) return
        event.preventDefault()
        scrollToAnchor(heading)
        // See DocsToc: `null` here destroys React Router's history state.
        history.replaceState(history.state, '', fragment)
        return
      }

      if (!link.hasAttribute('data-internal')) return

      event.preventDefault()
      void navigate(link.getAttribute('href') ?? '/')
    },
    [navigate, execute, prepare, restore, announce],
  )

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return

    const current = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]')
    const group = current?.closest('.tabs')
    if (!current || !group) return

    const buttons = [...group.querySelectorAll<HTMLElement>('[data-tab]')]
    const next = buttons[(buttons.indexOf(current) + step + buttons.length) % buttons.length]
    if (!next) return

    event.preventDefault()
    selectTab(next)
    next.focus()
  }, [])

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the handler intercepts clicks on links inside, it does not make the div interactive */}
      <div
        className="doc-body"
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerOver={(event) => prepare(event.target as HTMLElement)}
        onFocusCapture={(event) => {
          // A keyboard reader lands on the block itself; hand them the editor
          // with the caret at the start, which is the only place a keyboard
          // arrival can sensibly put it.
          const target = event.target as HTMLElement
          if (target.tagName !== 'PRE') return
          const textarea = prepare(target)
          if (!textarea) return
          textarea.focus()
          textarea.setSelectionRange(0, 0)
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time HTML from the library's own markdown, with raw HTML disabled in the pipeline
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p ref={announcer} className="visually-hidden" role="status" />
    </>
  )
}
