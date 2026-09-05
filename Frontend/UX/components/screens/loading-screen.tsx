'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { SignTalkMark, SignTalkWordmark } from '@/components/signtalk-mark'
import { cn } from '@/lib/utils'

const steps = [
  'Authenticating session',
  'Loading gesture recognition model',
  'Connecting to sign database',
  'Calibrating camera pipeline',
  'Ready',
]

const STEP_DURATION_MS = 550

export function LoadingScreen({
  onDone,
  /** False while the session handshake is still in flight. */
  ready = true,
}: {
  onDone: () => void
  ready?: boolean
}) {
  const [completed, setCompleted] = useState(0)

  useEffect(() => {
    if (completed >= steps.length) {
      const timeout = setTimeout(onDone, 400)
      return () => clearTimeout(timeout)
    }
    // Hold on the last step until the server has actually answered, so the bar
    // never reaches 100% before there is somewhere to go.
    if (completed === steps.length - 1 && !ready) return
    const timeout = setTimeout(() => setCompleted((count) => count + 1), STEP_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [completed, ready, onDone])

  const progress = Math.round((completed / steps.length) * 100)
  const current = steps[Math.min(completed, steps.length - 1)]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10">
      <div className="flex flex-col items-center gap-4">
        {/* The mark is line art, so it glows on its own rather than sitting in a tile. */}
        <span className="relative flex size-20 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute size-14 animate-breathe rounded-full bg-primary blur-2xl"
          />
          <SignTalkMark className="relative size-20" />
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <SignTalkWordmark className="text-lg" />
          <h1 className="sr-only">Starting SignTalk</h1>
          {/* One polite announcement per step, rather than a chatty list. */}
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {completed >= steps.length ? 'Ready' : current}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between font-mono text-xs">
            <span className="text-muted-foreground">Loading</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Startup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="flex flex-col gap-2.5 text-sm" aria-hidden="true">
          {steps.map((step, index) => {
            const isDone = index < completed
            const isActive = index === completed
            return (
              <li
                key={step}
                className={cn(
                  'flex items-center gap-2.5 transition-colors duration-300',
                  isDone && 'text-muted-foreground',
                  isActive && 'font-medium text-foreground',
                  // Pending steps stay legible instead of dropping to /40.
                  !isDone && !isActive && 'text-muted-foreground/65',
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {isDone ? (
                    <Check className="size-4 text-success" strokeWidth={2.75} />
                  ) : isActive ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current opacity-40" />
                  )}
                </span>
                {step}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
