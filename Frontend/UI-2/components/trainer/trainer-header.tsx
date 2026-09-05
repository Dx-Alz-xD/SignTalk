"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { BookOpen, ChevronRight, Download, Menu, Settings, Sparkles } from "lucide-react"

interface Crumb {
  label: string
  href?: string
}

interface TrainerHeaderProps {
  crumbs: Crumb[]
}

const menuItems = [
  { icon: BookOpen, label: "Documentation", hint: "Guides & API" },
  { icon: Download, label: "Export model", hint: "Soon" },
  { icon: Settings, label: "Studio settings", hint: "Soon" },
]

export function TrainerHeader({ crumbs }: TrainerHeaderProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[linear-gradient(100deg,oklch(0.46_0.2_18),oklch(0.54_0.23_24)_45%,oklch(0.5_0.21_12))] shadow-[0_2px_24px_-8px_oklch(0.5_0.2_22_/_0.65)]">
      {/* Slow highlight travelling across the bar */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-sheen h-full w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      </div>

      <div className="relative flex items-center justify-between gap-4 px-6 py-3.5 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="SignTalk home">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background p-1 shadow-sm ring-1 ring-inset ring-black/5 transition-transform duration-300 hover:-rotate-6">
              <Image
                src="/signtalk-mark.png"
                alt=""
                width={256}
                height={256}
                preload
                className="size-full object-contain"
              />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-base font-bold tracking-tight text-white">SignTalk</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">Studio</span>
            </span>
          </Link>

          <span aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-white/20 sm:block" />

          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1 overflow-hidden rounded-lg bg-background/95 px-3 py-2 text-sm shadow-sm ring-1 ring-inset ring-black/5 backdrop-blur">
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1
                return (
                  <li key={crumb.label} className="flex shrink-0 items-center gap-1">
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className="font-medium text-muted-foreground transition-colors hover:text-primary"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={isLast ? "page" : undefined}
                        className={isLast ? "font-semibold text-primary" : "font-medium text-muted-foreground"}
                      >
                        {crumb.label}
                      </span>
                    )}
                    {!isLast && <ChevronRight className="size-4 text-muted-foreground/40" />}
                  </li>
                )
              })}
            </ol>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-inset ring-white/20 md:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
              <span className="relative inline-flex size-2 rounded-full bg-white" />
            </span>
            Local session
          </span>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Open menu"
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex size-10 items-center justify-center rounded-lg bg-background text-foreground shadow-sm ring-1 ring-inset ring-black/5 transition-colors hover:text-primary"
            >
              <Menu className="size-5" />
            </button>

            {open && (
              <div
                role="menu"
                aria-label="Menu"
                className="absolute right-0 top-full z-20 mt-2 w-60 origin-top-right rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl duration-150 animate-in fade-in zoom-in-95 slide-in-from-top-1"
              >
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <item.icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-medium">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground">{item.hint}</span>
                  </button>
                ))}
                <div className="my-1.5 h-px bg-border" />
                <p className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-ember" />
                  Models are stored on this device
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
