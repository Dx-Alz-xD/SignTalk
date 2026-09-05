'use client'

/**
 * Browser-side hand tracking, in the exact shape the Python detector expects.
 *
 * This is the half of detector/tracker.py that runs on the client. MediaPipe
 * finds the 21 landmarks per hand here; the server only ever receives those
 * numbers, never a frame.
 *
 * Two details make browser samples interchangeable with ones the desktop CLI
 * recorded, which is the whole point of sharing detector/features.py:
 *
 *  - **The frame is mirrored before tracking.** detector/camera.py flips the
 *    frame (mirror=True) and tracks the flipped image, so its stored landmarks
 *    are of a mirrored hand. features.py normalises away translation, scale and
 *    rotation, but a mirror is none of those — it would survive normalisation
 *    and put browser samples in a different place to desktop ones. Flipping
 *    here keeps them in the same space, and gives the natural selfie preview.
 *  - **Handedness is passed through as MediaPipe reports it.** On a mirrored
 *    frame the labels are the mirror of the real hand; that is what the desktop
 *    stores too, so the "Left"/"Right" slots line up.
 */

import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { API_BASE } from '@/lib/api'

/** One hand on the wire, matching _clean_hand in backend/landmarks.py. */
export type HandSample = {
  label: 'Left' | 'Right'
  score: number
  /** 21 points of [x, y, z], normalised image coordinates. */
  landmarks: [number, number, number][]
}

/** Bone pairs for the skeleton overlay, filled in once the task class loads. */
export let HAND_CONNECTIONS: { start: number; end: number }[] = []

// Mirrors the defaults in detector/tracker.py, so a gesture that tracks on the
// desktop tracks here too.
const MAX_HANDS = 2
const DETECTION_CONFIDENCE = 0.6
const TRACKING_CONFIDENCE = 0.5

export class HandTracker {
  private landmarker: HandLandmarker
  /** MediaPipe rejects a timestamp that does not advance, so they are clamped. */
  private lastTimestamp = -1

  private constructor(landmarker: HandLandmarker) {
    this.landmarker = landmarker
  }

  /**
   * Loads the WASM runtime and the model.
   *
   * Both are served locally — the runtime from Next's `public/mediapipe/wasm`,
   * the model from the SignTalk API — rather than a CDN, so the trainer works
   * offline and the browser provably runs the same model file as the desktop
   * detector.
   */
  static async create(): Promise<HandTracker> {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${API_BASE}/models/hand_landmarker.task`,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: MAX_HANDS,
      minHandDetectionConfidence: DETECTION_CONFIDENCE,
      minHandPresenceConfidence: DETECTION_CONFIDENCE,
      minTrackingConfidence: TRACKING_CONFIDENCE,
    })

    if (HAND_CONNECTIONS.length === 0) {
      HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS ?? []
    }
    return new HandTracker(landmarker)
  }

  /** Hands in the current frame. `source` must already be mirrored. */
  detect(source: HTMLCanvasElement | HTMLVideoElement, timestampMs: number): HandSample[] {
    const stamp = timestampMs <= this.lastTimestamp ? this.lastTimestamp + 1 : timestampMs
    this.lastTimestamp = stamp

    let result: HandLandmarkerResult
    try {
      result = this.landmarker.detectForVideo(source, stamp)
    } catch {
      // A dropped frame is not worth tearing the session down for; the next
      // one usually lands. Report no hands and let the caller carry on.
      return []
    }
    return toSamples(result)
  }

  close() {
    this.landmarker.close()
  }
}

function toSamples(result: HandLandmarkerResult): HandSample[] {
  const out: HandSample[] = []
  const hands = result.landmarks ?? []

  for (let i = 0; i < hands.length && i < MAX_HANDS; i += 1) {
    const points = hands[i]
    if (!points || points.length !== 21) continue

    const category = result.handedness?.[i]?.[0]
    const name = category?.categoryName === 'Left' ? 'Left' : 'Right'

    out.push({
      label: name,
      score: typeof category?.score === 'number' ? category.score : 1,
      landmarks: points.map((p) => [p.x, p.y, p.z ?? 0] as [number, number, number]),
    })
  }
  return out
}
