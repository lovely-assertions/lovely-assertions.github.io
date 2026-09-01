import { Link } from 'react-router'
import type { PageFooter } from '../../pipeline/types.ts'

/**
 * The "See also" / "Next" trailer, lifted out of the markdown body.
 *
 * The corpus spells this five different ways; one component renders all of
 * them, so a reader sees the same affordance at the foot of every page.
 */
export function PageFooterLinks({ footer }: { footer: PageFooter }) {
  const isNext = footer.kind === 'next'

  return (
    <nav className="doc-next" aria-label={isNext ? 'Next page' : 'Related pages'}>
      <p className="doc-next-label">{isNext ? 'Next' : 'See also'}</p>
      <ul>
        {footer.links.map((link) => (
          <li key={link.href}>
            <Link to={link.href} prefetch="intent">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
