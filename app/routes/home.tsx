import { useState } from 'react'
import { absolute } from '../../pipeline/origin.ts'
import { licenceOf, pythonFloor } from '../../pipeline/release.ts'
import { Agents } from '../components/home/Agents.tsx'
import { Claims } from '../components/home/Claims.tsx'
import { Comparison } from '../components/home/Comparison.tsx'
import { DocsIndex } from '../components/home/DocsIndex.tsx'
import { Hero, HeroCode } from '../components/home/Hero.tsx'
import { Install } from '../components/home/Install.tsx'
import { Promises } from '../components/home/Promises.tsx'
import { SiteFooter } from '../components/home/SiteFooter.tsx'
import { MarketingHeader } from '../components/MarketingHeader.tsx'
import { loadCorpusMeta, loadWheelMeta } from '../lib/content.server.ts'
import type { InstallTool } from '../lib/install.ts'
import { socialMeta } from '../lib/meta.ts'
import type { Route } from './+types/home'

const DESCRIPTION =
  "A zero-dependency Python assertion library for pytest and unittest: expect() offers only the assertions valid for your value's type, narrowing survives the chain, and every failure message names the value, the requirement and what it actually held."

export async function loader() {
  // Both facts are read from the release this build ships, so the page cannot
  // advertise a version it does not document or a Python floor the package no
  // longer has. Every surface that states them reads this one loader.
  const [meta, wheel] = await Promise.all([loadCorpusMeta(), loadWheelMeta()])
  return {
    version: meta.source.ref.replace(/^v/, ''),
    python: pythonFloor(wheel.requiresPython),
    licence: licenceOf(wheel.licence),
  }
}

export function meta({ loaderData }: Route.MetaArgs) {
  // No literal fallback. A hardcoded version here would be a second spelling
  // that only ever appears when the first one failed -- which is exactly when
  // nobody would notice it had gone stale.
  const { version, python, licence } = loaderData

  return [
    ...socialMeta({
      title: 'lovely-assertions — fluent, strictly-typed assertions for Python tests',
      cardTitle: 'lovely-assertions',
      description: DESCRIPTION,
      route: '/',
      type: 'website',
    }),
    {
      'script:ld+json': {
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: 'lovely-assertions',
        description: DESCRIPTION,
        // The three places this library exists. `sameAs` is what lets a crawler
        // treat the PyPI project, the repository and this site as one thing
        // rather than three unrelated pages about the same name.
        url: absolute('/'),
        sameAs: [
          'https://pypi.org/project/lovely-assertions/',
          'https://github.com/lovely-assertions/lovely-assertions',
        ],
        codeRepository: 'https://github.com/lovely-assertions/lovely-assertions',
        programmingLanguage: 'Python',
        runtimePlatform: `Python ${python}`,
        license: licence.url,
        softwareVersion: version,
        keywords: ['python', 'testing', 'assertions', 'pytest', 'unittest', 'type-safety'],
      },
    },
  ]
}

export default function Home({ loaderData }: Route.ComponentProps) {
  // One choice, read by both selectors, the hero pill and the install block.
  const [tool, setTool] = useState<InstallTool>('uv')

  return (
    <div className="marketing halo">
      {/* The docs have had one of these all along; the marketing page carried
          the target id and no way to reach it, so a keyboard reader had to walk
          the whole navbar on the one page that is pure navigation. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <MarketingHeader />
      {/* `tabIndex={-1}` so the jump actually lands: Safari and iOS VoiceOver
          do not honour the fragment's focus-navigation starting point on their
          own, which makes the link a no-op for exactly the readers it is for. */}
      <main id="main" tabIndex={-1}>
        <Hero
          tool={tool}
          onToolChange={setTool}
          version={loaderData.version}
          python={loaderData.python}
        />
        <HeroCode />
        <Comparison />
        <Claims />
        <Agents />
        <Install tool={tool} onToolChange={setTool} />
        <Promises />
        <DocsIndex />
      </main>
      <SiteFooter licence={loaderData.licence.id} />
    </div>
  )
}
