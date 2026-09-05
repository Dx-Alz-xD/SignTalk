import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & {
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
      <span className="relative flex size-[1.125rem] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className={cn(
            'peer size-[1.125rem] appearance-none rounded-md border border-input bg-elevated',
            'transition-[background-color,border-color] duration-150',
            'hover:border-border-strong',
            'checked:border-primary checked:bg-primary checked:hover:border-primary',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
            className,
          )}
          {...props}
        />
        <Check
          className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
          strokeWidth={3.5}
          aria-hidden="true"
        />
      </span>
      <span className="pt-px leading-snug">{children}</span>
    </label>
  )
}
