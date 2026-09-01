/**
 * Booting a Python that can run the documentation's examples.
 *
 * Deliberately agnostic about where it runs. The browser worker and the parity
 * gate in CI both go through this function, so the gate is evidence about the
 * playground rather than about a second implementation that resembles it.
 */

/** Pinned, never `latest`. The parity gate proves the docs against this exact build. */
export const PYODIDE_VERSION = '314.0.6'

export const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

/** The virtual path the wheel is mounted at; zipimport reads it in place. */
const WHEEL_PATH = '/tmp/lovely_assertions.whl'

interface PyodideLike {
  FS: { writeFile(path: string, data: Uint8Array): void }
  runPython(code: string): unknown
  globals: { get(name: string): unknown }
}

export interface Runner {
  /** Execute one self-contained snippet and return everything it printed. */
  run(source: string): string
  /**
   * Execute a page's blocks in order, sharing one namespace.
   *
   * A page is one session: the first block imports what the fifth one uses.
   * The library's own docs harness works this way, so the parity gate must too.
   */
  runPage(sources: readonly string[]): string[]
  /**
   * Drop the library from `sys.modules`, so the next run re-imports it.
   *
   * The namespace is new every run; the interpreter is not. See `forget()` in
   * harness.py for what one edited line can otherwise do to the blocks around
   * it.
   */
  forget(): void
  version: string
}

export interface RunnerOptions {
  /** Pyodide's own loader, imported by the caller so this stays environment-free. */
  readonly loadPyodide: (options: { indexURL: string }) => Promise<PyodideLike>
  readonly indexURL: string
  /** The published wheel, as bytes. */
  readonly wheel: Uint8Array
  /** The contents of harness.py. */
  readonly harness: string
}

export async function createRunner({
  loadPyodide,
  indexURL,
  wheel,
  harness,
}: RunnerOptions): Promise<Runner> {
  const pyodide = await loadPyodide({ indexURL })

  // A pure-Python wheel is a zip of importable packages, so putting it on the
  // path is the whole installation. No micropip, no network.
  pyodide.FS.writeFile(WHEEL_PATH, wheel)
  pyodide.runPython(`import sys; sys.path.insert(0, ${JSON.stringify(WHEEL_PATH)})`)

  pyodide.runPython(harness)
  const run = pyodide.globals.get('run')
  const runPage = pyodide.globals.get('run_page')
  const forget = pyodide.globals.get('forget')
  if (typeof run !== 'function' || typeof runPage !== 'function' || typeof forget !== 'function') {
    throw new Error('the harness did not define run(), run_page() and forget()')
  }

  const version = String(pyodide.runPython('import lovely_assertions as _la; _la.__version__'))

  return {
    version,
    forget(): void {
      ;(forget as () => void)()
    },

    run(source: string): string {
      return String((run as (source: string) => unknown)(source))
    },

    runPage(sources: readonly string[]): string[] {
      // Pyodide hands back a proxy over the Python list; toJs copies it out so
      // the caller is not holding a reference into the interpreter.
      const results = (runPage as (sources: string[]) => { toJs(): string[]; destroy(): void })([
        ...sources,
      ])
      const copied = results.toJs()
      results.destroy()
      return copied
    },
  }
}
