import type { ReactNode } from 'react'
import Link from 'next/link'
import { SignTalkMark } from '@/components/signtalk-mark'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * The drawn application window every route sits inside. The title comes from
 * the route rather than a lookup table, so a new page cannot forget to name
 * itself.
 */
export function AppWindow({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="relative w-full max-w-5xl">
      {/* Ambient wash so the window sits in a space rather than on a flat page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-16 -top-24 bottom-0 -z-10 opacity-90 blur-3xl"
        style={{
          background:
            'radial-gradient(60% 55% at 25% 12%, var(--glow-a), transparent 70%), radial-gradient(55% 50% at 82% 88%, var(--glow-b), transparent 70%)',
        }}
      />

      <div className="flex w-full flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-window">
        <header className="relative flex h-11 shrink-0 items-center gap-3 border-b bg-secondary/70 px-3 backdrop-blur-sm sm:px-4">
          <div className="flex w-16 shrink-0 items-center gap-2 sm:w-20" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57] ring-1 ring-inset ring-black/10" />
            <span className="size-3 rounded-full bg-[#febc2e] ring-1 ring-inset ring-black/10" />
            <span className="size-3 rounded-full bg-[#28c840] ring-1 ring-inset ring-black/10" />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <Link
              href="/"
              aria-label="SignTalk home"
              className="flex min-w-0 items-center gap-2 rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SignTalkMark compact className="size-4 shrink-0" />
              <span className="truncate text-xs font-medium tracking-tight text-muted-foreground">
                {title}
              </span>
            </Link>
          </div>

          <div className="flex w-16 shrink-0 justify-end sm:w-20">
            <ThemeToggle />
          </div>
        </header>

        <div className="flex min-h-[32rem] flex-1 flex-col sm:min-h-[36rem] lg:min-h-[38rem]">
          {/* Replays the enter animation on each route rather than snapping. */}
          <div className="flex flex-1 flex-col animate-screen-in">{children}</div>
        </div>
      </div>
    </div>
  )
}
