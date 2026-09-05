'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, Globe, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { errorMessage } from '@/lib/api'
import {
  DEFAULT_SAMPLE_TARGET,
  HAND_CONTROLS,
  MAX_SAMPLE_TARGET,
  MIN_SAMPLE_TARGET,
  createVocabulary,
  publishLanguage,
  updateLanguage,
  type HandControl,
} from '@/lib/library'
import type { Vocabulary } from '@/components/trainer/vocabulary-table'
import { cn } from '@/lib/utils'

/**
 * The sign language's own details, asked before any recording happens.
 *
 * Doubles as the edit screen: opened with an existing vocabulary it saves in
 * place, opened without one it creates. Everything here belongs to the
 * *language* rather than to a single capture — how many hands it uses and how
 * many frames a capture collects apply to every symbol inside it.
 */
export function LanguageDetailsForm({
  existing,
  onReady,
  onCancel,
}: {
  existing: Vocabulary | null
  /** Saved — carry on to the training screen. */
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
  const [shared, setShared] = useState(existing?.language.visibility === 'public')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const editing = existing !== null

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
        })
        saved = { sign: existing.sign, language: updated }
      } else {
        const result = await createVocabulary({
          name: name.trim(),
          language: language.trim(),
          handControl,
          sampleTarget,
        })
        saved = { sign: result.sign, language: result.language }
      }

      // Publishing is a separate call because it can fail on its own terms —
      // an empty language cannot be shared — and that must not lose the edit.
      if (shared !== (saved.language.visibility === 'public')) {
        try {
          saved = { ...saved, language: await publishLanguage(saved.language.id, shared) }
        } catch (cause) {
          setFailure(errorMessage(cause))
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
            ? 'The vocabulary name is fixed once created — add or remove symbols instead.'
            : 'What you are teaching: an alphabet, a phrase set, a vocabulary.'}
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Language</span>
        <Input
          value={language}
          onChange={(event) => {
            setLanguage(event.target.value)
            setFailure(null)
          }}
          placeholder="ASL, ISL, BSL…"
        />
        <span className="text-xs text-muted-foreground">
          Groups vocabularies together, and scopes the model when interpreting.
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
          Sample size{' '}
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
          More frames means a steadier model but a longer hold. {DEFAULT_SAMPLE_TARGET} is
          the default the desktop trainer uses; anything from {MIN_SAMPLE_TARGET} to{' '}
          {MAX_SAMPLE_TARGET} is allowed.
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
            Publishes this language so anyone can find and install it, recorded samples
            included. You can take it back down at any time. A language with no samples
            yet cannot be published — record some first.
          </span>
        </span>
      </label>

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
