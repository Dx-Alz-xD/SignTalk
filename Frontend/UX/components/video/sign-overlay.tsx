'use client'

import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Move } from 'lucide-react'
import type { Cue } from '@/lib/video'
import { cn } from '@/lib/utils'

/** Where the overlay sits, as fractions of the video's box. */
export type Placement = { x: number; y: number; width: number; opacity: number }

export const DEFAULT_PLACEMENT: Placement = { x: 0.68, y: 0.06, width: 0.26, opacity: 0.95 }

/**
 * The sign picture floating over the video. Drag it anywhere; the caller owns
 * the placement so the size and opacity sliders next to the player can move
 * it too. Positions are fractions, so it stays put when the player resizes.
 */
export function SignOverlay({
  cue,
  word,
  url,
  placement,
  onPlacement,
  showCaption,
}: {
  cue: Cue | null
  /** The word being spoken, for the caption. */
  word: string | null
  /** Picture for the cue's symbol; undefined while loading, null when none. */
  url: string | null | undefined
  placement: Placement
  onPlacement: (placement: Placement) => void
  showCaption: boolean
}) {
  const drag = useRef<{ dx: number; dy: number; box: DOMRect } | null>(null)

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    const container = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    const self = event.currentTarget.getBoundingClientRect()
    drag.current = { dx: event.clientX - self.left, dy: event.clientY - self.top, box: container }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    const { dx, dy, box } = drag.current
    const widthPx = box.width * placement.width
    const heightPx = event.currentTarget.getBoundingClientRect().height
    const x = (event.clientX - dx - box.left) / box.width
    const y = (event.clientY - dy - box.top) / box.height
    onPlacement({
      ...placement,
      x: Math.max(0, Math.min(1 - widthPx / box.width, x)),
      y: Math.max(0, Math.min(1 - heightPx / box.height, y)),
    })
  }

  function up(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const symbol = cue?.step.kind === 'symbol' ? cue.step.symbol : null
  const letter = cue?.step.kind === 'symbol' ? cue.step.text : cue?.step.kind === 'missing' ? cue.step.text : ''

  return (
    <div
      role="group"
      aria-label="Sign overlay. Drag to move."
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
        width: `${placement.width * 100}%`,
        opacity: placement.opacity,
      }}
      className="absolute z-10 flex cursor-grab touch-none select-none flex-col overflow-hidden rounded-xl border border-white/20 bg-black/75 shadow-window backdrop-blur-sm active:cursor-grabbing"
    >
      <div className="relative aspect-square w-full bg-black/60">
        {symbol && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={symbol.name} className="size-full object-contain" draggable={false} />
        ) : cue?.step.kind === 'missing' ? (
          <div className="flex size-full items-center justify-center font-mono text-3xl text-warning">
            {letter}
          </div>
        ) : symbol ? (
          <div className="flex size-full items-center justify-center font-mono text-3xl text-white/70">
            {letter}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center text-white/30">
            <Move className="size-6" aria-hidden="true" />
          </div>
        )}

        {cue && cue.count > 1 && (
          <div className="absolute inset-x-0 bottom-0 flex gap-0.5 p-1">
            {Array.from({ length: cue.count }).map((_, i) => (
              <span
                key={i}
                className={cn('h-0.5 flex-1 rounded-full', i <= cue.index ? 'bg-primary' : 'bg-white/25')}
              />
            ))}
          </div>
        )}
      </div>

      {showCaption && (
        <div className="flex items-baseline justify-between gap-2 px-2 py-1">
          <span className="truncate text-xs font-medium text-white">
            {word ? spell(word, cue) : <span className="text-white/40">…</span>}
          </span>
          {letter && (
            <span className="shrink-0 font-mono text-[0.625rem] uppercase text-primary">{letter}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** The word with the letter being shown underlined. */
function spell(word: string, cue: Cue | null) {
  if (!cue || cue.count <= 1 || cue.step.kind !== 'symbol' || cue.step.text.length !== 1) return word
  // Letters are indexed over the cleaned word; approximate with the same
  // ordinal in the shown word, which lines up for ordinary words.
  const letters = Array.from(word)
  return letters.map((char, i) => (
    <span key={i} className={i === cue.index ? 'text-primary underline decoration-2 underline-offset-2' : undefined}>
      {char}
    </span>
  ))
}
