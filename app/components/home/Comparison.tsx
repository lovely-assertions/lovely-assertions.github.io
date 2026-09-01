/**
 * The section that has to land: what the same bug looks like from each side.
 *
 * The two panels are deliberately the same size. The point is not that one
 * output is longer — it is that a missing key and a key holding the wrong value
 * are different bugs, and only one of these messages knows which it found.
 */
export function Comparison() {
  return (
    <section className="section comparison">
      <p className="eyebrow">compared with a bare pytest assert</p>
      <h2 className="section-title">
        pytest hands you two dicts.
        <br />
        This hands you the bug.
      </h2>

      <div className="comparison-grid">
        <div className="comparison-panel" data-side="before">
          <p className="comparison-label">what you write today</p>
          <pre className="code comparison-code">
            <code>
              <span className="tok-keyword">assert</span>{' '}
              <span className="tok-string">"levitation"</span>{' '}
              <span className="tok-keyword">in</span> spellbook
            </code>
          </pre>
          <pre className="code comparison-out">
            <code>assert 'levitation' in &#123;'levitatoin': 3, 'fireball': 1&#125;</code>
          </pre>
        </div>

        <div className="comparison-panel" data-side="after">
          <p className="comparison-label">what you could write</p>
          <pre className="code comparison-code">
            <code>
              <span className="tok-call-light">expect</span>(spellbook).
              <span className="tok-call-light">contains_key</span>(
              <span className="tok-string-light">"levitation"</span>)
            </code>
          </pre>
          <pre className="code comparison-message failure">
            <code>
              Expected <b>spellbook</b> to contain key <i>'levitation'</i>{' '}
              <em>(did you mean 'levitatoin'?)</em>, but the keys were{' '}
              <i>['levitatoin', 'fireball']</i>.
            </code>
          </pre>
        </div>
      </div>

      <p className="section-close">
        A missing key and a key holding the wrong value are two different bugs. The message picks
        one — and spots your typo on the way past.
      </p>
    </section>
  )
}
