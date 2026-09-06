'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The icon depends on a client-only value, so hold the server markup until
  // after hydration rather than risk a mismatch.
  useEffect(() => setMounted(true), [])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme` : 'Switch theme'}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-muted-foreground',
        'transition-colors hover:bg-muted hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {mounted && resolved === 'dark' ? (
        <Sun className="size-3.5" aria-hidden="true" />
      ) : (
        <Moon className="size-3.5" aria-hidden="true" />
      )}
    </button>
  )
}
