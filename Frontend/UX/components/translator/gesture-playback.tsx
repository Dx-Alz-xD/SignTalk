'use client'

import { useEffect, useMemo, useState } from 'react'
import { ImageOff, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchSymbolImageUrl, outputPreview, type Symbol } from '@/lib/library'
import { cn } from '@/lib/utils'

/**
 * Sign-to-sign translation, shown rather than spoken: the text is broken into
 * the target language's symbols and their reference pictures are played back
 * one after another, at the interval the language's owner chose.
 *
 * Whole words match first (a symbol that types "hello"), then letters. A
 * character nothing in the language types is shown as a gap rather than
 * silently dropped, so the reader knows something was missed.
 */

export type Step =
  | { kind: 'symbol'; symbol: Symbol; text: string }
  | { kind: 'space' }
  | { kind: 'missing'; text: string }

/** Break `text` into the symbols of `symbols` (one language's worth). */
export function planSteps(text: string, symbols: Symbol[]): Step[] {
  const byOutput = new Map<string, Symbol>()
  for (const symbol of symbols) {
    if (symbol.output_kind !== 'text') continue
    const typed = outputPreview(symbol).trim().toLowerCase()
    if (typed && !byOutput.has(typed)) byOutput.set(typed, symbol)
  }

  const steps: Step[] = []
  const words = text.trim().split(/\s+/).filter(Boolean)
  words.forEach((word, index) => {
    const whole = byOutput.get(word.toLowerCase())
    if (whole) {
      steps.push({ kind: 'symbol', symbol: whole, text: word })
    } else {
      for (const char of Array.from(word)) {
        const letter = byOutput.get(char.toLowerCase())
        steps.push(letter ? { kind: 'symbol', symbol: letter, text: char } : { kind: 'missing', text: char })
      }
    }
    if (index < words.length - 1) steps.push({ kind: 'space' })
  })
  return steps
}

export function GesturePlayback({
  steps,
  intervalMs,
  languageName,
}: {
  steps: Step[]
  intervalMs: number
  languageName: string
}) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [urls, setUrls] = useState<Record<string, string | null>>({})

  const symbolIds = useMemo(
    () => [...new Set(steps.flatMap((s) => (s.kind === 'symbol' ? [s.symbol.id] : [])))],
    [steps],
  )

  // Pictures come through the session cookie as object URLs (see
  // fetchSymbolImageUrl); revoke them when the plan changes or we unmount.
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

  // Restart from the top whenever the plan changes.
  useEffect(() => {
    setIndex(0)
    setPlaying(true)
  }, [steps])

  useEffect(() => {
    if (!playing || steps.length === 0) return
    if (index >= steps.length - 1) {
      setPlaying(false)
      return
    }
    // A gap between words reads better short than at the full interval.
    const wait = steps[index]?.kind === 'space' ? Math.min(intervalMs, 400) : intervalMs
    const timer = setTimeout(() => setIndex((i) => i + 1), wait)
    return () => clearTimeout(timer)
  }, [playing, index, steps, intervalMs])

  if (steps.length === 0) return null
  const step = steps[Math.min(index, steps.length - 1)]
  const missing = steps.filter((s) => s.kind === 'missing').length

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-black/90">
        <Frame step={step} url={step.kind === 'symbol' ? urls[step.symbol.id] : undefined} />

        <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-wider text-white/80 backdrop-blur">
          {languageName} · {index + 1} / {steps.length}
        </span>

        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIndex((i) => Math.min(i + 1, steps.length - 1))}
          disabled={index >= steps.length - 1}
          aria-label="Next sign"
        >
          <SkipForward aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setIndex(0)
            setPlaying(true)
          }}
          aria-label="Restart"
        >
          <RotateCcw aria-hidden="true" />
        </Button>
        <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground">
          {(intervalMs / 1000).toFixed(1)}s per sign
        </span>
      </div>

      {/* The whole sequence at a glance; click a tile to jump to it. */}
      <ol className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                setIndex(i)
                setPlaying(false)
              }}
              title={s.kind === 'symbol' ? s.symbol.name : s.kind === 'space' ? 'space' : `No sign for “${s.text}”`}
              className={cn(
                'flex size-9 items-center justify-center overflow-hidden rounded-md border font-mono text-xs transition-colors',
                i === index ? 'border-primary ring-2 ring-primary/35' : 'border-border hover:border-border-strong',
                s.kind === 'space' && 'bg-muted/40 text-muted-foreground',
                s.kind === 'missing' && 'border-dashed text-warning',
              )}
            >
              {s.kind === 'symbol' ? (
                urls[s.symbol.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[s.symbol.id] ?? ''} alt={s.symbol.name} className="size-full object-cover" />
                ) : (
                  <span className="truncate px-1">{s.text}</span>
                )
              ) : s.kind === 'space' ? (
                '␣'
              ) : (
                s.text
              )}
            </button>
          </li>
        ))}
      </ol>

      {missing > 0 && (
        <p className="text-[0.6875rem] leading-relaxed text-warning">
          {missing} character{missing === 1 ? '' : 's'} {missing === 1 ? 'has' : 'have'} no sign in{' '}
          {languageName} and {missing === 1 ? 'is' : 'are'} shown as a gap.
        </p>
      )}
    </div>
  )
}

function Frame({ step, url }: { step: Step; url: string | null | undefined }) {
  if (step.kind === 'space') {
    return (
      <div className="flex size-full items-center justify-center text-white/40">
        <span className="font-mono text-sm uppercase tracking-[0.2em]">space</span>
      </div>
    )
  }
  if (step.kind === 'missing') {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 text-warning">
        <ImageOff className="size-8" aria-hidden="true" />
        <span className="text-sm">No sign for “{step.text}”</span>
      </div>
    )
  }
  return (
    <div className="relative size-full">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={step.symbol.name} className="size-full object-contain" />
      ) : url === null ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-white/60">
          <ImageOff className="size-8" aria-hidden="true" />
          <span className="text-sm">“{step.symbol.name}” has no samples to draw yet</span>
        </div>
      ) : (
        <div className="flex size-full items-center justify-center text-white/40">
          <span className="text-sm">Loading…</span>
        </div>
      )}
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-lg font-semibold text-white backdrop-blur">
        {step.text}
      </span>
    </div>
  )
}
