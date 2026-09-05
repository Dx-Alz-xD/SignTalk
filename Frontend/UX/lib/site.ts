/**
 * One source of truth for anything that needs the site's absolute URL:
 * canonical tags, Open Graph, sitemap.xml, robots.txt and JSON-LD.
 *
 * Set NEXT_PUBLIC_SITE_URL in the deployment environment. The fallback only
 * exists so local builds produce valid absolute URLs.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://signtalk.app'
).replace(/\/+$/, '')

export const SITE_NAME = 'SignTalk'

export const SITE_TAGLINE = 'Sign language that speaks your signs'

export const SITE_DESCRIPTION =
  'SignTalk interprets sign language from your camera in real time, translates between sign languages, and lets you train any sign yourself.'

/** Absolute URL for a route, for canonicals and structured data. */
export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname === '/' ? '' : pathname}`
}
