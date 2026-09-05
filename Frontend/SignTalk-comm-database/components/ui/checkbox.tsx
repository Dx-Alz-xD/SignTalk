'use client'

import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type ControlProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** Renders the dash state for a partially-selected group. */
  indeterminate?: boolean
}

/** The box on its own, for table cells and other places with no inline label. */
export function CheckboxControl({ className, indeterminate = false, ...props }: ControlProps) {
  const ref = useRef<HTMLInputElement>(null)

  // `indeterminate` is a DOM property, not an attribute, so React can't set it.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <span className="relative flex size-[1.125rem] shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'peer size-[1.125rem] appearance-none rounded-[5px] border-[1.5px] border-muted-foreground/45 bg-elevated',
          'transition-[background-color,border-color] duration-150',
          'hover:border-muted-foreground/80',
          'checked:border-primary checked:bg-primary checked:hover:border-primary',
          'indeterminate:border-primary indeterminate:bg-primary',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
          'disabled:cursor-not-allowed disabled:opacity-55',
          className,
        )}
        {...props}
      />
      {indeterminate ? (
        <Minus
          className="pointer-events-none absolute size-3 text-primary-foreground"
          strokeWidth={3.5}
          aria-hidden="true"
        />
      ) : (
        <Check
          className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
          strokeWidth={3.5}
          aria-hidden="true"
        />
      )}
    </span>
  )
}

type CheckboxProps = ControlProps & {
  children: ReactNode
  labelClassName?: string
}

export function Checkbox({ children, className, labelClassName, ...props }: CheckboxProps) {
  return (
    <label
      className={cn(
        'flex w-fit cursor-pointer select-none items-start gap-2.5 text-sm text-muted-foreground',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55',
        labelClassName,
      )}
    >
      <CheckboxControl className={className} {...props} />
      <span className="pt-px leading-snug">{children}</span>
    </label>
  )
}
