/**
 * Where the fetched corpus lives, and how to read it.
 *
 * Both the fetch step and the render step need these paths, and a second
 * spelling of any of them is a bug waiting for a rename.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { CorpusMeta, SourceConfig } from './types.ts'

export const ROOT = path.resolve(import.meta.dirname, '..')
export const CACHE_DIR = path.join(ROOT, '.docs-cache')
export const CORPUS_DIR = path.join(CACHE_DIR, 'current')
export const GENERATED_DIR = path.join(ROOT, '.generated')

const META = '.meta.json'

export async function readSourceConfig(): Promise<SourceConfig> {
  const raw = await fs.readFile(path.join(ROOT, 'docs.source.json'), 'utf8')
  return JSON.parse(raw) as SourceConfig
}

/** What the fetch step recorded about the corpus now on disk. */
export async function readCorpusMeta(): Promise<CorpusMeta> {
  try {
    const raw = await fs.readFile(path.join(CORPUS_DIR, META), 'utf8')
    return JSON.parse(raw) as CorpusMeta
  } catch {
    throw new Error('no corpus on disk. Run `pnpm run docs:fetch` first.')
  }
}

/** Every file the fetch step brought in, repo-relative and sorted. */
export async function corpusFiles(): Promise<string[]> {
  const files: string[] = []

  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name !== META) files.push(path.relative(CORPUS_DIR, full))
    }
  }

  await walk(CORPUS_DIR)
  return files.sort()
}

export function readCorpusFile(repoPath: string): Promise<string> {
  return fs.readFile(path.join(CORPUS_DIR, repoPath), 'utf8')
}
