// The desktop build (desktop/) sets DESKTOP_BUILD=1 and needs a static export it
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


  images: {
    unoptimized: true,
  },

  // The Content-Security-Policy is not here: it carries a per-request nonce,
  // so it is set in proxy.ts. These are the headers that never vary.
  // A static export has no server to send them - the desktop app is served
  // from disk - so Next drops this whole block for that build.
  ...(desktop
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                // Do not let a browser guess a type we did not send; that
                // guess is how an uploaded file comes back as script.
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                // Clickjacking: nobody frames this app. frame-ancestors in
                // the CSP says the same thing to newer browsers.
                { key: 'X-Frame-Options', value: 'DENY' },
                // Never leak the path someone was on to another site - these
                // URLs carry language and symbol ids.
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                // The camera is the whole app, so it is allowed here and
                // nowhere else; anything embedded gets nothing.
                {
                  key: 'Permissions-Policy',
                  value: 'camera=(self), microphone=(self), geolocation=()',
                },
                // Two years of HTTPS-only. Harmless on localhost, which
                // browsers exempt from HSTS.
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains',
                },
              ],
            },
          ]
        },
      }),
}

export default nextConfig
