'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { useCameraStage } from '@/components/trainer/camera-stage'
import { errorMessage } from '@/lib/api'
import type { HandSample } from '@/lib/hand-tracker'
import {
  listLanguages,
  listSigns,
  listSymbols,
  outputPreview,
  type Language,
  type Symbol,
} from '@/lib/library'
import { modelStatus, predictFrame, type ModelStatus } from '@/lib/training'
import {
  TARGET_LANGUAGES,
  browserTranslationSupported,
  translate,
  translationAvailable,
  type Translation,
} from '@/lib/translate'
import { cn } from '@/lib/utils'

/** How often a frame is sent for classification. */
const PREDICT_INTERVAL_MS = 120
/** Consecutive agreeing frames before a sign counts as held. */
const AGREEMENT = 4
/** Below this the frame is treated as "not sure", not as a wrong answer. */
const MIN_CONFIDENCE = 0.55
/** The same sign cannot fire twice within this window without a gap first. */
const REARM_MS = 900

export function TranslatorScreen({ onBack }: { onBack: () => void }) {
  const [languages, setLanguages] = useState<Language[]>([])
  const [sourceId, setSourceId] = useState<string>('')
  const [target, setTarget] = useState('en')
  const [model, setModel] = useState<ModelStatus | null>(null)
  /** symbol label -> what it types, so a recognised sign becomes text. */
  const [outputs, setOutputs] = useState<Record<string, Symbol>>({})

  const [cameraOn, setCameraOn] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [current, setCurrent] = useState<{ label: string; confidence: number } | null>(null)
  const [translated, setTranslated] = useState<Translation | null>(null)
  const [translating, setTranslating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const handsRef = useRef<HandSample[]>([])
  const [handCount, setHandCount] = useState(0)

  const onFrame = useCallback((hands: HandSample[]) => {
    handsRef.current = hands
    setHandCount((count) => (count === hands.length ? count : hands.length))
  }, [])

  const stage = useCameraStage({ active: cameraOn, onFrame })

  const source = useMemo(
    () => languages.find((language) => language.id === sourceId) ?? null,
    [languages, sourceId],
  )

  useEffect(() => {
    const controller = new AbortController()
    listLanguages(controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return
        setLanguages(found)
        setSourceId((current) => current || found[0]?.id || '')
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  // Load the chosen language's model status and the output of every symbol in
  // it, so a prediction can be turned into text without another round trip.
  useEffect(() => {
    if (!sourceId) return
    const controller = new AbortController()

    modelStatus(sourceId, controller.signal)
      .then(setModel)
      .catch(() => setModel(null))

    listSigns(sourceId, controller.signal)
      .then(async (signs) => {
        const map: Record<string, Symbol> = {}
        for (const sign of signs) {
          for (const symbol of await listSymbols(sign.id, controller.signal)) {
            // The classifier labels a symbol "sign / symbol"; key the lookup
            // the same way so a prediction maps straight onto its output.
            map[`${sign.name} / ${symbol.name}`] = symbol
          }
        }
        if (!controller.signal.aborted) setOutputs(map)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [sourceId])

  // The recognition loop. Kept in a ref-driven interval rather than on the
  // render loop: classification is a round trip, and the camera must not wait.
  useEffect(() => {
    if (!cameraOn || stage.state !== 'live' || !sourceId) return

    let stopped = false
    let agreeing: { label: string; count: number } | null = null
    let lastEmitted = ''
    let lastEmittedAt = 0

    async function tick() {
      while (!stopped) {
        const hands = handsRef.current
        if (hands.length === 0) {
          agreeing = null
          setCurrent(null)
          // A gap re-arms the same sign, so holding "A" twice types it twice.
          lastEmitted = ''
          await wait(PREDICT_INTERVAL_MS)
          continue
        }

        try {
          const result = await predictFrame(hands, sourceId)
          if (stopped) return

          const found = result.prediction
          if (!found || found.confidence < MIN_CONFIDENCE) {
            agreeing = null
            setCurrent(found ? { label: found.label, confidence: found.confidence } : null)
          } else {
            setCurrent({ label: found.label, confidence: found.confidence })
            agreeing =
              agreeing && agreeing.label === found.label
                ? { label: found.label, count: agreeing.count + 1 }
                : { label: found.label, count: 1 }

            const now = Date.now()
            const repeatTooSoon =
              found.label === lastEmitted && now - lastEmittedAt < REARM_MS
            if (agreeing.count >= AGREEMENT && !repeatTooSoon) {
              lastEmitted = found.label
              lastEmittedAt = now
              agreeing = null
              setTranscript((text) => append(text, found.label, outputs))
            }
          }
        } catch (cause) {
          if (stopped) return
          setFailure(errorMessage(cause))
          return
        }

        await wait(PREDICT_INTERVAL_MS)
      }
    }

    void tick()
    return () => {
      stopped = true
    }
  }, [cameraOn, stage.state, sourceId, outputs])

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
          {failure && <FormAlert>{failure}</FormAlert>}

          {languages.length === 0 ? (
            <FormAlert>
              No sign languages yet. Train one first — the translator reads whatever the
              Trainer has taught it.
            </FormAlert>
          ) : model && !model.trained ? (
            <FormAlert>
              {source?.name} has no usable model yet. Record samples for at least two
              symbols so the interpreter has something to tell apart.
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
                      Camera is off. Frames never leave this device — only the hand
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

                {current && (
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
                    {current.label.split(' / ').pop()}
                    <span className="ml-2 font-mono text-xs text-white/60">
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
              disabled={!sourceId}
              onClick={() => setCameraOn((on) => !on)}
            >
              <Camera aria-hidden="true" />
              {cameraOn ? 'Stop interpreting' : 'Start interpreting'}
            </Button>

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
              <span className="text-sm font-medium">Transcript</span>
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
              placeholder="Signs you hold will appear here. You can edit this before translating."
              className="w-full resize-y rounded-xl border border-input bg-elevated p-3.5 text-sm leading-relaxed placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border bg-elevated p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold tracking-tight">Translate</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {model?.trained
                ? `${model.labels.length} sign${model.labels.length === 1 ? '' : 's'} known, ${model.sampleCount} samples.`
                : 'Pick a trained sign language to interpret from.'}
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">From (sign language)</span>
            <Select
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value)
                setTranslated(null)
              }}
              disabled={cameraOn}
              className="h-9"
            >
              {languages.length === 0 && <option value="">No sign languages yet</option>}
              {languages.map((language) => (
                <option key={language.id} value={language.id}>
                  {language.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">To (spoken language)</span>
            <Select
              value={target}
              onChange={(event) => {
                setTarget(event.target.value)
                setTranslated(null)
              }}
              className="h-9"
            >
              {TARGET_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </Select>
          </label>

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
            {translating ? 'Translating…' : 'Translate'}
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
              {translated.engine === 'none' ? (
                <p className="text-[0.6875rem] leading-relaxed text-warning">
                  Not translated — no engine could handle that pair. This is the original
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
        </aside>
      </div>
    </Shell>
  )
}

/**
 * Appends what a recognised label types.
 *
 * Key and combo outputs are shown in brackets rather than actually pressed:
 * a web page cannot synthesise real keystrokes into other applications, and
 * pretending otherwise would be worse than naming what it would send.
 */
function append(text: string, label: string, outputs: Record<string, Symbol>): string {
  const symbol = outputs[label]
  if (!symbol) return text ? `${text} ${label.split(' / ').pop()}` : label.split(' / ').pop()!

  if (symbol.output_kind === 'space') return `${text} `
  if (symbol.output_kind === 'key' || symbol.output_kind === 'combo') {
    return `${text}[${symbol.output_value}]`
  }

  const piece = outputPreview(symbol)
  // Letters run together into words; anything longer reads as its own token.
  if (piece.length === 1) return `${text}${piece}`
  return text && !text.endsWith(' ') ? `${text} ${piece}` : `${text}${piece}`
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
              Sign to text, then to any language
            </span>
          </div>
        </div>
        <SignTalkLockup className="hidden sm:flex" />
      </header>

      <div className="flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8">{children}</div>
    </div>
  )
}
