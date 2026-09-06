'use client'

import { API_BASE, ApiError, api } from '@/lib/api'
import type { Symbol } from '@/lib/library'
import { translate } from '@/lib/translate'
import { planSteps, type Step } from '@/components/translator/gesture-playback'

/**
 * The video translator's data layer: transcription jobs, subtitle parsing,
 * and turning timed words into a schedule of signs.
 */

// ------------------------------------------------------------- transcripts --

/** One spoken word and when it was said, in seconds from the start. */
export type TimedWord = { text: string; start: number; end: number; probability?: number }

export type TranscriptSource = 'speech' | 'subtitles' | 'typed' | 'translated'

export type Segment = { start: number; end: number; text: string }

export type Transcript = {
  words: TimedWord[]
  source: TranscriptSource
  /** BCP-47 code of the words, when known (detected by the transcriber). */
  language?: string | null
  model?: string | null
  /** Sentence-ish spans, used to translate a stretch at a time. */
  segments?: Segment[]
  /** For a translated transcript: the language it was translated from. */
  translatedFrom?: string | null
}

export type TranscriberStatus = { available: boolean; model: string | null; reason: string | null }

export function transcriberStatus(signal?: AbortSignal): Promise<TranscriberStatus> {
  return api<TranscriberStatus>('/video/transcriber', { signal })
}

/**
 * Uploads audio (or a whole media file) and starts a transcription job.
 * Multipart rather than JSON, so this does not go through `api()`.
 */
export async function startTranscription(
  media: Blob,
  filename: string,
  language = '',
): Promise<{ jobId: string }> {
  const body = new FormData()
  body.append('media', media, filename)
  body.append('language', language)

  let response: Response
  try {
    response = await fetch(`${API_BASE}/video/transcribe`, {
      method: 'POST',
      credentials: 'include',
      body,
    })
  } catch {
    throw new ApiError('Cannot reach the SignTalk server. Is the backend running?', 0, 'NetworkError')
  }
  const payload = (await response.json().catch(() => null)) as
    | { jobId?: string; error?: string; detail?: string }
    | null
  if (!response.ok || !payload?.jobId) {
    const message =
      (payload && (payload.error || payload.detail)) || `Upload failed (${response.status}).`
    throw new ApiError(String(message), response.status, 'UploadError')
  }
  return { jobId: payload.jobId }
}

export type Job = {
  status: 'queued' | 'running' | 'done' | 'failed'
  progress: number
  result: {
    language: string | null
    duration: number
    words: TimedWord[]
    segments: { start: number; end: number; text: string }[]
    model: string
  } | null
  error: string | null
}

export function fetchJob(jobId: string, signal?: AbortSignal): Promise<Job> {
  return api<Job>(`/video/jobs/${jobId}`, { signal })
}

/** Polls a job until it finishes. `onProgress` gets 0..1 as it goes. */
export async function awaitJob(
  jobId: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<NonNullable<Job['result']>> {
  for (;;) {
    const job = await fetchJob(jobId, signal)
    onProgress(job.progress)
    if (job.status === 'done' && job.result) return job.result
    if (job.status === 'failed') throw new Error(job.error ?? 'Transcription failed.')
    await new Promise((resolve) => setTimeout(resolve, 900))
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }
}

// ------------------------------------------------------------- subtitles --

const TIMESTAMP = /(\d{1,2}):(\d{2})(?::(\d{2}))?[.,](\d{1,3})/

function seconds(stamp: string): number | null {
  const match = TIMESTAMP.exec(stamp)
  if (!match) return null
  const [, a, b, c, ms] = match
  const hours = c !== undefined ? Number(a) : 0
  const minutes = c !== undefined ? Number(b) : Number(a)
  const secs = c !== undefined ? Number(c) : Number(b)
  return hours * 3600 + minutes * 60 + secs + Number(ms.padEnd(3, '0')) / 1000
}

/**
 * SRT or WebVTT -> timed words. A cue gives one span of time for a line of
 * text; its words are spread evenly across that span, which is close enough
 * to how people actually speak a subtitle line.
 */
export function parseSubtitles(text: string): TimedWord[] {
  const words: TimedWord[] = []
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim())
    const timing = lines.findIndex((line) => line.includes('-->'))
    if (timing < 0) continue
    const [from, to] = lines[timing].split('-->').map((part) => part.trim().split(/\s+/)[0])
    const start = seconds(from)
    const end = seconds(to)
    if (start === null || end === null || end <= start) continue
    const content = lines
      .slice(timing + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '') // VTT styling tags
      .trim()
    words.push(...spread(content, start, end))
  }
  return words.sort((a, b) => a.start - b.start)
}

/** Typed text with no timings: spread the words evenly across a span. */
export function spread(text: string, start: number, end: number): TimedWord[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  // Weight by length so long words get a little more of the span.
  const weights = tokens.map((token) => Math.max(2, token.replace(/[^\p{L}\p{N}]/gu, '').length))
  const total = weights.reduce((sum, w) => sum + w, 0)
  const words: TimedWord[] = []
  let cursor = start
  tokens.forEach((token, index) => {
    const slice = ((end - start) * weights[index]) / total
    words.push({ text: token, start: cursor, end: cursor + slice })
    cursor += slice
  })
  return words
}

// ------------------------------------------------------------- translation --

/**
 * Sentence-ish spans from timed words alone (a subtitle or typed transcript
 * has no segments): break at sentence punctuation, at a pause longer than
 * 0.6 s, or every ~8 s.
 */
export function segmentsFromWords(words: TimedWord[]): Segment[] {
  const segments: Segment[] = []
  let current: TimedWord[] = []
  const flush = () => {
    if (current.length === 0) return
    segments.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
    })
    current = []
  }
  words.forEach((word, index) => {
    current.push(word)
    const next = words[index + 1]
    const sentenceEnd = /[.!?…]["')\]]?$/.test(word.text)
    const pause = next ? next.start - word.end > 0.6 : true
    const long = word.end - current[0].start > 8
    if (sentenceEnd || pause || long) flush()
  })
  flush()
  return segments
}

/**
 * Translates a transcript into another spoken language, one segment at a
 * time, and spreads each translated segment's words across the time the
 * original was spoken. Word-for-word timing cannot survive translation
 * (word order and count change), but sentence timing does - so the signs
 * still land while that sentence is being said.
 */
export async function translateTranscript(
  transcript: Transcript,
  to: string,
  from?: string | null,
): Promise<Transcript & { engine: 'browser' | 'api' | 'same' | 'none' }> {
  const segments = transcript.segments?.length ? transcript.segments : segmentsFromWords(transcript.words)
  const words: TimedWord[] = []
  const out: Segment[] = []
  let engine: 'browser' | 'api' | 'same' | 'none' = 'same'
  for (const segment of segments) {
    const result = await translate(segment.text, to, from ?? undefined)
    if (result.engine !== 'same') engine = result.engine
    const text = result.engine === 'none' ? segment.text : result.text
    out.push({ ...segment, text })
    words.push(...spread(text, segment.start, segment.end))
  }
  return {
    words,
    source: 'translated',
    language: to,
    segments: out,
    translatedFrom: from ?? transcript.language ?? null,
    engine,
  }
}

// --------------------------------------------------------------- schedule --

/** One sign to show, between two moments of the video. */
export type Cue = {
  start: number
  end: number
  wordIndex: number
  step: Step
  /** Position within the word: 0-based letter index, and how many. */
  index: number
  count: number
}

/** Strip punctuation a sign language has no symbol for. */
function clean(word: string): string {
  return word.replace(/[^\p{L}\p{N}'’-]/gu, '')
}

/**
 * Words -> signs on a timeline. Each word's signs are spread evenly across
 * the time the word was spoken, so a five-letter word said in half a second
 * shows five pictures at 100 ms each - exactly as fast as the speaker.
 */
export function buildSchedule(words: TimedWord[], symbols: Symbol[]): Cue[] {
  const cues: Cue[] = []
  words.forEach((word, wordIndex) => {
    const text = clean(word.text)
    if (!text) return
    const steps = planSteps(text, symbols).filter((step) => step.kind !== 'space')
    if (steps.length === 0) return
    const span = Math.max(0.05, word.end - word.start)
    const slot = span / steps.length
    steps.forEach((step, index) => {
      cues.push({
        start: word.start + index * slot,
        end: word.start + (index + 1) * slot,
        wordIndex,
        step,
        index,
        count: steps.length,
      })
    })
  })
  return cues
}

/** The cue showing at time `t`, or null between words. Cues are sorted. */
export function cueAt(cues: Cue[], t: number): Cue | null {
  let low = 0
  let high = cues.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const cue = cues[mid]
    if (t < cue.start) high = mid - 1
    else if (t >= cue.end) low = mid + 1
    else return cue
  }
  return null
}

/**
 * The playback rate at which no sign is shown for less than `minSeconds`.
 * 1 when the speech is already slow enough; never below 0.25.
 */
export function suggestedRate(cues: Cue[], minSeconds = 0.3): number {
  if (cues.length === 0) return 1
  const shortest = Math.min(...cues.map((cue) => cue.end - cue.start))
  const rate = shortest / minSeconds
  return Math.max(0.25, Math.min(1, Math.round(rate * 20) / 20))
}
