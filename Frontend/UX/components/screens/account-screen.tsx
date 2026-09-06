'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Clock,
  ExternalLink,
  Globe,
  Images,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PasswordField } from '@/components/ui/field'
import { FormAlert } from '@/components/form-alert'
import { Screen, ScreenBody, ScreenHeader } from '@/components/screen'
import { Badge, EmptyState, Panel, Section, Skeleton, StatTile } from '@/components/ui/surface'
import { useSession } from '@/components/session'
import { errorMessage } from '@/lib/api'
import { changePassword, type Account } from '@/lib/auth'
import { deleteLanguage, languageTag, listLanguages, publishLanguage, type Language } from '@/lib/library'
import { validatePassword } from '@/lib/validation'

/**
 * Everything about the signed-in account in one place: who you are, your
 * password, and the sign languages you own, with the actions that go with
 * them. Camera and recognition settings live next door in Settings.
 */
export function AccountScreen({
  onOpenProfile,
  onOpenTrainer,
  onSignOut,
}: {
  onOpenProfile: (username: string) => void
  onOpenTrainer: () => void
  onSignOut: () => void
}) {
  const { account } = useSession()
  const [languages, setLanguages] = useState<Language[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async (signal?: AbortSignal) => {
    const owned = await listLanguages(signal)
    if (!signal?.aborted) setLanguages(owned)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal).catch((cause) => {
      if (!controller.signal.aborted) {
        setFailure(errorMessage(cause))
        setLanguages([])
      }
    })
    return () => controller.abort()
  }, [reload])

  const published = (languages ?? []).filter((language) => language.visibility === 'public')
  const privateOnes = (languages ?? []).filter((language) => language.visibility !== 'public')

  const act = useCallback(
    async (run: () => Promise<unknown>, done: string) => {
      setFailure(null)
      setNotice(null)
      try {
        await run()
        setNotice(done)
        await reload()
      } catch (cause) {
        setFailure(errorMessage(cause))
      }
    },
    [reload],
  )

  const totals = (languages ?? []).reduce(
    (sum, language) => ({
      symbols: sum.symbols + language.symbol_count,
      samples: sum.samples + language.sample_count,
    }),
    { symbols: 0, samples: 0 },
  )

  return (
    <Screen>
      <ScreenHeader
        title="Account"
        subtitle="Your details, your password, and what you have shared"
        icon={<UserRound className="size-5" aria-hidden="true" />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => account && onOpenProfile(account.username)}
              disabled={!account}
            >
              <ExternalLink aria-hidden="true" />
              Public profile
            </Button>
            <Button variant="ghost" size="sm" onClick={onSignOut} className="text-muted-foreground">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </>
        }
      />

      <ScreenBody>
        {failure && <FormAlert>{failure}</FormAlert>}
        {notice && <FormAlert tone="success">{notice}</FormAlert>}

        {/* ------------------------------------------------------ identity -- */}
        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <Panel>
            <div className="flex items-start gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-xl font-semibold text-primary ring-1 ring-inset ring-primary/20">
                {initials(account)}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xl font-semibold tracking-tight">
                  {account?.username ?? <Skeleton className="h-6 w-32" />}
                </h3>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5" aria-hidden="true" />
                    {account?.email}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5" aria-hidden="true" />
                    {account?.phone ?? 'no number on file'}
                  </span>
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="primary">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    {account?.method === 'recovery_code' ? 'recovery code' : 'password'}
                  </Badge>
                  <Badge>
                    <Clock className="size-3" aria-hidden="true" />
                    {account?.minutesLeft ?? 0} min left
                  </Badge>
                  {account?.joinedAt && <Badge>joined {formatDate(account.joinedAt)}</Badge>}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Languages" value={languages?.length ?? 0} loading={languages === null} />
              <StatTile label="Published" value={published.length} loading={languages === null} />
              <StatTile label="Symbols" value={totals.symbols} loading={languages === null} />
              <StatTile label="Samples" value={totals.samples} loading={languages === null} />
            </dl>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Other people see your username, when you joined and what you have published. Your
              email and phone number are never shown to them.
            </p>
          </Panel>

          {/* ---------------------------------------------------- password -- */}
          <PasswordSection onChanged={setNotice} />
        </div>

        {/* ----------------------------------------------------- languages -- */}
        <Section
          eyebrow="Your library"
          title="Sign languages you own"
          description="Publishing shares a full copy, samples and all. Deleting removes it from your library for good."
          actions={
            <Button variant="outline" size="sm" onClick={onOpenTrainer}>
              <Layers aria-hidden="true" />
              Open Trainer
            </Button>
          }
        >
          {languages === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : languages.length === 0 ? (
            <EmptyState
              icon={<Layers className="size-6" aria-hidden="true" />}
              title="No sign languages yet"
              description="Install one from the Community, or train your own in the Trainer."
              actions={
                <Button size="sm" onClick={onOpenTrainer}>
                  Open Trainer
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-5">
              <LanguageGroup
                icon={<Globe className="size-4 text-success" aria-hidden="true" />}
                title="Published to the community"
                empty="Nothing on the shelf yet. Turn on sharing when editing a language in the Trainer."
                languages={published}
                actions={(language) => (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void act(() => publishLanguage(language.id, false), `${language.name} is now private.`)
                      }
                    >
                      <Lock aria-hidden="true" />
                      Unpublish
                    </Button>
                    <DeleteButton language={language} onDelete={act} />
                  </>
                )}
              />
              <LanguageGroup
                icon={<Lock className="size-4 text-muted-foreground" aria-hidden="true" />}
                title="Private"
                empty="Everything you own is shared."
                languages={privateOnes}
                actions={(language) => (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void act(
                          () => publishLanguage(language.id, true),
                          `${language.name} is on the community shelf.`,
                        )
                      }
                    >
                      <Globe aria-hidden="true" />
                      Publish
                    </Button>
                    <DeleteButton language={language} onDelete={act} />
                  </>
                )}
              />
            </div>
          )}
        </Section>
      </ScreenBody>
    </Screen>
  )
}

// ------------------------------------------------------------------ pieces --

function LanguageGroup({
  icon,
  title,
  empty,
  languages,
  actions,
}: {
  icon: ReactNode
  title: string
  empty: string
  languages: Language[]
  actions: (language: Language) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
        <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
          {languages.length}
        </span>
      </h4>
      {languages.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {languages.map((language) => (
            <li
              key={language.id}
              className="flex flex-col gap-3 rounded-xl border bg-elevated p-4 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-raised"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium tracking-tight">{language.name}</p>
                  <p className="truncate text-xs text-primary/90">{languageTag(language)}</p>
                </div>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {language.gesture_translation && (
                    <Badge tone="primary">
                      <Images className="size-3" aria-hidden="true" />
                      pictures
                    </Badge>
                  )}
                  {language.source === 'imported' && <Badge>installed</Badge>}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {language.sign_count} vocab · {language.symbol_count} symbols ·{' '}
                {language.sample_count.toLocaleString()} samples · {language.hand_control}
                {language.published_at && ` · shared ${formatDate(language.published_at)}`}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5">{actions(language)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DeleteButton({
  language,
  onDelete,
}: {
  language: Language
  onDelete: (run: () => Promise<unknown>, done: string) => Promise<void>
}) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!arming) {
    return (
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setArming(true)}>
        <Trash2 aria-hidden="true" />
        Delete
      </Button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">
        Delete {language.name} and its {language.sample_count.toLocaleString()} samples?
      </span>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void onDelete(() => deleteLanguage(language.id), `${language.name} was deleted.`).finally(() => {
            setBusy(false)
            setArming(false)
          })
        }}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : 'Delete for good'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArming(false)} disabled={busy}>
        Keep
      </Button>
    </span>
  )
}

function PasswordSection({ onChanged }: { onChanged: (message: string) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const found = {
      current: current ? undefined : 'Enter your current password.',
      next: validatePassword(next) ?? undefined,
      confirm: confirm !== next ? 'Passwords don’t match.' : undefined,
    }
    if (Object.values(found).some(Boolean)) {
      setErrors(found)
      return
    }
    setErrors({})
    setFailure(null)
    setBusy(true)
    try {
      onChanged(await changePassword(current, next))
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (cause) {
      setFailure(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Change password"
      description="Every other device is signed out when you do. This one stays in."
      icon={<KeyRound className="size-4" aria-hidden="true" />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {failure && <FormAlert>{failure}</FormAlert>}
        <PasswordField
          label="Current password"
          autoComplete="current-password"
          value={current}
          error={errors.current}
          onChange={(event) => {
            setCurrent(event.target.value)
            setErrors((prev) => ({ ...prev, current: undefined }))
            setFailure(null)
          }}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          showStrength
          value={next}
          error={errors.next}
          onChange={(event) => {
            setNext(event.target.value)
            setErrors((prev) => ({ ...prev, next: undefined }))
          }}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          error={confirm && confirm !== next ? 'Passwords don’t match.' : errors.confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
            setErrors((prev) => ({ ...prev, confirm: undefined }))
          }}
        />
        <Button type="submit" size="lg" disabled={busy || (confirm.length > 0 && confirm !== next)}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
          {busy ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </Panel>
  )
}

// ----------------------------------------------------------------- helpers --

function initials(account: Account | null) {
  const source = account?.username?.trim() || account?.email?.split('@')[0] || ''
  if (!source) return 'ST'
  const words = source.split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2)).toUpperCase()
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export function formatDate(iso: string) {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? iso : dateFormatter.format(parsed)
}
