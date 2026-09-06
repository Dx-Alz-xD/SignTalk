import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site'

/**
 * Only public, indexable routes belong here. /app is the signed-in workspace
 * and is marked noindex, so listing it would contradict its own robots meta.
 *
 * Bump LAST_MODIFIED when page content meaningfully changes; deriving it from
 * the build date would claim every deploy changed the content.
 */
const LAST_MODIFIED = new Date('2026-09-06')

// The desktop build exports the site statically, which requires route handlers
// to declare that they are static. Harmless for the server build - this file
// has no dynamic input either way.
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl('/'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: absoluteUrl('/signup'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/forgot-password'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/about'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/terms'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified: LAST_MODIFIED,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ]
}
