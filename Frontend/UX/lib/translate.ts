'use client'

/**
 * Translation for the interpreter's transcript.
 *
 * Prefers the browser's own on-device Translator and LanguageDetector, which
 * cost nothing, need no key and keep the text on the machine — the same
 * privacy story as the landmarks never leaving the device. Where those are not
 * available (they are Chromium-only, and behind a model download), it falls
 * back to a LibreTranslate-compatible endpoint if one is configured, and
 * otherwise reports plainly that it could not translate rather than silently
 * handing back the original text as though it had.
 *
 * Mirrors how backend/auth/delivery.py chooses a sender: use the real thing
 * where it exists, degrade honestly where it does not.
 */

/** LibreTranslate-compatible endpoint, e.g. http://localhost:5000/translate. */
const ENDPOINT = process.env.NEXT_PUBLIC_TRANSLATE_URL ?? ''

export type Translation = {
  text: string
  /** Whichever engine produced it, for the on-screen note. */
  engine: 'browser' | 'api' | 'none'
  /** The language the source text was detected as, when we could tell. */
  detected?: string
}

// The two globals are recent enough that TypeScript's DOM lib has no types for
// them yet. Narrow shapes, matching only what is used here.
type AvailabilityFn = (options: Record<string, string>) => Promise<string>

type TranslatorGlobal = {
  availability: AvailabilityFn
  create: (options: {
    sourceLanguage: string
    targetLanguage: string
  }) => Promise<{ translate: (input: string) => Promise<string> }>
}

type DetectorGlobal = {
  availability: AvailabilityFn
  create: () => Promise<{
    detect: (input: string) => Promise<{ detectedLanguage: string; confidence: number }[]>
  }>
}

function browserTranslator(): TranslatorGlobal | null {
  const found = (globalThis as { Translator?: TranslatorGlobal }).Translator
  return found && typeof found.create === 'function' ? found : null
}

function browserDetector(): DetectorGlobal | null {
  const found = (globalThis as { LanguageDetector?: DetectorGlobal }).LanguageDetector
  return found && typeof found.create === 'function' ? found : null
}

/** True when this browser can translate on its own. */
export function browserTranslationSupported(): boolean {
  return browserTranslator() !== null
}

/** True when translation is possible at all — built-in or configured API. */
export function translationAvailable(): boolean {
  return browserTranslationSupported() || ENDPOINT !== ''
}

/**
 * The language the text looks like, as a BCP-47 code.
 *
 * Used to fill the "from" side when the user has not said what their signs
 * spell out — the transcript is plain text by that point, so this is the same
 * question any translator asks.
 */
export async function detectLanguage(text: string): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null

  const detector = browserDetector()
  if (!detector) return null

  try {
    if ((await detector.availability({})) === 'unavailable') return null
    const instance = await detector.create()
    const [best] = await instance.detect(trimmed)
    // Below about a coin flip the guess is worse than admitting we don't know.
    return best && best.confidence >= 0.5 ? best.detectedLanguage : null
  } catch {
    return null
  }
}

/**
 * Translates `text` into `target`.
 *
 * `source` may be omitted, in which case the language is detected first — both
 * engines want an explicit source, so this is where "detect, then translate"
 * actually happens.
 */
export async function translate(
  text: string,
  target: string,
  source?: string,
): Promise<Translation> {
  const trimmed = text.trim()
  if (!trimmed) return { text: '', engine: 'none' }

  const detected = source ?? (await detectLanguage(trimmed)) ?? undefined
  const from = detected ?? 'en'

  if (from === target) return { text: trimmed, engine: 'none', detected }

  const engine = browserTranslator()
  if (engine) {
    try {
      const state = await engine.availability({ sourceLanguage: from, targetLanguage: target })
      if (state !== 'unavailable') {
        // 'downloadable' still resolves — create() fetches the model, which is
        // slow the first time and instant afterwards.
        const instance = await engine.create({ sourceLanguage: from, targetLanguage: target })
        return { text: await instance.translate(trimmed), engine: 'browser', detected }
      }
    } catch {
      // Fall through to the API rather than failing outright.
    }
  }

  if (ENDPOINT) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: trimmed, source: from, target, format: 'text' }),
      })
      if (response.ok) {
        const payload = (await response.json()) as { translatedText?: string }
        if (payload.translatedText) {
          return { text: payload.translatedText, engine: 'api', detected }
        }
      }
    } catch {
      // Nothing left to try.
    }
  }

  return { text: trimmed, engine: 'none', detected }
}

/**
 * Target languages offered in the picker.
 *
 * The set every mainstream translation library covers, so the list is honest
 * whichever engine ends up serving the request.
 */
export const TARGET_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'tr', label: 'Turkish' },
  { code: 'vi', label: 'Vietnamese' },
]
