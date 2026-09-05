'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/lib/api'
import type { HandSample } from '@/lib/hand-tracker'
import {
  STILL_THRESHOLD,
  TARGET_SAMPLES,
  encodeFrame,
  storeSamples,
  vectorDistance,
  type Sample,
  type StoredView,
} from '@/lib/training'

export type Phase = 'idle' | 'countdown' | 'capturing' | 'saving'

/** Seconds of lead-in before frames start counting. detector/trainer.py: 3.0. */
const COUNTDOWN_SECONDS = 3
/** Give up rather than hang if the pose never settles. detector/trainer.py: 45s. */
const CAPTURE_TIMEOUT_MS = 45_000
/** How often a frame is offered to the stillness gate. */
const SAMPLE_INTERVAL_MS = 80

/**
 * Runs one capture: count down, collect steady frames, post them.
 *
 * Frames only count while the pose is holding still, so a sample set never
 * fills up with half-formed transitions between one gesture and the next. The
 * steadiness test is the server's own — /training/encode returns the same
 * feature vector the classifier will see, and the threshold is the one
 * detector/trainer.py calibrated — rather than a second, disagreeing
 * definition of "steady" invented on the client.
 */
export function useCapture({
  handsRef,
  onSaved,
  target = TARGET_SAMPLES,
}: {
  /** Latest tracked hands, written by the render loop every frame. */
  handsRef: { current: HandSample[] }
  onSaved: (view: StoredView) => void
  /** Frames to collect, from the language's own sample_target. */
  target?: number
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [collected, setCollected] = useState(0)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [steady, setSteady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A capture is a single run of an async loop; this is how it gets stopped
  // from a button, an unmount, or a switch to another symbol.
  const runId = useRef(0)

  const cancel = useCallback(() => {
    runId.current += 1
    setPhase('idle')
    setCollected(0)
    setSteady(false)
    setCountdown(COUNTDOWN_SECONDS)
  }, [])

  useEffect(() => cancel, [cancel])

  const start = useCallback(
    async (into: { symbolId: string; view: string; replace: boolean }) => {
      const run = (runId.current += 1)
      const alive = () => runId.current === run

      setError(null)
      setCollected(0)
      setSteady(false)
      setPhase('countdown')

      for (let remaining = COUNTDOWN_SECONDS; remaining > 0; remaining -= 1) {
        setCountdown(remaining)
        await wait(1000)
        if (!alive()) return
      }

      setPhase('capturing')
      const samples: Sample[] = []
      let previous: number[] | null = null
      const deadline = Date.now() + CAPTURE_TIMEOUT_MS

      while (alive() && samples.length < target && Date.now() < deadline) {
        const hands = handsRef.current
        if (hands.length === 0) {
          // Nothing to measure against — drop the reference so the first frame
          // after the hand returns starts a fresh comparison instead of being
          // judged against a pose from before it left.
          previous = null
          setSteady(false)
          await wait(SAMPLE_INTERVAL_MS)
          continue
        }

        // Snapshot before awaiting: the render loop will have moved on by the
        // time the vector comes back, and the sample must match the vector.
        const frame: Sample = { hands: hands.map(clone) }

        let vector: number[] | null
        try {
          vector = (await encodeFrame(frame.hands)).vector
        } catch (cause) {
          if (!alive()) return
          setError(errorMessage(cause))
          setPhase('idle')
          return
        }
        if (!alive()) return

        if (vector) {
          const still = previous !== null && vectorDistance(previous, vector) <= STILL_THRESHOLD
          setSteady(still)
          if (still) {
            samples.push(frame)
            setCollected(samples.length)
          }
          previous = vector
        }

        await wait(SAMPLE_INTERVAL_MS)
      }

      if (!alive()) return

      if (samples.length === 0) {
        setError('No steady frames were captured. Hold the sign still in view and try again.')
        setPhase('idle')
        return
      }

      setPhase('saving')
      try {
        const result = await storeSamples(into.symbolId, {
          view: into.view,
          samples,
          replace: into.replace,
        })
        if (!alive()) return
        onSaved(result.view)
        setPhase('idle')
        setCollected(0)
      } catch (cause) {
        if (!alive()) return
        setError(errorMessage(cause))
        setPhase('idle')
      }
    },
    [handsRef, onSaved, target],
  )

  return {
    phase,
    collected,
    countdown,
    steady,
    error,
    start,
    cancel,
    clearError: useCallback(() => setError(null), []),
    target,
  }
}

function clone(hand: HandSample): HandSample {
  return {
    label: hand.label,
    score: hand.score,
    landmarks: hand.landmarks.map((p) => [p[0], p[1], p[2]] as [number, number, number]),
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
