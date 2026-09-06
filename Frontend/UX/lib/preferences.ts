import { api } from '@/lib/api'
import type { Theme } from '@/lib/theme-storage'

/**
 * Per-account settings, as the API returns them. Every one of these is read
 * somewhere in the app: which camera to open, whether the preview is mirrored
 * and drawn on, how sure the recogniser has to be before it reports a sign,
 * how long the capture countdown runs, and where the video overlay starts.
 */

export type Pace = 'careful' | 'speed'

export type OverlayPreference = {
  x: number
  y: number
  width: number
  opacity: number
  caption: boolean
}

export type Preferences = {
  theme: Theme
  /** MediaDevices deviceId, or '' for whichever camera the browser picks. */
  cameraDeviceId: string
  mirrorPreview: boolean
  showSkeleton: boolean
  minConfidence: number
  pace: Pace
  captureCountdown: number
  reduceMotion: boolean
  overlay: OverlayPreference
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  cameraDeviceId: '',
  mirrorPreview: true,
  showSkeleton: true,
  minConfidence: 0.55,
  pace: 'careful',
  captureCountdown: 3,
  reduceMotion: false,
  overlay: { x: 0.68, y: 0.06, width: 0.26, opacity: 0.95, caption: true },
}

export const MIN_CONFIDENCE_RANGE = [0.3, 0.9] as const
export const COUNTDOWN_RANGE = [0, 10] as const

/** What a confidence threshold means in practice, for the settings screen. */
export function describeConfidence(value: number): string {
  if (value <= 0.4) return 'Reports a sign readily. Faster, with more wrong guesses.'
  if (value < 0.55) return 'A little eager. Good for signing at speed.'
  if (value <= 0.6) return 'The calibrated default: almost no wrong readings.'
  if (value <= 0.75) return 'Cautious. Misses a few, rarely wrong.'
  return 'Very cautious. Only near-certain readings are reported.'
}

export type PreferenceChanges = Partial<Omit<Preferences, 'overlay'>> & {
  overlay?: Partial<OverlayPreference>
}

export function fetchPreferences(signal?: AbortSignal): Promise<Preferences> {
  return api<{ preferences: Preferences }>('/preferences', { signal }).then((r) => r.preferences)
}

export function savePreferences(changes: PreferenceChanges): Promise<Preferences> {
  return api<{ preferences: Preferences }>('/preferences', {
    method: 'PATCH',
    body: changes,
  }).then((r) => r.preferences)
}

export function resetPreferences(): Promise<Preferences> {
  return api<{ preferences: Preferences }>('/preferences', { method: 'DELETE' }).then(
    (r) => r.preferences,
  )
}

/** Merge a change set into a preferences object, for optimistic updates. */
export function withChanges(current: Preferences, changes: PreferenceChanges): Preferences {
  return {
    ...current,
    ...changes,
    overlay: { ...current.overlay, ...(changes.overlay ?? {}) },
  }
}
