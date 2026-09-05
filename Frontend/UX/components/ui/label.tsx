import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'text-[0.8125rem] font-medium leading-none text-foreground select-none',
        'peer-disabled:opacity-55',
        className,
      )}
      {...props}
    />
  )
}
