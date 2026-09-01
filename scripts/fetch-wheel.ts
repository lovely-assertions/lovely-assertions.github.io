/**
 * Fetch the published wheel, so the playground runs the real library.
 *
 * Shipping the wheel ourselves rather than calling `micropip.install` at runtime
 * removes micropip from the bundle, removes a round trip to PyPI on every cold
 * start, removes PyPI as a runtime dependency of this site, and -- the reason
 * that actually matters -- pins the playground to a known version instead of
 * whatever PyPI serves that day. A wheel with no compiled extensions is just a
 * zip of importable modules, so `sys.path` can point straight at it.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { ROOT, readCorpusMeta } from '../pipeline/corpus.ts'
import type { WheelMeta } from '../pipeline/release.ts'

const PACKAGE = 'lovely-assertions'
const OUT = path.join(ROOT, 'public', 'playground')

interface PyPiFile {
  filename: string
  url: string
  packagetype: string
  digests: { sha256: string }
}

interface PyPiRelease {
  info: { version: string; requires_python: string; license_expression: string | null }
  urls: PyPiFile[]
}

/**
 * The version to ship.
 *
 * The docs are built from a git tag and the wheel comes from PyPI, and they are
 * the same release only because the tag is `v` plus the version. When they are
 * not -- someone built the site from `main`, or from an older tag -- the
 * playground would be running code the surrounding page does not describe, so
 * the mismatch is reported rather than papered over.
 */
async function wanted(): Promise<{ version: string; matchesDocs: boolean }> {
  const meta = await readCorpusMeta()
  const fromTag = /^v(\d+\.\d+\.\d+.*)$/.exec(meta.source.ref)?.[1]

  const release = (await (
    await fetch(`https://pypi.org/pypi/${PACKAGE}/json`, {
      headers: { accept: 'application/json' },
    })
  ).json()) as PyPiRelease

  const latest = release.info.version
  return { version: fromTag ?? latest, matchesDocs: fromTag === latest }
}

async function main(): Promise<void> {
  const { version, matchesDocs } = await wanted()

  const response = await fetch(`https://pypi.org/pypi/${PACKAGE}/${version}/json`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`PyPI has no ${PACKAGE} ${version} (HTTP ${response.status})`)
  }
  const release = (await response.json()) as PyPiRelease

  const wheel = release.urls.find(
    (file) => file.packagetype === 'bdist_wheel' && file.filename.endsWith('-py3-none-any.whl'),
  )
  if (!wheel) {
    throw new Error(`${PACKAGE} ${version} has no pure-Python wheel; the playground needs one`)
  }

  const bytes = Buffer.from(await (await fetch(wheel.url)).arrayBuffer())

  // PyPI publishes the hash it expects; a wheel that does not match it is not
  // the wheel that was released.
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== wheel.digests.sha256) {
    throw new Error(`${wheel.filename} does not match the digest PyPI published`)
  }

  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(path.join(OUT, 'lovely_assertions.whl'), bytes)
  await fs.writeFile(
    path.join(OUT, 'wheel.json'),
    // `requires_python` and `license_expression` are recorded here because this
    // is where the release is read. The hero badge, the JSON-LD and llms.txt all
    // state the floor, and all three used to type it out; now the release tells
    // them. The licence is here for a sharper reason: it was typed out in four
    // places, the library changed it, and all four went on saying MIT. A release
    // is the only thing that knows which licence its own artifact carries.
    `${JSON.stringify(
      {
        package: PACKAGE,
        version,
        filename: wheel.filename,
        sha256: digest,
        requiresPython: release.info.requires_python,
        licence: release.info.license_expression,
      } satisfies WheelMeta,
      null,
      2,
    )}\n`,
  )

  console.log(`\n  wheel ${version} (${(bytes.length / 1024).toFixed(0)} KiB)`)
  if (!matchesDocs) {
    console.log('  note: the docs are not built from this release, so the playground may')
    console.log('        run code the surrounding pages do not describe.')
  }
  console.log()
}

try {
  await main()
} catch (error) {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
