/**
 * Run one example on the page it appears on, and show what it printed.
 *
 * The block is replayed as the tail of its page's prefix, not on its own: a
 * page is one session, and the block that imports `expect` is usually several
 * above the one with the button. That is the same call `gate:parity` makes, so
 * a result here is comparable with the output printed beside it rather than
 * being a second, weaker claim.
 *
 * The quoted output pane is never written into. The reader's result goes into a
 * sibling, labelled as theirs. Reset therefore restores the build-time bytes
 * because they were never removed -- not because they were reconstructed.
 */

import type { WorkedExample } from '../../pipeline/types.ts'
import { runPage } from './pythonSession.ts'

/** What a run turned out to be. The vocabulary the reader sees is built on it. */
export type Outcome =
  /** It printed something, and that is the documented output. */
  | 'printed'
  /**
   * An assertion failed, and the failure message is the documented output.
   *
   * Not an error, and never shown as one: 24 examples in the corpus exist
   * precisely to show what a failure reads like. Colouring those red would say
   * the library is broken at the moment it is working.
   */
  | 'failure'
  /** The reader's own code raised something else. The only red state. */
  | 'raised'
  /** The interpreter never got there. Not the example's fault. */
  | 'unavailable'

export interface RunResult {
  readonly outcome: Outcome
  readonly text: string
  /** Whether it reproduced the output printed on the page. */
  readonly matched: boolean | null
}

/** Trailing whitespace is forgiven; indentation inside a block is not. */
function normalise(text: string): string {
  return text.replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
}

/**
 * The reader's code blew up.
 *
 * Two shapes, because the harness prints a traceback only when the exception
 * has frames in the block. A `SyntaxError` from compiling it has none, so it
 * arrives as the exception summary alone -- which is the most likely way a
 * reader's edit fails, and it was being reported as ordinary output.
 *
 * Measured across the corpus: not one of the 242 quoted outputs matches either
 * shape, which is what makes it safe for this to be the only red state.
 * `check-runnable.ts` keeps that true as the corpus changes.
 */
const RAISED =
  /^Traceback \(most recent call last\)|^(?:[A-Za-z_][\w.]*\.)?[A-Za-z_]\w*(?:Error|Exception|Exit|Interrupt|Warning):/m

/**
 * Every failure message the library writes opens the same way, and 163 of the
 * 242 quoted outputs are one. Rendering those as errors would say the library
 * is broken at the exact moment it is doing its job.
 */
const FAILURE = /^Expected /

function classify(text: string): Outcome {
  if (RAISED.test(text)) return 'raised'
  if (FAILURE.test(text)) return 'failure'
  return 'printed'
}

/**
 * Replay the page up to `index` and report what that block printed.
 *
 * `sources` is the page's pristine list; `edits` replaces any block the reader
 * has changed. Everything before the block runs too, because it has to: the
 * namespace it needs was built there.
 */
export async function runExample(
  examples: readonly WorkedExample[],
  index: number,
  edits: ReadonlyMap<number, string>,
): Promise<RunResult> {
  const example = examples[index]
  if (!example)
    return { outcome: 'unavailable', text: 'That block is not on this page.', matched: null }

  const prefix = examples
    .slice(0, index + 1)
    .map((entry, position) => edits.get(position) ?? entry.source)

  try {
    const outputs = await runPage(prefix)
    const text = outputs[index] ?? ''
    const edited = [...edits.keys()].some((position) => position <= index)
    return {
      outcome: classify(text),
      text,
      // An edited prefix has no claim to compare against, so there is nothing
      // to have matched or missed.
      matched:
        edited || example.output === null ? null : normalise(text) === normalise(example.output),
    }
  } catch (error) {
    return {
      outcome: 'unavailable',
      text: error instanceof Error ? error.message : String(error),
      matched: null,
    }
  }
}
