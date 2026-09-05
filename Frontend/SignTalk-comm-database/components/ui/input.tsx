import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const inputBaseClass = cn(
  'h-11 w-full rounded-lg border border-input bg-elevated px-3.5 text-sm text-foreground',
  'shadow-[inset_0_1px_0_oklch(1_0_0/4%)] transition-[color,box-shadow,border-color,background-color] duration-150',
  'placeholder:text-muted-foreground/70',
  'hover:border-border-strong',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30',
)

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(inputBaseClass, className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select data-slot="select" className={cn(inputBaseClass, 'cursor-pointer appearance-none', className)} {...props}>
      {children}
    </select>
  )
}
