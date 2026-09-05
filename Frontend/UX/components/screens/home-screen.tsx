'use client'

import {
  ArrowUpRight,
  Database,
  GraduationCap,
  Keyboard,
  Languages,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { cn } from '@/lib/utils'
import type { AccountDetails } from '@/lib/account-session'

type Action = {
  id: 'translator' | 'trainer' | 'direct-paste' | 'community'
  title: string
  description: string
  icon: LucideIcon
  meta: string
  /** Set once the destination exists; without it the card is inert. */
  href?: string
  /** Muted chip for things that aren't wired up yet. */
  pending?: boolean
}

const featured: Action = {
  id: 'translator',
  title: 'Translator',
  description:
    'Live sign-to-text transcription, with optional translation to other spoken or signed languages.',
  icon: Languages,
  meta: 'Camera · live',
}

const actions: Action[] = [
  {
    id: 'trainer',
    title: 'Trainer',
    description: 'Record a new letter, word, or phrase and add it to your vocabulary.',
    icon: GraduationCap,
    meta: 'Any sign language',
  },
  {
    id: 'direct-paste',
    title: 'Direct Paste',
    description:
      'Transcribe in the background, typing into whatever text field has focus.',
    icon: Keyboard,
    meta: 'Background mode',
  },
  {
    id: 'community',
    title: 'Community Database',
    description: 'Share your trained signs, or download sets contributed by others.',
    icon: Database,
    meta: 'Community',
    href: '/app/community',
  },
]

function initials(account: AccountDetails | null) {
  const source = account?.username?.trim() || account?.email?.split('@')[0] || ''
  if (!source) return 'ST'
  const words = source.split(/[\s._-]+/).filter(Boolean)
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2)
  return letters.toUpperCase()
}

export function HomeScreen({ account = null }: { account?: AccountDetails | null }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3.5 sm:px-8">
        <SignTalkLockup />

        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-2 rounded-full border bg-elevated py-1 pl-2.5 pr-3 text-xs text-muted-foreground">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inset-0 animate-breathe rounded-full bg-accent" />
              <span className="relative size-2 rounded-full bg-accent" />
            </span>
            Camera idle
          </span>
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.6875rem] font-semibold text-primary ring-1 ring-inset ring-primary/20"
            title={account?.username || account?.email || 'Your account'}
          >
            {initials(account)}
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-7 px-5 py-9 sm:px-8">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">What would you like to do?</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pick a workspace to get started.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <FeaturedCard action={featured} />
          <div className="grid gap-4 sm:grid-cols-3">
            {actions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const cardBase = cn(
  'group relative overflow-hidden rounded-xl border border-border bg-elevated text-left',
  'transition-[border-color,box-shadow,transform] duration-200',
  'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-raised',
  'active:translate-y-0 active:shadow-none',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
)

/**
 * A card is a real link once its destination exists, so the route is
 * crawlable and openable in a new tab. Cards with nowhere to go yet stay
 * buttons - focusable and announced, but inert.
 */
function CardShell({
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

/** The one thing most people open the app to do, so it gets the most weight. */
function FeaturedCard({ action }: { action: Action }) {
  const { title, description, icon: Icon, meta, href } = action
  return (
    <CardShell href={href} className={cn(cardBase, 'p-5 sm:p-6 hover:border-primary/45')}>
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
          <span className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </span>
        </span>
        <ArrowUpRight
          className="ml-auto hidden size-5 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:block"
          aria-hidden="true"
        />
      </span>
    </CardShell>
  )
}

function ActionCard({ action }: { action: Action }) {
  const { title, description, icon: Icon, meta, pending, href } = action
  return (
    <CardShell
      href={href}
      className={cn(cardBase, 'flex min-h-40 flex-col gap-3.5 p-5 hover:border-primary/45')}
    >
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
        <span className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <Chip muted={pending}>{meta}</Chip>
    </CardShell>
  )
}

function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
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
