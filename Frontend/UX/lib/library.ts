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

export type Language = {
  id: string
  name: string
  description: string
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

export type Symbol = {
  id: string
  name: string
  views: View[]
  sample_count: number
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
}): Promise<{ language: Language; sign: Sign; symbols: Symbol[] }> {
  return api('/library/vocabulary', {
    body: {
      name: input.name,
      language: input.language ?? '',
      phrasesIncluded: input.phrasesIncluded ?? false,
      phrases: input.phrases ?? [],
    },
  })
}
