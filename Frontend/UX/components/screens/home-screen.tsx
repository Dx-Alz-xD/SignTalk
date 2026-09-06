'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Clapperboard,
  Database,
  GraduationCap,
  Images,
  Keyboard,
  Languages,
  Layers,
  ScanFace,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { languageTag, listLanguages, type Language } from '@/lib/library'
import type { Account } from '@/lib/auth'
import { cn } from '@/lib/utils'

type ActionId = 'translator' | 'trainer' | 'direct-paste' | 'video' | 'community'

type Action = {
  id: ActionId
  title: string
  description: string
  icon: LucideIcon
  /** Colour family for the tile and the glow. */
  tone: 'primary' | 'accent' | 'success'
}

const featured: Action = {
  id: 'translator',
  title: 'Translator',
  description:
    'Interpret signs from your camera into text as you make them, then carry that text into any spoken language or into another sign language, shown sign by sign.',
  icon: Languages,
  tone: 'primary',
}

const actions: Action[] = [
  {
    id: 'trainer',
    title: 'Trainer',
    description: 'Teach a letter, a word or a whole vocabulary by holding it in front of the camera.',
    icon: GraduationCap,
    tone: 'accent',
  },
  {
    id: 'direct-paste',
    title: 'Direct Paste',
    description: 'Keep the camera on and sign; the words are typed into whatever field you click.',
    icon: Keyboard,
    tone: 'success',
  },
  {
    id: 'video',
    title: 'Video Translator',
    description: 'Play a spoken video with its words signed over the top, timed to the speech.',
    icon: Clapperboard,
    tone: 'primary',
  },
  {
    id: 'community',
    title: 'Community',
    description: 'Install sign languages other people have published, or share your own.',
    icon: Database,
    tone: 'accent',
  },
]

const tones = {
  primary: {
    tile: 'bg-primary text-primary-foreground',
    soft: 'bg-primary/12 text-primary ring-primary/20',
    glow: 'bg-primary',
    border: 'hover:border-primary/45',
  },
  accent: {
    tile: 'bg-accent text-accent-foreground',
    soft: 'bg-accent/15 text-accent-foreground ring-accent/30',
    glow: 'bg-accent',
    border: 'hover:border-accent/50',
  },
  success: {
    tile: 'bg-success text-white',
    soft: 'bg-success/12 text-success ring-success/25',
    glow: 'bg-success',
    border: 'hover:border-success/45',
  },
} as const

export function HomeScreen({
  account = null,
  onOpen,
}: {
  account?: Account | null
  onOpen: (id: ActionId) => void
  /** Kept for callers that still pass it; the frame owns sign-out now. */
  onSignOut?: () => void
}) {
  const [languages, setLanguages] = useState<Language[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listLanguages(controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setLanguages(found)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLanguages([])
      })
    return () => controller.abort()
  }, [])

  const stats = useMemo(() => {
    const list = languages ?? []
    return {
      languages: list.length,
      vocabularies: list.reduce((sum, l) => sum + l.sign_count, 0),
      symbols: list.reduce((sum, l) => sum + l.symbol_count, 0),
      samples: list.reduce((sum, l) => sum + l.sample_count, 0),
      published: list.filter((l) => l.visibility === 'public').length,
      pictures: list.filter((l) => l.gesture_translation).length,
    }
  }, [languages])

  // Only ever the first name-ish word: "Welcome back, krish" reads better than
  // the full address the account happens to be keyed on.
  const greeting = account?.username?.trim().split(/[\s._-]+/)[0]
  const hour = new Date().getHours()
  const daypart = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'

  return (
    <div className="flex flex-1 flex-col">
      {/* ------------------------------------------------------------ hero -- */}
      <section className="relative overflow-hidden border-b px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 size-[28rem] rounded-full bg-primary opacity-[0.10] blur-[110px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 left-1/3 size-[22rem] rounded-full bg-accent opacity-[0.09] blur-[110px]"
        />
        <div aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div className="flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-primary">
              <Sparkles className="size-3" aria-hidden="true" />
              Sign language that speaks your signs
            </span>
            <h2 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
              {greeting ? (
                <>
                  Good {daypart}, <span className="text-primary">{greeting}</span>.
                </>
              ) : (
                'What would you like to do?'
              )}
            </h2>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
              Interpret, train, type and translate with any sign language, live from your camera.
              Everything here runs on hand landmarks, never on your video.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <Button size="xl" onClick={() => onOpen('translator')}>
                <ScanFace aria-hidden="true" />
                Start interpreting
              </Button>
              <Button size="xl" variant="outline" onClick={() => onOpen('trainer')}>
                <GraduationCap aria-hidden="true" />
                Train a sign
              </Button>
            </div>
          </div>

          {/* --------------------------------------------------- stats -- */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Sign languages" value={stats.languages} loading={languages === null} />
            <Stat label="Vocabularies" value={stats.vocabularies} loading={languages === null} />
            <Stat label="Symbols" value={stats.symbols} loading={languages === null} />
            <Stat label="Samples" value={stats.samples} loading={languages === null} />
            <Stat label="Published" value={stats.published} loading={languages === null} />
            <Stat label="With pictures" value={stats.pictures} loading={languages === null} />
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------- actions -- */}
      <section className="flex flex-col gap-5 px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
              Workspaces
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">Pick where to start</h3>
          </div>
        </div>

        <FeaturedCard action={featured} onOpen={onOpen} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => (
            <ActionCard key={action.id} action={action} onOpen={onOpen} />
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- library -- */}
      <section className="flex flex-col gap-5 border-t px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-muted-foreground">
              Your library
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              {languages === null
                ? 'Loading your sign languages'
                : languages.length === 0
                  ? 'No sign languages yet'
                  : `${languages.length} sign language${languages.length === 1 ? '' : 's'} ready to use`}
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpen('trainer')} className="text-muted-foreground">
            Manage in Trainer
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>

        {languages && languages.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {languages.map((language) => (
              <li
                key={language.id}
                className="group flex flex-col gap-3 rounded-xl border bg-elevated p-4 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold tracking-tight">{language.name}</p>
                    <p className="truncate text-xs text-primary/90">{languageTag(language)}</p>
                    <p className="text-xs text-muted-foreground">
                      {language.source === 'imported'
                        ? 'Installed from the community'
                        : language.source === 'asl_dataset'
                          ? 'Imported dataset'
                          : 'Recorded by you'}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {language.gesture_translation && (
                      <span
                        className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary"
                        title="Has pictures for sign-to-sign translation"
                      >
                        <Images className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <span
                      className={cn(
                        'rounded-md border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase',
                        language.visibility === 'public'
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border bg-muted/60 text-muted-foreground',
                      )}
                    >
                      {language.visibility === 'public' ? 'shared' : 'private'}
                    </span>
                  </span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <Mini label="vocab" value={language.sign_count} />
                  <Mini label="symbols" value={language.symbol_count} />
                  <Mini label="samples" value={language.sample_count} />
                </dl>
                <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                    style={{ width: `${Math.min(100, (language.sample_count / 400) * 100)}%` }}
                    title={`${language.sample_count} samples; 400 is a well-trained alphabet`}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : languages && languages.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-elevated/60 p-6">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Layers className="size-5" aria-hidden="true" />
            </span>
            <p className="text-sm">Install ISL or ASL from the Community, or train your first sign.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onOpen('community')}>
                Open Community
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpen('trainer')}>
                Open Trainer
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

// ----------------------------------------------------------------- pieces --

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card/70 p-4 backdrop-blur">
      <dt className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono text-2xl font-semibold tracking-tight', loading && 'animate-pulse text-muted-foreground')}>
        {loading ? '··' : value.toLocaleString()}
      </dd>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-card px-2 py-1.5">
      <dd className="font-mono text-sm font-semibold">{value.toLocaleString()}</dd>
      <dt className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">{label}</dt>
    </div>
  )
}

const cardBase = cn(
  'group relative overflow-hidden rounded-2xl border border-border bg-elevated text-left',
  'transition-[border-color,box-shadow,transform] duration-200',
  'hover:-translate-y-0.5 hover:shadow-raised',
  'active:translate-y-0 active:shadow-none',
  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
)

/** The one thing most people open the app to do, so it gets the most weight. */
function FeaturedCard({ action, onOpen }: { action: Action; onOpen: (id: ActionId) => void }) {
  const { title, description, icon: Icon, tone } = action
  const t = tones[tone]
  return (
    <button type="button" onClick={() => onOpen(action.id)} className={cn(cardBase, 'p-6 sm:p-7', t.border)}>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-20 -top-24 size-64 rounded-full opacity-[0.10] blur-3xl transition-opacity duration-300 group-hover:opacity-[0.18]',
          t.glow,
        )}
      />
      <span aria-hidden="true" className="bg-dots pointer-events-none absolute inset-0 opacity-40" />
      <span className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
        <span className={cn('flex size-16 shrink-0 items-center justify-center rounded-2xl shadow-raised', t.tile)}>
          <Icon className="size-8" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</span>
          <span className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
          Open
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </button>
  )
}

function ActionCard({ action, onOpen }: { action: Action; onOpen: (id: ActionId) => void }) {
  const { title, description, icon: Icon, tone } = action
  const t = tones[tone]
  return (
    <button
      type="button"
      onClick={() => onOpen(action.id)}
      className={cn(cardBase, 'flex min-h-48 flex-col gap-4 p-5', t.border)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -right-12 -top-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-[0.16]',
          t.glow,
        )}
      />
      <span className="relative flex items-center justify-between">
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-xl ring-1 ring-inset transition-colors duration-200',
            t.soft,
            'group-hover:ring-transparent',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <ArrowUpRight
          className="size-4 text-muted-foreground opacity-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      </span>
      <span className="relative flex flex-1 flex-col gap-1.5">
        <span className="text-base font-semibold tracking-tight">{title}</span>
        <span className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
