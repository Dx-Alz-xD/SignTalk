"use client"

import { useState } from "react"
import {
  Camera,
  CircleCheck,
  Languages,
  MessageSquareText,
  Plus,
  ScanFace,
  Sparkles,
  Video,
  VideoOff,
} from "lucide-react"

interface CameraWorkspaceProps {
  name: string
  language: string
  phrasesIncluded: boolean
}

const samples = [
  { label: "Hello", value: 100 },
  { label: "Thank you", value: 100 },
  { label: "Please", value: 72 },
  { label: "Yes", value: 40 },
  { label: "No", value: 0 },
]

type Status = "ready" | "training" | "queued"

function statusOf(value: number): Status {
  if (value >= 100) return "ready"
  if (value > 0) return "training"
  return "queued"
}

const statusStyles: Record<Status, { chip: string; bar: string; label: string }> = {
  ready: {
    chip: "bg-jade/10 text-jade ring-jade/20",
    bar: "bg-jade",
    label: "Ready",
  },
  training: {
    chip: "bg-primary/10 text-primary ring-primary/20",
    bar: "bg-gradient-to-r from-primary to-ember",
    label: "Training",
  },
  queued: {
    chip: "bg-muted text-muted-foreground ring-border",
    bar: "bg-transparent",
    label: "Queued",
  },
}

export function CameraWorkspace({ name, language, phrasesIncluded }: CameraWorkspaceProps) {
  const [cameraOn, setCameraOn] = useState(false)
  const [training, setTraining] = useState(false)

  const overall = Math.round(samples.reduce((sum, s) => sum + s.value, 0) / samples.length)
  const readyCount = samples.filter((s) => s.value >= 100).length

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* What the previous step configured, carried through so it stays visible while recording */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={ScanFace} tone="crimson">
          {samples.length} signs
        </Chip>
        <Chip icon={Languages} tone="iris">
          {language || "Language not set"}
        </Chip>
        <Chip icon={MessageSquareText} tone="ember">
          {phrasesIncluded ? "Phrases included" : "Single signs only"}
        </Chip>
      </div>

      <div className={`grid flex-1 grid-cols-1 gap-6 ${training ? "lg:grid-cols-[1fr_360px]" : ""}`}>
        <div className="flex flex-col gap-4">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-background shadow-inner">
            <div aria-hidden="true" className="bg-blueprint pointer-events-none absolute inset-0 opacity-70" />

            {cameraOn && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div className="animate-sheen h-full w-1/4 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
                </div>

                {/* Framing guides for the hands */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-8 md:inset-12">
                  <span className="absolute left-0 top-0 size-8 rounded-tl-lg border-l-2 border-t-2 border-primary/50" />
                  <span className="absolute right-0 top-0 size-8 rounded-tr-lg border-r-2 border-t-2 border-primary/50" />
                  <span className="absolute bottom-0 left-0 size-8 rounded-bl-lg border-b-2 border-l-2 border-primary/50" />
                  <span className="absolute bottom-0 right-0 size-8 rounded-br-lg border-b-2 border-r-2 border-primary/50" />
                </div>

                <span className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/30 backdrop-blur">
                  <span className="size-2 animate-pulse rounded-full bg-primary" />
                  Live
                </span>

                <span className="absolute right-4 top-4 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border backdrop-blur">
                  {name}
                </span>
              </>
            )}

            {cameraOn ? (
              <div className="relative flex flex-col items-center gap-3 text-muted-foreground">
                <Video className="size-11" />
                <span className="text-sm">Camera preview</span>
              </div>
            ) : (
              <div className="relative flex max-w-xs flex-col items-center gap-3 px-6 text-center text-muted-foreground">
                <span className="flex size-16 items-center justify-center rounded-2xl bg-muted ring-1 ring-inset ring-border">
                  <VideoOff className="size-8" />
                </span>
                <span className="text-sm font-medium text-foreground">Camera is off</span>
                <span className="text-pretty text-xs leading-relaxed">
                  Turn it on to frame your hands. Recording stays on this device.
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCameraOn((v) => !v)}
            aria-pressed={cameraOn}
            className={`flex w-full items-center justify-center gap-3 rounded-2xl border px-6 py-5 text-lg font-semibold transition-all ${
              cameraOn
                ? "border-primary bg-primary text-primary-foreground shadow-[0_14px_36px_-16px_oklch(0.5_0.2_22_/_0.9)] hover:bg-primary/90"
                : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent"
            }`}
          >
            <Camera className="size-6" />
            {cameraOn ? "Turn Camera Off" : "Turn Camera On"}
          </button>

          <button
            type="button"
            onClick={() => setTraining((v) => !v)}
            aria-expanded={training}
            aria-controls="training-panel"
            className={`group flex w-full items-center justify-center gap-3 rounded-2xl border px-6 py-5 text-lg font-semibold tracking-wide transition-all ${
              training
                ? "border-primary bg-gradient-to-r from-primary to-[oklch(0.5_0.2_12)] text-primary-foreground shadow-[0_14px_36px_-16px_oklch(0.5_0.2_22_/_0.9)]"
                : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent"
            }`}
          >
            <Sparkles
              className={`size-6 transition-transform duration-500 ${training ? "" : "group-hover:rotate-12"}`}
            />
            TRAIN
          </button>
        </div>

        {training && (
          <aside
            id="training-panel"
            className="flex flex-col gap-4 duration-300 animate-in fade-in slide-in-from-right-4"
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b border-border p-6 pb-5">
                <div className="flex flex-col gap-1">
                  <h2 className="font-display text-lg font-semibold tracking-tight">Training progress</h2>
                  <p className="text-xs text-muted-foreground">
                    {readyCount} of {samples.length} signs ready
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Add a sign"
                  title="Add a sign"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-[0_10px_26px_-12px_oklch(0.5_0.2_22_/_0.9)]"
                >
                  <Plus className="size-5" />
                </button>
              </div>

              <div className="border-b border-border bg-muted/40 px-6 py-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Overall</span>
                  <span className="font-display text-2xl font-bold tabular-nums text-foreground">{overall}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-ember to-jade transition-all duration-700"
                    style={{ width: `${overall}%` }}
                  />
                </div>
              </div>

              <ul className="flex flex-col gap-5 p-6">
                {samples.map((item) => {
                  const status = statusOf(item.value)
                  const style = statusStyles[status]
                  return (
                    <li key={item.label} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          {status === "ready" ? (
                            <CircleCheck className="size-4 shrink-0 text-jade" />
                          ) : (
                            <span
                              className={`size-2 shrink-0 rounded-full ${
                                status === "training" ? "animate-pulse bg-primary" : "bg-muted-foreground/40"
                              }`}
                            />
                          )}
                          <span className="truncate font-medium text-foreground">{item.label}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${style.chip}`}
                          >
                            {style.label}
                          </span>
                          <span className="w-9 text-right font-medium tabular-nums text-muted-foreground">
                            {item.value}%
                          </span>
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${style.bar}`}
                          style={{ width: `${item.value}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <p className="px-1 text-xs leading-relaxed text-muted-foreground">
              Signs stay editable while training. Re-record any that finish with a low score.
            </p>
          </aside>
        )}
      </div>
    </div>
  )
}

function Chip({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof ScanFace
  tone: "crimson" | "ember" | "iris"
  children: React.ReactNode
}) {
  const tones = {
    crimson: "border-primary/20 bg-primary/5 text-primary",
    ember: "border-ember/25 bg-ember/8 text-ember",
    iris: "border-iris/20 bg-iris/5 text-iris",
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tones[tone]}`}
    >
      <Icon className="size-3.5" />
      {children}
    </span>
  )
}
