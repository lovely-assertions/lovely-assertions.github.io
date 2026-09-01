import { useRef } from 'react'
import { INSTALL_TOOLS, type InstallTool, TOOL_LABELS } from '../lib/install.ts'

/**
 * The pill track that picks an install tool.
 *
 * A radio group, not a tab list. It used to declare `role="tablist"`, and the
 * shipped home page then carried two tablists, six tabs, no `aria-controls`
 * and — measured — zero `role="tabpanel"`. APG reserves tabs for a set of
 * layered panels one of which is shown; what this does is make a choice whose
 * consequence is a command block further down the page, and one of the two
 * instances has no panel at all. A screen reader was announcing "uv, tab, 1 of
 * 3" for a control that owned nothing, twice, under the same label.
 *
 * Focus follows selection, which both patterns require and this one used not to
 * do: the roving tabindex is derived from `value`, so changing the value handed
 * `tabIndex=0` to a button that did not have focus and `tabIndex=-1` to the one
 * that did. Measured on the built page, one ArrowRight left the pink focus ring
 * 54px from the selected pill, and a second left it 116px away — with the
 * focused button no longer in the tab sequence at all. Nothing was announced,
 * because nothing had moved.
 */
export function SegmentedControl({
  value,
  onChange,
  className = 'segmented',
  label = 'Install tool',
}: {
  readonly value: InstallTool
  readonly onChange: (next: InstallTool) => void
  readonly className?: string
  readonly label?: string
}) {
  const track = useRef<HTMLDivElement>(null)

  /** Select a tool and take focus to it, which is what makes it announced. */
  function pick(next: InstallTool): void {
    onChange(next)
    track.current?.querySelector<HTMLButtonElement>(`[data-tool="${next}"]`)?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const at = INSTALL_TOOLS.indexOf(value)
    const last = INSTALL_TOOLS.length - 1

    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? INSTALL_TOOLS[(at + 1) % INSTALL_TOOLS.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? INSTALL_TOOLS[(at - 1 + INSTALL_TOOLS.length) % INSTALL_TOOLS.length]
          : event.key === 'Home'
            ? INSTALL_TOOLS[0]
            : event.key === 'End'
              ? INSTALL_TOOLS[last]
              : undefined

    if (!next) return
    event.preventDefault()
    pick(next)
  }

  return (
    <div
      ref={track}
      className={className}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {INSTALL_TOOLS.map((tool) => (
        // biome-ignore lint/a11y/useSemanticElements: APG's radio group with a roving tabindex, which this implements in full — a native <input type="radio"> would need a visually hidden control and a :has() focus ring to keep the pill track's gradient and shadow
        <button
          key={tool}
          type="button"
          role="radio"
          data-tool={tool}
          aria-checked={tool === value}
          tabIndex={tool === value ? 0 : -1}
          onClick={() => pick(tool)}
        >
          {TOOL_LABELS[tool]}
        </button>
      ))}
    </div>
  )
}
