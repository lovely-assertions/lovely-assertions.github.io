/**
 * Five commitments, stated as flatly as possible.
 *
 * The last one is a limitation, in the same size type as the four features
 * beside it — the library says what it cannot do rather than leaving a reader
 * to discover it.
 */

export function Promises() {
  return (
    <section className="section promises">
      <ul className="promise-row">
        <li className="promise" data-tone="pink">
          Zero runtime dependencies. Permanently.
        </li>
        <li className="promise" data-tone="lilac">
          A passing assertion is a comparison and a <code>return self</code>.
        </li>
        <li className="promise" data-tone="butter">
          pyright and mypy, both strict, both green.
        </li>
        <li className="promise" data-tone="mint">
          Every failure message in the docs is real output.
        </li>
        <li className="promise" data-tone="sky">
          It does not narrow <em>your</em> variable, and says so.
        </li>
      </ul>
    </section>
  )
}
