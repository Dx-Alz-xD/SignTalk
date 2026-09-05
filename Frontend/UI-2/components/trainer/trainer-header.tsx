'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronRight, Download, Menu, Settings, Sparkles } from 'lucide-react'
import { SignTalkLockup } from '@/components/trainer/signtalk-lockup'

interface Crumb {
  label: string
  href?: string
}

interface TrainerHeaderProps {
  crumbs: Crumb[]
  /** Status shown in the chip on the right — the camera state, mostly. */
  status?: string
}

const menuItems = [
  { icon: BookOpen, label: 'Documentation', hint: 'Guides & API' },
  { icon: Download, label: 'Export model', hint: 'Soon' },
  { icon: Settings, label: 'Studio settings', hint: 'Soon' },
]

export function TrainerHeader({ crumbs, status = 'Camera idle' }: TrainerHeaderProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3.5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" aria-label="SignTalk home" className="shrink-0 rounded-md">
          <SignTalkLockup />
        </Link>

        <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border-strong sm:block" />

        <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
          <ol className="flex items-center gap-1 font-mono text-[0.6875rem] uppercase tracking-wider">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <li key={crumb.label} className="flex shrink-0 items-center gap-1">
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="text-muted-foreground transition-colors hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={isLast ? 'page' : undefined}
                      className={isLast ? 'text-foreground' : 'text-muted-foreground'}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <ChevronRight className="size-3 text-muted-foreground/50" />}
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span className="hidden items-center gap-2 rounded-full border bg-elevated py-1 pl-2.5 pr-3 text-xs text-muted-foreground sm:flex">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inset-0 animate-breathe rounded-full bg-accent" />
            <span className="relative size-2 rounded-full bg-accent" />
          </span>
          {status}
        </span>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Open menu"
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Menu className="size-4" />
          </button>

          {open && (
            <div
              role="menu"
              aria-label="Menu"
              className="absolute right-0 top-full z-20 mt-2 w-60 origin-top-right rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-window duration-150 animate-in fade-in zoom-in-95 slide-in-from-top-1"
            >
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <item.icon className="size-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                    {item.hint}
                  </span>
                </button>
              ))}
              <div className="my-1.5 h-px bg-border" />
              <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-accent" />
                Models are stored on this device
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
