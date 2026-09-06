'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Captions,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  FileText,
  Gauge,
  Languages,
  Loader2,
  Maximize,
  Mic,
  Minimize,
  Pause,
  Play,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { FormAlert } from '@/components/form-alert'
import { SignOverlay, type Placement } from '@/components/video/sign-overlay'
import { useSession } from '@/components/session'
import { errorMessage } from '@/lib/api'
import { extractWav } from '@/lib/audio-extract'
import {
  fetchSymbolImageUrl,
  listLanguages,
  listSigns,
  listSymbols,
  type Language,
  type Sign,
  type Symbol,
} from '@/lib/library'
import {
  awaitJob,
  buildSchedule,
  cueAt,
  parseSubtitles,
  spread,
  startTranscription,
  suggestedRate,
  transcriberStatus,
  translateTranscript,
  type TimedWord,
  type Transcript,
  type TranscriberStatus,
} from '@/lib/video'
import { TARGET_LANGUAGES, detectLanguage } from '@/lib/translate'
import { exportSupported, exportWithSigns } from '@/lib/video-export'
import { cn } from '@/lib/utils'

type Vocabulary = { sign: Sign; language: Language }

type Stage =
  | { kind: 'idle' }
  | { kind: 'extracting' }
  | { kind: 'uploading' }
  | { kind: 'transcribing'; progress: number }

/**
 * Video translator: a spoken video with the signs for every word shown over
 * it, timed to the speech.
 *
 * The video never leaves the browser - only its soundtrack does, as a small
 * WAV, for transcription. The words come back with timings, each word's
 * letters (or its whole-word sign, when the vocabulary has one) are spread
 * across the moment it was said, and the overlay follows the playhead.
 */
export function VideoTranslatorScreen({ onBack }: { onBack: () => void }) {
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([])
  const [targetId, setTargetId] = useState('')
  const [symbols, setSymbols] = useState<Symbol[]>([])
  const [transcriber, setTranscriber] = useState<TranscriberStatus | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [failure, setFailure] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [showTyped, setShowTyped] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(true)

  // Export: the video plays through once while a canvas records it with the
  // overlay burned in; the result is offered as a download.
  const [exporting, setExporting] = useState<{ progress: number } | null>(null)
  const [exported, setExported] = useState<{ url: string; size: number; name: string } | null>(null)
  const exportAbort = useRef<AbortController | null>(null)

  const { preferences, save } = useSession()
  const [placement, setPlacement] = useState<Placement>(() => ({
    x: preferences.overlay.x,
    y: preferences.overlay.y,
    width: preferences.overlay.width,
    opacity: preferences.overlay.opacity,
  }))
  const [showCaption, setShowCaption] = useState(preferences.overlay.caption)
  const [savedDefault, setSavedDefault] = useState(false)
  const [rate, setRate] = useState(1)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [urls, setUrls] = useState<Record<string, string | null>>({})

  // Translation into the target's spoken language, when they differ.
  const [original, setOriginal] = useState<Transcript | null>(null)
  const [translating, setTranslating] = useState(false)
  const [transcriptLanguage, setTranscriptLanguage] = useState<string | null>(null)

  // Fullscreen is asked of the whole stage (video + overlay), not the video
  // element - the native button fullscreens the <video> alone and the overlay
  // would vanish. The picture is letterboxed inside the stage, so the overlay
  // is positioned against the picture's own box, measured below.
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [frame, setFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const target = useMemo(
    () => vocabularies.find((v) => v.sign.id === targetId) ?? null,
    [vocabularies, targetId],
  )

  // ----------------------------------------------------------- loading --
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      const [languages, status] = await Promise.all([
        listLanguages(controller.signal),
        transcriberStatus(controller.signal).catch(() => null),
      ])
      if (controller.signal.aborted) return
      setTranscriber(status)
      const pairs: Vocabulary[] = []
      for (const language of languages) {
        for (const sign of await listSigns(language.id, controller.signal)) pairs.push({ sign, language })
      }
      if (controller.signal.aborted) return
      setVocabularies(pairs)
      // Default to the first vocabulary that can show pictures.
      const first = pairs.find((v) => v.language.gesture_translation) ?? pairs[0]
      if (first) setTargetId((current) => current || first.sign.id)
    })().catch((cause) => {
      if (!controller.signal.aborted) setFailure(errorMessage(cause))
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!target) {
      setSymbols([])
      return
    }
    const controller = new AbortController()
    listSymbols(target.sign.id, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setSymbols(found)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
    return () => controller.abort()
  }, [target])

  // Object URL for the chosen file; revoked when it changes.
  useEffect(() => {
    if (!file) {
      setVideoUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // ---------------------------------------------------------- schedule --
  const cues = useMemo(
    () => (transcript && target?.language.gesture_translation ? buildSchedule(transcript.words, symbols) : []),
    [transcript, symbols, target],
  )
  const current = useMemo(() => cueAt(cues, time), [cues, time])
  const currentWord = current ? transcript?.words[current.wordIndex]?.text ?? null : null
  const suggestion = useMemo(() => suggestedRate(cues), [cues])

  // Pictures for every symbol in the schedule, fetched once.
  const symbolIds = useMemo(
    () => [...new Set(cues.flatMap((cue) => (cue.step.kind === 'symbol' ? [cue.step.symbol.id] : [])))],
    [cues],
  )
  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      const next: Record<string, string | null> = {}
      for (const id of symbolIds) {
        const url = await fetchSymbolImageUrl(id)
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        if (url) created.push(url)
        next[id] = url
        setUrls({ ...next })
      }
    })()
    return () => {
      cancelled = true
      created.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [symbolIds])

  // Follow the playhead smoothly while playing; timeupdate alone is too coarse
  // for letters that last a tenth of a second.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const video = videoRef.current
      if (video) setTime(video.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate
  }, [rate, videoUrl])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Where the picture actually sits inside the stage (object-fit: contain).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const box = stage.getBoundingClientRect()
      if (!videoSize || !box.width || !box.height) {
        setFrame({ left: 0, top: 0, width: box.width, height: box.height })
        return
      }
      const scale = Math.min(box.width / videoSize.w, box.height / videoSize.h)
      const width = videoSize.w * scale
      const height = videoSize.h * scale
      setFrame({ left: (box.width - width) / 2, top: (box.height - height) / 2, width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [videoSize, fullscreen, videoUrl])

  // The spoken language of the words on screen, so the target can be matched.
  useEffect(() => {
    if (!transcript) {
      setTranscriptLanguage(null)
      return
    }
    if (transcript.language) {
      setTranscriptLanguage(transcript.language)
      return
    }
    let cancelled = false
    detectLanguage(transcript.words.map((w) => w.text).join(' ')).then((found) => {
      if (!cancelled) setTranscriptLanguage(found ?? 'en')
    })
    return () => {
      cancelled = true
    }
  }, [transcript])

  const targetSpoken = target?.language.spoken_language ?? null
  const needsTranslation =
    Boolean(transcript && targetSpoken && transcriptLanguage) &&
    transcript!.source !== 'translated' &&
    transcriptLanguage!.toLowerCase() !== targetSpoken!.toLowerCase()

  async function translateForTarget() {
    if (!transcript || !targetSpoken) return
    setTranslating(true)
    setFailure(null)
    try {
      const result = await translateTranscript(transcript, targetSpoken, transcriptLanguage)
      if (result.engine === 'none') {
        setFailure(
          `Could not translate ${spokenLabel(transcriptLanguage)} to ${spokenLabel(targetSpoken)} in this browser. ` +
            'Chrome 138+ translates on-device, or set NEXT_PUBLIC_TRANSLATE_URL.',
        )
        return
      }
      setOriginal(transcript)
      setTranscript(result)
    } catch (cause) {
      setFailure(errorMessage(cause))
    } finally {
      setTranslating(false)
    }
  }

  async function downloadWithSigns() {
    const video = videoRef.current
    if (!video || !transcript || cues.length === 0) return
    exportAbort.current?.abort()
    const controller = new AbortController()
    exportAbort.current = controller
    setFailure(null)
    if (exported) URL.revokeObjectURL(exported.url)
    setExported(null)
    setExporting({ progress: 0 })
    try {
      const blob = await exportWithSigns({
        video,
        cues,
        words: transcript.words,
        images: urls,
        placement,
        showCaption,
        rate,
        signal: controller.signal,
        onProgress: (progress) => setExporting({ progress }),
      })
      const base = (file?.name ?? 'video').replace(/\.[^.]+$/, '')
      setExported({
        url: URL.createObjectURL(blob),
        size: blob.size,
        name: `${base} · ${target?.sign.name ?? 'signs'}.webm`,
      })
    } catch (cause) {
      if (!controller.signal.aborted) setFailure(errorMessage(cause))
    } finally {
      setExporting(null)
    }
  }

  function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement === stage) void document.exitFullscreen()
    else void stage.requestFullscreen()
  }

  // -------------------------------------------------------- transcribe --
  const transcribe = useCallback(
    async (chosen: File) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setFailure(null)
      setTranscript(null)

      try {
        // Soundtrack only, as WAV; the whole file if the browser cannot decode it.
        setStage({ kind: 'extracting' })
        let media: Blob = chosen
        let name = chosen.name
        try {
          media = await extractWav(chosen)
          name = 'audio.wav'
        } catch {
          // Fall through with the original file.
        }
        if (controller.signal.aborted) return

        setStage({ kind: 'uploading' })
        const { jobId } = await startTranscription(media, name)
        if (controller.signal.aborted) return

        setStage({ kind: 'transcribing', progress: 0 })
        const result = await awaitJob(
          jobId,
          (progress) => setStage({ kind: 'transcribing', progress }),
          controller.signal,
        )
        if (controller.signal.aborted) return
        setOriginal(null)
        setTranscript({
          words: result.words,
          source: 'speech',
          language: result.language,
          model: result.model,
          segments: result.segments,
        })
        if (result.words.length === 0) {
          setFailure('No speech was found in that video. You can paste a transcript or a subtitle file instead.')
        }
      } catch (cause) {
        if (controller.signal.aborted) return
        setFailure(errorMessage(cause))
        // Whatever went wrong, the person still has a video and two other ways
        // to get a transcript.
        setShowTyped(true)
      } finally {
        if (!controller.signal.aborted) setStage({ kind: 'idle' })
      }
    },
    [],
  )

  function chooseVideo(chosen: File | undefined) {
    if (!chosen) return
    setFile(chosen)
    setTranscript(null)
    setTime(0)
    setPlaying(false)
    setRate(1)
    // Unknown yet means the status call has not answered; try anyway, and the
    // failure path below offers the subtitle and typed routes. Only a known
    // "not available" skips straight to them.
    if (transcriber?.available === false) setShowTyped(true)
    else void transcribe(chosen)
  }

  async function chooseSubtitles(chosen: File | undefined) {
    if (!chosen) return
    setFailure(null)
    const words = parseSubtitles(await chosen.text())
    if (words.length === 0) {
      setFailure('No cues were found in that file. It should be an .srt or .vtt subtitle file.')
      return
    }
    setOriginal(null)
    setTranscript({ words, source: 'subtitles' })
  }

  function applyTyped() {
    const words: TimedWord[] = spread(typed, 0, duration || 1)
    if (words.length === 0) return
    setOriginal(null)
    setTranscript({ words, source: 'typed' })
    setShowTyped(false)
  }

  function seek(to: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = to
    setTime(to)
  }

  const busy = stage.kind !== 'idle' || exporting !== null
  const canPlay = Boolean(videoUrl)
  const targetName = target ? `${target.sign.name} · ${target.language.name}` : ''

  return (
    <Shell onBack={onBack}>
      {failure && <FormAlert>{failure}</FormAlert>}

      {vocabularies.length === 0 && (
        <FormAlert>
          No sign languages in your library yet - install ISL or ASL from the Community Database, or
          train one, so there are signs to show.
        </FormAlert>
      )}

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* -------------------------------------------------- player -- */}
          <div
            ref={stageRef}
            className={cn(
              'relative aspect-video w-full overflow-hidden rounded-2xl border bg-black',
              // In fullscreen the stage is the screen; the picture letterboxes inside.
              '[&:fullscreen]:aspect-auto [&:fullscreen]:rounded-none [&:fullscreen]:border-0',
            )}
          >
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  // Our own button fullscreens the stage; the native one would
                  // take the <video> alone and lose the overlay.
                  controlsList="nofullscreen"
                  playsInline
                  className="size-full object-contain"
                  onLoadedMetadata={(event) => {
                    setDuration(event.currentTarget.duration || 0)
                    setVideoSize({
                      w: event.currentTarget.videoWidth || 16,
                      h: event.currentTarget.videoHeight || 9,
                    })
                  }}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onSeeked={(event) => setTime(event.currentTarget.currentTime)}
                  onTimeUpdate={(event) => {
                    if (!playing) setTime(event.currentTarget.currentTime)
                  }}
                />
                {transcript && target?.language.gesture_translation && frame && (
                  // Sized to the picture, so the overlay's fractions mean the
                  // same spot in the window and in fullscreen.
                  <div
                    className="pointer-events-none absolute"
                    style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
                  >
                    <div className="pointer-events-auto contents">
                      <SignOverlay
                        cue={current}
                        word={currentWord}
                        url={current?.step.kind === 'symbol' ? urls[current.step.symbol.id] : undefined}
                        placement={placement}
                        onPlacement={setPlacement}
                        showCaption={showCaption}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen with signs'}
                  title={fullscreen ? 'Exit fullscreen' : 'Fullscreen with signs'}
                  className="absolute right-3 top-3 z-20 flex size-9 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  {fullscreen ? <Minimize className="size-4" aria-hidden="true" /> : <Maximize className="size-4" aria-hidden="true" />}
                </button>
              </>
            ) : (
              <label className="flex size-full cursor-pointer flex-col items-center justify-center gap-3 px-8 text-center transition-colors hover:bg-white/5">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Clapperboard className="size-7" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium text-white">Choose a video</span>
                <span className="max-w-sm text-xs leading-relaxed text-white/60">
                  It stays on this device. Only the soundtrack is sent for transcription; the
                  words come back timed, and the signs follow along.
                </span>
                <input
                  type="file"
                  accept="video/*,audio/*"
                  className="sr-only"
                  onChange={(event) => chooseVideo(event.target.files?.[0])}
                />
              </label>
            )}

            {busy && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-black/70 px-4 py-2.5 text-xs text-white backdrop-blur">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span className="flex-1">
                  {stage.kind === 'extracting' && 'Reading the soundtrack…'}
                  {stage.kind === 'uploading' && 'Sending the audio…'}
                  {stage.kind === 'transcribing' &&
                    `Transcribing on the server (${transcriber?.model ?? 'whisper'})… ${Math.round(
                      stage.progress * 100,
                    )}%`}
                </span>
                {stage.kind === 'transcribing' && (
                  <span className="h-1 w-32 overflow-hidden rounded-full bg-white/20">
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${stage.progress * 100}%` }}
                    />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort()
                    setStage({ kind: 'idle' })
                  }}
                  className="rounded-md p-1 text-white/70 hover:text-white"
                  aria-label="Cancel transcription"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* ------------------------------------------------ controls -- */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="xl"
              variant={playing ? 'outline' : 'default'}
              disabled={!canPlay}
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                if (video.paused) void video.play()
                else video.pause()
              }}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {playing ? 'Pause' : 'Play'}
            </Button>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gauge className="size-4" aria-hidden="true" />
              Speed
              <Select
                value={String(rate)}
                onChange={(event) => setRate(Number(event.target.value))}
                className="h-9 w-24"
                aria-label="Playback speed"
              >
                {[0.25, 0.5, 0.75, 1, 1.25].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </Select>
              {cues.length > 0 && suggestion < rate && (
                <button
                  type="button"
                  onClick={() => setRate(suggestion)}
                  className="rounded-sm text-xs text-primary underline-offset-4 hover:underline"
                  title="Slow the video so every sign is on screen for at least 0.3 s"
                >
                  suggest {suggestion}×
                </button>
              )}
            </label>

            {transcript && target?.language.gesture_translation && cues.length > 0 && (
              exporting ? (
                <Button
                  size="xl"
                  variant="outline"
                  onClick={() => exportAbort.current?.abort()}
                  title="Stop exporting"
                >
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Exporting {Math.round(exporting.progress * 100)}%
                </Button>
              ) : exported ? (
                <a
                  href={exported.url}
                  download={exported.name}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 text-[0.9375rem] font-medium text-white shadow-raised transition-colors hover:bg-success/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Save video ({(exported.size / 1_048_576).toFixed(1)} MB)
                </a>
              ) : (
                <Button
                  size="xl"
                  variant="outline"
                  onClick={() => void downloadWithSigns()}
                  disabled={busy || !exportSupported()}
                  title={
                    exportSupported()
                      ? 'Plays the video once and records it with the signs burned in'
                      : 'This browser cannot record video from a canvas'
                  }
                >
                  <Download aria-hidden="true" />
                  Download with signs
                </Button>
              )
            )}

            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
              <input type="file" accept="video/*,audio/*" className="sr-only" onChange={(event) => chooseVideo(event.target.files?.[0])} disabled={busy} />
              <span className={cn('inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-elevated px-3 text-sm font-medium transition-colors hover:border-border-strong hover:bg-muted', busy && 'pointer-events-none opacity-50')}>
                <Upload className="size-4" aria-hidden="true" />
                {file ? 'Another video' : 'Choose video'}
              </span>
            </label>
          </div>

          {/* ---------------------------------------------- translate -- */}
          {transcript && target && needsTranslation && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm">
                <Languages className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  The speech is {spokenLabel(transcriptLanguage)}; {target.sign.name} spells{' '}
                  {spokenLabel(targetSpoken)}. Translate it first so the signs say what is said.
                </span>
              </p>
              <Button size="sm" onClick={() => void translateForTarget()} disabled={translating}>
                {translating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Languages aria-hidden="true" />}
                {translating ? 'Translating…' : `Translate to ${spokenLabel(targetSpoken)}`}
              </Button>
            </div>
          )}
          {transcript?.source === 'translated' && original && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-elevated/60 px-4 py-3 text-xs text-muted-foreground">
              <span>
                Translated {spokenLabel(transcript.translatedFrom)} → {spokenLabel(transcript.language)}, one
                sentence at a time, each kept to the moment the original was said.
              </span>
              <button
                type="button"
                onClick={() => {
                  setTranscript(original)
                  setOriginal(null)
                }}
                className="rounded-sm text-primary underline-offset-4 hover:underline"
              >
                Use the original
              </button>
            </div>
          )}

          {/* ---------------------------------------------- transcript -- */}
          {transcript && (
            <div className="flex flex-col gap-2 rounded-xl border bg-elevated p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setTranscriptOpen((v) => !v)}
                  aria-expanded={transcriptOpen}
                  aria-controls="video-transcript"
                  className="flex items-center gap-2 rounded-md text-sm font-medium transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {transcriptOpen ? (
                    <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <Captions className="size-4 text-primary" aria-hidden="true" />
                  Transcript
                  <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                    {transcript.words.length} words ·{' '}
                    {transcript.source === 'speech'
                      ? `speech (${spokenLabel(transcript.language)})`
                      : transcript.source === 'subtitles'
                        ? 'subtitle file'
                        : transcript.source === 'translated'
                          ? `translated to ${spokenLabel(transcript.language)}`
                          : 'typed, evenly timed'}
                  </span>
                </button>
                <span className="text-xs text-muted-foreground">
                  {transcriptOpen ? 'Click a word to jump there.' : currentWord ? `Now: ${currentWord}` : 'Collapsed'}
                </span>
              </div>
              {transcriptOpen && (
              <p id="video-transcript" className="max-h-40 overflow-y-auto text-sm leading-7">
                {transcript.words.map((word, index) => {
                  const active = current?.wordIndex === index
                  const spoken = word.end <= time
                  return (
                    <button
                      key={`${index}-${word.start}`}
                      type="button"
                      onClick={() => seek(word.start)}
                      className={cn(
                        'mr-1 rounded px-0.5 transition-colors hover:bg-muted',
                        active && 'bg-primary/15 text-primary',
                        !active && spoken && 'text-muted-foreground',
                      )}
                      title={`${word.start.toFixed(2)}s – ${word.end.toFixed(2)}s`}
                    >
                      {word.text}
                    </button>
                  )
                })}
              </p>
              )}
            </div>
          )}

          {/* -------------------------------------- transcript fallbacks -- */}
          {file && !busy && (transcriber?.available === false || showTyped || !transcript) && (
            <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-elevated/60 p-4">
              {transcriber?.available === false && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <Mic className="mr-1.5 inline size-3.5" aria-hidden="true" />
                  Speech-to-text is not installed on the server ({transcriber.reason}). Run{' '}
                  <code className="font-mono">pip install faster-whisper</code> and restart it, or use a
                  subtitle file or a typed transcript below.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-elevated px-3 text-sm font-medium hover:border-border-strong hover:bg-muted">
                  <FileText className="size-4" aria-hidden="true" />
                  Subtitle file (.srt / .vtt)
                  <input type="file" accept=".srt,.vtt,text/vtt,text/plain" className="sr-only" onChange={(event) => void chooseSubtitles(event.target.files?.[0])} />
                </label>
                <Button variant="outline" size="lg" onClick={() => setShowTyped((v) => !v)}>
                  Type the transcript
                </Button>
                {transcriber?.available && (
                  <Button variant="ghost" size="lg" onClick={() => void transcribe(file)}>
                    <Mic aria-hidden="true" />
                    Transcribe again
                  </Button>
                )}
              </div>
              {showTyped && (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    rows={3}
                    placeholder="Type what is said in the video. The words are spread evenly across its length."
                    className="w-full rounded-lg border border-input bg-card p-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                  />
                  <Button size="sm" className="self-start" onClick={applyTyped} disabled={!typed.trim() || !duration}>
                    Use this transcript
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- aside -- */}
        <aside className="flex flex-col gap-4 rounded-xl border bg-elevated p-4">
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold tracking-tight">Signs</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Which sign language spells the words, and where its pictures sit on the video.
            </p>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Sign language</span>
            <Select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-9">
              {vocabularies.length === 0 && <option value="">No sign languages yet</option>}
              {vocabularies.map(({ sign, language }) => (
                <option key={sign.id} value={sign.id}>
                  {sign.name} · {language.name} ({spokenLabel(language.spoken_language)})
                  {language.gesture_translation ? '' : ' (pictures off)'}
                </option>
              ))}
            </Select>
          </label>

          {target && !target.language.gesture_translation && (
            <FormAlert>
              {targetName} is not available for gesture translation. Turn on “Allow gesture
              translation” for it in the Trainer (Edit details).
            </FormAlert>
          )}

          {target && target.language.gesture_translation && transcript && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {cues.length} sign{cues.length === 1 ? '' : 's'} scheduled across {transcript.words.length} words.
              {suggestion < 1 && (
                <>
                  {' '}
                  The fastest is on screen for{' '}
                  {Math.round(Math.min(...cues.map((c) => c.end - c.start)) * 1000)} ms - try {suggestion}× speed.
                </>
              )}
            </p>
          )}

          <div className="flex flex-col gap-3 border-t pt-4">
            <span className="text-xs font-medium text-muted-foreground">Overlay</span>

            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ['Top left', 0.04, 0.06],
                  ['Top right', 0.68, 0.06],
                  ['Bottom left', 0.04, 0.52],
                  ['Bottom right', 0.68, 0.52],
                ] as [string, number, number][]
              ).map(([label, x, y]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPlacement((p) => ({ ...p, x: Math.min(x, 1 - p.width), y }))}
                  className="rounded-md border bg-card px-1.5 py-1.5 text-[0.6875rem] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">…or drag the overlay anywhere on the video.</p>

            <label className="flex flex-col gap-1.5 text-xs">
              <span className="flex justify-between text-muted-foreground">
                Size <span className="font-mono">{Math.round(placement.width * 100)}%</span>
              </span>
              <input
                type="range"
                min={12}
                max={50}
                value={Math.round(placement.width * 100)}
                onChange={(event) =>
                  setPlacement((p) => {
                    const width = Number(event.target.value) / 100
                    return { ...p, width, x: Math.min(p.x, 1 - width) }
                  })
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs">
              <span className="flex justify-between text-muted-foreground">
                Opacity <span className="font-mono">{Math.round(placement.opacity * 100)}%</span>
              </span>
              <input
                type="range"
                min={30}
                max={100}
                value={Math.round(placement.opacity * 100)}
                onChange={(event) => setPlacement((p) => ({ ...p, opacity: Number(event.target.value) / 100 }))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
            </label>

            <Checkbox checked={showCaption} onChange={(event) => setShowCaption(event.target.checked)}>
              Show the word under the sign
            </Checkbox>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void save({ overlay: { ...placement, caption: showCaption } }).then(() => {
                  setSavedDefault(true)
                  window.setTimeout(() => setSavedDefault(false), 1800)
                })
              }}
            >
              {savedDefault ? 'Saved as default' : 'Save as my default'}
            </Button>
          </div>

          <p className="border-t pt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Each word's signs are spread across the time it is spoken, so they keep pace with the
            speaker. Whole-word signs are used when the vocabulary has one; otherwise the word is
            finger-spelled. Missing letters show as a gap.
          </p>
        </aside>
      </div>
    </Shell>
  )
}

function spokenLabel(code: string | null | undefined): string {
  if (!code) return 'unknown'
  return TARGET_LANGUAGES.find((l) => l.code === code.toLowerCase())?.label ?? code
}

function Shell({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
            <ArrowLeft aria-hidden="true" />
            Home
          </Button>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex min-w-0 flex-col">
            <h2 className="truncate font-semibold leading-tight tracking-tight">Video Translator</h2>
            <span className="truncate text-xs text-muted-foreground">
              Spoken video, signed over the top and timed to the words
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 px-5 py-6 sm:px-8">{children}</div>
    </div>
  )
}
