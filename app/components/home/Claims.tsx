/**
 * The three claims the library makes, each with the mechanism that makes it
 * true. Break any one of them and the package has no reason to exist.
 */
export function Claims() {
  return (
    <section className="section">
      <h2 className="section-title is-tight">
        Typed discoverability, real narrowing, and failure messages that explain themselves.
      </h2>

      <div className="cards">
        <article className="card" data-wash="pink">
          <span className="badge" data-tone="pink">
            1
          </span>
          <h3>Only what applies</h3>
          <p>
            A <code>str</code> subject has no <code>is_positive</code>. Not hidden — absent, and
            your checker says so before you run anything.
          </p>
          <pre className="card-code">
            <code>
              <span className="tok-call-light">expect</span>(spell).
              <span className="tok-call-light">is_lower</span>(){'\n'}
              <span className="tok-call-light">expect</span>(wishes).
              <span className="tok-call-light">has_length</span>(3)
            </code>
          </pre>
        </article>

        <article className="card" data-wash="lilac">
          <span className="badge" data-tone="lilac">
            2
          </span>
          <h3>Narrowing that sticks</h3>
          <p>
            The subject a chain returns is re-typed, statically — to pyright and to mypy alike. No
            cast anywhere.
          </p>
          <pre className="card-code">
            <code>
              found = <span className="tok-call-light">expect</span>(raw).
              <span className="tok-call-light">is_not_none</span>(){'\n'}
              hero = found.subject{'\n'}
              <span className="tok-comment-light"># hero: str, no cast, no shrug</span>
            </code>
          </pre>
        </article>

        <article className="card" data-wash="butter">
          <span className="badge" data-tone="butter">
            3
          </span>
          <h3>Sentences, not diffs</h3>
          <p>
            Which value, what was required, what it actually held — plus a bounded difference block
            when the value is composite.
          </p>
          <pre className="card-code">
            <code>
              Expected quest_order to be sorted, but 'rescue'{'\n'}
              at index 1 came after 'wedding':{'\n'}
              ['wedding', 'rescue', 'feast'].
            </code>
          </pre>
        </article>
      </div>
    </section>
  )
}
