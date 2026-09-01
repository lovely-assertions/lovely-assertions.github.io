import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { COMMANDS, COPY_LABELS, type InstallTool, PILL_LABELS } from '../../lib/install.ts'
import { ctaEnter, ctaLeave, mountBadgePulse, mountMarker, tiltMarker } from '../../lib/motion.ts'
import { CopyButton } from '../CopyButton.tsx'
import { SegmentedControl } from '../SegmentedControl.tsx'

/**
 * The promise, the proof, and the command.
 *
 * The word "lovely" carries a highlighter that draws itself on load — the one
 * piece of decoration on the page, and it is doing work: the sentence is a joke
 * about failure, and the marker is what makes it read as one.
 *
 * Both animations are built in `motion.ts`. They used to be written here with
 * `gsap.timeline()` and `gsap.context()` inline, which meant this component
 * imported the engine — and an engine three components name directly cannot be
 * loaded on demand.
 */
export function Hero({
  tool,
  onToolChange,
  version,
  python,
}: {
  readonly tool: InstallTool
  readonly onToolChange: (next: InstallTool) => void
  /** The release this build documents, from the corpus it was built from. */
  readonly version: string
  /** The Python floor, from the wheel the playground runs. `3.13+`. */
  readonly python: string
}) {
  const marker = useRef<HTMLSpanElement>(null)
  const badge = useRef<HTMLSpanElement>(null)

  useEffect(() => (badge.current ? mountBadgePulse(badge.current) : undefined), [])
  useEffect(() => (marker.current ? mountMarker(marker.current) : undefined), [])

  return (
    <section className="hero">
      <p className="hero-badge">
        <span className="hero-badge-dot" ref={badge} aria-hidden="true" />
        {/* Two facts that move with a release and used to be typed here. The
            third does not move: no runtime dependencies is a design commitment,
            not release metadata.

            One interpolation rather than three, so the badge is a single text
            node. Split across expressions, React separates them with comment
            markers in the static HTML, which is what the search index and any
            reader of the source would then have to step over. */}
        {`v${version} · python ${python} · zero dependencies`}
      </p>

      <h1 className="hero-title">
        Your tests will fail. They may as well be{' '}
        <span
          className="marker"
          ref={marker}
          onPointerEnter={(event) => tiltMarker(event.currentTarget)}
        >
          <span className="marker-ink" data-ink="" aria-hidden="true" />
          <span className="marker-text">lovely</span>
        </span>{' '}
        about it.
      </h1>

      <p className="hero-lead">
        A zero-dependency Python assertion library for pytest and unittest.{' '}
        <strong>expect()</strong> offers only what applies to your value's type, narrowing survives
        the chain, and a failure turns up as a sentence rather than a shrug.
      </p>

      {/* The selector and the action row are one group: they share a tighter
          rhythm with each other than with the prose above them. */}
      <div className="hero-choose">
        <SegmentedControl value={tool} onChange={onToolChange} label="Install tool" />

        <div className="hero-actions">
          <CopyButton
            className="command-pill"
            text={COMMANDS[tool]}
            label={COPY_LABELS[tool]}
            celebrate
          >
            <span className="command-pill-label">{PILL_LABELS[tool]}</span>
          </CopyButton>

          {/* A router link, like the same destination in the footer. As a raw
              anchor this tore down the hydrated app and re-fetched every chunk
              to reach a page the client already had the route for. */}
          <Link
            className="cta"
            to="/docs/"
            prefetch="intent"
            onPointerEnter={(event) => ctaEnter(event.currentTarget)}
            onPointerLeave={(event) => ctaLeave(event.currentTarget)}
            onFocus={(event) => ctaEnter(event.currentTarget)}
            onBlur={(event) => ctaLeave(event.currentTarget)}
          >
            Read the docs
            <span className="cta-arrow" data-arrow="" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}

/**
 * The hero's code card.
 *
 * A section of its own, not the last item in the hero column: it sits in the
 * narrower 940px band and keeps its own rhythm above and below.
 */
export function HeroCode() {
  return (
    <section className="code-band">
      <div className="hero-code">
        <pre className="code">
          <code>
            <span className="tok-keyword">from</span> lovely_assertions{' '}
            <span className="tok-keyword">import</span> expect{'\n\n'}
            <span className="tok-call">expect</span>(
            <span className="tok-string">"lovely-assertions"</span>).
            <span className="tok-call">starts_with</span>(<span className="tok-string">"love"</span>
            ).
            <span className="tok-dim">and_</span>.<span className="tok-call">contains</span>(
            <span className="tok-string">"assertions"</span>)
          </code>
        </pre>
      </div>
    </section>
  )
}
