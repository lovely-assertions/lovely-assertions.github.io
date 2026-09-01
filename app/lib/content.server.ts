/**
 * Reading the rendered corpus.
 *
 * Only route loaders import this, and loaders run at build time, so none of it
 * reaches the browser -- a reader downloads finished HTML with no markdown
 * machinery behind it.
 *
 * Node APIs only: this is loaded by Vite during the prerender pass, which runs
 * under Node regardless of what installed the packages.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { WheelMeta } from '../../pipeline/release.ts'
import type { CorpusMeta, Page } from '../../pipeline/types.ts'

const GENERATED = path.resolve(import.meta.dirname, '../../.generated')
const PUBLIC = path.resolve(import.meta.dirname, '../../public')

/** A route becomes the flat filename the build wrote. */
function fileNameFor(route: string): string {
  if (route === '/') return 'index'
  return route.replace(/^\/|\/$/g, '').replace(/\//g, '__')
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

export function loadPage(route: string): Promise<Page | null> {
  return readJson<Page>(path.join(GENERATED, 'pages', `${fileNameFor(route)}.json`))
}

/*
 * There is deliberately no `loadIndex` here.
 *
 * One existed, exported and documented, and nothing called it. `scripts/agents.ts`
 * reads `.generated/pages.json` itself and declares its own row type, and the
 * two Omits had already drifted -- this one kept `examples`, that one drops it --
 * so the exported helper was quietly telling the next caller that a row carries
 * every worked example, which `pipeline/build.ts` writes to a separate file. A
 * dead reader with a wrong type is worse than no reader.
 */

/**
 * The release the playground runs, which is also the release the site describes.
 *
 * Written by `scripts/fetch-wheel.ts` from PyPI's own metadata, so the version
 * and the Python floor on the marketing page come from the package rather than
 * from someone remembering to edit a string.
 */
export async function loadWheelMeta(): Promise<WheelMeta> {
  const meta = await readJson<WheelMeta>(path.join(PUBLIC, 'playground', 'wheel.json'))
  if (!meta) throw new Error('no wheel metadata. Run `pnpm run wheel:fetch` first.')
  return meta
}

/** Which corpus this build rendered, for the "built from" line in the footer. */
export async function loadCorpusMeta(): Promise<Omit<CorpusMeta, 'corpus'>> {
  const meta = await readJson<Omit<CorpusMeta, 'corpus'>>(path.join(PUBLIC, 'meta.json'))
  if (!meta) throw new Error('no corpus metadata. Run `pnpm run docs:fetch` first.')
  return meta
}
