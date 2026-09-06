import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A message about the form as a whole rather than one field, a refused
 * sign-in, a server that isn't answering, a password that was just changed.
 */
export function FormAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success'
  children: ReactNode
}) {
  if (!children) return null
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle

  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3.5 py-3 text-xs leading-relaxed',
        tone === 'success'
          ? 'border-success/25 bg-success/10 text-success'
          : 'border-destructive/25 bg-destructive/10 text-destructive',
      )}
    >
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
