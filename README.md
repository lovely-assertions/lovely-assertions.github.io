# lovely-assertions.dev

The marketing and documentation site for
[lovely-assertions](https://github.com/lovely-assertions/lovely-assertions),
published to GitHub Pages at <https://lovely-assertions.dev>.

## The documentation is not in this repository

It lives in the library repo, under `docs/`, and it stays there. Every build
fetches that markdown from the latest released tag and renders it; nothing is
copied here, and no page is written twice. Change a page upstream and the site
changes, including which pages exist and what order they appear in.

That has a consequence worth stating plainly: **a page cannot be edited here.**
The "Edit this page on GitHub" link on every page points at the library repo,
which is the only place the text exists.

## Running it

```bash
corepack enable
pnpm install
pnpm dev
```

Node 24 or newer, which runs the TypeScript in `scripts/` and `pipeline/`
directly. pnpm is pinned by `packageManager`, so corepack installs the right one.

Working on the docs and the site at the same time? Point the build at your own
checkout, and skip the network entirely:

```bash
DOCS_DIR=../lovely-assertions pnpm dev
```

That previews a documentation change *before* it is merged, which the released
tag by definition cannot.

## How a page is made

| Step | What happens |
|---|---|
| `pnpm run docs:fetch` | Resolves the latest release to an immutable commit SHA, downloads that commit's tarball once, caches it by SHA, and refuses a corpus that is missing files |
| `pnpm run docs:render` | Parses each file, rewrites its links into site routes, pairs every example with its verified output, and writes `.generated/` |
| `pnpm run wheel:fetch` | Downloads the published wheel the playground runs, checking it against the digest PyPI published |
| `pnpm run build` | Pre-renders one HTML file per route |
| `pnpm run search:index` | Builds the search index from the HTML that actually ships |
| `pnpm run sitemap` | Writes the sitemap, and fails if a route was not built, if nothing links to one, or if a link on any page goes nowhere |
| `pnpm run agents` | Publishes the site a second time for programs: a `.md` twin of every page, `/llms.txt` and `/llms-full.txt` |
| `pnpm run gate:parity` | Replays every documented example through the playground and requires byte-identical output |
| `pnpm run gate:runnable` | Checks that what the site offers to run is what the parity gate verified, and that editing a block restores |
| `pnpm run gate:agents` | Checks every promise the site makes to a program, including that each code block is byte-identical to the corpus |
| `pnpm run gate:layout` | Loads every route at every width the design is verified against, and fails if anything scrolls sideways |
| `pnpm run gate:motion` | Triggers every animation the design specifies in a real browser and watches the property move |

`pnpm run ci` runs all of it. CI runs it in three steps -- `ci:before`, the
build, then `ci:after` -- because the pre-render pass has a cold-start race and
the documented workaround is to retry the build alone. The gate list itself
lives only in `package.json`: both workflows used to spell it out step by step,
and the two lists had already drifted apart.

Three assets are generated and committed rather than rebuilt on every deploy,
because they change only when the design does:

```bash
pnpm run fonts:fetch && pnpm run og:make && pnpm run icons:make
```

`tests/design.test.ts` is what keeps the last of those honest: it asserts that
`public/icon.svg` is drawn in the brand colours the stylesheet defines, so an
icon left behind by a palette change fails the build rather than shipping.

### Why pre-rendered, not a single-page app

GitHub Pages serves static files. A client-rendered app answers every deep link
with a 404 status — the fallback paints a page, but the status stays 404 — and
search engines only queue 200 responses for rendering. A documentation site
built that way is unindexable one route deep. So every route is a real file.

### The signature convention

The library's own test suite executes every `python` block in the docs and
byte-compares the `text` block after it against what the code really printed.
So those two blocks are not two snippets that happen to be adjacent: they are a
claim and its evidence. The renderer joins them into one unit with a labelled
output pane, because rendered as two identical code blocks a reader has no way
to tell the second one is real.

There are 242 of them, and the count is pinned in `docs.source.json`. If an
upstream edit puts prose between an example and its output, the pairing breaks
and the build fails rather than quietly downgrading every page.

## The design

`app/styles/tokens.css` is the whole palette, type scale and spacing set. Every
other stylesheet refers to those names and defines no colour of its own, so the
design changes in one file.

Two rules in it are load-bearing. Colours stay in `oklch()` — the palette is one
family of pastels at near-equal lightness, and hex approximations break the
coherence — **except** the handful that get animated, which are hex because
interpolating from `oklch()` is unreliable. And contrast is not a matter of
taste: the call-to-action sits at lightness 0.47 because white on a lighter pink
fails AA, and the documentation's muted foreground is dark for the same reason.
Re-measure anything you change, in both themes.

The documentation is the only surface with a dark theme, so it reads through a
smaller semantic layer (`--fg`, `--bg-soft`, `--panel`). A documentation
component styled with a marketing token does not flip, and goes illegible the
moment someone turns the lights off — there is a test for exactly that.

Motion is CSS. The design was authored against GSAP, but everything in it except
the sparkles maps onto transitions and keyframes, and a site whose subject is a
zero-dependency library should not ship an animation runtime to move three dots.
`prefers-reduced-motion` turns off the JavaScript too, not just the keyframes.

## What fails the build

- A documentation file with no route, or a route with no file
- A link to something that does not exist, or an anchor to a heading that does not
- A code fence in a language nothing styles
- A page with no title, or no description for its meta tag
- A page that nothing links to from `docs/README.md`
- Fewer verified examples than expected
- Two headings on one page that produce the same anchor
- A documented example the playground reproduces differently
- Any page that scrolls sideways, at any width
- A documentation component styled with a token that does not flip with the theme

Each one is a way the site could otherwise ship subtly wrong and look fine.

## Layout

```
pipeline/    markdown -> HTML, with no framework import, so it runs in CI alone
scripts/     fetching the corpus, and building the search index
app/         the React site: routes, components, styles
tests/       gates over the rendered corpus
```

`app/styles/tokens.css` is the only file that defines a colour. Everything else
refers to a role, so the visual design changes in one place.
