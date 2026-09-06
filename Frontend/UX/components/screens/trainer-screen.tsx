'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CircleCheck,
  Hand,
  Loader2,
  Pencil,
  Plus,
  Images,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { useCameraStage } from '@/components/trainer/camera-stage'
import { useCapture } from '@/components/trainer/use-capture'
import { DatasetImport } from '@/components/trainer/dataset-import'
import { LanguageDetailsForm } from '@/components/trainer/language-details-form'
import { VocabularyTable, type Vocabulary } from '@/components/trainer/vocabulary-table'
import { errorMessage } from '@/lib/api'
import type { HandSample } from '@/lib/hand-tracker'
import {
  DEFAULT_VIEW,
  MIN_SAMPLE_TARGET,
  OUTPUT_KINDS,
  STANDARD_VIEWS,
  createSymbol,
  deleteSign,
  deleteSymbol,
  listLanguages,
  listSigns,
  listSymbols,
  outputPreview,
  putSymbolImage,
  updateSymbol,
  type OutputKind,
  type Symbol,
} from '@/lib/library'
import { modelStatus, type ModelStatus, type StoredView } from '@/lib/training'
import { cn } from '@/lib/utils'

type Step = 'list' | 'details' | 'training'

export function TrainerScreen({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<Step>('list')
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([])
  const [active, setActive] = useState<Vocabulary | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)

  /** Reloads the whole tree; cheap enough, and never leaves a stale count. */
  const reload = useCallback(async (signal?: AbortSignal) => {
    const languages = await listLanguages(signal)
    const pairs: Vocabulary[] = []
    for (const language of languages) {
      for (const sign of await listSigns(language.id, signal)) {
        pairs.push({ sign, language })
      }
    }
    if (!signal?.aborted) setVocabularies(pairs)
    return pairs
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  if (loading) {
    return (
      <Shell onBack={onBack} title="Trainer">
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your sign languages&hellip;
        </div>
      </Shell>
    )
  }

  if (step === 'details') {
    return (
      <Shell
        onBack={() => setStep('list')}
        backLabel="All sign languages"
        title={active ? `Edit ${active.sign.name}` : 'New sign language'}
        subtitle={active?.language.name}
      >
        <LanguageDetailsForm
          existing={active}
          onCancel={() => setStep('list')}
          onReady={(saved) => {
            setActive(saved)
            void reload().catch(() => undefined)
            setStep('training')
          }}
        />
      </Shell>
    )
  }

  if (step === 'training' && active) {
    return (
      <TrainingWorkspace
        vocabulary={active}
        onBack={() => {
          void reload().catch(() => undefined)
          setStep('list')
        }}
        onEditDetails={() => setStep('details')}
      />
    )
  }

  return (
    <Shell onBack={onBack} title="Trainer" subtitle="Your sign languages">
      {failure && <FormAlert>{failure}</FormAlert>}
      <VocabularyTable
        vocabularies={vocabularies}
        onCreate={() => {
          setActive(null)
          setStep('details')
        }}
        onEdit={(vocabulary) => {
          setActive(vocabulary)
          setStep('details')
        }}
        onDelete={async (vocabulary) => {
          setFailure(null)
          try {
            await deleteSign(vocabulary.sign.id)
            await reload()
          } catch (cause) {
            setFailure(errorMessage(cause))
          }
        }}
        onOpen={(vocabulary) => {
          setActive(vocabulary)
          setStep('training')
        }}
      />
    </Shell>
  )
}

// ------------------------------------------------------------------ training --

function TrainingWorkspace({
  vocabulary,
  onBack,
  onEditDetails,
}: {
  vocabulary: Vocabulary
  onBack: () => void
  onEditDetails: () => void
}) {
  const { sign, language } = vocabulary

  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<string>(DEFAULT_VIEW)
  const [model, setModel] = useState<ModelStatus | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // Frames for the *next* capture. Starts at the language's default and can
  // be nudged per symbol - a subtle letter earns more frames than a fist.
  const [frames, setFrames] = useState(language.sample_target)
  const [importing, setImporting] = useState(false)

  const handsRef = useRef<HandSample[]>([])
  const [handCount, setHandCount] = useState(0)

  const onFrame = useCallback((hands: HandSample[]) => {
    handsRef.current = hands
    setHandCount((current) => (current === hands.length ? current : hands.length))
  }, [])

  const stage = useCameraStage({ active: cameraOn, onFrame })

  const selected = useMemo(
    () => symbols.find((s) => s.id === selectedId) ?? null,
    [symbols, selectedId],
  )

  const refresh = useCallback(async () => {
    const found = await listSymbols(sign.id)
    setSymbols(found)
    setSelectedId((current) => current ?? found[0]?.id ?? null)
    modelStatus({ languageId: language.id }).then(setModel).catch(() => setModel(null))
    return found
  }, [sign.id, language.id])

  useEffect(() => {
    refresh().catch((cause) => setFailure(errorMessage(cause)))
  }, [refresh])

  const handleSaved = useCallback(
    (stored: StoredView) => {
      setSaved(
        `Saved ${stored.sample_count} sample${stored.sample_count === 1 ? '' : 's'} ` +
          `to “${stored.view}”: ${stored.quality}.`,
      )
      // With gesture translation on, the frame on screen at the end of the
      // hold becomes this symbol's reference picture. The canvas is the
      // mirrored preview with the skeleton drawn on it - a fair likeness of
      // what the person sees themselves doing.
      const canvas = stage.canvasRef.current
      if (language.gesture_translation && selectedId && canvas) {
        void snapshot(canvas)
          .then((image) => (image ? putSymbolImage(selectedId, image) : undefined))
          .then(() => refresh())
          .catch(() => refresh())
      } else {
        refresh().catch(() => undefined)
      }
    },
    [refresh, language.gesture_translation, selectedId, stage.canvasRef],
  )

  const capture = useCapture({
    handsRef,
    onSaved: handleSaved,
    target: frames,
  })

  const busy = capture.phase !== 'idle'

  // What the language said it expects, so the capture button can say so too.
  const wantedHands = language.hand_control === 'both' ? 2 : 1
  const handsWrong = stage.state === 'live' && handCount > 0 && handCount !== wantedHands

  return (
    <Shell
      onBack={onBack}
      backLabel="All sign languages"
      title={sign.name}
      subtitle={`${language.name} · ${language.hand_control} · ${language.sample_target} frames`}
      action={
        <>
          <Button
            variant={importing ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setImporting((open) => !open)}
            aria-expanded={importing}
            className={importing ? undefined : 'text-muted-foreground'}
          >
            <Upload aria-hidden="true" />
            Import dataset
          </Button>
          <Button variant="ghost" size="sm" onClick={onEditDetails} className="text-muted-foreground">
            <Pencil aria-hidden="true" />
            Edit details
          </Button>
        </>
      }
    >
      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {failure && <FormAlert>{failure}</FormAlert>}
          {capture.error && <FormAlert>{capture.error}</FormAlert>}
          {saved && !busy && <FormAlert tone="success">{saved}</FormAlert>}

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

                {handsWrong && !busy && (
                  <span className="absolute bottom-3 left-3 rounded-full bg-warning/90 px-3 py-1 text-xs font-medium text-black backdrop-blur">
                    This language is set to “{language.hand_control}”: show{' '}
                    {wantedHands} hand{wantedHands === 1 ? '' : 's'}
                  </span>
                )}

                {capture.phase === 'countdown' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-7xl font-bold text-white drop-shadow-lg">
                      {capture.countdown}
                    </span>
                  </div>
                )}

                {capture.phase === 'capturing' && (
                  <span
                    className={cn(
                      'absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-medium backdrop-blur',
                      capture.steady ? 'bg-success/85 text-white' : 'bg-warning/85 text-black',
                    )}
                  >
                    {capture.steady ? 'Holding steady' : 'Hold still'}
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={cameraOn ? 'outline' : 'default'}
              size="xl"
              onClick={() => {
                if (cameraOn) capture.cancel()
                setCameraOn((on) => !on)
              }}
            >
              <Camera aria-hidden="true" />
              {cameraOn ? 'Turn camera off' : 'Turn camera on'}
            </Button>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Angle
              <Select
                value={view}
                onChange={(event) => setView(event.target.value)}
                disabled={busy}
                className="w-32"
              >
                {STANDARD_VIEWS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>

            <label
              className="flex items-center gap-2 text-sm text-muted-foreground"
              title="Frames this capture collects. Reset to the language default with the ⟲."
            >
              Frames
              <input
                type="range"
                min={MIN_SAMPLE_TARGET}
                max={200}
                step={5}
                value={frames}
                disabled={busy}
                onChange={(event) => setFrames(Number(event.target.value))}
                className="h-2 w-28 cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-50"
                aria-label="Frames for the next capture"
              />
              <span className="w-8 font-mono text-xs text-foreground">{frames}</span>
              {frames !== language.sample_target && (
                <button
                  type="button"
                  onClick={() => setFrames(language.sample_target)}
                  disabled={busy}
                  className="rounded-sm text-xs text-primary underline-offset-4 hover:underline"
                  aria-label={`Reset to ${language.sample_target} frames`}
                >
                  ⟲ {language.sample_target}
                </button>
              )}
            </label>

            {capture.phase === 'idle' ? (
              <Button
                size="xl"
                className="ml-auto"
                disabled={stage.state !== 'live' || !selected}
                onClick={() => {
                  setSaved(null)
                  capture.clearError()
                  if (selected) {
                    void capture.start({ symbolId: selected.id, view, replace: false })
                  }
                }}
              >
                <Sparkles aria-hidden="true" />
                {selected ? `Record “${selected.name}”` : 'Add a symbol first'}
              </Button>
            ) : (
              <Button variant="outline" size="xl" className="ml-auto" onClick={capture.cancel}>
                <X aria-hidden="true" />
                {capture.phase === 'saving' ? 'Saving…' : 'Cancel'}
              </Button>
            )}
          </div>

          {capture.phase === 'capturing' && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Capturing steady frames</span>
                <span className="font-mono">
                  {capture.collected} / {capture.target}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${(capture.collected / capture.target) * 100}%` }}
                />
              </div>
            </div>
          )}

          {importing && (
            <DatasetImport
              language={language}
              sign={sign}
              onDone={() => void refresh().catch(() => undefined)}
              onClose={() => setImporting(false)}
            />
          )}
        </div>

        <SymbolPanel
          signName={sign.name}
          symbols={symbols}
          selectedId={selectedId}
          model={model}
          disabled={busy}
          pictures={
            !language.gesture_translation
              ? 'off'
              : stage.state === 'live'
                ? 'ready'
                : 'camera-off'
          }
          onTakePicture={async (symbolId) => {
            const canvas = stage.canvasRef.current
            if (!canvas) return
            const image = await snapshot(canvas)
            if (image) await putSymbolImage(symbolId, image)
            await refresh()
          }}
          onSelect={setSelectedId}
          onAdd={async (name) => {
            const created = await createSymbol(sign.id, name)
            await refresh()
            setSelectedId(created.id)
          }}
          onSaveOutput={async (symbolId, changes) => {
            await updateSymbol(symbolId, changes)
            await refresh()
          }}
          onDelete={async (symbolId) => {
            await deleteSymbol(symbolId)
            const remaining = await listSymbols(sign.id)
            setSymbols(remaining)
            setSelectedId((current) =>
              current === symbolId ? (remaining[0]?.id ?? null) : current,
            )
            modelStatus({ languageId: language.id }).then(setModel).catch(() => setModel(null))
          }}
          onFailure={setFailure}
        />
      </div>
    </Shell>
  )
}

// ------------------------------------------------------------------- symbols --

function SymbolPanel({
  signName,
  symbols,
  selectedId,
  model,
  disabled,
  pictures,
  onTakePicture,
  onSelect,
  onAdd,
  onSaveOutput,
  onDelete,
  onFailure,
}: {
  signName: string
  symbols: Symbol[]
  selectedId: string | null
  model: ModelStatus | null
  disabled: boolean
  /** Whether a photo can be taken right now, and if not, why. */
  pictures: 'ready' | 'camera-off' | 'off'
  onTakePicture: (id: string) => Promise<void>
  onSelect: (id: string) => void
  onAdd: (name: string) => Promise<void>
  onSaveOutput: (
    id: string,
    changes: { outputKind: OutputKind; outputValue: string },
  ) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onFailure: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [snapping, setSnapping] = useState<string | null>(null)

  const pictureHint =
    pictures === 'ready'
      ? 'Take a picture of this sign from the camera now'
      : pictures === 'camera-off'
        ? 'Turn the camera on to take a picture'
        : 'Turn on “Allow gesture translation” in Edit details to keep pictures'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    try {
      await onAdd(name.trim())
      setName('')
    } catch (cause) {
      onFailure(errorMessage(cause))
    } finally {
      setAdding(false)
    }
  }

  return (
    <aside className="flex flex-col gap-4 rounded-xl border bg-elevated p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold tracking-tight">Symbols in {signName}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {model?.trained
            ? `Model ready: ${model.labels.length} label${
                model.labels.length === 1 ? '' : 's'
              }, ${model.sampleCount} samples.`
            : 'Two symbols with samples are needed before the model can tell them apart.'}
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Add a symbol, e.g. A"
          className="h-9"
        />
        <Button type="submit" size="icon-lg" disabled={!name.trim() || adding} aria-label="Add symbol">
          {adding ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </Button>
      </form>

      {symbols.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No symbols yet. Each one is a label the interpreter can return: a letter, a
          word, a phrase, or a key like space.
        </p>
      ) : (
        <ul className="flex max-h-[26rem] flex-col gap-1.5 overflow-y-auto">
          {symbols.map((symbol) => {
            const selected = symbol.id === selectedId
            const editing = symbol.id === editingId

            return (
              <li key={symbol.id}>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
                    selected
                      ? 'border-primary/45 bg-primary/8'
                      : 'border-transparent hover:bg-muted/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(symbol.id)}
                    disabled={disabled}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                  >
                    {symbol.sample_count > 0 ? (
                      <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                    )}
                    <span className="truncate text-sm font-medium">{symbol.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                      {symbol.sample_count}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSnapping(symbol.id)
                      void onTakePicture(symbol.id)
                        .catch((cause) => onFailure(errorMessage(cause)))
                        .finally(() => setSnapping(null))
                    }}
                    disabled={disabled || pictures !== 'ready' || snapping !== null}
                    aria-label={`Take a picture for ${symbol.name}`}
                    title={pictureHint}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {snapping === symbol.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="size-3.5" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingId(editing ? null : symbol.id)}
                    disabled={disabled}
                    aria-label={`Edit what ${symbol.name} types`}
                    aria-expanded={editing}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void onDelete(symbol.id).catch((cause) => onFailure(errorMessage(cause)))
                    }}
                    disabled={disabled}
                    aria-label={`Delete ${symbol.name}`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>

                {editing ? (
                  <OutputEditor
                    symbol={symbol}
                    onCancel={() => setEditingId(null)}
                    onSave={async (changes) => {
                      try {
                        await onSaveOutput(symbol.id, changes)
                        setEditingId(null)
                      } catch (cause) {
                        onFailure(errorMessage(cause))
                      }
                    }}
                  />
                ) : (
                  <p className="flex items-center gap-1.5 px-2.5 pt-1 font-mono text-[0.6875rem] text-muted-foreground">
                    <span>
                      types {JSON.stringify(outputPreview(symbol))}
                      {symbol.views.length > 0 &&
                        ` · ${symbol.views.map((v) => `${v.view} ${v.samples}`).join(' · ')}`}
                    </span>
                    {symbol.has_image ? (
                      <Images className="size-3 text-primary" aria-label="Has a photo" />
                    ) : symbol.sample_count > 0 ? (
                      <Images className="size-3 opacity-40" aria-label="Shown as a hand skeleton until a photo is taken" />
                    ) : null}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}

/** What this symbol types when the translator recognises it. */
function OutputEditor({
  symbol,
  onSave,
  onCancel,
}: {
  symbol: Symbol
  onSave: (changes: { outputKind: OutputKind; outputValue: string }) => Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = useState<OutputKind>(symbol.output_kind)
  const [value, setValue] = useState(symbol.output_value)
  const [saving, setSaving] = useState(false)

  const hint = OUTPUT_KINDS.find((option) => option.value === kind)?.hint
  const needsValue = kind === 'key' || kind === 'combo'

  return (
    <div className="mt-1.5 flex flex-col gap-2 rounded-lg border bg-card p-2.5">
      <Select
        value={kind}
        aria-label={`What ${symbol.name} types`}
        onChange={(event) => setKind(event.target.value as OutputKind)}
        className="h-8 text-xs"
      >
        {OUTPUT_KINDS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      {kind !== 'space' && (
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            kind === 'text'
              ? `${symbol.name} (or a phrase)`
              : kind === 'key'
                ? 'Enter, Backspace, Tab…'
                : 'Ctrl+C, Alt+Tab…'
          }
          className="h-8 text-xs"
        />
      )}

      <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{hint}</p>

      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="flex-1"
          disabled={saving || (needsValue && !value.trim())}
          onClick={() => {
            setSaving(true)
            void onSave({ outputKind: kind, outputValue: value }).finally(() =>
              setSaving(false),
            )
          }}
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ snapshot --

const SNAPSHOT_MAX_PX = 320

/** The preview canvas, shrunk to a thumbnail and encoded for putSymbolImage. */
async function snapshot(
  canvas: HTMLCanvasElement,
): Promise<{ mime: string; base64: string; width: number; height: number } | null> {
  if (!canvas.width || !canvas.height) return null
  const scale = Math.min(1, SNAPSHOT_MAX_PX / Math.max(canvas.width, canvas.height))
  const small = document.createElement('canvas')
  small.width = Math.round(canvas.width * scale)
  small.height = Math.round(canvas.height * scale)
  small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)
  const dataUrl = small.toDataURL('image/jpeg', 0.82)
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return null
  return { mime: 'image/jpeg', base64: dataUrl.slice(comma + 1), width: small.width, height: small.height }
}

// --------------------------------------------------------------------- shell --

function Shell({
  onBack,
  backLabel = 'Home',
  title,
  subtitle,
  action,
  children,
}: {
  onBack: () => void
  backLabel?: string
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Button>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate font-semibold leading-tight tracking-tight">{title}</h2>
            {subtitle && (
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8">{children}</div>
    </div>
  )
}
