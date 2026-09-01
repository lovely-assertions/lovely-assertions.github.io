import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  runSnippet,
  type SessionState,
  sessionState,
  stop as stopSession,
  subscribe,
  warm as warmSession,
} from './pythonSession.ts'

export type Status = SessionState['status']

export interface Playground {
  readonly status: Status
  readonly version: string | null
  readonly output: string | null
  readonly error: string | null
  /** Boot ahead of time, e.g. when the reader focuses the editor. */
  readonly warm: () => void
  readonly run: (source: string) => void
  /** Kill a runaway snippet. The next run boots a fresh interpreter. */
  readonly stop: () => void
}

/**
 * Drive the shared Python session from the playground page.
 *
 * The interpreter itself lives in `pythonSession.ts` and outlives this
 * component: it is the same one the documentation pages run their examples in,
 * so a reader who has already run something on a guide finds the playground
 * warm. Unmounting this deliberately does not tear it down -- the previous
 * version did, and that made every navigation cost another 6 MiB boot.
 */
export function usePlayground(): Playground {
  /*
   * `useSyncExternalStore`, not `useState` + `useEffect`.
   *
   * The interpreter is an external mutable store and it already exposes exactly
   * the two functions this wants: `subscribe` returns its own unsubscribe, and
   * `sessionState` returns a stable snapshot that only changes when `publish`
   * replaces it. That is the API React added for this, and it is tearing-safe
   * under concurrent rendering, where a subscription set up in an effect can
   * miss a change that lands between render and commit.
   *
   * The third argument is the server snapshot. It is the same function: these
   * pages are prerendered under Node, where the store has never been touched
   * and honestly reports `idle`.
   */
  const session = useSyncExternalStore<SessionState>(subscribe, sessionState, sessionState)
  const [output, setOutput] = useState<string | null>(null)

  const run = useCallback((source: string) => {
    setOutput(null)
    runSnippet(source).then(setOutput, () => setOutput(null))
  }, [])

  const stop = useCallback(() => {
    setOutput(null)
    stopSession()
  }, [])

  return {
    status: session.status,
    version: session.version,
    output,
    error: session.error,
    warm: warmSession,
    run,
    stop,
  }
}
