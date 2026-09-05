import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/site'

/**
 * Emits a JSON-LD block. Server-rendered, so it is present in the page source
 * for crawlers that never execute JavaScript.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      // The input is our own literals, never user content.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export type Crumb = { name: string; href: string }

/** schema.org BreadcrumbList matching the visible trail on the page. */
export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.href),
    })),
  }
}

/** The page itself, tied back to the site-wide WebSite node in the layout. */
export function webPageSchema({
  name,
  description,
  path,
}: {
  name: string
  description: string
  path: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name,
    description,
    isPartOf: { '@id': `${SITE_URL}/#website` },
    about: { '@id': `${SITE_URL}/#app` },
    inLanguage: 'en',
    publisher: { '@id': `${SITE_URL}/#organization` },
  }
}

/** Everything a normal page needs, in one call. */
export function PageSchema({
  name,
  description,
  path,
  crumbs,
}: {
  name: string
  description: string
  path: string
  crumbs?: Crumb[]
}) {
  const graph: object[] = [webPageSchema({ name, description, path })]
  if (crumbs?.length) graph.push(breadcrumbSchema(crumbs))
  return <JsonLd data={graph} />
}

export { SITE_NAME }
