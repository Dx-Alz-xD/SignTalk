'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CircleCheck,
  Hand,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { SignTalkLockup } from '@/components/signtalk-mark'
import { useCameraStage } from '@/components/trainer/camera-stage'
import { useCapture } from '@/components/trainer/use-capture'
import { errorMessage } from '@/lib/api'
import type { HandSample } from '@/lib/hand-tracker'
import {
  DEFAULT_VIEW,
  STANDARD_VIEWS,
  createSymbol,
  createVocabulary,
  deleteSymbol,
  listLanguages,
  listSigns,
  listSymbols,
  type Language,
  type Sign,
  type Symbol,
} from '@/lib/library'
import { modelStatus, type ModelStatus, type StoredView } from '@/lib/training'
import { cn } from '@/lib/utils'

/** A symbol is considered covered once one view holds this many samples. */
const SAMPLES_FOR_READY = 40

export function TrainerScreen({ onBack }: { onBack: () => void }) {
  const [signs, setSigns] = useState<{ sign: Sign; language: Language }[]>([])
  const [active, setActive] = useState<{ sign: Sign; language: Language } | null>(null)
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<string>(DEFAULT_VIEW)
  const [model, setModel] = useState<ModelStatus | null>(null)

  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)

  // The render loop writes here every frame. It is a ref rather than state
  // because nothing on screen needs to re-render 30 times a second — only the
  // hand count does, and that is derived below.
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

  const refreshModel = useCallback((languageId: string) => {
    modelStatus(languageId)
      .then(setModel)
      .catch(() => setModel(null))
  }, [])

  const handleSaved = useCallback(
    (stored: StoredView) => {
      setSaved(
        `Saved ${stored.sample_count} sample${stored.sample_count === 1 ? '' : 's'} ` +
          `to “${stored.view}” — ${stored.quality}.`,
      )
      if (active) {
        void listSymbols(active.sign.id).then(setSymbols).catch(() => undefined)
        refreshModel(active.language.id)
      }
    },
    [active, refreshModel],
  )

  const capture = useCapture({ handsRef, onSaved: handleSaved })

  // Load every sign the user owns, flattened across languages — the trainer
  // works one sign at a time, so the language is context rather than a step.
  useEffect(() => {
    const controller = new AbortController()
    listLanguages(controller.signal)
      .then(async (languages) => {
        const pairs: { sign: Sign; language: Language }[] = []
        for (const language of languages) {
          const found = await listSigns(language.id, controller.signal)
          for (const sign of found) pairs.push({ sign, language })
        }
        if (controller.signal.aborted) return
        setSigns(pairs)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  async function open(pair: { sign: Sign; language: Language }) {
    setActive(pair)
    setFailure(null)
    setSaved(null)
    try {
      const found = await listSymbols(pair.sign.id)
      setSymbols(found)
      setSelectedId(found[0]?.id ?? null)
      refreshModel(pair.language.id)
    } catch (cause) {
      setFailure(errorMessage(cause))
    }
  }

  function leave() {
    capture.cancel()
    setCameraOn(false)
    setActive(null)
    setSymbols([])
    setSelectedId(null)
    setModel(null)
  }

  if (loading) {
    return (
      <Shell onBack={onBack} title="Trainer">
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading your vocabulary&hellip;
        </div>
      </Shell>
    )
  }

  if (!active) {
    return (
      <Shell onBack={onBack} title="Trainer">
        <VocabularyPicker
          signs={signs}
          failure={failure}
          onOpen={open}
          onCreated={(pair) => {
            setSigns((prev) => [...prev, pair])
            void open(pair)
          }}
          onFailure={setFailure}
        />
      </Shell>
    )
  }

  const busy = capture.phase !== 'idle'

  return (
    <Shell
      onBack={leave}
      backLabel="All vocabularies"
      title={active.sign.name}
      subtitle={active.language.name}
    >
      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {failure && <FormAlert>{failure}</FormAlert>}
          {capture.error && <FormAlert>{capture.error}</FormAlert>}
          {saved && !busy && <FormAlert tone="success">{saved}</FormAlert>}

          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-black">
            {/* Never shown: it is the source the mirrored canvas is drawn from. */}
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
        </div>

        <SymbolPanel
          sign={active.sign}
          symbols={symbols}
          selectedId={selectedId}
          model={model}
          disabled={busy}
          onSelect={setSelectedId}
          onAdd={async (name) => {
            const created = await createSymbol(active.sign.id, name)
            setSymbols(await listSymbols(active.sign.id))
            setSelectedId(created.id)
          }}
          onDelete={async (symbolId) => {
            await deleteSymbol(symbolId)
            const remaining = await listSymbols(active.sign.id)
            setSymbols(remaining)
            setSelectedId((current) =>
              current === symbolId ? (remaining[0]?.id ?? null) : current,
            )
            refreshModel(active.language.id)
          }}
          onFailure={setFailure}
        />
      </div>
    </Shell>
  )
}

// ---------------------------------------------------------------- vocabulary --

function VocabularyPicker({
  signs,
  failure,
  onOpen,
  onCreated,
  onFailure,
}: {
  signs: { sign: Sign; language: Language }[]
  failure: string | null
  onOpen: (pair: { sign: Sign; language: Language }) => void
  onCreated: (pair: { sign: Sign; language: Language }) => void
  onFailure: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('')
  const [creating, setCreating] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    try {
      const result = await createVocabulary({ name: name.trim(), language: language.trim() })
      setName('')
      setLanguage('')
      onCreated({ sign: result.sign, language: result.language })
    } catch (cause) {
      onFailure(errorMessage(cause))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      {failure && <FormAlert>{failure}</FormAlert>}

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-xl border bg-elevated p-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-2 text-sm">
          <span className="font-medium">New vocabulary</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Alphabet"
          />
        </label>
        <label className="flex flex-1 flex-col gap-2 text-sm">
          <span className="font-medium text-muted-foreground">Language (optional)</span>
          <Input
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="ASL"
          />
        </label>
        <Button type="submit" size="xl" disabled={!name.trim() || creating}>
          {creating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          Create
        </Button>
      </form>

      {signs.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nothing trained yet. Create a vocabulary above — a set like “Alphabet” or
          “Greetings” — then add the individual signs to record inside it.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {signs.map((pair) => (
            <button
              key={pair.sign.id}
              type="button"
              onClick={() => onOpen(pair)}
              className={cn(
                'group flex flex-col gap-1 rounded-xl border border-border bg-elevated p-4 text-left',
                'transition-[border-color,box-shadow,transform] duration-150',
                'hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-raised',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
              )}
            >
              <span className="font-semibold tracking-tight">{pair.sign.name}</span>
              <span className="text-xs text-muted-foreground">
                {pair.language.name} · {pair.sign.symbol_count} symbol
                {pair.sign.symbol_count === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------- symbols --

function SymbolPanel({
  sign,
  symbols,
  selectedId,
  model,
  disabled,
  onSelect,
  onAdd,
  onDelete,
  onFailure,
}: {
  sign: Sign
  symbols: Symbol[]
  selectedId: string | null
  model: ModelStatus | null
  disabled: boolean
  onSelect: (id: string) => void
  onAdd: (name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onFailure: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

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
        <h3 className="font-semibold tracking-tight">Symbols in {sign.name}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {model?.trained
            ? `Model ready — ${model.labels.length} label${
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
          No symbols yet. Each one is a label the interpreter can return.
        </p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
          {symbols.map((symbol) => {
            const best = symbol.views.reduce((max, v) => Math.max(max, v.samples), 0)
            const ready = best >= SAMPLES_FOR_READY
            const selected = symbol.id === selectedId

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
                    {ready ? (
                      <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          symbol.sample_count > 0 ? 'bg-warning' : 'bg-muted-foreground/40',
                        )}
                      />
                    )}
                    <span className="truncate text-sm font-medium">{symbol.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[0.6875rem] text-muted-foreground">
                      {symbol.sample_count}
                    </span>
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

                {selected && symbol.views.length > 0 && (
                  <p className="px-2.5 pt-1 font-mono text-[0.6875rem] text-muted-foreground">
                    {symbol.views.map((v) => `${v.view} ${v.samples}`).join(' · ')}
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

// ---------------------------------------------------------------------- shell --

function Shell({
  onBack,
  backLabel = 'Home',
  title,
  subtitle,
  children,
}: {
  onBack: () => void
  backLabel?: string
  title: string
  subtitle?: string
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
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 className="truncate font-semibold tracking-tight">{title}</h2>
            {subtitle && (
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
        </div>
        <SignTalkLockup className="hidden sm:flex" />
      </header>

      <div className="flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8">{children}</div>
    </div>
  )
}
