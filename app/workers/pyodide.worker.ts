/// <reference lib="webworker" />

/**
 * Python, off the main thread.
 *
 * A worker for two reasons. The obvious one is that booting a ~6 MiB runtime and
 * running arbitrary code should not freeze the page. The other is that it is the
 * only way to stop a runaway loop here: interrupting Pyodide needs a
 * SharedArrayBuffer, which needs COOP/COEP headers, which GitHub Pages cannot
 * send. Terminating a worker needs nothing, so `while True: pass` is survivable.
 *
 * It must be a module worker: Pyodide 314 ships `pyodide.asm.mjs` and dropped
 * support for classic workers.
 */

import harnessSource from '../../playground/harness.py?raw'
import { createRunner, PYODIDE_CDN, type Runner } from '../../playground/runtime.ts'

export type Request =
  | { type: 'boot' }
  | { type: 'run'; id: number; source: string }
  /**
   * A page's blocks, in order, sharing one namespace.
   *
   * The same call the parity gate makes, so a reader pressing Run on the fifth
   * block gets what CI verified rather than what the fifth block does alone --
   * which, for a block whose imports are three blocks above it, is a NameError.
   *
   * `dirty` asks for `lovely_assertions` to be dropped from `sys.modules`
   * first. A namespace is fresh every run but the interpreter is not, so one
   * edited line that rebinds something on the module keeps changing every later
   * run in the session. It costs a re-import, so it is only paid once a reader
   * has actually edited something.
   */
  | { type: 'runPage'; id: number; sources: readonly string[]; dirty: boolean }

export type Response =
  | { type: 'ready'; version: string }
  | { type: 'result'; id: number; output: string }
  | { type: 'page'; id: number; outputs: readonly string[] }
  | { type: 'failed'; message: string }

let booting: Promise<Runner> | undefined

async function boot(): Promise<Runner> {
  const [{ loadPyodide }, wheel] = await Promise.all([
    // Pinned by URL. jsDelivr already serves this with a long cache lifetime,
    // brotli and the right wasm content type, and keeps ~6 MiB per cold start
    // off this site's own bandwidth.
    import(/* @vite-ignore */ `${PYODIDE_CDN}pyodide.mjs`) as Promise<{
      loadPyodide: Parameters<typeof createRunner>[0]['loadPyodide']
    }>,
    fetch('/playground/lovely_assertions.whl').then(async (response) => {
      if (!response.ok) throw new Error(`the wheel is missing (HTTP ${response.status})`)
      return new Uint8Array(await response.arrayBuffer())
    }),
  ])

  return createRunner({
    loadPyodide,
    indexURL: PYODIDE_CDN,
    wheel,
    harness: harnessSource,
  })
}

function reply(message: Response): void {
  self.postMessage(message)
}

/**
 * Start the runtime, and announce it once however it was asked for.
 *
 * `ready` used to be sent only in answer to an explicit `boot`. Nothing sends
 * one any more -- the runtime is fetched when a reader presses Run, not before
 * -- so the page was never told the interpreter had arrived, and went on
 * showing "Starting Python" on every later run.
 */
function runtime(): Promise<Runner> {
  booting ??= boot()
    .then((runner) => {
      reply({ type: 'ready', version: runner.version })
      return runner
    })
    .catch((error: unknown) => {
      // Forget the failure. A rejected promise left in this slot answers every
      // later press instantly with the same error and never tries again, so a
      // flaky network kills Run for the rest of the visit.
      booting = undefined
      throw error
    })
  return booting
}

self.addEventListener('message', (event: MessageEvent<Request>) => {
  const request = event.data

  if (request.type === 'boot') {
    void runtime().catch((error: unknown) =>
      reply({ type: 'failed', message: error instanceof Error ? error.message : String(error) }),
    )
    return
  }

  void runtime().then(
    (runner) => {
      try {
        if (request.type === 'runPage') {
          if (request.dirty) runner.forget()
          reply({ type: 'page', id: request.id, outputs: runner.runPage(request.sources) })
          return
        }
        reply({ type: 'result', id: request.id, output: runner.run(request.source) })
      } catch (error) {
        // A crash inside Python is already caught by the harness, so reaching
        // here means the runtime itself is unhappy.
        reply({ type: 'failed', message: error instanceof Error ? error.message : String(error) })
      }
    },
    (error: unknown) =>
      reply({ type: 'failed', message: error instanceof Error ? error.message : String(error) }),
  )
})
