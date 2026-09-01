/**
 * Bring the documentation corpus into this repo's build, without ever
 * committing a copy of it.
 *
 * The markdown in lovely-assertions/lovely-assertions is the single source of
 * truth. This script is the only thing that knows how to get it, and it is used
 * identically by `pnpm run dev`, by CI and by a contributor with no credentials
 * -- one code path, so "works in CI, broken locally" cannot happen.
 *
 * Resolution order, first match wins:
 *
 *   1. DOCS_DIR=/path/to/lovely-assertions  -- read straight off disk, zero
 *      network. The contributor-with-both-repos path, and the way to preview a
 *      docs change before it is merged.
 *   2. --ref / DOCS_REF / docs.source.json  -- resolve to an immutable commit
 *      SHA, download that commit's tarball once, cache it by SHA.
 *
 * A tag is resolved to a SHA before anything is downloaded, because a tag can
 * be moved and a SHA cannot: two builds of the same SHA see byte-identical
 * files. The tarball *bytes* are never checksummed -- GitHub has changed its
 * archive compression before and does not promise byte stability -- the
 * extracted files are.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import tar from 'tar-stream'
import { CACHE_DIR, CORPUS_DIR, ROOT, readSourceConfig } from '../pipeline/corpus.ts'
import type { CorpusMeta, SourceConfig } from '../pipeline/types.ts'

const REF_PATTERN = /^[A-Za-z0-9._/-]{1,100}$/

/**
 * A token, if one can be had without asking anyone for anything.
 *
 * CI sets GITHUB_TOKEN. A maintainer usually has `gh` signed in already, and
 * borrowing that beats making them export a variable to run the dev server --
 * the anonymous limit is 60 calls an hour per IP, which a few rebuilds exhaust.
 * Anonymous still works; this only removes a papercut.
 */
function discoverToken(): string | undefined {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (fromEnv) return fromEnv

  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    )
  } catch {
    return undefined
  }
}

const TOKEN = discoverToken()

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': 'lovely-assertions.dev-build' }
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`
  return headers
}

/**
 * A GitHub REST call.
 *
 * Unauthenticated works -- two calls per cold build against a 60/hour per-IP
 * limit -- but CI passes a token so a busy shared runner cannot exhaust it.
 */
async function api<T>(endpoint: string): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: { ...authHeaders(), accept: 'application/vnd.github+json' },
  })
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining')
    const hint = remaining === '0' ? ' (rate limit exhausted -- set GITHUB_TOKEN)' : ''
    throw new Error(`GitHub ${endpoint} -> ${response.status}${hint}`)
  }
  return (await response.json()) as T
}

/**
 * The ref to build from: an explicit flag beats the environment beats the manifest.
 *
 * Truthiness, not nullishness, and that is the whole point of this comment.
 * GitHub Actions exports `DOCS_REF: ${{ inputs.docs_ref }}` as the empty string
 * on every trigger that carries no inputs -- push, schedule, repository_dispatch
 * -- rather than leaving the variable unset. Under `??` that empty string beat
 * the manifest's `latest`, failed the pattern below, and ended the run with
 * `refusing to use ref ""`. Every automatic deploy would have died there, and
 * only a manual one would ever have worked. An empty ref is never a request for
 * a ref, from the environment or from `--ref` with nothing after it.
 */
export function requestedRef(config: SourceConfig): string {
  const flag = process.argv.indexOf('--ref')
  const ref =
    (flag !== -1 ? process.argv[flag + 1] : undefined) || process.env.DOCS_REF || config.ref
  if (!REF_PATTERN.test(ref)) {
    throw new Error(`refusing to use ref ${JSON.stringify(ref)}: not a plausible git ref`)
  }
  return ref
}

interface Resolved {
  readonly ref: string
  readonly sha: string
  readonly resolvedFrom: string
  /**
   * When that commit was authored.
   *
   * The corpus arrives as one tarball at one SHA, so this is the only date the
   * site can honestly claim for any page in it. A per-file date would need
   * history the tarball does not carry.
   */
  readonly committedAt: string
}

interface Commit {
  readonly sha: string
  readonly commit: { readonly committer: { readonly date: string } }
}

/** Turn whatever the manifest asked for into a tag name and an immutable SHA. */
async function resolve(repo: string, ref: string): Promise<Resolved> {
  if (ref === 'latest') {
    const release = await api<{ tag_name: string }>(`/repos/${repo}/releases/latest`)
    const commit = await api<Commit>(`/repos/${repo}/commits/${release.tag_name}`)
    return {
      ref: release.tag_name,
      sha: commit.sha,
      resolvedFrom: 'latest release',
      committedAt: commit.commit.committer.date,
    }
  }
  const commit = await api<Commit>(`/repos/${repo}/commits/${ref}`)
  return {
    ref,
    sha: commit.sha,
    resolvedFrom: 'explicit ref',
    committedAt: commit.commit.committer.date,
  }
}

/** `docs/**` and plain filenames -- the only two shapes the manifest needs. */
function included(relative: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('/**') ? relative.startsWith(pattern.slice(0, -2)) : relative === pattern,
  )
}

/**
 * Stream a commit tarball into a directory.
 *
 * GitHub wraps every archive in one top-level directory whose name embeds the
 * SHA, so the first path segment is dropped rather than matched.
 */
async function extract(
  repo: string,
  sha: string,
  patterns: readonly string[],
  destination: string,
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${repo}/tarball/${sha}`, {
    headers: authHeaders(),
  })
  if (!response.ok) throw new Error(`tarball ${sha} -> ${response.status}`)

  // The archive is a few hundred kilobytes, so it is read whole rather than
  // streamed: an async iterator over a buffer says what this does far more
  // plainly than a pipeline of callbacks, at no cost worth measuring.
  const archive = gunzipSync(Buffer.from(await response.arrayBuffer()))

  const parser = tar.extract()
  parser.end(archive)

  for await (const entry of parser) {
    const relative = entry.header.name.split('/').slice(1).join('/')
    if (entry.header.type !== 'file' || !relative || !included(relative, patterns)) {
      entry.resume()
      continue
    }

    const chunks: Buffer[] = []
    for await (const chunk of entry) chunks.push(Buffer.from(chunk as Uint8Array))

    const target = path.join(destination, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, Buffer.concat(chunks))
  }
}

/** Copy an on-disk tree, for DOCS_DIR and for the SHA cache. */
async function copyFrom(
  source: string,
  patterns: readonly string[],
  destination: string,
): Promise<string[]> {
  const written: string[] = []

  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      const relative = path.relative(source, full)
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        await walk(full)
      } else if (included(relative, patterns)) {
        const target = path.join(destination, relative)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(full, target)
        written.push(relative)
      }
    }
  }

  await walk(source)
  return written.sort()
}

/**
 * Refuse to build a corpus that is missing or truncated.
 *
 * A half-extracted tarball or a repo reorganisation would otherwise produce a
 * site quietly missing pages, which is far worse than a failed build.
 */
async function check(
  written: readonly string[],
  expect: SourceConfig['expect'],
  destination: string,
): Promise<void> {
  const problems: string[] = []

  if (written.length < expect.minFiles) {
    problems.push(`expected at least ${expect.minFiles} files, got ${written.length}`)
  }
  for (const required of expect.requiredPaths) {
    if (!written.includes(required)) problems.push(`missing required file: ${required}`)
  }
  for (const [file, floor] of Object.entries(expect.minLines)) {
    if (!written.includes(file)) continue
    const contents = await fs.readFile(path.join(destination, file), 'utf8')
    const lines = contents.split('\n').length
    if (lines < floor) problems.push(`${file} has ${lines} lines, expected at least ${floor}`)
  }

  if (problems.length > 0) {
    throw new Error(`the fetched corpus does not look right:\n  - ${problems.join('\n  - ')}`)
  }
}

/** A hash of the extracted files, so a build can prove which corpus it rendered. */
async function digest(written: readonly string[], destination: string): Promise<string> {
  const hash = createHash('sha256')
  for (const relative of written) {
    hash.update(relative)
    hash.update(await fs.readFile(path.join(destination, relative)))
  }
  return hash.digest('hex')
}

async function main(): Promise<void> {
  const config = await readSourceConfig()
  await fs.rm(CORPUS_DIR, { recursive: true, force: true })
  await fs.mkdir(CORPUS_DIR, { recursive: true })

  let source: CorpusMeta['source']
  let written: string[]

  const local = process.env.DOCS_DIR
  if (local) {
    const resolved = path.resolve(local)
    console.log(`\n  reading docs from disk: ${resolved}`)
    console.log('  (DOCS_DIR is set -- no network, and this may include unreleased changes)\n')
    written = await copyFrom(resolved, config.include, CORPUS_DIR)
    source = {
      kind: 'local',
      repo: config.repo,
      path: resolved,
      ref: 'main',
      sha: null,
      // Reading from disk, so the corpus is whatever is there now.
      committedAt: new Date().toISOString(),
    }
  } else {
    const resolved = await resolve(config.repo, requestedRef(config))
    const cached = path.join(CACHE_DIR, resolved.sha)

    try {
      await fs.access(cached)
      console.log(`\n  docs ${resolved.ref} (${resolved.sha.slice(0, 8)}) -- cached`)
    } catch {
      console.log(`\n  docs ${resolved.ref} (${resolved.sha.slice(0, 8)}) -- downloading`)
      await fs.mkdir(cached, { recursive: true })
      await extract(config.repo, resolved.sha, config.include, cached)
    }
    written = await copyFrom(cached, config.include, CORPUS_DIR)
    source = { kind: 'github', repo: config.repo, path: null, ...resolved }
  }

  await check(written, config.expect, CORPUS_DIR)

  const meta: CorpusMeta = {
    source,
    files: written.length,
    sha256: await digest(written, CORPUS_DIR),
    corpus: written,
  }

  await fs.mkdir(path.join(ROOT, 'public'), { recursive: true })
  await fs.writeFile(
    path.join(ROOT, 'public', 'meta.json'),
    `${JSON.stringify({ ...meta, corpus: undefined }, null, 2)}\n`,
  )
  await fs.writeFile(path.join(CORPUS_DIR, '.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)

  console.log(`  ${meta.files} files, sha256 ${meta.sha256.slice(0, 12)}\n`)
}

// Only when run as a script. `requestedRef` is exported so a test can pin the
// rule that an empty `DOCS_REF` is no ref at all, and importing this file to
// reach it must not start a network fetch.
if (import.meta.main) await main()
