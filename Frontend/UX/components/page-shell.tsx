import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * The outer page frame shared by every route.
 *
 *   app   pages under /app: the frame (top bar, menu, start-up gate) comes
 *         from app/app/layout.tsx, so this renders the page alone. The
 *         `windowTitle` name survives from the earlier framed design; the top
 *         bar derives its title from the route now, so it is unused here but
 *         kept so pages need not change.
 *   auth  sign in, sign up, recovery, not-found: the page alone, full bleed.
 */
export function PageShell({
  variant = 'app',
  children,
}: {
  windowTitle?: string
  variant?: 'app' | 'auth'
  children: ReactNode
}) {
  if (variant === 'auth') {
    return (
      <div className="bg-mesh flex min-h-svh flex-col">
        <nav
          aria-label="Site"
          className="sticky top-0 z-40 flex h-11 items-center justify-center gap-1 border-b bg-card/70 px-4 text-sm backdrop-blur-md"
        >
          {[
            ['/', 'Home'],
            ['/about', 'About'],
            ['/terms', 'Terms'],
            ['/privacy', 'Privacy'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {label}
            </Link>
          ))}
        </nav>
        <main className="animate-screen-in flex flex-1 flex-col">{children}</main>
      </div>
    )
  }
  return <div className="animate-screen-in flex flex-1 flex-col">{children}</div>
}
