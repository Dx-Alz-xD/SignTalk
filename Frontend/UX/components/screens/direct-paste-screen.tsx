'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Copy,
  Hand,
  Keyboard,
  Loader2,
  Monitor,
  Trash2,
  Type,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { useRecognizer, type Emission } from '@/components/recognizer/use-recognizer'
import { errorMessage } from '@/lib/api'
import { desktopBridge } from '@/lib/desktop-bridge'
import { listLanguages, type Language } from '@/lib/library'
import { cn } from '@/lib/utils'

/**
 * Direct Paste: the camera stays on, and every sign you hold is typed into
 * whichever text field has focus.
 *
 * On the website "whichever text field" means any input, textarea or
 * contenteditable on this page - click into one and start signing. When
 * nothing is focused, the scratchpad below the camera takes the text. In the
 * SignTalk desktop app the bridge in lib/desktop-bridge.ts goes further and
 * types into whatever application is in front, which a browser tab is not
 * allowed to do.
 */

/** Recent recognitions shown under the camera, newest first. */
const LOG_LENGTH = 8

type LogEntry = { id: number; emission: Emission; note?: string; at: number }

export function DirectPasteScreen({ onBack }: { onBack: () => void }) {
  const [languages, setLanguages] = useState<Language[]>([])
  const [sourceId, setSourceId] = useState('')
  const [cameraOn, setCameraOn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [targetLabel, setTargetLabel] = useState('Scratchpad')
  const [scratchLength, setScratchLength] = useState(0)

  const scratchRef = useRef<HTMLTextAreaElement | null>(null)
  const bridge = desktopBridge()

  useEffect(() => {
    const controller = new AbortController()
    listLanguages(controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setLanguages(found)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  // Keep the "typing into" label honest as focus moves around the page.
  useEffect(() => {
    function update() {
      const active = document.activeElement
      if (isEditable(active)) setTargetLabel(describe(active))
      else if (bridge) setTargetLabel('The focused application')
      else setTargetLabel('Scratchpad')
    }
    update()
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [bridge])

  const onEmit = useCallback(
    (emission: Emission) => {
      const active = document.activeElement
      let note: string | undefined

      if (isEditable(active)) {
        note = applyToField(active, emission)
      } else if (bridge) {
        // Desktop shell, nothing focused on our own page: type into whatever
        // window the person is actually working in.
        note = sendToDesktop(bridge, emission)
      } else if (scratchRef.current) {
        note = applyToField(scratchRef.current, emission)
        setScratchLength(scratchRef.current.value.length)
      }

      setLog((entries) =>
        [{ id: Date.now() + Math.random(), emission, note, at: Date.now() }, ...entries].slice(
          0,
          LOG_LENGTH,
        ),
      )
    },
    [bridge],
  )

  const recognizer = useRecognizer({
    active: cameraOn,
    scope: sourceId ? { languageId: sourceId } : {},
    languages,
    onEmit,
  })
  const { stage, handCount, current, model } = recognizer
  const shownFailure = failure ?? recognizer.failure

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
              Database. Direct Paste types whatever your library can recognise.
            </FormAlert>
          ) : model && !model.trained ? (
            <FormAlert>
              Nothing trained to recognise yet. Record samples for at least two symbols first.
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
                    <Keyboard className="size-7 text-muted-foreground" aria-hidden="true" />
                    <p className="max-w-xs text-sm text-muted-foreground">
                      Turn the camera on, click into any text field, and sign. The words are
                      typed where your cursor is.
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

                <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-xs font-medium text-primary-foreground backdrop-blur">
                  <Type className="size-3.5" aria-hidden="true" />
                  {targetLabel}
                </span>

                {current && (
                  <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-1.5 text-sm font-medium text-white backdrop-blur">
                    {current.label.split(' / ').pop()}
                    {!sourceId && current.sign && (
                      <span
                        className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-white/80"
                        title={current.language ?? undefined}
                      >
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
              {cameraOn ? 'Stop Direct Paste' : 'Start Direct Paste'}
            </Button>

            <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              Recognise
              <Select
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
                disabled={cameraOn}
                className="h-9 w-48"
              >
                <option value="">All sign languages</option>
                {languages.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                Scratchpad
                <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                  takes the text when nothing else is focused
                </span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={scratchLength === 0}
                  onClick={() => {
                    const text = scratchRef.current?.value ?? ''
                    void navigator.clipboard?.writeText(text)
                  }}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  Copy
                </button>
                <button
                  type="button"
                  disabled={scratchLength === 0}
                  onClick={() => {
                    if (scratchRef.current) scratchRef.current.value = ''
                    setScratchLength(0)
                  }}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>
            {/* Uncontrolled on purpose: text lands here through the same
                caret-level insertion any other field gets, so the scratchpad
                behaves exactly like a field elsewhere on the page. */}
            <textarea
              ref={scratchRef}
              rows={3}
              aria-label="Scratchpad"
              placeholder="Click here and sign, or click into any other text field on the page."
              onInput={(event) => setScratchLength(event.currentTarget.value.length)}
              className="w-full resize-y rounded-xl border border-input bg-elevated p-3.5 text-sm leading-relaxed placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border bg-elevated p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold tracking-tight">Typing into</h3>
            <p className="flex items-center gap-2 text-sm">
              {bridge ? (
                <Monitor className="size-4 text-primary" aria-hidden="true" />
              ) : (
                <Type className="size-4 text-primary" aria-hidden="true" />
              )}
              <span className="truncate font-medium">{targetLabel}</span>
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {bridge
                ? 'Desktop app: with nothing focused here, text goes to whichever application is in front.'
                : 'Website: text goes to the field you have clicked into on this page. The desktop app can type into any application.'}
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Try any field</span>
            <input
              type="text"
              placeholder="Click here, then sign"
              aria-label="A text field to try Direct Paste in"
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Recent signs</span>
            {log.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Nothing yet. Hold a trained sign steady for a moment and it will appear here
                as it is typed.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {log.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-xs"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">
                        {entry.emission.symbol}
                        <span className="ml-1.5 font-mono text-[0.625rem] text-muted-foreground">
                          {entry.emission.kind === 'space'
                            ? '␣'
                            : entry.emission.kind === 'key' || entry.emission.kind === 'combo'
                              ? `[${entry.emission.value}]`
                              : JSON.stringify(entry.emission.value)}
                        </span>
                      </span>
                      {entry.note && (
                        <span className="text-[0.6875rem] text-warning">{entry.note}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
                      {Math.round(entry.emission.confidence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            {model?.trained
              ? `${model.labels.length} sign${model.labels.length === 1 ? '' : 's'} recognisable across ${
                  sourceId ? 'this language' : `${languages.length} sign language${languages.length === 1 ? '' : 's'}`
                }.`
              : 'Signs marked as keys (Enter, Backspace) work in any field; shortcuts only in the desktop app.'}
          </p>
        </aside>
      </div>
    </Shell>
  )
}

// -------------------------------------------------------------- targets --

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''])

/** Anything a person could type into. */
function isEditable(element: Element | null): element is Editable {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (element instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(element.type) && !element.disabled && !element.readOnly
  }
  return element instanceof HTMLElement && element.isContentEditable
}

function describe(element: Element): string {
  const el = element as HTMLElement
  const label =
    el.getAttribute('aria-label') ||
    (el as HTMLInputElement).placeholder ||
    (el as HTMLInputElement).name ||
    el.id
  if (label) return label.length > 32 ? `${label.slice(0, 32)}…` : label
  if (element instanceof HTMLTextAreaElement) return 'A text area'
  if (element instanceof HTMLInputElement) return 'A text field'
  return 'An editable region'
}

/**
 * Types one emission into a field at the caret. Returns a note for the log
 * when something could not be done in a browser.
 */
function applyToField(element: Editable, emission: Emission): string | undefined {
  if (emission.kind === 'key') {
    const key = emission.value.toLowerCase()
    if (key === 'backspace') {
      deleteBackward(element)
      return undefined
    }
    if (key === 'enter' || key === 'return') {
      if (element instanceof HTMLInputElement) return 'Enter does nothing in a single-line field'
      insertText(element, '\n')
      return undefined
    }
    if (key === 'tab') {
      insertText(element, '\t')
      return undefined
    }
    if (key === 'space') {
      insertText(element, ' ')
      return undefined
    }
    return `"${emission.value}" can only be pressed in the desktop app`
  }
  if (emission.kind === 'combo') {
    return `"${emission.value}" can only be pressed in the desktop app`
  }

  const piece = emission.kind === 'space' ? ' ' : emission.value
  insertText(element, spaced(element, piece))
  return undefined
}

/** Letters run together; words get a separating space unless one is there. */
function spaced(element: Editable, piece: string): string {
  if (piece.length <= 1) return piece
  const before = textBeforeCaret(element)
  return before && !/\s$/.test(before) ? ` ${piece}` : piece
}

function textBeforeCaret(element: Editable): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value.slice(0, element.selectionStart ?? element.value.length)
  }
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return element.textContent ?? ''
  const range = selection.getRangeAt(0).cloneRange()
  range.selectNodeContents(element)
  range.setEnd(selection.anchorNode ?? element, selection.anchorOffset)
  return range.toString()
}

function insertText(element: Editable, text: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start
    element.setRangeText(text, start, end, 'end')
    // Frameworks listening on the field (React included) pick this up.
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  element.focus()
  document.execCommand('insertText', false, text)
}

function deleteBackward(element: Editable) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? start
    if (start !== end) element.setRangeText('', start, end, 'end')
    else if (start > 0) element.setRangeText('', start - 1, start, 'end')
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }
  element.focus()
  document.execCommand('delete')
}

/** Desktop shell: hand the emission to the OS-level typist. */
function sendToDesktop(
  bridge: NonNullable<ReturnType<typeof desktopBridge>>,
  emission: Emission,
): string | undefined {
  try {
    if (emission.kind === 'key' || emission.kind === 'combo') {
      if (!bridge.pressKey) return `This desktop build cannot press "${emission.value}"`
      void bridge.pressKey(emission.value)
      return undefined
    }
    void bridge.typeText(emission.kind === 'space' ? ' ' : emission.value)
    return undefined
  } catch (cause) {
    return errorMessage(cause)
  }
}

// ---------------------------------------------------------------- shell --

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
            <h2 className="truncate font-semibold leading-tight tracking-tight">Direct Paste</h2>
            <span className="truncate text-xs text-muted-foreground">
              Sign, and it is typed where your cursor is
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8">{children}</div>
    </div>
  )
}
