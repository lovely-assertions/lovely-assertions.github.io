/**
 * Copying text, including where the Clipboard API is unavailable, and copying
 * bytes this page does not have yet.
 *
 * A non-secure context has no `navigator.clipboard` at all, so the old
 * hidden-textarea route stays as a fallback rather than letting the button do
 * nothing on a plain-HTTP preview.
 */
export function copyText(text: string): void {
  void (async () => {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through.
    }

    const carrier = document.createElement('textarea')
    carrier.value = text
    carrier.setAttribute('readonly', '')
    carrier.style.position = 'fixed'
    carrier.style.opacity = '0'
    document.body.append(carrier)
    carrier.select()
    try {
      document.execCommand('copy')
    } finally {
      carrier.remove()
    }
  })()
}

/**
 * Copy the body of a URL, arranged from inside the click that asked for it.
 *
 * The obvious shape -- `await fetch(url)`, then `writeText` -- is refused by
 * Safari, and silently: the clipboard write has to be arranged during the
 * gesture, not in a later task after a promise resolves. `ClipboardItem` exists
 * for exactly this. The `write()` call happens now; the bytes arrive when they
 * arrive.
 *
 * The blob is rebuilt as `text/plain` rather than passed through. The response
 * is `text/markdown`, and an item whose declared type does not match the blob
 * inside it is rejected -- which would look like a copy that did nothing.
 *
 * This is what makes the button affordable. A page's markdown is fetched when
 * someone presses the button and never before, so a reader who does not press
 * it pays nothing, and the reference page's 95 KB is not on anybody's hover.
 */
export function copyFrom(url: string): void {
  const plain = fetch(url)
    .then((response) => response.text())
    .then((body) => new Blob([body], { type: 'text/plain' }))

  const settle = () => void plain.then(async (blob) => copyText(await blob.text()))

  if (typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function') {
    // The fallback runs on rejection too: a browser that has the API and
    // refuses this particular write can still be served the slower way.
    void navigator.clipboard.write([new ClipboardItem({ 'text/plain': plain })]).catch(settle)
    return
  }

  settle()
}
