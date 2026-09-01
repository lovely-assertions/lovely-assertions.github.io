import { useCallback, useEffect, useRef, useState } from 'react'
import { copyFrom, copyText } from '../lib/clipboard.ts'
import { acknowledgeCopy } from '../lib/motion.ts'
import { CheckIcon, CopyIcon } from './icons.tsx'

/**
 * Copy a string, and say so.
 *
 * Two rules, both learned the hard way:
 *
 * The feedback fires on the click, not on the clipboard promise. A denied
 * clipboard write leaves the promise pending or rejected, and a button that
 * only acknowledges on success looks broken in exactly the contexts where the
 * reader most needs to know something happened.
 *
 * It copies precisely what is displayed. The pyproject option shows two lines,
 * header included, and copying only the second one would hand the reader
 * something that does not work.
 */

const REVERT_MS = 1500

/**
 * Where the bytes come from. Exactly one, and the compiler holds that.
 *
 * `text` is the usual case: something on the page, copied verbatim. `from` is
 * for bytes the page does not carry -- a documentation page's markdown is ten
 * kilobytes it would otherwise have to ship to every reader in case one of them
 * pressed a button.
 */
type CopySource =
  | { readonly text: string; readonly from?: never }
  | { readonly from: string; readonly text?: never }

export function CopyButton({
  text,
  from,
  label,
  className = 'copy-button',
  size = 15,
  celebrate = false,
  children,
}: CopySource & {
  /** Names the button for anyone who cannot see the icon. */
  readonly label: string
  readonly className?: string
  readonly size?: number
  /** Hop and throw sparkles, for the buttons a reader presses once. */
  readonly celebrate?: boolean
  /** A visible label, for the wide pill form. Icon-only without it. */
  readonly children?: React.ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(() => {
    // Acknowledge first; the write is allowed to fail without the reader being
    // left wondering whether the click registered.
    setCopied(true)
    // The animation returns to rest on its own; this timer only carries the
    // attribute back, for anything reading the state rather than watching it.
    if (button.current) acknowledgeCopy(button.current, celebrate)

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), REVERT_MS)

    // Both of these must be reached from inside the click. `copyFrom` says why.
    if (from === undefined) copyText(text ?? '')
    else copyFrom(from)
  }, [text, from, celebrate])

  return (
    <button
      ref={button}
      type="button"
      className={className}
      onClick={copy}
      aria-label={label}
      data-copied={copied || undefined}
    >
      {children}
      <span className="copy-button-icons">
        <span className="copy-button-icon" data-icon="copy">
          <CopyIcon size={size} />
        </span>
        <span className="copy-button-icon" data-icon="check">
          <CheckIcon size={size} />
        </span>
      </span>
      {/* The same acknowledgement, for a reader who cannot see the icon swap.
          Present from the first render and empty, because a live region has to
          be in the document before its content changes to be announced. The
          button's name comes from `aria-label`, so this never joins it. */}
      <span className="visually-hidden" role="status">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  )
}
