/**
 * Content Security Policy, per request.
 *
 * CSP is the difference between an XSS bug that steals a session and one that
 * does nothing: the session cookie is already HttpOnly, and this stops the
 * injected script from running at all. It is enforced with a nonce - a fresh
 * random value each request that Next.js stamps onto its own script tags -
 * rather than 'unsafe-inline', which would allow exactly what we are blocking.
 *
 * Anything inline that we write ourselves has to carry the nonce too; see the
 * theme bootstrap and the JSON-LD block in app/layout.tsx.
 *
 * Note: this file is Next 16's `proxy.ts`, the former `middleware.ts`.
 * It does not run in the desktop build, which is a static export served from
 * disk - see next.config.mjs.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * The API's origin, when it has one of its own, for connect-src.
 *
 * Returns '' when the API is same-origin - deployments set
 * NEXT_PUBLIC_SIGNTALK_API=/api and let next.config.mjs proxy it, and 'self'
 * already covers that. A relative path must not be emitted as a source: CSP
 * matches on scheme/host/port, so '/api' would be a malformed source
 * expression, and browsers drop the whole directive when they meet one.
 */
function apiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SIGNTALK_API ?? 'http://localhost:8000'
  try {
    const url = new URL(configured)
    // Only http(s) has an origin worth naming. Anything else - a bare path, a
    // Windows path, a file: URL - yields the opaque origin, whose serialisation
    // is the string "null", and emitting that would poison the directive.
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const isDev = process.env.NODE_ENV === 'development'
  const api = apiOrigin()

  const policy = [
    `default-src 'self'`,

    // 'strict-dynamic' lets the nonced Next.js bundle load the chunks it needs
    // without us listing every one. 'wasm-unsafe-eval' is what MediaPipe needs
    // to instantiate the hand tracker; it permits WebAssembly and nothing else
    // - notably not eval() of JavaScript. React needs real 'unsafe-eval' in
    // development only, to rebuild server stack traces in the browser.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,

    // Inline styles stay allowed deliberately. React components set style=""
    // attributes constantly (every popover position, every progress bar), and
    // a nonce cannot cover an attribute - the strict version of this directive
    // breaks the UI outright. The threat it would answer, CSS exfiltration, is
    // far narrower than script injection, which is nonce-gated above.
    `style-src 'self' 'unsafe-inline'`,

    // blob: is the camera frame drawn to a canvas and every symbol picture,
    // which arrives as bytes over fetch and becomes an object URL.
    `img-src 'self' blob: data:`,
    `media-src 'self' blob:`,
    `font-src 'self' data:`,

    // The hand tracker runs in a worker created from a blob.
    `worker-src 'self' blob:`,

    // storage.googleapis.com is the hand model's fallback source, used only
    // when this server does not have the file (lib/hand-tracker.ts). Drop it
    // if you would rather the app fail closed than reach Google - the model is
    // normally served from the API, and the tracker prefers that copy.
    `connect-src ${['\'self\'', api, 'https://storage.googleapis.com', ...(isDev ? ['ws:', 'http://localhost:*'] : [])].filter(Boolean).join(' ')}`,

    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Off in development, where the API is plain http on localhost.
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  // Next.js reads the nonce back out of this header while rendering, and
  // applies it to the framework and page scripts on its own.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: [
    {
      // Static assets are served straight from disk and carry no script, so
      // they neither need the policy nor the per-request work of minting one.
      // /api is the rewrite to the backend, which sets its own headers and
      // answers with JSON - a page policy on it is wasted work per request.
      source: '/((?!api|_next/static|_next/image|favicon.ico|mediapipe|models).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
