import type { Metadata } from 'next'
import Link from 'next/link'
import { Compass, Info, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Page not found',
  description:
    'That SignTalk page does not exist. Head back to sign in, create an account, or reset your password.',
  robots: { index: false, follow: true },
}

/**
 * Every route here is one click away, so a wrong URL is a detour rather than
 * a dead end. Next.js serves this with a real 404 status.
 */
const destinations = [
  { href: '/', title: 'Sign in', description: 'Get back to your interpreter and trainer.', icon: LogIn },
  { href: '/signup', title: 'Create an account', description: 'New here? Set one up in a minute.', icon: UserPlus },
  {
    href: '/forgot-password',
    title: 'Reset your password',
    description: 'Get a code by email or SMS.',
    icon: KeyRound,
  },
  {
    href: '/about',
    title: 'About SignTalk',
    description: 'What it does and how it works.',
    icon: Info,
  },
]

export default function NotFound() {
  return (
    <PageShell windowTitle="Page not found" variant="auth">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 sm:px-10">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
            <Compass className="size-6" aria-hidden="true" />
          </span>
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Error 404
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            We couldn&rsquo;t find that page
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The link may be out of date, or the address may have a typo in it. Here is
            everything else on SignTalk.
          </p>
        </div>

        <nav aria-label="Site pages" className="w-full max-w-md">
          <ul className="flex flex-col gap-3">
            {destinations.map(({ href, title, description, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex items-center gap-4 rounded-xl border border-border bg-elevated p-4 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-raised focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{title}</span>
                    <span className="text-[0.8125rem] leading-relaxed text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Back to sign in
        </Link>
      </div>
    </PageShell>
  )
}
