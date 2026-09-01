/**
 * The argument that a coding agent reads these tests too.
 *
 * The heading used to claim that Claude and Copilot fix a named failure *faster*
 * than they fix `assert a == b`. Nobody measured that, and it is a claim about
 * two products this project does not test. What is left is the part that is
 * true by construction: an agent has the test output and nothing else.
 *
 * The soft-assertions report at the bottom is real output, not a mock-up: it is
 * the same three failures the library's own README quotes, and the test suite
 * compares that quote against what the library actually prints.
 */
export function Agents() {
  return (
    <section className="section">
      <p className="eyebrow">your agent reads these tests too</p>
      <h2 className="section-title has-lead">An agent can only debug what the test run printed.</h2>
      <p className="section-lead">
        A diff of two dictionaries leaves it to guess which of them is wrong. A sentence naming the
        value, the requirement and what it actually held tells it which line to edit.
      </p>

      <div className="cards" data-density="tight">
        <article className="card" data-wash="mint">
          <p className="card-eyebrow">intent is in the call</p>
          <h3>No operator to reverse-engineer</h3>
          <p>
            <code>is_sorted()</code> says what is required. An agent reading the file knows the
            constraint without inferring it from a comparison and a comment.
          </p>
        </article>

        <article className="card" data-wash="sky">
          <p className="card-eyebrow">wrong calls do not compile</p>
          <h3>A typed catalogue, not a guess</h3>
          <p>
            A <code>str</code> subject has no <code>is_positive</code>. An invented assertion is a
            type error in the same pass, not a red run twenty seconds later.
          </p>
        </article>

        <article className="card" data-wash="pink">
          <p className="card-eyebrow">failures fit in context</p>
          <h3>Four hundred characters, not sixty thousand</h3>
          <p>
            Difference blocks are bounded. Comparing two five-thousand-element lists does not spend
            an agent's context window on data it cannot use.
          </p>
        </article>
      </div>

      <div className="report">
        <p className="eyebrow report-eyebrow">one scope, three failures, one report</p>
        <pre className="code failure">
          <code>
            3 assertions failed:{'\n'}
            {'  '}(1) Expected <b>order_totals</b> to be sorted, but 1 at index 1 came after 3: [3,
            1, 2].{'\n'}
            {'  '}(2) Expected <b>server_config</b> to contain key 'hostname'{' '}
            <em>(did you mean 'host'?)</em>, but the keys were ['host'].{'\n'}
            {'  '}(3) Expected <b>config</b> to contain entry 'port': 9090, but that key held{' '}
            <i>8080</i>.
          </code>
        </pre>

        <p className="section-caption">
          With <code>soft_assertions()</code>, one run reports every failure in the block. Three
          fixes in one pass instead of three red-green cycles — which is the difference between an
          agent finishing the job and an agent asking you to run the tests again.
        </p>
      </div>
    </section>
  )
}
