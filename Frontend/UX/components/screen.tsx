'use client'

import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The frame inside the app frame: every workspace screen is a header and a
 * body. The top bar and the menu belong to AppFrame, so a screen header only
 * names the screen, says what it is for, and carries that screen's actions.
 *
 * `back` is for going up a level inside a screen (out of a profile, out of a
 * training session), not for getting home: the logo and the menu do that.
 */

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-1 flex-col', className)}>{children}</div>
}

export function ScreenHeader({
  title,
  subtitle,
  icon,
  back,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  icon?: ReactNode
  back?: { label: string; onClick: () => void }
  actions?: ReactNode
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b px-5 py-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {back && (
          <>
            <Button variant="ghost" size="sm" onClick={back.onClick} className="text-muted-foreground">
              <ArrowLeft aria-hidden="true" />
              {back.label}
            </Button>
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          </>
        )}
        {icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
            {icon}
          </span>
        )}
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-base font-semibold leading-tight tracking-tight">{title}</h2>
          {subtitle && (
            <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function ScreenBody({
  children,
  className,
  wide = false,
}: {
  children: ReactNode
  className?: string
  /** Fills the width; otherwise the content is held to a readable measure. */
  wide?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8',
        !wide && 'mx-auto w-full max-w-6xl',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Centred spinner-with-words, for a screen that is still loading. */
export function ScreenLoading({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-2.5 px-6 py-16 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
      />
      {children}
    </div>
  )
}
