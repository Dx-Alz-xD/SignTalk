'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Clapperboard,
  Database,
  GraduationCap,
  Keyboard,
  Languages,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { LoadingScreen } from '@/components/screens/loading-screen'
import { SessionContext, type SessionValue } from '@/components/session'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { ThemeToggle } from '@/components/theme-toggle'
import { fetchAccount, signOut, type Account } from '@/lib/auth'
import {
  DEFAULT_PREFERENCES,
  fetchPreferences,
  resetPreferences,
  savePreferences,
  withChanges,
  type PreferenceChanges,
  type Preferences,
} from '@/lib/preferences'
import { applyTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * The signed-in app's frame, mounted once by app/app/layout.tsx and kept
 * across every page change inside /app, so nothing here re-animates when a
 * link is clicked.
 *
 * It owns three things every screen depends on: the start-up sequence, the
 * navigation, and the session (who is signed in and what they have set).
 * Until this tab has booted, the frame shows the loading screen and nothing
 * else: no menu to wander off through, no page underneath. Someone who is not
 * signed in is sent to the sign-in page, whatever /app URL they typed.
 */

type Item = {
  href: string
  label: string
  hint: string
  icon: LucideIcon
  exact?: boolean
  group: 'do' | 'manage'
}

export const NAV: Item[] = [
  { href: '/app', label: 'Home', hint: 'Your workspace', icon: LayoutDashboard, exact: true, group: 'do' },
  { href: '/app/translator', label: 'Translator', hint: 'Signs to text and back', icon: Languages, group: 'do' },
  { href: '/app/trainer', label: 'Trainer', hint: 'Teach new signs', icon: GraduationCap, group: 'do' },
  { href: '/app/direct-paste', label: 'Direct Paste', hint: 'Type by signing', icon: Keyboard, group: 'do' },
  { href: '/app/video', label: 'Video Translator', hint: 'Signs over a spoken video', icon: Clapperboard, group: 'do' },
  { href: '/app/community', label: 'Community', hint: 'Shared sign languages', icon: Database, group: 'do' },
  { href: '/app/account', label: 'Account', hint: 'Details, security, publishing', icon: UserRound, group: 'manage' },
  { href: '/app/settings', label: 'Settings', hint: 'Camera, recognition, appearance', icon: Settings, group: 'manage' },
]

const BOOTED_KEY = 'signtalk-booted'

function alreadyBooted(): boolean {
  try {
    return sessionStorage.getItem(BOOTED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberBooted(remember: boolean) {
  try {
    if (remember) sessionStorage.setItem(BOOTED_KEY, '1')
    else sessionStorage.removeItem(BOOTED_KEY)
  } catch {
    // Private mode: the splash simply plays again next time.
  }
}

function titleFor(pathname: string): string {
  if (pathname.startsWith('/app/users/')) return 'Profile'
  const found = NAV.find((item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
  )
  return found?.label ?? 'SignTalk'
}

type Phase = 'checking' | 'splash' | 'ready'

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // Server and first client render agree on 'checking'; the effect below
  // decides between the splash and going straight in.
  const [phase, setPhase] = useState<Phase>('checking')
  const [settled, setSettled] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const restored = useRef<Account | null>(null)

  const [open, setOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const skipSplash = alreadyBooted()
    if (!skipSplash) setPhase('splash')

    fetchAccount(controller.signal)
      .then(async (found) => {
        if (controller.signal.aborted) return
        restored.current = found
        setAccount(found)
        if (!found) {
          // Not signed in: the sign-in page comes first, always.
          rememberBooted(false)
          router.replace('/')
          return
        }
        // Settings ride along with the boot, so the camera and the recogniser
        // never briefly run on defaults the person has changed.
        try {
          const saved = await fetchPreferences(controller.signal)
          if (!controller.signal.aborted) setPreferences(saved)
        } catch {
          // Defaults are a fine place to be if this one call fails.
        }
        if (!controller.signal.aborted) {
          setPreferencesReady(true)
          if (skipSplash) setPhase('ready')
        }
      })
      .catch(() => {
        // An unreachable API is not proof of being signed out; the page's own
        // requests will report it. Let a booted tab through.
        if (!controller.signal.aborted && skipSplash) setPhase('ready')
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true)
      })
    return () => controller.abort()
  }, [router])

  // The account's theme and motion preference win over whatever this device
  // had set, so they follow the person between machines.
  useEffect(() => {
    if (preferencesReady) applyTheme(preferences.theme)
  }, [preferencesReady, preferences.theme])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? 'true' : 'false'
  }, [preferences.reduceMotion])

  const save = useCallback(async (changes: PreferenceChanges) => {
    // Applied at once so sliders and switches feel immediate; the server is
    // the source of truth and its answer replaces the guess.
    setPreferences((current) => withChanges(current, changes))
    const saved = await savePreferences(changes)
    setPreferences(saved)
  }, [])

  const reset = useCallback(async () => {
    setPreferences(await resetPreferences())
  }, [])

  const refreshAccount = useCallback(async () => {
    setAccount(await fetchAccount())
  }, [])

  const session: SessionValue = useMemo(
    () => ({ account, preferences, ready: preferencesReady, save, reset, refreshAccount }),
    [account, preferences, preferencesReady, save, reset, refreshAccount],
  )

  const finishBoot = useCallback(() => {
    if (!restored.current) {
      router.replace('/')
      return
    }
    rememberBooted(true)
    setPhase('ready')
  }, [router])

  // A route change closes the drawer.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const handleSignOut = useCallback(async () => {
    rememberBooted(false)
    restored.current = null
    setAccount(null)
    router.replace('/')
    await signOut().catch(() => undefined)
  }, [router])

  // ------------------------------------------------------------ start-up --
  if (phase !== 'ready') {
    return (
      <div className="bg-mesh flex min-h-svh flex-col">
        {phase === 'splash' ? (
          <LoadingScreen ready={settled} onDone={finishBoot} />
        ) : (
          <div className="flex flex-1 items-center justify-center" aria-busy="true">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Checking your session</span>
          </div>
        )}
      </div>
    )
  }

  const title = titleFor(pathname)
  const isActive = (item: Item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)

  return (
    <SessionContext.Provider value={session}>
      <div className="bg-mesh flex min-h-svh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>

        {/* -------------------------------------------------------- top bar -- */}
        <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="app-nav"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            </button>

            <SignTalkLockup href="/app" className="shrink-0" />

            <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
            <h1 className="hidden min-w-0 truncate text-sm font-medium text-muted-foreground sm:block">
              {title}
            </h1>

            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle className="size-9 [&_svg]:size-4" />
              <Link
                href="/app/account"
                aria-label="Account"
                title={account ? `${account.username}, account and settings` : 'Account'}
                className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-[0.6875rem] font-semibold text-primary ring-1 ring-inset ring-primary/20 transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {initials(account)}
              </Link>
            </div>
          </div>
        </header>

        {/* ---------------------------------------------------------- menu -- */}
        <div
          aria-hidden={!open}
          className={cn(
            'fixed inset-0 top-14 z-40 transition-opacity duration-200',
            open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <aside
            id="app-nav"
            className={cn(
              'absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col border-r bg-card shadow-window transition-transform duration-200',
              open ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <nav aria-label="Sections" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {(['do', 'manage'] as const).map((group) => (
                <div key={group} className="flex flex-col gap-1">
                  <p className="px-3 pb-1 pt-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
                    {group === 'do' ? 'Workspace' : 'You'}
                  </p>
                  {NAV.filter((item) => item.group === group).map((item) => {
                    const active = isActive(item)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        tabIndex={open ? 0 : -1}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {active && (
                          <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary" />
                        )}
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground shadow-raised'
                              : 'bg-muted/60 text-muted-foreground group-hover:text-foreground',
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{item.label}</span>
                          <span className="truncate text-[0.6875rem] text-muted-foreground">{item.hint}</span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>

            <div className="border-t p-3">
              <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-3 pt-1 text-xs text-muted-foreground">
                {[
                  ['/about', 'About'],
                  ['/terms', 'Terms'],
                  ['/privacy', 'Privacy'],
                ].map(([href, label]) => (
                  <Link key={href} href={href} tabIndex={open ? 0 : -1} className="hover:text-foreground">
                    {label}
                  </Link>
                ))}
              </div>
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => void handleSignOut()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <LogOut className="size-4" aria-hidden="true" />
                </span>
                <span className="font-medium">Sign out</span>
                {account && <span className="ml-auto truncate text-xs text-muted-foreground">{account.username}</span>}
              </button>
            </div>
          </aside>
        </div>

        {/* ---------------------------------------------------------- page -- */}
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
            <div className="flex min-h-[calc(100svh-7rem)] flex-1 flex-col overflow-hidden rounded-2xl border bg-card/85 shadow-raised backdrop-blur">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SessionContext.Provider>
  )
}

function initials(account: Account | null) {
  const source = account?.username?.trim() || account?.email?.split('@')[0] || ''
  if (!source) return 'ST'
  const words = source.split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2)).toUpperCase()
}
