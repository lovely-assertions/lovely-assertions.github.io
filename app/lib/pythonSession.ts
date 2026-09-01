/**
 * One Python interpreter, for the whole site.
 *
 * A module singleton rather than a worker per component. Three reasons, in
 * order of how much they cost to get wrong:
 *
 * Booting is ~6 MiB and a second and a half. A worker per page means paying it
 * again every time a reader follows a link, and this is a documentation site --
 * following links is what readers do here.
 *
 * Client navigation keeps the module graph alive, so the interpreter survives a
 * move between pages for free. What does not survive it is a worker terminated
 * on unmount, which is what the playground used to do.
 *
 * And the interpreter is shared state whether or not it is modelled as such.
 * `sys.modules` is process-global, so a reader who edits one block can change
 * what a block on another page prints. That is the `dirty` flag below: once
 * anything has been edited, every run first drops the library so the next
 * import is clean. See `forget()` in harness.py for what it costs and why.
 *
 * Nothing here loads until something calls `warm` or a run, so a reader who
 * never presses Run pays for none of it.
 */

import type { Request, Response } from '../workers/pyodide.worker.ts'

export type SessionStatus = 'idle' | 'booting' | 'ready' | 'running' | 'failed'

export interface SessionState {
  readonly status: SessionStatus
  readonly version: string | null
  /**
   * Whether the runtime has arrived.
   *
   * The first run downloads about 6 MB, and every one after it is immediate.
   * The difference is the reader's whole experience of pressing Run, so it is
   * part of the state rather than something each caller guesses at.
   */
  readonly booted: boolean
  /** Set when the runtime itself failed, not when Python raised. */
  readonly error: string | null
}

/**
 * How long a run may take before the interpreter is assumed to be stuck.
 *
 * Deliberately not counted from the click. The first run also downloads and
 * starts a ~6 MB runtime, and on a slow connection that alone outlasts any
 * sensible limit -- so a reader would be told their code was an endless loop
 * when it had not begun. The clock starts when the interpreter is ready.
 */
const WATCHDOG_MS = 10_000

/**
 * How long the runtime itself may take to arrive.
 *
 * Generous, because it is a download on someone else's connection. It exists
 * so a run cannot hang forever on a dead network, not to police anybody.
 */
const BOOT_MS = 120_000

let worker: Worker | null = null
let nextId = 0

/** Whether the runtime has finished starting in this session. */
let booted = false

/**
 * Whether anything has been edited in this session.
 *
 * Sticky on purpose: a reader who edits a block, reverts it and runs again is
 * still running in an interpreter that executed the edit once.
 */
let dirty = false

let state: SessionState = { status: 'idle', version: null, booted: false, error: null }
const listeners = new Set<(state: SessionState) => void>()

/**
 * A run that has been posted and not yet answered.
 *
 * The deadline belongs to the run, not to the module. It used to be one shared
 * `watchdog` variable, and the Run buttons are per block -- disabling the one
 * that was pressed leaves the other 29 on a reference page live -- so two runs
 * could be pending at once. The message handler cleared that single timer on
 * *any* reply, which meant a run that finished destroyed the deadline of a run
 * still going. Measured: an endless loop left pending beside a fast run was
 * still spinning at 68 seconds against a 10-second limit, and the next press
 * re-armed the shared timer and then reported both blocks stopped -- including
 * one that had never executed.
 */
interface Pending {
  readonly settle: (outputs: readonly string[] | null, error?: string) => void
  timer: ReturnType<typeof setTimeout> | null
}

const pending = new Map<number, Pending>()

function publish(next: Partial<SessionState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener(state)
}

export function subscribe(listener: (state: SessionState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function sessionState(): SessionState {
  return state
}

/** Every run from now on re-imports the library first. */
export function markEdited(): void {
  dirty = true
}

export function isDirty(): boolean {
  return dirty
}

function disarm(run: Pending | undefined): void {
  if (run?.timer) clearTimeout(run.timer)
  if (run) run.timer = null
}

function arm(run: Pending, ms: number, reason: string): void {
  disarm(run)
  run.timer = setTimeout(() => stop(reason), ms)
}

const TOO_SLOW =
  `Stopped after ${WATCHDOG_MS / 1000} seconds. ` +
  'An endless loop cannot be interrupted here, only ended.'

const NO_RUNTIME = 'Python did not start. Check the connection and try again.'

/**
 * Start the clock on one run.
 *
 * Python cannot be interrupted here -- that needs a SharedArrayBuffer, which
 * needs headers GitHub Pages cannot send -- so a run that never returns is
 * ended by ending the interpreter it runs in. That still takes every other
 * pending run down with it, which is why `stop()` settles them all.
 */
function armWatchdog(run: Pending): void {
  arm(run, WATCHDOG_MS, TOO_SLOW)
}

/**
 * Wait for the runtime, then start the run's own clock.
 *
 * Called for every run: when the interpreter is already up this is one tick,
 * and when it is not it is however long the download takes.
 */
function armAfterBoot(run: Pending): void {
  if (booted) armWatchdog(run)
  else arm(run, BOOT_MS, NO_RUNTIME)
}

/** End the interpreter. Anything waiting on it is told, rather than left hanging. */
export function stop(reason = 'Stopped.'): void {
  worker?.terminate()
  worker = null
  booted = false
  dirty = false
  for (const run of pending.values()) {
    disarm(run)
    run.settle(null, reason)
  }
  pending.clear()
  publish({ status: 'idle', booted: false, error: reason })
}

function ensure(): Worker {
  if (worker) return worker

  const created = new Worker(new URL('../workers/pyodide.worker.ts', import.meta.url), {
    // Pyodide 314 is an ES module and cannot run in a classic worker.
    type: 'module',
  })

  // A worker that cannot load its own module never sends a message at all, so
  // without this the only thing that ends the wait is the boot deadline -- two
  // minutes of a progress bar for a failure the browser knew about at once.
  created.addEventListener('error', () => stop(NO_RUNTIME))

  created.addEventListener('message', (event: MessageEvent<Response>) => {
    const message = event.data

    if (message.type === 'ready') {
      booted = true
      // The runtime is up, so whatever is running now gets its own clock --
      // measured from here rather than from the click that queued it. Each of
      // them, not just one: they were all waiting on the same download.
      for (const run of pending.values()) armWatchdog(run)
      publish({
        version: message.version,
        booted: true,
        status: state.status === 'running' ? 'running' : 'ready',
      })
      return
    }

    if (message.type === 'failed') {
      // A runtime failure is not a Python failure: the harness reports those as
      // output. Reaching here means the interpreter itself is unhappy, and
      // every caller waiting on it needs to hear so.
      //
      // The worker goes with it. It is holding a half-started runtime, and
      // keeping it means the next press fails the same way without trying.
      stop(booted ? message.message : NO_RUNTIME)
      return
    }

    // Only this run's deadline. The ones still pending keep theirs.
    const run = pending.get(message.id)
    disarm(run)
    pending.delete(message.id)
    publish({ status: pending.size > 0 ? 'running' : 'ready', error: null })
    if (!run) return
    run.settle(message.type === 'page' ? message.outputs : [message.output])
  })

  worker = created
  return created
}

/** Start booting, without asking for anything to be run. */
export function warm(): void {
  if (state.status === 'idle') publish({ status: 'booting' })
  ensure().postMessage({ type: 'boot' } satisfies Request)
}

/**
 * Replay a page's blocks in one namespace and return what each printed.
 *
 * The prefix, not the single block: a page is one session, so the block that
 * imports `expect` is often three above the one being run. This is the same
 * call the parity gate makes, which is what lets a result on the page be
 * compared with the output printed beside it.
 */
export function runPage(sources: readonly string[]): Promise<readonly string[]> {
  publish({ status: 'running', error: null })

  nextId += 1
  const id = nextId
  ensure().postMessage({ type: 'runPage', id, sources, dirty } satisfies Request)

  return new Promise((resolve, reject) => {
    const run: Pending = {
      settle: (outputs, error) => {
        if (outputs) resolve(outputs)
        else reject(new Error(error ?? 'The interpreter stopped.'))
      },
      timer: null,
    }
    pending.set(id, run)
    armAfterBoot(run)
  })
}

/** Run one self-contained snippet, for the playground page. */
export function runSnippet(source: string): Promise<string> {
  publish({ status: 'running', error: null })

  nextId += 1
  const id = nextId
  ensure().postMessage({ type: 'run', id, source } satisfies Request)

  return new Promise((resolve, reject) => {
    const run: Pending = {
      settle: (outputs, error) => {
        if (outputs) resolve(outputs[0] ?? '')
        else reject(new Error(error ?? 'The interpreter stopped.'))
      },
      timer: null,
    }
    pending.set(id, run)
    armAfterBoot(run)
  })
}
