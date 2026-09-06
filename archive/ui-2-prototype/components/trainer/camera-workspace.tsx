'use client'

import { useEffect, useState } from 'react'
import { Camera, Check, Plus, Sparkles, VideoOff } from 'lucide-react'
import { TrainerHeader } from '@/components/trainer/trainer-header'
import { Chip } from '@/components/trainer/action-card'
import { cn } from '@/lib/utils'

const crumbs = [
  { label: 'SignTalk', href: '/' },
  { label: 'Trainer', href: '/' },
  { label: 'Add New', href: '/add-new' },
  { label: 'Configure' },
]

const SAMPLES = ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4']

type Phase = 'idle' | 'training' | 'done'

export function CameraWorkspace() {
  const [cameraOn, setCameraOn] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<number[]>(() => SAMPLES.map(() => 0))

  // Stands in for real training telemetry until the backend is wired up: each
  // sample fills in turn, so the panel shows movement rather than a frozen bar.
  useEffect(() => {
    if (phase !== 'training') return

    const timer = setInterval(() => {
      setProgress((prev) => {
        const active = prev.findIndex((value) => value < 100)
        if (active === -1) return prev
        const next = [...prev]
        next[active] = Math.min(100, next[active] + Math.random() * 18 + 6)
        return next
      })
    }, 220)

    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase === 'training' && progress.every((value) => value >= 100)) setPhase('done')
  }, [phase, progress])

  function handleTrain() {
    if (phase === 'training') return
    setProgress(SAMPLES.map(() => 0))
    setPhase('training')
  }

  const done = progress.filter((value) => value >= 100).length
  const live = cameraOn || phase === 'training'
  const showProgress = phase !== 'idle'

  return (
    <div className="flex flex-1 flex-col animate-screen-in">
      <TrainerHeader crumbs={crumbs} />

      <div className="grid flex-1 grid-cols-1 gap-5 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          {/* Viewfinder: what the recognizer is actually looking at. */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-elevated">
            <div
              aria-hidden="true"
              className="bg-dotgrid pointer-events-none absolute inset-0 text-foreground/[0.07]"
            />

            <Bracket className="left-3 top-3 border-l-2 border-t-2" />
            <Bracket className="right-3 top-3 border-r-2 border-t-2" />
            <Bracket className="bottom-3 left-3 border-b-2 border-l-2" />
            <Bracket className="bottom-3 right-3 border-b-2 border-r-2" />

            {live && (
              <div
                aria-hidden="true"
                className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
              />
            )}

            <div className="absolute inset-x-4 top-4 flex items-center justify-between font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    live ? 'animate-breathe bg-primary' : 'bg-muted-foreground/50',
                  )}
                  aria-hidden="true"
                />
                {phase === 'training' ? 'Learning' : cameraOn ? 'Tracking' : 'Standby'}
              </span>
              <span>21 pts</span>
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              {cameraOn ? (
                <>
                  <Camera className="size-10 text-primary" aria-hidden="true" />
                  <span className="text-sm">Camera preview</span>
                </>
              ) : (
                <>
                  <span className="flex size-14 items-center justify-center rounded-xl bg-muted">
                    <VideoOff className="size-6" aria-hidden="true" />
                  </span>
                  <span className="text-sm">Camera is off</span>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCameraOn((v) => !v)}
              aria-pressed={cameraOn}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium',
                'transition-all duration-150 active:translate-y-px',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                cameraOn
                  ? 'border-primary/45 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-input bg-elevated text-foreground hover:border-border-strong hover:bg-muted',
              )}
            >
              <Camera className="size-4" aria-hidden="true" />
              {cameraOn ? 'Turn camera off' : 'Turn camera on'}
            </button>

            <button
              type="button"
              onClick={handleTrain}
              disabled={phase === 'training'}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-medium',
                'bg-primary text-primary-foreground shadow-raised',
                'transition-all duration-150 hover:bg-primary/90 active:translate-y-px',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                'disabled:pointer-events-none disabled:opacity-60',
              )}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {phase === 'training' ? 'Training' : phase === 'done' ? 'Train again' : 'Train'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {showProgress ? (
            <div className="flex animate-screen-in flex-col gap-4 rounded-xl border bg-elevated p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-semibold tracking-tight">Training progress</h2>
                  <Chip muted={phase !== 'done'}>
                    {phase === 'done' ? 'Complete' : done + '/' + SAMPLES.length + ' complete'}
                  </Chip>
                </div>
                <button
                  type="button"
                  aria-label="Add sample"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-raised transition-all hover:bg-primary/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                >
                  <Plus className="size-4" />
                </button>
              </div>

              <ul className="flex flex-col gap-4">
                {SAMPLES.map((label, index) => {
                  const value = Math.round(progress[index])
                  return (
                    <li key={label} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="flex items-center gap-1 font-mono text-[0.6875rem] text-foreground">
                          {value === 100 && <Check className="size-3 text-primary" aria-hidden="true" />}
                          {value}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: value + '%' }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed bg-elevated/40 p-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">Not trained yet</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Hit Train to build a model from your recorded samples.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Bracket({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute size-5 rounded-[3px] border-border-strong ${className}`}
    />
  )
}
