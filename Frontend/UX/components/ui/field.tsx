'use client'

import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { passwordRules, passwordStrength } from '@/lib/validation'

type FieldShellProps = {
  id: string
  label: ReactNode
  /** Rendered on the label row, right-aligned, e.g. a "Forgot?" link. */
  action?: ReactNode
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}

/** Label row, control, then a single message slot that swaps hint for error. */
export function FieldShell({
  id,
  label,
  action,
  hint,
  error,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {children}
      {error ? (
        <p
          id={`${id}-message`}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type TextFieldProps = Omit<ComponentProps<'input'>, 'id'> & {
  label: ReactNode
  action?: ReactNode
  hint?: ReactNode
  error?: string | null
  fieldClassName?: string
}

export function TextField({
  label,
  action,
  hint,
  error,
  fieldClassName,
  className,
  ...props
}: TextFieldProps) {
  const id = useId()
  const described = hint || error ? `${id}-message` : undefined

  return (
    <FieldShell
      id={id}
      label={label}
      action={action}
      hint={hint}
      error={error}
      className={fieldClassName}
    >
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={className}
        {...props}
      />
    </FieldShell>
  )
}

type PasswordFieldProps = Omit<ComponentProps<'input'>, 'id' | 'type'> & {
  label: ReactNode
  action?: ReactNode
  hint?: ReactNode
  error?: string | null
  /** Show the strength meter and the requirement checklist. */
  showStrength?: boolean
  value: string
}

const toneStyles: Record<string, { bar: string; text: string }> = {
  weak: { bar: 'bg-destructive', text: 'text-destructive' },
  fair: { bar: 'bg-warning', text: 'text-warning' },
  good: { bar: 'bg-accent', text: 'text-accent' },
  strong: { bar: 'bg-success', text: 'text-success' },
}

export function PasswordField({
  label,
  action,
  hint,
  error,
  showStrength = false,
  className,
  value,
  ...props
}: PasswordFieldProps) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const described = hint || error ? `${id}-message` : undefined
  const strength = passwordStrength(value)
  const tone = toneStyles[strength.tone]

  return (
    <FieldShell id={id} label={label} action={action} hint={hint} error={error}>
      <div className="relative">
        <Input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [described, showStrength ? `${id}-strength` : null].filter(Boolean).join(' ') ||
            undefined
          }
          className={cn('pr-11', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setRevealed((open) => !open)}
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          className={cn(
            'absolute right-1 top-1 flex size-9 items-center justify-center rounded-md',
            'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {revealed ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {showStrength && (
        <div id={`${id}-strength`} className="flex flex-col gap-2.5 pt-0.5">
          <div className="flex items-center gap-3">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Password strength"
              aria-valuemin={0}
              aria-valuemax={passwordRules.length}
              aria-valuenow={strength.score}
              aria-valuetext={strength.label}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width,background-color] duration-300 ease-out',
                  tone.bar,
                )}
                style={{ width: `${value ? Math.max(strength.percent, 8) : 0}%` }}
              />
            </div>
            <span
              className={cn(
                'w-12 text-right font-mono text-[0.6875rem] uppercase tracking-wider transition-colors',
                value ? tone.text : 'text-muted-foreground/60',
              )}
            >
              {value ? strength.label : ''}
            </span>
          </div>

          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {passwordRules.map((rule) => {
              const met = rule.test(value)
              return (
                <li
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-1.5 text-[0.6875rem] leading-tight transition-colors',
                    met ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full transition-colors',
                      met ? 'bg-success/20 text-success' : 'bg-muted text-transparent',
                    )}
                  >
                    <Check className="size-2.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {rule.label}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </FieldShell>
  )
}
