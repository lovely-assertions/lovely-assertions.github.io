import { useState } from 'react'
import { DocsShell } from '../components/docs/DocsShell.tsx'
import { ErrorPage } from '../components/ErrorPage.tsx'
import { loadCorpusMeta } from '../lib/content.server.ts'
import { socialMeta } from '../lib/meta.ts'
import { usePlayground } from '../lib/usePlayground.ts'
import type { Route } from './+types/playground'

/**
 * A place to break an assertion and read what it says.
 *
 * The persuasive moment for this library is not seeing a passing test: it is
 * watching a failure name your own variable and explain itself. Every example
 * in the docs already shows that with output verified in CI, so the only thing
 * this adds is running *edited* code -- which is exactly the thing a static page
 * cannot do, and the reason it is worth 6 MiB to someone who asks for it.
 */

const SEED = `from lovely_assertions import expect, soft_assertions

server_name = "db-01.internal"
open_ports = [5432, 6379, 5432]

# Change any of these and run again.
with soft_assertions():
    expect(server_name).ends_with(".example.com")
    expect(open_ports).contains_no_duplicates()
    expect(open_ports).has_length(2)
`

export function meta() {
  return socialMeta({
    title: 'Playground · lovely-assertions',
    cardTitle: 'Playground',
    description:
      'Run lovely-assertions in your browser: change an assertion, break it, and read the failure message it produces.',
    route: '/playground/',
    type: 'article',
    // An interpreter, not a document. There is no markdown behind it.
    markdown: false,
  })
}

export async function loader() {
  const meta = await loadCorpusMeta()
  // No `nav`: it is a static JSON import the client bundle already carries, and
  // returning it here only serialised a second copy into this document.
  return { version: meta.source.ref.replace(/^v/, '') }
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} />
}

export default function Playground({ loaderData }: Route.ComponentProps) {
  const [source, setSource] = useState(SEED)
  const python = usePlayground()

  const busy = python.status === 'running' || python.status === 'booting'

  return (
    <DocsShell current="/playground/" version={loaderData.version}>
      <article className="doc" data-pagefind-body>
        <header>
          <h1 className="doc-title">Playground</h1>
          <p className="doc-lead">
            Runs the real package in your browser. The first run downloads a Python runtime of about
            six megabytes; nothing is downloaded until you ask.
          </p>
        </header>

        <div className="playground">
          <label className="visually-hidden" htmlFor="playground-source">
            Python source
          </label>
          <textarea
            id="playground-source"
            className="playground-source"
            value={source}
            spellCheck={false}
            rows={14}
            onFocus={python.warm}
            onChange={(event) => setSource(event.target.value)}
          />

          <div className="playground-controls">
            <button type="button" onClick={() => python.run(source)} disabled={busy}>
              {python.status === 'booting' ? 'Starting Python…' : busy ? 'Running…' : 'Run'}
            </button>
            {busy ? (
              <button type="button" onClick={python.stop}>
                Stop
              </button>
            ) : null}
            {python.version ? (
              <span className="playground-version">lovely-assertions {python.version}</span>
            ) : null}
          </div>

          {/* Both live, for the same reason `DocBody` marks the result pane it
              builds: running code is the only thing this page does, and the
              result arrives below a button that has just been disabled. Without
              these, pressing Run produced no perceivable outcome at all for a
              screen reader — the one interaction the page exists for. */}
          {/* Rendered from the first paint and left empty, because a live region
              has to be in the document before its content changes to announce
              it. The stylesheet gives an empty one no box. */}
          <p className="playground-error" role="alert">
            {python.error}
          </p>

          <div className="example-output" role="status">
            {python.output === null ? null : (
              <pre>{python.output || '(no output — every assertion passed)'}</pre>
            )}
          </div>
        </div>
      </article>
    </DocsShell>
  )
}
