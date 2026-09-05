// The desktop build (app/) sets DESKTOP_BUILD=1 and needs a static export it
// can serve from disk. The web build is unaffected - no output key is set.
const desktop = process.env.DESKTOP_BUILD === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(desktop ? { output: 'export' } : {}),

  // No browser source maps in production: they ship the full readable source
  // to anyone who opens devtools, and they are dead weight on every deploy.
  productionBrowserSourceMaps: false,

  // Nothing gains from advertising the framework in a response header.
  poweredByHeader: false,

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },
}

export default nextConfig
