/**
 * Replay every documented example through the playground, and require it to
 * produce exactly what the docs say it produces.
 *
 * This is the most valuable check in the repository, because of what it pins
 * all at once: the Pyodide version, the wheel version, the harness, and the
 * documentation itself. Without it the playground can disagree with the page it
 * sits on and nobody finds out -- and it would not disagree loudly. It would
 * print a slightly weaker sentence, on every example, which is exactly the
 * claim the library is making.
 *
 * The examples come from the same mdast parse that renders the pages, never
 * from a regex over the markdown: a regex over prose containing em dashes
 * mispairs blocks, and a mispaired block looks like a real failure here.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { loadPyodide } from 'pyodide'
import { GENERATED_DIR, ROOT } from '../pipeline/corpus.ts'
import type { WorkedExample } from '../pipeline/types.ts'
import { createRunner, PYODIDE_VERSION } from '../playground/runtime.ts'

/**
 * Examples the harness cannot reproduce, and why.
 *
 * Keep this empty if at all possible. Every entry is a place where the site
 * shows an example the playground would get wrong, so each one needs a reason
 * that is about the example rather than about the harness being incomplete.
 */
const EXPECTED_TO_DIFFER: ReadonlyMap<string, string> = new Map()

function normalise(text: string): string {
  // Only trailing whitespace is forgiven. Indentation inside an output block is
  // meaningful here -- the difference engine and soft-assertion reports both use
  // it to show structure -- so it is compared byte for byte.
  return text.replace(/[ \t]+$/gm, '').replace(/\n+$/, '')
}

async function main(): Promise<void> {
  const [examples, wheel, harness] = await Promise.all([
    readFile(path.join(GENERATED_DIR, 'examples.json'), 'utf8').then(
      (raw) => JSON.parse(raw) as WorkedExample[],
    ),
    readFile(path.join(ROOT, 'public/playground/lovely_assertions.whl')),
    readFile(path.join(ROOT, 'playground/harness.py'), 'utf8'),
  ])

  const runner = await createRunner({
    loadPyodide: loadPyodide as unknown as Parameters<typeof createRunner>[0]['loadPyodide'],
    indexURL: path.join(ROOT, 'node_modules/pyodide'),
    wheel: new Uint8Array(wheel),
    harness,
  })

  const quoted = examples.filter((example) => example.output !== null).length
  console.log(
    `\n  Pyodide ${PYODIDE_VERSION}, lovely-assertions ${runner.version}, ` +
      `${examples.length} runnable blocks, ${quoted} with quoted output\n`,
  )

  // Grouped by page, because a page is one session: its first block imports
  // what its fifth block uses. Running each example alone would fail a quarter
  // of the corpus with NameError and prove nothing about the library.
  const byPage = new Map<string, WorkedExample[]>()
  for (const example of examples) {
    const group = byPage.get(example.repoPath)
    if (group) group.push(example)
    else byPage.set(example.repoPath, [example])
  }

  const mismatches: Array<{ example: WorkedExample; got: string }> = []
  let checked = 0

  for (const [, page] of byPage) {
    const produced = runner.runPage(page.map((example) => example.source))
    for (const [index, example] of page.entries()) {
      // Blocks the page runs but quotes nothing from still have to execute --
      // they are the imports the rest depends on -- but there is nothing to
      // compare them against.
      if (example.output === null) continue
      const got = normalise(produced[index] ?? '')
      checked += 1
      if (got !== normalise(example.output)) mismatches.push({ example, got })
    }
  }

  const unexplained = mismatches.filter(({ example }) => !EXPECTED_TO_DIFFER.has(example.source))

  if (unexplained.length > 0) {
    console.error(`  ${unexplained.length} of ${checked} examples did not reproduce.\n`)
    for (const { example, got } of unexplained.slice(0, 5)) {
      console.error(`  --- ${example.repoPath} ---`)
      console.error(`  source:\n${example.source.replace(/^/gm, '    ')}`)
      console.error(`  documented:\n${(example.output ?? '').replace(/^/gm, '    ')}`)
      console.error(`  produced:\n${got.replace(/^/gm, '    ')}\n`)
    }
    if (unexplained.length > 5) console.error(`  ...and ${unexplained.length - 5} more.\n`)
    console.error(
      '  If the messages read "the value" where a variable name is expected, the\n' +
        '  harness stopped priming linecache -- see playground/harness.py.\n',
    )
    process.exit(1)
  }

  console.log(`  ${checked} examples reproduce exactly\n`)
}

await main()
