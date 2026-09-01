/**
 * Gates over the rendered corpus.
 *
 * These run against .generated/, so they check what the site will actually
 * serve rather than what the pipeline intended. Every one passes today, which
 * means any failure is a real regression -- upstream or here -- and not a
 * threshold that wants tuning.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, test } from 'node:test'
import GithubSlugger from 'github-slugger'
import type { Page } from '../pipeline/types.ts'
import { requestedRef } from '../scripts/fetch-docs.ts'

const GENERATED = path.resolve(import.meta.dirname, '../.generated')

const index = JSON.parse(await readFile(path.join(GENERATED, 'pages.json'), 'utf8')) as Omit<
  Page,
  'html'
>[]

async function bodyOf(route: string): Promise<string> {
  const name = route === '/' ? 'index' : route.replace(/^\/|\/$/g, '').replace(/\//g, '__')
  const page = JSON.parse(
    await readFile(path.join(GENERATED, 'pages', `${name}.json`), 'utf8'),
  ) as Page
  return page.html
}

const reference = index.find((page) => page.repoPath === 'docs/reference/assertions.md')

describe('the slug algorithm', () => {
  // The docs were written against GitHub's slugger and 94 anchors depend on it.
  // These are the ones whose slug is not obvious; if a dependency bump changes
  // any of them, links that work on GitHub break here.
  const golden = [
    ['Expect[T]', 'expectt'],
    ['CollectionExpect[E, C]', 'collectionexpecte-c'],
    ['MappingExpect[K, V]', 'mappingexpectk-v'],
    ['RaisedExpect[E]', 'raisedexpecte'],
    ['Claim 1 — typed discoverability', 'claim-1--typed-discoverability'],
    [
      'all_satisfy asserts; it does not return a verdict',
      'all_satisfy-asserts-it-does-not-return-a-verdict',
    ],
    ['Floating point: is_close_to', 'floating-point-is_close_to'],
    ['Why not just ==', 'why-not-just-'],
    ['Descending: .which, .and_ and .whose_value', 'descending-which-and_-and-whose_value'],
  ] as const

  for (const [heading, slug] of golden) {
    test(`${heading} -> ${slug}`, () => {
      assert.equal(new GithubSlugger().slug(heading), slug)
    })
  }
})

describe('every page', () => {
  test('has a title', () => {
    assert.deepEqual(
      index.filter((page) => !page.title).map((page) => page.repoPath),
      [],
    )
  })

  test('has a description for its meta tag', () => {
    assert.deepEqual(
      index.filter((page) => !page.description).map((page) => page.repoPath),
      [],
    )
  })

  test('has a unique route', () => {
    const routes = index.map((page) => page.route)
    assert.equal(new Set(routes).size, routes.length)
  })

  test('has no duplicate heading anchors', () => {
    // GithubSlugger would silently append -1, and a link written against the
    // GitHub rendering would land on the wrong section.
    const clashes: string[] = []
    for (const page of index) {
      const seen = new Set<string>()
      for (const heading of page.headings) {
        if (seen.has(heading.id)) clashes.push(`${page.repoPath}#${heading.id}`)
        seen.add(heading.id)
      }
    }
    assert.deepEqual(clashes, [])
  })
})

describe('links', () => {
  test('every internal anchor resolves to a heading that exists', async () => {
    const anchors = new Map(
      index.map((page) => [page.route, new Set(page.headings.map((heading) => heading.id))]),
    )
    const broken: string[] = []

    for (const page of index) {
      const html = await bodyOf(page.route)
      for (const match of html.matchAll(/href="(\/[^"#]*\/)#([^"]+)"/g)) {
        const [, route, fragment] = match
        if (!route || !fragment) continue
        const ids = anchors.get(route)
        if (!ids) broken.push(`${page.repoPath} -> ${route} (no such page)`)
        else if (!ids.has(fragment)) {
          broken.push(`${page.repoPath} -> ${route}#${fragment} (no such heading)`)
        }
      }
    }

    assert.deepEqual(broken, [])
  })

  test('no rendered link still points at a .md file', async () => {
    const leaked: string[] = []
    for (const page of index) {
      const html = await bodyOf(page.route)
      for (const match of html.matchAll(/href="([^"]*\.md(?:#[^"]*)?)"/g)) {
        // Links out to the library repo's own files are allowed to be .md.
        if (match[1]?.startsWith('https://github.com/')) continue
        leaked.push(`${page.repoPath} -> ${match[1]}`)
      }
    }
    assert.deepEqual(leaked, [])
  })
})

describe('the signature convention', () => {
  test('every verified example carries both panes', async () => {
    const html = await bodyOf('/docs/getting-started/reading-failures/')
    const figures = html.match(/<figure class="example" data-verified="true">/g) ?? []
    assert.ok(figures.length > 0)
    assert.equal((html.match(/class="example-source"/g) ?? []).length, figures.length)
    assert.equal((html.match(/class="example-output"/g) ?? []).length, figures.length)
  })

  test('the output pane is never syntax highlighted', async () => {
    // An output block is a transcript, not a listing. Colouring it would claim
    // it is code the reader could run.
    const html = await bodyOf('/docs/getting-started/reading-failures/')
    for (const match of html.matchAll(/<div class="example-output"><pre([^>]*)>/g)) {
      assert.ok(!(match[1] ?? '').includes('shiki'))
    }
  })

  test('the generated reference pairs its examples too', () => {
    // These only pair because untagged fences are normalised to `text` first.
    assert.equal(reference?.verifiedExamples, 23)
  })
})

describe('the generated reference', () => {
  test('gains the sub-headings its markdown does not have', () => {
    const generated = reference?.headings.filter((heading) => heading.siteGenerated) ?? []
    assert.equal(generated.length, 113)
  })

  test('namespaces repeated sub-headings by their subject class', () => {
    // "What a failure looks like" appears under twenty classes; a bare slug
    // would collide and the anchors would point at the wrong one.
    const repeated =
      reference?.headings
        .filter((heading) => heading.text === 'What a failure looks like')
        .map((heading) => heading.id) ?? []
    assert.ok(repeated.length > 1)
    assert.equal(new Set(repeated).size, repeated.length)
  })
})

describe('callouts', () => {
  test('every blockquote becomes a callout of a known kind', async () => {
    const kinds = new Map<string, number>()
    for (const page of index) {
      const html = await bodyOf(page.route)
      // A blockquote that kept its default rendering was missed by the plugin.
      assert.ok(
        !/<blockquote(?![^>]*class="callout")/.test(html),
        `${page.repoPath} has a bare blockquote`,
      )
      for (const match of html.matchAll(/class="callout" data-kind="(\w+)"/g)) {
        const kind = match[1] ?? ''
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
      }
    }

    // The corpus has 20 blockquotes; every one is classified, and the counts
    // are pinned so a change upstream is a deliberate one. The five tips that
    // arrived at 0.2.0 are the `Full signatures:` pointers added to the guides
    // that own a subject and were not linking the reference -- which is the
    // shape this inference was written for, reaching five more pages.
    assert.deepEqual([...kinds.entries()].sort(), [
      ['careful', 6],
      ['note', 1],
      ['tip', 13],
    ])
  })

  test('the reference pointers are tips, not warnings', async () => {
    // "Full signatures: …" is navigation help. Rendering it as a caution would
    // tell the reader to worry about a cross-reference.
    const html = await bodyOf('/docs/guides/strings/')
    const callout = html.match(/class="callout" data-kind="(\w+)"/)
    assert.equal(callout?.[1], 'tip')
  })
})

describe('command tabs', () => {
  test('adjacent shell blocks become one tabbed group', async () => {
    const html = await bodyOf('/docs/getting-started/installation/')
    assert.ok(html.includes('data-tab="pyright"'))
    assert.ok(html.includes('data-tab="mypy"'))

    // Both panels ship in the HTML, so the content is there without scripting.
    assert.equal((html.match(/data-panel="/g) ?? []).length, 2)
  })

  test('commands separated by prose are left alone', async () => {
    // installation.md explains why you would pick uv before showing it. Folding
    // those two commands into tabs would delete the sentence that does it.
    const html = await bodyOf('/docs/getting-started/installation/')
    const groups = (html.match(/class="tab-track"/g) ?? []).length
    assert.equal(groups, 1, 'only the adjacent pair should group')
    assert.ok(html.includes('which is what the project itself uses'))
  })
})

describe('which ref the corpus is fetched from', () => {
  const manifest = { ref: 'latest' } as never

  function withEnv(value: string | undefined, run: () => void): void {
    const before = process.env.DOCS_REF
    if (value === undefined) delete process.env.DOCS_REF
    else process.env.DOCS_REF = value
    try {
      run()
    } finally {
      if (before === undefined) delete process.env.DOCS_REF
      else process.env.DOCS_REF = before
    }
  }

  test('an empty DOCS_REF is no ref, not a ref of ""', () => {
    // GitHub Actions exports `DOCS_REF: ${{ inputs.docs_ref }}` as the empty
    // string on push, schedule and repository_dispatch, because those triggers
    // carry no inputs. Under `??` that empty string beat the manifest and every
    // automatic deploy ended with `refusing to use ref ""` -- a failure that
    // could only ever appear on the first real deploy.
    withEnv('', () => {
      assert.equal(requestedRef(manifest), 'latest')
    })
  })

  test('a real DOCS_REF still wins', () => {
    withEnv('v0.1.0', () => {
      assert.equal(requestedRef(manifest), 'v0.1.0')
    })
  })

  test('no DOCS_REF falls through to the manifest', () => {
    withEnv(undefined, () => {
      assert.equal(requestedRef(manifest), 'latest')
    })
  })
})
