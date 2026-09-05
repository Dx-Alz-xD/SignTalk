import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BrandPanel } from '@/components/brand-panel'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { cn } from '@/lib/utils'

/** Brand panel on the left, a single centred column of form on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 md:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <section className="flex flex-col justify-center px-6 py-10 sm:px-10 md:px-12">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-7">
          <Link
            href="/"
            aria-label={`${'SignTalk'} home`}
            className="w-fit rounded-md md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SignTalkLockup />
          </Link>
          {children}
        </div>
      </section>
    </div>
  )
}

const backButtonClass = cn(
  '-ml-1 -mt-1 flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground',
  'transition-colors hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
)

/**
 * Renders a real anchor when given an href, so the route is a crawlable
 * internal link rather than a button only JavaScript can follow. The onClick
 * form is kept for moving between steps inside a single page.
 */
export function BackButton({
  href,
  onClick,
  children,
}: {
  href?: string
  onClick?: () => void
  children: ReactNode
}) {
  const content = (
    <>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={backButtonClass}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={backButtonClass}>
      {content}
    </button>
  )
}

/**
 * The page's single h1. Every route passes a different title, so no two pages
 * share a top-level heading.
 */
export function AuthHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode
  title: string
  description: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {icon && (
        <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
          {icon}
        </span>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

/** A step heading inside a page that already has its h1. */
export function StepHeading({
  icon,
  title,
  description,
}: {
  icon?: ReactNode
  title: string
  description: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {icon && (
        <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
          {icon}
        </span>
      )}
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

export function LegalNote() {
  return (
    <p className="text-center text-xs leading-relaxed text-muted-foreground">
      By continuing you agree to the SignTalk terms of use.
    </p>
  )
}
