'use client'

import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The shapes every screen is built from: a section with a heading, a panel,
 * an empty state, a stat tile, a settings row, a switch, a segmented choice
 * and a loading skeleton.
 *
 * Screens used to spell each of these out inline, which is how six slightly
 * different card paddings and four different heading sizes happened. One
 * definition each keeps the app looking like one app.
 */

// ------------------------------------------------------------------ section --

export function Section({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h3 className="mt-1 text-lg font-semibold tracking-tight">{title}</h3>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

// -------------------------------------------------------------------- panel --

export function Panel({
  title,
  description,
  icon,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-elevated',
        // A hairline of light along the top edge, so a panel reads as raised
        // rather than as a rectangle drawn on the page.
        'shadow-[inset_0_1px_0_oklch(1_0_0/6%)]',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="font-semibold tracking-tight">{title}</h3>}
              {description && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('flex flex-1 flex-col gap-4 p-5', bodyClassName)}>{children}</div>
      {footer && <div className="border-t bg-card/40 px-5 py-3">{footer}</div>}
    </div>
  )
}

// -------------------------------------------------------------- empty state --

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-elevated/50 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- stat tile --

export function StatTile({
  label,
  value,
  hint,
  loading = false,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  loading?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card/70 p-4 backdrop-blur transition-colors hover:border-border-strong',
        className,
      )}
      title={hint}
    >
      <span className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-7 w-14" />
      ) : (
        <span className="font-mono text-2xl font-semibold tracking-tight">{value}</span>
      )}
    </div>
  )
}

// ----------------------------------------------------------------- skeleton --

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-md bg-muted', className)} aria-hidden="true" />
}

// ------------------------------------------------------------ settings row --

/** One setting: a label and hint on the left, its control on the right. */
export function Setting({
  label,
  hint,
  htmlFor,
  control,
  children,
  stacked = false,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  /** Rendered on the right of the label row. */
  control?: ReactNode
  /** Rendered under the label row, full width. */
  children?: ReactNode
  stacked?: boolean
}) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className={cn('flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0')}>
      <div className={cn('flex gap-4', stacked ? 'flex-col' : 'items-start justify-between')}>
        <Label htmlFor={htmlFor} className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium">{label}</span>
          {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
        </Label>
        {control && <div className="flex shrink-0 items-center">{control}</div>}
      </div>
      {children}
    </div>
  )
}

// -------------------------------------------------------------------- switch --

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Accessible name when the visible label sits elsewhere. */
  label: string
  disabled?: boolean
  id?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

// ----------------------------------------------------------------- segmented --

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string; icon?: ReactNode }[]
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex items-center gap-1 rounded-xl border bg-card p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary text-primary-foreground shadow-raised'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// -------------------------------------------------------------------- slider --

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  format,
  className,
  ...rest
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  label: string
  format?: (value: number) => string
  className?: string
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max' | 'step' | 'type'>) {
  // The track is filled up to the value, which is what makes a slider
  // readable at a glance; the thumb itself is styled in globals.css.
  const filled = max > min ? ((value - min) / (max - min)) * 100 : 0

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, var(--primary) ${filled}%, var(--muted) ${filled}%)`,
        }}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
        {...rest}
      />
      <span className="w-14 shrink-0 text-right font-mono text-xs text-foreground">
        {format ? format(value) : value}
      </span>
    </div>
  )
}

// -------------------------------------------------------------------- badge --

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const tones = {
    neutral: 'border-border bg-muted/60 text-muted-foreground',
    primary: 'border-primary/25 bg-primary/10 text-primary',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  } as const
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
