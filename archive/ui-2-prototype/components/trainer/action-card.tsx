import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Action = {
  title: string
  description: string
  icon: LucideIcon
  meta: string
  /** Muted chip for things that aren't wired up yet. */
  pending?: boolean
  href?: string
}

const cardBase = cn(
  'group relative overflow-hidden rounded-xl border border-border bg-elevated text-left',
  'transition-[border-color,box-shadow,transform] duration-200',
  'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised hover:border-primary/45',
  'active:translate-y-0 active:shadow-none',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
)

/** Renders as a link when the destination exists, and a button while it doesn't. */
function Shell({
  href,
  className,
  children,
}: {
  href?: string
  className: string
  children: ReactNode
}) {
  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={className}>
      {children}
    </button>
  )
}

/** The one thing most people open the trainer to do, so it gets the most weight. */
export function FeaturedCard({ action }: { action: Action }) {
  const { title, description, icon: Icon, meta, href } = action

  return (
    <Shell href={href} className={cn(cardBase, 'block p-5 sm:p-6')}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-52 rounded-full bg-primary opacity-[0.09] blur-3xl transition-opacity duration-300 group-hover:opacity-[0.16]"
      />
      <span className="relative flex items-start gap-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-raised">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{title}</span>
            <Chip>{meta}</Chip>
          </span>
          <span className="max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</span>
        </span>
        <ArrowUpRight
          className="ml-auto hidden size-5 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:block"
          aria-hidden="true"
        />
      </span>
    </Shell>
  )
}

export function ActionCard({ action }: { action: Action }) {
  const { title, description, icon: Icon, meta, pending, href } = action

  return (
    <Shell href={href} className={cn(cardBase, 'flex min-h-40 flex-col gap-3.5 p-5')}>
      <span className="flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <ArrowUpRight
          className="size-4 text-muted-foreground opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      </span>
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="font-semibold tracking-tight">{title}</span>
        <span className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <Chip muted={pending}>{meta}</Chip>
    </Shell>
  )
}

export function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'w-fit rounded-full border px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider',
        muted
          ? 'border-border bg-muted/60 text-muted-foreground'
          : 'border-primary/25 bg-primary/10 text-primary',
      )}
    >
      {children}
    </span>
  )
}
