/**
 * The route table and the href resolver, tested on the shapes that actually
 * appear in the corpus rather than on invented ones.
 */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { resolveHref, routeFor, UnmappedSource } from '../pipeline/routes.ts'

describe('routeFor', () => {
  test('maps the docs index and its sections', () => {
    assert.equal(routeFor('docs/README.md')?.route, '/docs/')
    assert.equal(routeFor('docs/reference/README.md')?.route, '/docs/reference/')
    assert.equal(routeFor('docs/guides/strings.md')?.route, '/docs/guides/strings/')
  })

  test('a section index wins over the generic page rule', () => {
    // Tried in the other order, docs/reference/README.md becomes
    // /docs/reference/README/ and the section index disappears.
    assert.notEqual(routeFor('docs/reference/README.md')?.route, '/docs/reference/README/')
  })

  test('maps the root policy files', () => {
    assert.equal(routeFor('CHANGELOG.md')?.route, '/changelog/')
    assert.equal(routeFor('CONTRIBUTING.md')?.route, '/contributing/')
    assert.equal(routeFor('CODE_OF_CONDUCT.md')?.route, '/code-of-conduct/')
    assert.equal(routeFor('SECURITY.md')?.route, '/security/')
  })

  test('the license is verbatim, never markdown', () => {
    assert.equal(routeFor('LICENSE')?.mode, 'verbatim')
  })

  test('the README feeds the designed home page rather than becoming one', () => {
    assert.equal(routeFor('README.md')?.mode, 'extracted')
  })

  test('the generated reference is marked as generated', () => {
    assert.equal(routeFor('docs/reference/assertions.md')?.generated, 'generate_reference.py')
  })

  test('agent instructions are excluded, not published', () => {
    assert.equal(routeFor('CLAUDE.md'), null)
  })

  test('an unknown file fails the build instead of being dropped', () => {
    assert.throws(() => routeFor('docs/guides/deep/nested/page.md'), UnmappedSource)
    assert.throws(() => routeFor('pyproject.toml'), UnmappedSource)
  })
})

describe('resolveHref', () => {
  test('the three spellings of the changelog all converge', () => {
    // Resolving before mapping is the whole point: a string replace would send
    // these to three different places.
    assert.equal(resolveHref('README.md', 'CHANGELOG.md'), 'CHANGELOG.md')
    assert.equal(resolveHref('docs/README.md', '../CHANGELOG.md'), 'CHANGELOG.md')
    assert.equal(resolveHref('docs/reference/assertions.md', '../../CHANGELOG.md'), 'CHANGELOG.md')
  })

  test('../README.md from a docs page is the docs index, not the marketing home', () => {
    assert.equal(
      resolveHref('docs/getting-started/chaining-and-narrowing.md', '../README.md'),
      'docs/README.md',
    )
  })

  test('a sibling link stays in its own section', () => {
    assert.equal(resolveHref('docs/guides/strings.md', 'sequences.md'), 'docs/guides/sequences.md')
  })

  test('a link up and across resolves', () => {
    assert.equal(
      resolveHref('docs/guides/strings.md', '../reference/assertions.md'),
      'docs/reference/assertions.md',
    )
  })
})
