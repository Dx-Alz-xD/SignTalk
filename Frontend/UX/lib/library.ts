/**
 * Typed wrappers over /library, the vocabulary tree the trainer records into.
 *
 * The shape is language > sign > symbol > view:
 *
 *   language   "ASL"           what the model is scoped to when interpreting
 *   sign       "Alphabet"      a set the user is building
 *   symbol     "A"             one label the classifier can return
 *   view       "front"         one camera angle of that label, holding samples
 *
 * These come straight off the database rows, so the field names are snake_case
 * here and camelCase in the auth API, matching each endpoint rather than
 * inventing a third convention.
 */

import { API_BASE, api } from '@/lib/api'

/** Which hands a language is signed with. */
export type HandControl = 'left' | 'right' | 'both'

export const HAND_CONTROLS: { value: HandControl; label: string; hint: string }[] = [
  { value: 'right', label: 'Right hand', hint: 'One hand, signed on the right.' },
  { value: 'left', label: 'Left hand', hint: 'One hand, signed on the left.' },
  { value: 'both', label: 'Both hands', hint: 'Two hands together.' },
]

export type Language = {
  id: string
  name: string
  description: string
  hand_control: HandControl
  /** Frames one capture collects. Raising it trades time for a tighter model. */
  sample_target: number
  visibility: 'private' | 'unlisted' | 'public'
  published_at: string | null
  /** Whether a reference picture is kept per symbol, for sign-to-sign translation. */
  gesture_translation: boolean
  /** Milliseconds each picture stays up during playback. */
  gesture_interval_ms: number
  /**
   * The spoken language the symbols spell out, as a BCP-47 code (en, hi…).
   * Translating between sign languages goes through this: signs → text in
   * this language → translated → the target's signs.
   */
  spoken_language: string
  /** What kind of sign language this is, in the owner's words ("Indian Sign Language"). */
  tag: string
  /** 'user' recorded, 'asl_dataset' imported from images, 'imported' from the community. */
  source?: 'user' | 'asl_dataset' | 'imported'
  sign_count: number
  symbol_count: number
  sample_count: number
}

/**
 * The tag to show for a language: its own when set, otherwise one guessed
 * from a well-known name, otherwise a neutral label.
 */
export function languageTag(language: { name: string; tag?: string | null }): string {
  if (language.tag?.trim()) return language.tag.trim()
  return KNOWN_TAGS[language.name.trim().toUpperCase()] ?? 'Custom sign language'
}

export const KNOWN_TAGS: Record<string, string> = {
  ISL: 'Indian Sign Language',
  ASL: 'American Sign Language',
  BSL: 'Bengali Sign Language',
  JSL: 'Japanese Sign Language',
  CSL: 'Chinese Sign Language',
  LSF: 'French Sign Language',
  DGS: 'German Sign Language',
  AUSLAN: 'Australian Sign Language',
}

export const DEFAULT_GESTURE_INTERVAL_MS = 1200
export const MIN_GESTURE_INTERVAL_MS = 200
export const MAX_GESTURE_INTERVAL_MS = 10000

export type Sign = {
  id: string
  name: string
  has_phrases: boolean
  phrases: string[]
  symbol_count: number
}

/** One camera angle of a symbol, with how well the hold went. */
export type View = {
  view: string
  samples: number
  spread: number | null
  feature_version: number
}

/**
 * What the translator emits when it recognises a symbol.
 *
 *   text   the symbol's own name, or a phrase        "hello", "thank you"
 *   space  a single space, so words separate          -
 *   key    one named key                              Enter, Backspace, Tab
 *   combo  a key combination                          Ctrl+C
 */
export type OutputKind = 'text' | 'space' | 'key' | 'combo'

export const OUTPUT_KINDS: { value: OutputKind; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Types the symbol name, or a phrase you set.' },
  { value: 'space', label: 'Space', hint: 'Types a single space to separate words.' },
  { value: 'key', label: 'Key', hint: 'Sends one key, e.g. Enter or Backspace.' },
  { value: 'combo', label: 'Combination', hint: 'Sends a shortcut, e.g. Ctrl+C.' },
]

export type Symbol = {
  id: string
  name: string
  output_kind: OutputKind
  output_value: string
  views: View[]
  sample_count: number
  /** True when a reference picture is stored for sign-to-sign translation. */
  has_image: boolean
}

/** What a recognised symbol actually types. */
export function outputPreview(symbol: {
  name: string
  output_kind: OutputKind
  output_value: string
}): string {
  if (symbol.output_kind === 'space') return '␣'
  if (symbol.output_kind === 'text') return symbol.output_value || symbol.name
  return symbol.output_value
}

export const DEFAULT_VIEW = 'front'

/** The angles the backend knows by name; a view can be any string, though. */
export const STANDARD_VIEWS = ['front', 'left', 'right', 'top', 'bottom'] as const

export function listLanguages(signal?: AbortSignal): Promise<Language[]> {
  return api<{ languages: Language[] }>('/library/languages', { signal }).then(
    (r) => r.languages,
  )
}

export function listSigns(languageId: string, signal?: AbortSignal): Promise<Sign[]> {
  return api<{ signs: Sign[] }>(`/library/languages/${languageId}/signs`, { signal }).then(
    (r) => r.signs,
  )
}

export function listSymbols(signId: string, signal?: AbortSignal): Promise<Symbol[]> {
  return api<{ symbols: Symbol[] }>(`/library/signs/${signId}/symbols`, { signal }).then(
    (r) => r.symbols,
  )
}

export function createSymbol(signId: string, name: string): Promise<Symbol> {
  return api<{ symbol: Symbol }>(`/library/signs/${signId}/symbols`, {
    body: { name },
  }).then((r) => r.symbol)
}

export function deleteSymbol(symbolId: string): Promise<void> {
  return api<{ ok: boolean }>(`/library/symbols/${symbolId}`, { method: 'DELETE' }).then(
    () => undefined,
  )
}

/**
 * Creates the language and the sign inside it in one call. Re-submitting the
 * same pair reopens it rather than erroring, so this is safe to retry.
 */
export function createVocabulary(input: {
  name: string
  language?: string
  phrasesIncluded?: boolean
  phrases?: string[]
  handControl?: HandControl
  sampleTarget?: number
  gestureTranslation?: boolean
  gestureIntervalMs?: number
  spokenLanguage?: string
  tag?: string
  description?: string
}): Promise<{ language: Language; sign: Sign; symbols: Symbol[] }> {
  return api('/library/vocabulary', {
    body: {
      name: input.name,
      language: input.language ?? '',
      phrasesIncluded: input.phrasesIncluded ?? false,
      phrases: input.phrases ?? [],
      handControl: input.handControl ?? 'both',
      sampleTarget: input.sampleTarget ?? DEFAULT_SAMPLE_TARGET,
      gestureTranslation: input.gestureTranslation ?? false,
      gestureIntervalMs: input.gestureIntervalMs ?? DEFAULT_GESTURE_INTERVAL_MS,
      spokenLanguage: input.spokenLanguage ?? 'en',
      tag: input.tag ?? '',
      description: input.description ?? '',
    },
  })
}

/** Frames one capture collects. Mirrors DEFAULT_SAMPLES in detector/trainer.py. */
export const DEFAULT_SAMPLE_TARGET = 40
export const MIN_SAMPLE_TARGET = 5
export const MAX_SAMPLE_TARGET = 500

/** Edits a language in place. Only the fields passed are touched. */
export function updateLanguage(
  languageId: string,
  changes: {
    name?: string
    description?: string
    handControl?: HandControl
    sampleTarget?: number
    gestureTranslation?: boolean
    gestureIntervalMs?: number
    spokenLanguage?: string
    tag?: string
  },
): Promise<Language> {
  return api<{ language: Language }>(`/library/languages/${languageId}`, {
    method: 'PATCH',
    body: changes,
  }).then((r) => r.language)
}

/** Renames a symbol, or changes what recognising it types. */
export function updateSymbol(
  symbolId: string,
  changes: { name?: string; outputKind?: OutputKind; outputValue?: string },
): Promise<Symbol> {
  return api<{ symbol: Symbol }>(`/library/symbols/${symbolId}`, {
    method: 'PATCH',
    body: changes,
  }).then((r) => r.symbol)
}

/**
 * Deletes a vocabulary (a sign) and everything in it. The server also removes
 * the language when this was its last vocabulary; `languageDeleted` says so.
 */
export function deleteSign(signId: string): Promise<{ languageDeleted: boolean }> {
  return api<{ ok: boolean; languageDeleted: boolean }>(`/library/signs/${signId}`, {
    method: 'DELETE',
  }).then((r) => ({ languageDeleted: r.languageDeleted }))
}

export function deleteLanguage(languageId: string): Promise<void> {
  return api<{ ok: boolean }>(`/library/languages/${languageId}`, { method: 'DELETE' }).then(
    () => undefined,
  )
}

// ------------------------------------------------------------------- images --

/**
 * Stores a symbol's reference picture. Only allowed while the language has
 * gesture translation on; the server checks the bytes are really an image.
 */
export function putSymbolImage(
  symbolId: string,
  image: { mime: string; base64: string; width?: number; height?: number },
): Promise<void> {
  return api<{ image: unknown }>(`/library/symbols/${symbolId}/image`, {
    method: 'PUT',
    body: { mime: image.mime, data: image.base64, width: image.width, height: image.height },
  }).then(() => undefined)
}

/**
 * The picture as an object URL, or null when there is none. Fetched with the
 * session cookie rather than pointed at by an <img src>, so it works when the
 * API sits on another host as well as on localhost.
 */
export async function fetchSymbolImageUrl(symbolId: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/library/symbols/${symbolId}/image`, {
      credentials: 'include',
    })
    if (!response.ok) return null
    return URL.createObjectURL(await response.blob())
  } catch {
    return null
  }
}

// ----------------------------------------------------------------- review --

export type ReviewIssue = {
  level: 'block' | 'warn'
  code: string
  message: string
}

export type Review = {
  ok: boolean
  issues: ReviewIssue[]
  summary: { signs: number; symbols: number; samples: number; gesture_translation: boolean }
}

/** The security review publishing runs, so the owner can read it first. */
export function reviewLanguage(languageId: string, signal?: AbortSignal): Promise<Review> {
  return api<Review>(`/library/languages/${languageId}/review`, { signal })
}

// ------------------------------------------------------------------ sharing --

/** A language as it appears in the community database. */
export type CommunityLanguage = {
  id: string
  name: string
  description: string | null
  hand_control: HandControl
  published_at: string
  gesture_translation: boolean
  spoken_language: string
  tag: string
  source: 'user' | 'asl_dataset' | 'imported'
  author: string | null
  /** True when the caller published it. */
  mine: boolean
  /** True when the caller has already taken a copy. */
  installed: boolean
  sign_count: number
  symbol_count: number
  sample_count: number
  install_count: number
}

/** Adds this language to the community database, or takes it back out. */
export function publishLanguage(languageId: string, publicly: boolean): Promise<Language> {
  return api<{ language: Language }>(`/library/languages/${languageId}/publish`, {
    body: { public: publicly },
  }).then((r) => r.language)
}

export function browseCommunity(
  query = '',
  signal?: AbortSignal,
): Promise<CommunityLanguage[]> {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''
  return api<{ languages: CommunityLanguage[] }>(`/library/community${search}`, {
    signal,
  }).then((r) => r.languages)
}

/** Copies a published language, samples and all, into your own library. */
export function installLanguage(languageId: string): Promise<Language> {
  return api<{ language: Language }>(`/library/community/${languageId}/install`, {
    method: 'POST',
  }).then((r) => r.language)
}

// ---------------------------------------------------------------- profiles --

/** What anyone signed in may see about an account. */
export type PublicProfile = {
  username: string
  joined_at: string
  languages: CommunityLanguage[]
  published_count: number
  install_count: number
}

export function fetchProfile(username: string, signal?: AbortSignal): Promise<PublicProfile> {
  return api<PublicProfile>(`/users/${encodeURIComponent(username)}`, { signal })
}
