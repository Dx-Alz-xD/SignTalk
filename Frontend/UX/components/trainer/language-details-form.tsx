'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Globe, Images, Loader2, Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { errorMessage } from '@/lib/api'
import {
  DEFAULT_GESTURE_INTERVAL_MS,
  DEFAULT_SAMPLE_TARGET,
  HAND_CONTROLS,
  MAX_GESTURE_INTERVAL_MS,
  MAX_SAMPLE_TARGET,
  MIN_GESTURE_INTERVAL_MS,
  MIN_SAMPLE_TARGET,
  KNOWN_TAGS,
  createVocabulary,
  publishLanguage,
  reviewLanguage,
  updateLanguage,
  type HandControl,
  type Review,
} from '@/lib/library'
import type { Vocabulary } from '@/components/trainer/vocabulary-table'
import { TARGET_LANGUAGES } from '@/lib/translate'
import { cn } from '@/lib/utils'

/**
 * The sign language's own details, asked before any recording happens.
 *
 * Doubles as the edit screen: opened with an existing vocabulary it saves in
 * place, opened without one it creates. Everything here belongs to the
 * *language* rather than to a single capture - how many hands it uses, how
 * many frames a capture collects, whether pictures are kept for sign-to-sign
 * translation, and whether it is on the community shelf.
 */
export function LanguageDetailsForm({
  existing,
  onReady,
  onCancel,
}: {
  existing: Vocabulary | null
  /** Saved - carry on to the training screen. */
  onReady: (vocabulary: Vocabulary) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(existing?.sign.name ?? '')
  const [language, setLanguage] = useState(existing?.language.name ?? '')
  const [handControl, setHandControl] = useState<HandControl>(
    existing?.language.hand_control ?? 'both',
  )
  const [sampleTarget, setSampleTarget] = useState(
    existing?.language.sample_target ?? DEFAULT_SAMPLE_TARGET,
  )
  const [spoken, setSpoken] = useState(existing?.language.spoken_language ?? 'en')
  const [tag, setTag] = useState(existing?.language.tag ?? '')
  const [tagTouched, setTagTouched] = useState(Boolean(existing?.language.tag))
  const [description, setDescription] = useState(existing?.language.description ?? '')
  const [gestures, setGestures] = useState(existing?.language.gesture_translation ?? false)
  const [interval, setInterval_] = useState(
    existing?.language.gesture_interval_ms ?? DEFAULT_GESTURE_INTERVAL_MS,
  )
  // Sharing is on by default for a new language: publishing is allowed the
  // moment it exists (it lists with 0 samples until trained), and the
  // security review runs on every publish, so there is nothing to wait for.
  const [shared, setShared] = useState(
    existing ? existing.language.visibility === 'public' : true,
  )
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)

  const editing = existing !== null

  // Show the owner the same review publishing will run, up front.
  useEffect(() => {
    if (!existing) return
    const controller = new AbortController()
    reviewLanguage(existing.language.id, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setReview(found)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [existing])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setFailure('Give this sign language a name.')
      return
    }
    setBusy(true)
    setFailure(null)

    try {
      let saved: Vocabulary

      if (editing) {
        const updated = await updateLanguage(existing.language.id, {
          name: language.trim() || existing.language.name,
          handControl,
          sampleTarget,
          gestureTranslation: gestures,
          gestureIntervalMs: interval,
          spokenLanguage: spoken,
          tag: tag.trim(),
          description: description.trim() || undefined,
        })
        saved = { sign: existing.sign, language: updated }
      } else {
        const result = await createVocabulary({
          name: name.trim(),
          language: language.trim(),
          handControl,
          sampleTarget,
          gestureTranslation: gestures,
          gestureIntervalMs: interval,
          spokenLanguage: spoken,
          tag: tag.trim(),
          description: description.trim(),
        })
        saved = { sign: result.sign, language: result.language }
      }

      // Publishing is a separate call because it can fail on its own terms -
      // the security review can refuse - and that must not lose the edit.
      if (shared !== (saved.language.visibility === 'public')) {
        try {
          saved = { ...saved, language: await publishLanguage(saved.language.id, shared) }
        } catch (cause) {
          setFailure(errorMessage(cause))
          setReview(await reviewLanguage(saved.language.id).catch(() => null))
          setBusy(false)
          setShared(saved.language.visibility === 'public')
          return
        }
      }

      onReady(saved)
    } catch (cause) {
      setFailure(errorMessage(cause))
      setBusy(false)
    }
  }

  const blocking = review?.issues.filter((issue) => issue.level === 'block') ?? []
  const warnings = review?.issues.filter((issue) => issue.level === 'warn') ?? []

  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-6">
      {failure && <FormAlert>{failure}</FormAlert>}

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Sign language name</span>
        <Input
          value={name}
          autoFocus={!editing}
          disabled={editing}
          onChange={(event) => {
            setName(event.target.value)
            setFailure(null)
          }}
          placeholder="Everyday greetings"
        />
        <span className="text-xs text-muted-foreground">
          {editing
            ? 'The vocabulary name is fixed once created - add or remove symbols instead.'
            : 'What you are teaching: an alphabet, a phrase set, a vocabulary.'}
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Language</span>
        <Input
          value={language}
          onChange={(event) => {
            const next = event.target.value
            setLanguage(next)
            setFailure(null)
            // Offer a tag for a name we recognise, until the person types their own.
            if (!tagTouched) setTag(KNOWN_TAGS[next.trim().toUpperCase()] ?? '')
          }}
          placeholder="ASL, ISL, BSL…"
        />
        <span className="text-xs text-muted-foreground">
          Groups vocabularies together, and scopes the model when interpreting.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Tag <span className="font-normal text-muted-foreground">(what kind of sign language)</span>
        </span>
        <Input
          value={tag}
          maxLength={60}
          onChange={(event) => {
            setTag(event.target.value)
            setTagTouched(true)
          }}
          placeholder="Indian Sign Language, classroom signs, family shorthand…"
        />
        <span className="text-xs text-muted-foreground">
          Shown next to the name in every list, and searchable in the community. Anything you
          like; BSL here means Bengali Sign Language.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <textarea
          value={description}
          maxLength={600}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Who it is for, what it covers, anything a person installing it should know."
          className="w-full resize-y rounded-lg border border-input bg-elevated px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Spoken language</span>
        <Select value={spoken} onChange={(event) => setSpoken(event.target.value)} className="h-11">
          {TARGET_LANGUAGES.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">
          What the symbols spell out. Translating between two sign languages goes signs → text in
          this language → translated → the other one&rsquo;s signs.
        </span>
      </label>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-sm font-medium">Hand control</legend>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {HAND_CONTROLS.map((option) => {
            const active = handControl === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setHandControl(option.value)}
                aria-pressed={active}
                title={option.hint}
                className={cn(
                  'flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-elevated text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-muted-foreground">
          {HAND_CONTROLS.find((option) => option.value === handControl)?.hint}
        </span>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Default sample size{' '}
          <span className="font-mono text-xs text-muted-foreground">
            {sampleTarget} frames per capture
          </span>
        </span>
        <input
          type="range"
          min={MIN_SAMPLE_TARGET}
          max={200}
          step={5}
          value={sampleTarget}
          onChange={(event) => setSampleTarget(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          The starting point for every capture; you can change it per symbol while recording.
          More frames means a steadier model but a longer hold. {DEFAULT_SAMPLE_TARGET} is the
          default the desktop trainer uses; {MIN_SAMPLE_TARGET} to {MAX_SAMPLE_TARGET} is allowed.
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-elevated p-4">
        <input
          type="checkbox"
          checked={gestures}
          onChange={(event) => setGestures(event.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Images className={cn('size-4', gestures ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
            Allow gesture translation
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            Keeps one small reference picture per symbol, taken at the end of each capture, so
            the Translator can show text as a sequence of this language&rsquo;s signs. This is
            the only place SignTalk stores an image of you; leave it off and nothing but
            landmarks is kept - and the language cannot be a translation target.
          </span>
          {gestures && (
            <span className="mt-2 flex flex-col gap-1.5">
              <span className="text-xs font-medium">
                Time per sign{' '}
                <span className="font-mono text-muted-foreground">{(interval / 1000).toFixed(1)}s</span>
              </span>
              <input
                type="range"
                min={MIN_GESTURE_INTERVAL_MS}
                max={Math.min(MAX_GESTURE_INTERVAL_MS, 5000)}
                step={100}
                value={interval}
                onChange={(event) => setInterval_(Number(event.target.value))}
                onClick={(event) => event.stopPropagation()}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                aria-label="Seconds each picture stays up during playback"
              />
              <span className="text-xs text-muted-foreground">
                How long each picture stays up when this language is played back.
              </span>
            </span>
          )}
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-elevated p-4">
        <input
          type="checkbox"
          checked={shared}
          onChange={(event) => {
            setShared(event.target.checked)
            setFailure(null)
          }}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {shared ? (
              <Globe className="size-4 text-success" aria-hidden="true" />
            ) : (
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            )}
            Add to the community database
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground">
            Publishes this language so anyone can find and install it, samples included (and
            pictures, if gesture translation is on). Every publish passes a security review:
            only editing keys and clipboard shortcuts may be shared, text is checked for
            markup, and the samples are checked to be real hand landmarks. You can take it
            down at any time from your account page.
          </span>
        </span>
      </label>

      {review && (
        <div
          className={cn(
            'flex flex-col gap-2 rounded-xl border p-4 text-xs leading-relaxed',
            blocking.length ? 'border-destructive/30 bg-destructive/5' : 'border-success/30 bg-success/5',
          )}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {blocking.length ? (
              <ShieldAlert className="size-4 text-destructive" aria-hidden="true" />
            ) : (
              <ShieldCheck className="size-4 text-success" aria-hidden="true" />
            )}
            Security review: {blocking.length ? 'blocked' : 'passes'}
            <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
              {review.summary.symbols} symbols · {review.summary.samples} samples
            </span>
          </span>
          {blocking.map((issue) => (
            <p key={issue.code + issue.message} className="text-destructive">
              {issue.message}
            </p>
          ))}
          {warnings.map((issue) => (
            <p key={issue.code + issue.message} className="text-muted-foreground">
              {issue.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" size="xl" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="xl" className="flex-1" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              {editing ? 'Save and continue' : 'Create and start training'}
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
