'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Camera,
  Check,
  Clapperboard,
  Contrast,
  Gauge,
  Monitor,
  Moon,
  RotateCcw,
  ScanFace,
  Server,
  Sparkles,
  Sun,
  Timer,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { FormAlert } from '@/components/form-alert'
import { Screen, ScreenBody, ScreenHeader } from '@/components/screen'
import {
  Badge,
  Panel,
  Section,
  Segmented,
  Setting,
  Slider,
  Switch,
} from '@/components/ui/surface'
import { useSession } from '@/components/session'
import { API_BASE, errorMessage } from '@/lib/api'
import { COUNTDOWN_RANGE, MIN_CONFIDENCE_RANGE, describeConfidence } from '@/lib/preferences'
import type { Theme } from '@/lib/theme-storage'
import { cn } from '@/lib/utils'

type Capability = { available: boolean; detail: string }
type Health = {
  ok: boolean
  engine: string | null
  database: string
  version: string
  capabilities: Record<string, Capability>
}

const CAPABILITY_LABELS: Record<string, { title: string; what: string; install: string }> = {
  speechToText: {
    title: 'Speech to text',
    what: 'Transcribes a video with word timings for the Video Translator.',
    install: 'pip install faster-whisper',
  },
  datasetImport: {
    title: 'Server dataset import',
    what: 'Imports image datasets as built-in sign languages. Importing your own in the browser works either way.',
    install: 'pip install mediapipe opencv-python',
  },
  signSkeletons: {
    title: 'Hand skeletons',
    what: 'Draws a symbol with no photo as its hand skeleton, so every trained symbol has a picture.',
    install: 'pip install pillow',
  },
}

export function SettingsScreen() {
  const { preferences, save, reset } = useSession()
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [cameras, setCameras] = useState<MediaDeviceInfo[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)

  const change = useCallback(
    (changes: Parameters<typeof save>[0]) => {
      setFailure(null)
      void save(changes)
        .then(() => {
          setSaved(true)
          window.setTimeout(() => setSaved(false), 1600)
        })
        .catch((cause) => setFailure(errorMessage(cause)))
    },
    [save],
  )

  // Camera names need permission; without it the browser returns blank labels,
  // which is worth saying rather than showing an empty list.
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameras([])
      return
    }
    let cancelled = false
    const load = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (!cancelled) setCameras(devices.filter((device) => device.kind === 'videoinput'))
        })
        .catch(() => {
          if (!cancelled) setCameras([])
        })
    void load()
    navigator.mediaDevices.addEventListener?.('devicechange', load)
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener?.('devicechange', load)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/health`, { signal: controller.signal })
      .then((response) => response.json())
      .then((found) => {
        if (!controller.signal.aborted) setHealth(found)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const named = (cameras ?? []).filter((camera) => camera.label)

  return (
    <Screen>
      <ScreenHeader
        title="Settings"
        subtitle="How the camera, the recogniser and the app itself behave for you"
        icon={<Sparkles className="size-5" aria-hidden="true" />}
        actions={
          <>
            <span
              className={cn(
                'flex items-center gap-1.5 text-xs text-success transition-opacity duration-300',
                saved ? 'opacity-100' : 'opacity-0',
              )}
              aria-live="polite"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Saved
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFailure(null)
                void reset().catch((cause) => setFailure(errorMessage(cause)))
              }}
            >
              <RotateCcw aria-hidden="true" />
              Reset all
            </Button>
          </>
        }
      />

      <ScreenBody>
        {failure && <FormAlert>{failure}</FormAlert>}

        <p className="text-sm leading-relaxed text-muted-foreground">
          Everything here is saved to your account, so it follows you to another browser or
          machine. Changes take effect immediately.
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ------------------------------------------------- appearance -- */}
          <Panel
            title="Appearance"
            description="How SignTalk looks on every device you sign in from."
            icon={<Contrast className="size-4" aria-hidden="true" />}
          >
            <Setting
              label="Theme"
              hint="System follows whatever your device is set to."
              control={
                <Segmented<Theme>
                  label="Theme"
                  value={preferences.theme}
                  onChange={(theme) => change({ theme })}
                  options={[
                    { value: 'light', label: 'Light', icon: <Sun className="size-3.5" aria-hidden="true" /> },
                    { value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" aria-hidden="true" /> },
                    { value: 'system', label: 'System', icon: <Monitor className="size-3.5" aria-hidden="true" /> },
                  ]}
                />
              }
            />
            <Setting
              label="Reduce motion"
              hint="Turns off the start-up sequence, page transitions and the breathing indicators. Your device's own reduced-motion setting is always respected as well."
              control={
                <Switch
                  label="Reduce motion"
                  checked={preferences.reduceMotion}
                  onChange={(reduceMotion) => change({ reduceMotion })}
                />
              }
            />
          </Panel>

          {/* ----------------------------------------------------- camera -- */}
          <Panel
            title="Camera"
            description="Used by the Translator, the Trainer and Direct Paste."
            icon={<Camera className="size-4" aria-hidden="true" />}
          >
            <Setting
              label="Camera"
              htmlFor="camera-device"
              hint={
                cameras === null
                  ? 'Looking for cameras…'
                  : named.length === 0
                    ? 'Camera names appear once you have allowed camera access on any screen.'
                    : `${named.length} camera${named.length === 1 ? '' : 's'} found.`
              }
              stacked
            >
              <Select
                id="camera-device"
                value={preferences.cameraDeviceId}
                onChange={(event) => change({ cameraDeviceId: event.target.value })}
                className="h-10"
              >
                <option value="">Default camera</option>
                {(cameras ?? []).map((camera, index) => (
                  <option key={camera.deviceId || index} value={camera.deviceId}>
                    {camera.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </Select>
            </Setting>
            <Setting
              label="Mirror the preview"
              hint="Shows you as a mirror does. Recognition is unaffected either way: the tracker always reads the mirrored image, which is what the sign models were trained on."
              control={
                <Switch
                  label="Mirror the preview"
                  checked={preferences.mirrorPreview}
                  onChange={(mirrorPreview) => change({ mirrorPreview })}
                />
              }
            />
            <Setting
              label="Draw the hand skeleton"
              hint="Overlays the 21 tracked points on the preview, so you can see what the recogniser sees."
              control={
                <Switch
                  label="Draw the hand skeleton"
                  checked={preferences.showSkeleton}
                  onChange={(showSkeleton) => change({ showSkeleton })}
                />
              }
            />
          </Panel>

          {/* ------------------------------------------------ recognition -- */}
          <Panel
            title="Recognition"
            description="How eagerly a held sign is reported."
            icon={<ScanFace className="size-4" aria-hidden="true" />}
          >
            <Setting
              label="Default pace"
              hint="Careful waits for a steady hold. Speed fires after two agreeing frames, for signing at conversational speed. The Translator can override this per session."
              control={
                <Segmented
                  label="Default pace"
                  value={preferences.pace}
                  onChange={(pace) => change({ pace })}
                  options={[
                    { value: 'careful', label: 'Careful' },
                    { value: 'speed', label: 'Speed', icon: <Zap className="size-3.5" aria-hidden="true" /> },
                  ]}
                />
              }
            />
            <Setting
              label={
                <span className="flex items-center gap-2">
                  <Gauge className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Minimum confidence
                </span>
              }
              hint={describeConfidence(preferences.minConfidence)}
              stacked
            >
              <Slider
                label="Minimum confidence"
                min={MIN_CONFIDENCE_RANGE[0]}
                max={MIN_CONFIDENCE_RANGE[1]}
                step={0.05}
                value={preferences.minConfidence}
                onChange={(minConfidence) => change({ minConfidence })}
                format={(value) => `${Math.round(value * 100)}%`}
              />
            </Setting>
            <Setting
              label={
                <span className="flex items-center gap-2">
                  <Timer className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Capture countdown
                </span>
              }
              hint="Seconds to get into position before the Trainer starts collecting frames."
              stacked
            >
              <Slider
                label="Capture countdown"
                min={COUNTDOWN_RANGE[0]}
                max={COUNTDOWN_RANGE[1]}
                step={1}
                value={preferences.captureCountdown}
                onChange={(captureCountdown) => change({ captureCountdown })}
                format={(value) => (value === 0 ? 'none' : `${value}s`)}
              />
            </Setting>
          </Panel>

          {/* --------------------------------------------------- overlay -- */}
          <Panel
            title="Video overlay"
            description="Where the sign appears on a video, before you drag it."
            icon={<Clapperboard className="size-4" aria-hidden="true" />}
          >
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* A live sketch of the placement, so the sliders mean something. */}
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border bg-black/85 sm:w-56">
                <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-40" />
                <div
                  className="absolute rounded-md border border-white/25 bg-primary/80"
                  style={{
                    left: `${preferences.overlay.x * 100}%`,
                    top: `${preferences.overlay.y * 100}%`,
                    width: `${preferences.overlay.width * 100}%`,
                    aspectRatio: preferences.overlay.caption ? '1 / 1.16' : '1 / 1',
                    opacity: preferences.overlay.opacity,
                  }}
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['Top left', 0.04, 0.06],
                      ['Top right', 0.68, 0.06],
                      ['Bottom left', 0.04, 0.52],
                      ['Bottom right', 0.68, 0.52],
                    ] as [string, number, number][]
                  ).map(([label, x, y]) => {
                    const active =
                      Math.abs(preferences.overlay.x - x) < 0.02 && Math.abs(preferences.overlay.y - y) < 0.02
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => change({ overlay: { x: Math.min(x, 1 - preferences.overlay.width), y } })}
                        className={cn(
                          'rounded-lg border px-2 py-1.5 text-xs transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'bg-card text-muted-foreground hover:border-border-strong hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <label className="flex flex-col gap-1.5 text-xs">
                  <span className="text-muted-foreground">Size</span>
                  <Slider
                    label="Overlay size"
                    min={0.12}
                    max={0.5}
                    step={0.01}
                    value={preferences.overlay.width}
                    onChange={(width) => change({ overlay: { width } })}
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs">
                  <span className="text-muted-foreground">Opacity</span>
                  <Slider
                    label="Overlay opacity"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={preferences.overlay.opacity}
                    onChange={(opacity) => change({ overlay: { opacity } })}
                    format={(value) => `${Math.round(value * 100)}%`}
                  />
                </label>
              </div>
            </div>
            <Setting
              label="Caption the word"
              hint="Shows the word being spoken under the sign, with the current letter marked."
              control={
                <Switch
                  label="Caption the word"
                  checked={preferences.overlay.caption}
                  onChange={(caption) => change({ overlay: { caption } })}
                />
              }
            />
          </Panel>
        </div>

        {/* --------------------------------------------------- this server -- */}
        <Section
          eyebrow="This installation"
          title="What this server can do"
          description="Optional parts are installed by whoever runs the server. Anything missing is named here with the one command that adds it."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(CAPABILITY_LABELS).map(([key, meta]) => {
              const capability = health?.capabilities?.[key]
              return (
                <div key={key} className="flex flex-col gap-2 rounded-xl border bg-elevated p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{meta.title}</span>
                    {capability ? (
                      <Badge tone={capability.available ? 'success' : 'warning'}>
                        {capability.available ? 'ready' : 'missing'}
                      </Badge>
                    ) : (
                      <Badge>checking</Badge>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{meta.what}</p>
                  {capability && !capability.available && (
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-[0.6875rem]">
                      {meta.install}
                    </code>
                  )}
                  {capability?.available && capability.detail && (
                    <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                      {capability.detail}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-elevated/60 px-4 py-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Server className="size-3.5" aria-hidden="true" />
              API {API_BASE}
            </span>
            {health && (
              <>
                <span>
                  Database <span className="font-mono text-foreground">{health.engine ?? 'unknown'}</span>
                </span>
                <span>
                  Version <span className="font-mono text-foreground">{health.version}</span>
                </span>
                <Badge tone={health.ok ? 'success' : 'danger'}>{health.ok ? 'healthy' : 'unhealthy'}</Badge>
              </>
            )}
          </div>
        </Section>
      </ScreenBody>
    </Screen>
  )
}
