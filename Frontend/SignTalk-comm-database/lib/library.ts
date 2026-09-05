/**
 * Typed wrappers over /library — the vocabulary tree the trainer records into.
 *
 * The shape is language > sign > symbol > view:
 *
 *   language   "ASL"           what the model is scoped to when interpreting
 *   sign       "Alphabet"      a set the user is building
 *   symbol     "A"             one label the classifier can return
 *   view       "front"         one camera angle of that label, holding samples
 *
 * These come straight off the database rows, so the field names are snake_case
 * here and camelCase in the auth API — matching each endpoint rather than
 * inventing a third convention.
 */

import { api } from '@/lib/api'

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
  sign_count: number
  symbol_count: number
  sample_count: number
}

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
}): Promise<{ language: Language; sign: Sign; symbols: Symbol[] }> {
  return api('/library/vocabulary', {
    body: {
      name: input.name,
      language: input.language ?? '',
      phrasesIncluded: input.phrasesIncluded ?? false,
      phrases: input.phrases ?? [],
      handControl: input.handControl ?? 'both',
      sampleTarget: input.sampleTarget ?? DEFAULT_SAMPLE_TARGET,
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

// ------------------------------------------------------------------ sharing --

/** A language as it appears in the community database. */
export type CommunityLanguage = {
  id: string
  name: string
  description: string | null
  hand_control: HandControl
  published_at: string
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

/** Copies a published language — samples and all — into your own library. */
export function installLanguage(languageId: string): Promise<Language> {
  return api<{ language: Language }>(`/library/community/${languageId}/install`, {
    method: 'POST',
  }).then((r) => r.language)
}
