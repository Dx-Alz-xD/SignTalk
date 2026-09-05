import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

// The desktop build exports the site statically, which requires route handlers
// to declare that they are static. Harmless for the server build - this file
// has no dynamic input either way.
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The signed-in workspace holds nothing a crawler can use, and Next's
        // build output directory should never be fetched directly.
        disallow: ['/app', '/_next/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
