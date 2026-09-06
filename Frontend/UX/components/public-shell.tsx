import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Frame for the public, signed-out pages: About, Terms, Privacy. A slim
 * header with the logo and the three page links, the document in a readable
 * measure, and a footer that repeats the links. Nothing here needs a session.
 */

export const PUBLIC_PAGES = [
  { href: '/about', label: 'About' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
] as const

export function PublicShell({
  current,
  eyebrow,
  title,
  lede,
  updated,
  children,
}: {
  current: (typeof PUBLIC_PAGES)[number]['href']
  eyebrow: string
  title: string
  lede: string
  /** "Last updated" line for the legal documents. */
  updated?: string
  children: ReactNode
}) {
  return (
    <div className="bg-mesh flex min-h-svh flex-col">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <SignTalkLockup href="/" />
          <nav aria-label="About SignTalk" className="ml-2 hidden items-center gap-1 sm:flex">
            {PUBLIC_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                aria-current={page.href === current ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  page.href === current
                    ? 'bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {page.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Sign in
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
              Create account
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-40 size-[30rem] rounded-full bg-primary opacity-[0.10] blur-[120px]"
          />
          <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {lede}
            </p>
            {updated && (
              <p className="mt-4 font-mono text-xs text-muted-foreground">Last updated {updated}</p>
            )}
          </div>
        </section>

        <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">{children}</div>
      </main>

      <footer className="border-t bg-card/60">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <SignTalkLockup href="/" wordmarkClassName="text-xs" markClassName="size-5" />
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-4">
            {PUBLIC_PAGES.map((page) => (
              <Link key={page.href} href={page.href} className="hover:text-foreground">
                {page.label}
              </Link>
            ))}
            <Link href="/" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
          <p>Sign language that speaks your signs.</p>
        </div>
      </footer>
    </div>
  )
}

// ------------------------------------------------------------- typography --
// The long documents are ordinary HTML; these give it a readable measure and
// rhythm without a typography plugin.

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-3xl text-[0.9375rem] leading-relaxed text-foreground/90',
        '[&_h2]:mt-12 [&_h2]:scroll-mt-20 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2:first-child]:mt-0',
        '[&_h3]:mt-8 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight',
        '[&_p]:mt-4',
        '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6',
        '[&_li]:pl-1',
        '[&_strong]:font-semibold [&_strong]:text-foreground',
        '[&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem]',
        '[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
        '[&_th]:border-b [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground',
        '[&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top',
      )}
    >
      {children}
    </div>
  )
}

/** A two-column layout with a sticky table of contents beside the document. */
export function WithContents({
  sections,
  children,
}: {
  sections: { id: string; label: string }[]
  children: ReactNode
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[13rem_1fr]">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-20 flex flex-col gap-1">
          <p className="mb-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
            On this page
          </p>
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {section.label}
            </a>
          ))}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Feature card for the About page. */
export function Feature({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-elevated p-5">
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
        {icon}
      </span>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
