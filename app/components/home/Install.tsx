import { COMMANDS, COPY_LABELS, type InstallTool } from '../../lib/install.ts'
import { CopyButton } from '../CopyButton.tsx'
import { SegmentedControl } from '../SegmentedControl.tsx'

/**
 * The install band.
 *
 * Its selector is the same state as the hero's — one choice, read in two
 * places. Two local copies would let the page show `uv` at the top and `pip`
 * here.
 */
export function Install({
  tool,
  onToolChange,
}: {
  readonly tool: InstallTool
  readonly onToolChange: (next: InstallTool) => void
}) {
  const command = COMMANDS[tool]
  const [header, body] = command.split('\n')

  return (
    <section className="section install" id="install">
      <div className="install-panel">
        <div className="install-copy">
          <h2 className="panel-title">One line. No plugin, no fixture, no base class.</h2>
          <p className="panel-prose">
            Assertions belong with your tests, so a dev dependency is where it goes — and it will
            never grow a runtime dependency of its own.
          </p>
        </div>

        <div className="install-actions">
          <SegmentedControl
            value={tool}
            onChange={onToolChange}
            className="segmented is-onpanel"
            label="Install tool"
          />

          <div className="install-command">
            {/* The consequence of the choice made above, announced. The radio
                group says which tool is now checked; this says what the command
                became, which is the thing the reader came for. */}
            <pre className="code" role="status">
              <code>
                {tool === 'pyproject' ? (
                  <>
                    <span className="tok-section">{header}</span>
                    {'\n'}
                    {body}
                  </>
                ) : (
                  <>
                    <span className="tok-prompt">$</span> {command}
                  </>
                )}
              </code>
            </pre>
            <CopyButton
              className="copy-button install-copy-button"
              text={command}
              label={COPY_LABELS[tool]}
              celebrate
            />
          </div>

          <p className="install-proof">
            <code>
              expect(<span className="tok-string-light">"unicorn"</span>).contains(
              <span className="tok-string-light">"corn"</span>)
            </code>
            <span className="install-pass">✓ passes</span>
          </p>
        </div>
      </div>
    </section>
  )
}
