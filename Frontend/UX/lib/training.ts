/**
 * Typed wrappers over /training.
 *
 * The browser owns the camera and the hand tracking; the server never sees a
 * frame, only the 21 landmarks per hand that MediaPipe produced. That is both
 * the privacy story and the reason these payloads stay small enough to post a
 * whole capture in one request.
 */

import { api } from '@/lib/api'
import type { Symbol, View } from '@/lib/library'
import type { HandSample } from '@/lib/hand-tracker'

/** One captured frame, in the shape backend/landmarks.py expects. */
export type Sample = { hands: HandSample[] }

export type StoredView = View & {
  id: string
  sample_count: number
  quality_spread: number | null
  /** The server's own words: "very consistent", "good", "shaky — ...". */
  quality: string
}

export type ModelStatus = {
  trained: boolean
  labels: string[]
  sampleCount: number
  views: string[]
  /** True when samples were encoded by an older feature layout. */
  stale: boolean
  featureVersion: number
}

/**
 * Files a capture under one view of a symbol.
 *
 * `replace: false` appends to whatever is already stored for that view, which
 * is how a symbol accumulates more than one session's worth of samples.
 */
export function storeSamples(
  symbolId: string,
  input: { view: string; samples: Sample[]; replace?: boolean },
): Promise<{ view: StoredView; symbol: { id: string; name: string }; views: Symbol[] }> {
  return api(`/training/symbols/${symbolId}/samples`, {
    body: {
      view: input.view,
      replace: input.replace ?? false,
      samples: input.samples,
    },
  })
}

export function deleteView(symbolId: string, view: string): Promise<void> {
  return api<{ ok: boolean }>(`/training/symbols/${symbolId}/views/${view}`, {
    method: 'DELETE',
  }).then(() => undefined)
}

/** What the interpreter would be working with right now. */
export function modelStatus(
  languageId?: string | null,
  signal?: AbortSignal,
): Promise<ModelStatus> {
  const query = languageId ? `?languageId=${encodeURIComponent(languageId)}` : ''
  return api<ModelStatus>(`/training/model${query}`, { signal })
}

/**
 * The feature vector for one frame.
 *
 * The trainer uses this to measure stillness with the *same* distance function
 * the recogniser uses, rather than inventing a second definition of "steady"
 * that could disagree with the one the samples are judged by.
 */
export function encodeFrame(
  hands: HandSample[],
  signal?: AbortSignal,
): Promise<{ hands: number; vector: number[] | null }> {
  return api('/training/encode', { body: { hands }, signal })
}

/** Straight-line distance between two feature vectors, as features.py defines it. */
export function vectorDistance(a: number[], b: number[]): number {
  let total = 0
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const delta = a[i] - b[i]
    total += delta * delta
  }
  return Math.sqrt(total)
}

/**
 * Max feature distance between consecutive frames for one to count as still.
 * Mirrors STILL_THRESHOLD in detector/trainer.py, where it was calibrated
 * against the ASL dataset — keep the two in step.
 */
export const STILL_THRESHOLD = 0.7

/** Samples one capture collects, matching DEFAULT_SAMPLES in detector/trainer.py. */
export const TARGET_SAMPLES = 40
