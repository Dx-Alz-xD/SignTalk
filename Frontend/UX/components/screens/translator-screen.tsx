'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  Copy,
  Hand,
  Languages,
  Loader2,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { GesturePlayback, planSteps } from '@/components/translator/gesture-playback'
import {
  appendEmission,
  useRecognizer,
  type Emission,
  type Pace,
} from '@/components/recognizer/use-recognizer'
import { errorMessage } from '@/lib/api'
import {
  listLanguages,
  listSigns,
  listSymbols,
  type Language,
  type Sign,
  type Symbol,
} from '@/lib/library'
import type { Scope } from '@/lib/training'
import {
  TARGET_LANGUAGES,
  browserTranslationSupported,
  detectLanguage,
  translate,
  translationAvailable,
  type Translation,
} from '@/lib/translate'
import { cn } from '@/lib/utils'

/** A vocabulary as the person named it in the Trainer, with its language. */
type Vocabulary = { sign: Sign; language: Language }

/** "From" is everything, one language, or one vocabulary. */
const ALL = ''
const languageValue = (id: string) => `lang:${id}`
const signValue = (id: string) => `sign:${id}`

/**
 * "To" is a spoken language code, or one of the account's vocabularies. A
 * vocabulary rather than a language row, because people name those two
 * things both ways round ("ISL" inside "English", "Alphabet" inside "ISL") -
 * so the option shows both, and the symbols come from that one vocabulary.
 */
const signTarget = (id: string) => `sign:${id}`

export function TranslatorScreen({ onBack }: { onBack: () => void }) {
  const [languages, setLanguages] = useState<Language[]>([])
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([])
  const [from, setFrom] = useState<string>(ALL)
  const [target, setTarget] = useState('en')
  const [pace, setPace] = useState<Pace>('careful')

  const [cameraOn, setCameraOn] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [translated, setTranslated] = useState<Translation | null>(null)
  const [translating, setTranslating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Sign-to-sign: the target language's symbols, loaded when one is chosen.
  const [targetSymbols, setTargetSymbols] = useState<Symbol[] | null>(null)
  const [targetLoading, setTargetLoading] = useState(false)
  /**
   * The text the target's signs spell: the transcript translated into the
   * target's spoken language when the two differ, else the transcript itself.
   */
  const [bridge, setBridge] = useState<{
    text: string
    from: string
    to: string
    translation: Translation | null
  } | null>(null)
  const [bridging, setBridging] = useState(false)

  const scope: Scope = useMemo(() => {
    if (from.startsWith('lang:')) return { languageId: from.slice(5) }
    if (from.startsWith('sign:')) return { signId: from.slice(5) }
    return {}
  }, [from])

  const onEmit = useCallback((emission: Emission) => {
    setTranscript((text) => appendEmission(text, emission))
  }, [])

  const recognizer = useRecognizer({ active: cameraOn, scope, languages, pace, onEmit })
  const { stage, handCount, current, model } = recognizer

  const fromVocabulary = useMemo(
    () => (scope.signId ? vocabularies.find((v) => v.sign.id === scope.signId) ?? null : null),
    [scope.signId, vocabularies],
  )
  const fromLanguage = useMemo(
    () => (scope.languageId ? languages.find((l) => l.id === scope.languageId) ?? null : null),
    [scope.languageId, languages],
  )

  const targetVocabulary = useMemo(
    () =>
      target.startsWith('sign:') ? vocabularies.find((v) => v.sign.id === target.slice(5)) ?? null : null,
    [target, vocabularies],
  )
  const targetLanguage = targetVocabulary?.language ?? null
  const targetName = targetVocabulary
    ? `${targetVocabulary.sign.name} · ${targetVocabulary.language.name}`
    : ''
  const targetSignId = targetVocabulary?.sign.id ?? null

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const found = await listLanguages(controller.signal)
      if (controller.signal.aborted) return
      setLanguages(found)
      const pairs: Vocabulary[] = []
      for (const language of found) {
        for (const sign of await listSigns(language.id, controller.signal)) {
          pairs.push({ sign, language })
        }
      }
      if (!controller.signal.aborted) setVocabularies(pairs)
    })()
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  // Symbols of the target vocabulary, for the picture sequence.
  useEffect(() => {
    if (!targetSignId || !targetLanguage?.gesture_translation) {
      setTargetSymbols(null)
      return
    }
    const controller = new AbortController()
    setTargetLoading(true)
    listSymbols(targetSignId, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setTargetSymbols(found)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setTargetLoading(false)
      })
    return () => controller.abort()
  }, [targetSignId, targetLanguage?.gesture_translation])

  // Signs → text → (translate) → the target's signs. The source spoken
  // language is the one the "From" vocabulary declares, or detected from the
  // text when interpreting across everything; the target's is its own.
  const sourceSpoken = fromVocabulary?.language.spoken_language ?? fromLanguage?.spoken_language ?? null
  const targetSpoken = targetLanguage?.spoken_language ?? null

  useEffect(() => {
    if (!targetSpoken || !transcript.trim()) {
      setBridge(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setBridging(true)
      try {
        const from = sourceSpoken ?? (await detectLanguage(transcript)) ?? 'en'
        if (from === targetSpoken) {
          if (!cancelled) setBridge({ text: transcript, from, to: targetSpoken, translation: null })
          return
        }
        const translation = await translate(transcript, targetSpoken, from)
        if (!cancelled) {
          setBridge({
            text: translation.engine === 'none' ? transcript : translation.text,
            from,
            to: targetSpoken,
            translation,
          })
        }
      } finally {
        if (!cancelled) setBridging(false)
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [transcript, sourceSpoken, targetSpoken])

  const steps = useMemo(
    () => (targetSymbols && bridge?.text.trim() ? planSteps(bridge.text, targetSymbols) : []),
    [targetSymbols, bridge],
  )

  async function runTranslation() {
    if (!transcript.trim()) return
    setTranslating(true)
    setFailure(null)
    try {
      setTranslated(await translate(transcript, target))
    } catch (cause) {
      setFailure(errorMessage(cause))
    } finally {
      setTranslating(false)
    }
  }

  const canTranslate = translationAvailable()
  const shownFailure = failure ?? recognizer.failure
  const scopeLabel = fromVocabulary
    ? `${fromVocabulary.sign.name} (${fromVocabulary.language.name})`
    : fromLanguage
      ? fromLanguage.name
      : 'all your sign languages'
  const targetLabel = targetVocabulary
    ? targetName
    : TARGET_LANGUAGES.find((l) => l.code === target)?.label ?? target

  if (loading) {
    return (
      <Shell onBack={onBack}>
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your sign languages&hellip;
        </div>
      </Shell>
    )
  }

  return (
    <Shell onBack={onBack}>
      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {shownFailure && <FormAlert>{shownFailure}</FormAlert>}

          {languages.length === 0 ? (
            <FormAlert>
              No sign languages yet. Train one first, or install one from the Community
              Database. The translator reads whatever your library holds.
            </FormAlert>
          ) : model && !model.trained ? (
            <FormAlert>
              Nothing usable to interpret from in {scopeLabel} yet. Record samples for at
              least two symbols so the interpreter has something to tell apart.
            </FormAlert>
          ) : null}

          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-black">
            <video ref={stage.videoRef} className="hidden" playsInline muted />
            <canvas
              ref={stage.canvasRef}
              className={cn(
                'size-full object-cover transition-opacity',
                stage.state === 'live' ? 'opacity-100' : 'opacity-0',
              )}
            />

            {stage.state !== 'live' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                {stage.state === 'starting' ? (
                  <>
                    <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      Starting the camera and loading the hand model&hellip;
                    </p>
                  </>
                ) : stage.state === 'failed' ? (
                  <>
                    <CameraOff className="size-7 text-destructive" aria-hidden="true" />
                    <p className="max-w-sm text-sm text-destructive">{stage.error}</p>
                  </>
                ) : (
                  <>
                    <CameraOff className="size-7 text-muted-foreground" aria-hidden="true" />
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Camera is off. Frames never leave this device; only the hand
                      landmarks are sent.
                    </p>
                  </>
                )}
              </div>
            )}

            {stage.state === 'live' && (
              <>
                <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                  <Hand className="size-3.5" aria-hidden="true" />
                  {handCount === 0
                    ? 'No hand detected'
                    : `${handCount} hand${handCount === 1 ? '' : 's'}`}
                  <span className="text-white/50">· {stage.fps} fps</span>
                </span>

                {pace === 'speed' && (
                  <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-warning/90 px-2.5 py-1 text-xs font-medium text-black backdrop-blur">
                    <Zap className="size-3.5" aria-hidden="true" />
                    Speed mode
                  </span>
                )}

                {current && (
                  <span
                    className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-1.5 text-sm font-medium text-white backdrop-blur"
                    title={current.language ?? undefined}
                  >
                    {current.label.split(' / ').pop()}
                    {/* Which vocabulary it came from - the name the person gave
                        it in the Trainer - when more than one is in scope. */}
                    {!fromVocabulary && current.sign && (
                      <span className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-white/80">
                        {current.sign}
                      </span>
                    )}
                    <span className="font-mono text-xs text-white/60">
                      {Math.round(current.confidence * 100)}%
                    </span>
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={cameraOn ? 'outline' : 'default'}
              size="xl"
              disabled={languages.length === 0}
              onClick={() => setCameraOn((on) => !on)}
            >
              <Camera aria-hidden="true" />
              {cameraOn ? 'Stop interpreting' : 'Start interpreting'}
            </Button>

            <PaceToggle pace={pace} onChange={setPace} />

            <Button
              variant="ghost"
              size="xl"
              className="ml-auto"
              disabled={!transcript}
              onClick={() => {
                setTranscript('')
                setTranslated(null)
              }}
            >
              <Trash2 aria-hidden="true" />
              Clear
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Transcript
                <span className="ml-2 font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  signed or typed
                </span>
              </span>
              <button
                type="button"
                disabled={!transcript}
                onClick={() => void navigator.clipboard?.writeText(transcript)}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy
              </button>
            </div>
            <textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={3}
              placeholder="Signs you hold appear here. Type here too - anything in this box can be translated."
              className="w-full resize-y rounded-xl border border-input bg-elevated p-3.5 text-sm leading-relaxed placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            />
          </div>

          {/* Sign-to-sign result lives under the transcript: it is the wide,
              visual thing on this screen once a sign language is the target. */}
          {targetVocabulary && targetLanguage && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">In {targetName}</span>
              {!targetLanguage.gesture_translation ? (
                <FormAlert>
                  {targetName} is not available for gesture translation. Its owner has to turn
                  on “Allow gesture translation” in the Trainer (Edit details).
                </FormAlert>
              ) : targetLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading the signs of {targetName}&hellip;
                </p>
              ) : !transcript.trim() ? (
                <p className="text-sm text-muted-foreground">
                  Sign or type something above and its {targetVocabulary.sign.name} signs play here.
                </p>
              ) : bridging || !bridge ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Translating into {spokenLabel(targetSpoken)}&hellip;
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-xs">
                    <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <span className="font-medium text-foreground">{spokenLabel(bridge.from)}</span>
                      <ArrowRight className="size-3" aria-hidden="true" />
                      <span className="font-medium text-foreground">{spokenLabel(bridge.to)}</span>
                      <ArrowRight className="size-3" aria-hidden="true" />
                      <span className="font-medium text-foreground">{targetVocabulary.sign.name} signs</span>
                      {bridge.translation && bridge.translation.engine !== 'none' && (
                        <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-wider">
                          via {bridge.translation.engine === 'browser' ? 'browser' : 'translation API'}
                        </span>
                      )}
                    </span>
                    {bridge.translation && bridge.translation.engine !== 'none' && (
                      <p className="text-sm leading-relaxed">{bridge.text}</p>
                    )}
                    {bridge.translation?.engine === 'none' && (
                      <p className="leading-relaxed text-warning">
                        Could not translate {spokenLabel(bridge.from)} to {spokenLabel(bridge.to)} in this
                        browser - spelling the original text instead. Chrome 138+ translates on-device, or
                        set NEXT_PUBLIC_TRANSLATE_URL.
                      </p>
                    )}
                    {!bridge.translation && (
                      <p className="text-muted-foreground">
                        Both spell {spokenLabel(bridge.to)}, so nothing to translate.
                      </p>
                    )}
                  </div>
                  <GesturePlayback
                    steps={steps}
                    intervalMs={targetLanguage.gesture_interval_ms}
                    languageName={targetVocabulary.sign.name}
                  />
                </>
              )}
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border bg-elevated p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold tracking-tight">Translate</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {model?.trained
                ? `${model.labels.length} sign${model.labels.length === 1 ? '' : 's'} known in ${scopeLabel}, ${model.sampleCount} samples.`
                : 'Interpreting from every sign language in your library, or pick one.'}
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">From (sign language)</span>
            <Select
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setTranslated(null)
              }}
              disabled={cameraOn}
              className="h-9"
            >
              <option value={ALL}>
                {languages.length === 0 ? 'No sign languages yet' : 'All sign languages'}
              </option>
              {languages.map((language) => {
                const own = vocabularies.filter((v) => v.language.id === language.id)
                return (
                  <optgroup key={language.id} label={language.name}>
                    {own.length > 1 && (
                      <option value={languageValue(language.id)}>Everything in {language.name}</option>
                    )}
                    {own.map(({ sign }) => (
                      <option key={sign.id} value={signValue(sign.id)}>
                        {sign.name}
                        {own.length === 1 ? ` (${language.name})` : ''}
                      </option>
                    ))}
                    {own.length === 0 && (
                      <option value={languageValue(language.id)} disabled>
                        {language.name} (nothing trained)
                      </option>
                    )}
                  </optgroup>
                )
              })}
            </Select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">To</span>
            <Select
              value={target}
              onChange={(event) => {
                setTarget(event.target.value)
                setTranslated(null)
              }}
              className="h-9"
            >
              <optgroup label="Spoken languages">
                {TARGET_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </optgroup>
              {vocabularies.length > 0 && (
                <optgroup label="Sign languages (shown as pictures)">
                  {vocabularies.map(({ sign, language }) => (
                    <option key={sign.id} value={signTarget(sign.id)}>
                      {sign.name} · {language.name} ({spokenLabel(language.spoken_language)})
                      {language.gesture_translation ? '' : ' (pictures off)'}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </label>

          {targetVocabulary && targetLanguage ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sign-to-sign: the transcript is translated into {spokenLabel(targetLanguage.spoken_language)}
              {' '}(what {targetVocabulary.sign.name} spells) when it needs to be, then shown as{' '}
              {targetVocabulary.sign.name} signs - each sign&rsquo;s photo, or its hand skeleton when no
              photo was kept - one every {(targetLanguage.gesture_interval_ms / 1000).toFixed(1)}s.
            </p>
          ) : (
            <>
              <Button
                size="lg"
                disabled={!transcript.trim() || translating || !canTranslate}
                onClick={() => void runTranslation()}
              >
                {translating ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Languages aria-hidden="true" />
                )}
                {translating ? 'Translating…' : `Translate to ${targetLabel}`}
              </Button>

              {!canTranslate && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This browser has no built-in translator, and no translation endpoint is
                  configured. Set <code className="font-mono">NEXT_PUBLIC_TRANSLATE_URL</code> to
                  a LibreTranslate-compatible URL, or open SignTalk in Chrome 138+.
                </p>
              )}

              {translated && (
                <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {translated.detected ? translated.detected : 'source'}
                    <ArrowRight className="size-3" aria-hidden="true" />
                    {target}
                  </span>
                  <p className="text-sm leading-relaxed">{translated.text}</p>
                  {translated.engine === 'same' ? (
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Already in {targetLabel}. Nothing to translate.
                    </p>
                  ) : translated.engine === 'none' ? (
                    <p className="text-[0.6875rem] leading-relaxed text-warning">
                      Not translated: no engine could handle that pair. This is the original
                      text.
                    </p>
                  ) : (
                    <p className="text-[0.6875rem] text-muted-foreground">
                      via{' '}
                      {translated.engine === 'browser'
                        ? 'your browser, on-device'
                        : 'the configured translation API'}
                    </p>
                  )}
                </div>
              )}

              {browserTranslationSupported() && (
                <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
                  Translation runs on this device. The first use of a language pair downloads
                  a model, which can take a moment.
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </Shell>
  )
}

/** "Hindi" for "hi"; the code itself when it is not in the picker list. */
function spokenLabel(code: string | null | undefined): string {
  if (!code) return 'unknown'
  return TARGET_LANGUAGES.find((l) => l.code === code.toLowerCase())?.label ?? code
}

/** Careful (default) or Speed. Speed trusts a sign sooner and at lower confidence. */
function PaceToggle({ pace, onChange }: { pace: Pace; onChange: (pace: Pace) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Recognition pace"
      className="flex h-11 items-center rounded-lg border bg-elevated p-1 text-sm"
    >
      {(
        [
          { value: 'careful', label: 'Careful', hint: 'Waits for a steady hold. Fewer mistakes.' },
          { value: 'speed', label: 'Speed', hint: 'Fires after two frames at 45% confidence. For fluent signing.' },
        ] as { value: Pace; label: string; hint: string }[]
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={pace === option.value}
          title={option.hint}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-full items-center gap-1.5 rounded-md px-3 font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            pace === option.value
              ? 'bg-primary text-primary-foreground shadow-raised'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.value === 'speed' && <Zap className="size-3.5" aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Shell({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
            <ArrowLeft aria-hidden="true" />
            Home
          </Button>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate font-semibold leading-tight tracking-tight">Translator</h2>
            <span className="truncate text-xs text-muted-foreground">
              Sign to text, text to speech languages, or sign language to sign language
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8">{children}</div>
    </div>
  )
}
