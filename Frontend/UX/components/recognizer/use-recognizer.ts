'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCameraStage } from '@/components/trainer/camera-stage'
import { usePreferences } from '@/components/session'
import type { Pace } from '@/lib/preferences'
import { errorMessage } from '@/lib/api'
import type { HandSample } from '@/lib/hand-tracker'
import {
  listSigns,
  listSymbols,
  outputPreview,
  type Language,
  type OutputKind,
  type Sign,
  type Symbol,
} from '@/lib/library'
import { modelStatus, predictFrame, type ModelStatus, type Scope } from '@/lib/training'

/**
 * Live sign recognition, shared by the Translator and Direct Paste.
 *
 * Owns the camera, the classification loop and the "what does this label
 * type" lookup, and reports each held sign once as an `Emission`. What to do
 * with the emission - append it to a transcript, type it into a text field -
 * is the caller's business, which is the whole reason this is a hook and not
 * a screen.
 *
 * Scope is everything the account has (its own languages and the ones
 * installed from the community), one language, or one vocabulary (a sign).
 * The backend supports all three; this is where the frontend asks for them.
 */

/** Careful and quick are the two ways to run the recogniser. */
export type { Pace }

type Tuning = {
  /** How often a frame is sent for classification. */
  intervalMs: number
  /** Consecutive agreeing frames before a sign counts as held. */
  agreement: number
  /** Below this the frame is treated as "not sure", not as a wrong answer. */
  minConfidence: number
  /** The same sign cannot fire twice within this window without a gap first. */
  rearmMs: number
}

/**
 * `careful` is calibrated against the ASL dataset (detector/README.md): 0.55
 * keeps 91% of frames at 100% precision. `speed` trusts a sign after two
 * agreeing frames at 0.45 confidence and re-arms sooner, so someone fluent
 * can sign at conversational pace at the cost of the odd wrong letter.
 */
export const TUNING: Record<Pace, Tuning> = {
  careful: { intervalMs: 120, agreement: 4, minConfidence: 0.55, rearmMs: 900 },
  speed: { intervalMs: 70, agreement: 2, minConfidence: 0.45, rearmMs: 350 },
}

/** One recognised sign, resolved to what it should produce. */
export type Emission = {
  /** "sign / symbol", as the classifier labels it. */
  label: string
  symbol: string
  /** The vocabulary (sign) the symbol belongs to, e.g. "Alphabet". */
  sign: string | null
  /** Which sign language it came from, e.g. "ISL". */
  language: string | null
  confidence: number
  /** 'unknown' when the symbol has no output row (a label the model knows
   *  but the library lookup did not find - e.g. deleted mid-session). */
  kind: OutputKind | 'unknown'
  /** Text to type for text/space, the key name for key/combo. */
  value: string
}

export type Current = {
  label: string
  confidence: number
  sign: string | null
  language: string | null
}

export type OutputMap = Record<string, { symbol: Symbol; sign: Sign; language: string }>

export function useRecognizer({
  active,
  scope,
  languages,
  pace,
  onEmit,
}: {
  active: boolean
  /** {} = every sign language the account has. */
  scope: Scope
  /** The account's languages, already loaded, so "all" can be resolved. */
  languages: Language[]
  /** Overrides the account's default pace for this screen. */
  pace?: Pace
  onEmit: (emission: Emission) => void
}) {
  const preferences = usePreferences()
  const activePace: Pace = pace ?? preferences.pace
  const minConfidence = preferences.minConfidence
  const [model, setModel] = useState<ModelStatus | null>(null)
  const [outputs, setOutputs] = useState<OutputMap>({})
  const [outputsReady, setOutputsReady] = useState(false)
  const [current, setCurrent] = useState<Current | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [handCount, setHandCount] = useState(0)

  const handsRef = useRef<HandSample[]>([])
  const onEmitRef = useRef(onEmit)
  onEmitRef.current = onEmit
  const outputsRef = useRef<OutputMap>({})
  outputsRef.current = outputs

  const onFrame = useCallback((hands: HandSample[]) => {
    handsRef.current = hands
    setHandCount((count) => (count === hands.length ? count : hands.length))
  }, [])

  const stage = useCameraStage({ active, onFrame })

  const languageId = scope.languageId ?? null
  const signId = scope.signId ?? null

  // Which languages are in scope, as a stable key so the effect below only
  // re-runs when the scope really changes, not on every re-render.
  const scopeIds = (languageId ? [languageId] : languages.map((l) => l.id)).join(',')

  // Model status plus the output of every symbol in scope, so a prediction can
  // be turned into text without another round trip per frame.
  useEffect(() => {
    const controller = new AbortController()
    setOutputsReady(false)

    modelStatus({ languageId, signId }, controller.signal)
      .then((status) => {
        if (!controller.signal.aborted) setModel(status)
      })
      .catch(() => {
        if (!controller.signal.aborted) setModel(null)
      })

    const inScope = languageId ? languages.filter((l) => l.id === languageId) : languages

    ;(async () => {
      const map: OutputMap = {}
      for (const language of inScope) {
        for (const sign of await listSigns(language.id, controller.signal)) {
          if (signId && sign.id !== signId) continue
          for (const symbol of await listSymbols(sign.id, controller.signal)) {
            // The classifier labels a symbol "sign / symbol"; key the lookup
            // the same way so a prediction maps straight onto its output.
            map[`${sign.name} / ${symbol.name}`] = { symbol, sign, language: language.name }
          }
        }
      }
      if (!controller.signal.aborted) {
        setOutputs(map)
        setOutputsReady(true)
      }
    })().catch((cause) => {
      if (!controller.signal.aborted) {
        setFailure(errorMessage(cause))
        setOutputsReady(true)
      }
    })

    return () => controller.abort()
    // scopeIds stands in for `languages`: same set, same effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageId, signId, scopeIds])

  // The recognition loop. Kept in a ref-driven interval rather than on the
  // render loop: classification is a round trip, and the camera must not wait.
  useEffect(() => {
    if (!active || stage.state !== 'live') return

    // The account's confidence threshold wins over the pace's own, so the
    // setting means the same thing whichever pace is running.
    const tuning = { ...TUNING[activePace], minConfidence }
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
          await wait(tuning.intervalMs)
          continue
        }

        try {
          const result = await predictFrame(hands, { languageId, signId })
          if (stopped) return

          const found = result.prediction
          const meta = (found?.meta ?? {}) as { language?: unknown; sign?: unknown }
          const language = typeof meta.language === 'string' ? meta.language : null
          const sign = typeof meta.sign === 'string' ? meta.sign : null

          if (!found || found.confidence < tuning.minConfidence) {
            agreeing = null
            setCurrent(
              found ? { label: found.label, confidence: found.confidence, sign, language } : null,
            )
          } else {
            setCurrent({ label: found.label, confidence: found.confidence, sign, language })
            agreeing =
              agreeing && agreeing.label === found.label
                ? { label: found.label, count: agreeing.count + 1 }
                : { label: found.label, count: 1 }

            const now = Date.now()
            const repeatTooSoon =
              found.label === lastEmitted && now - lastEmittedAt < tuning.rearmMs
            if (agreeing.count >= tuning.agreement && !repeatTooSoon) {
              lastEmitted = found.label
              lastEmittedAt = now
              agreeing = null
              onEmitRef.current(
                resolve(found.label, found.confidence, sign, language, outputsRef.current),
              )
            }
          }
        } catch (cause) {
          if (stopped) return
          setFailure(errorMessage(cause))
          return
        }

        await wait(tuning.intervalMs)
      }
    }

    void tick()
    return () => {
      stopped = true
      setCurrent(null)
    }
  }, [active, stage.state, languageId, signId, activePace, minConfidence])

  return {
    stage,
    handCount,
    current,
    model,
    outputs,
    outputsReady,
    failure,
    pace: activePace,
    clearFailure: useCallback(() => setFailure(null), []),
  }
}

/** Turn a classifier label into what it should produce. */
export function resolve(
  label: string,
  confidence: number,
  sign: string | null,
  language: string | null,
  outputs: OutputMap,
): Emission {
  const symbolName = label.split(' / ').pop() ?? label
  const found = outputs[label]
  if (!found) {
    return {
      label,
      symbol: symbolName,
      sign: sign ?? label.split(' / ')[0] ?? null,
      language,
      confidence,
      kind: 'unknown',
      value: symbolName,
    }
  }
  const { symbol } = found
  return {
    label,
    symbol: symbol.name,
    sign: sign ?? found.sign.name,
    language: language ?? found.language,
    confidence,
    kind: symbol.output_kind,
    value: symbol.output_kind === 'space' ? ' ' : outputPreview(symbol),
  }
}

/**
 * Appends what a recognised sign types to a running transcript.
 *
 * Key and combo outputs are shown in brackets rather than actually pressed:
 * a transcript is text, and pretending otherwise would be worse than naming
 * what it would send.
 */
export function appendEmission(text: string, emission: Emission): string {
  if (emission.kind === 'space') return `${text} `
  if (emission.kind === 'key' || emission.kind === 'combo') return `${text}[${emission.value}]`

  const piece = emission.value
  // Letters run together into words; anything longer reads as its own token.
  if (piece.length === 1) return `${text}${piece}`
  return text && !text.endsWith(' ') ? `${text} ${piece}` : `${text}${piece}`
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
