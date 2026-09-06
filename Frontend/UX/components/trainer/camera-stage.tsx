'use client'

import { useEffect, useRef, useState } from 'react'
import { HandTracker, HAND_CONNECTIONS, type HandSample } from '@/lib/hand-tracker'
import { usePreferences } from '@/components/session'

export type CameraState = 'off' | 'starting' | 'live' | 'failed'

/**
 * Owns the camera, the tracker and the render loop.
 *
 * Everything downstream is landmarks, so this is the only place that touches a
 * pixel. The frame is drawn mirrored into a canvas and *that canvas* is what
 * gets tracked, see the note in lib/hand-tracker.ts for why the mirror has to
 * happen before tracking rather than in CSS.
 */
export function useCameraStage({
  active,
  onFrame,
}: {
  active: boolean
  /** Called once per tracked frame, on the render loop. */
  onFrame: (hands: HandSample[]) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<CameraState>('off')
  const [error, setError] = useState<string | null>(null)
  const [fps, setFps] = useState(0)

  const { cameraDeviceId, mirrorPreview, showSkeleton } = usePreferences()

  // The loop reads these through refs so that changing the callback does not
  // tear down and restart the camera.
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame
  const skeletonRef = useRef(showSkeleton)
  skeletonRef.current = showSkeleton

  /**
   * The tracked canvas is always mirrored, because the models were trained on
   * a mirrored image and un-mirroring it would move every landmark into a
   * space they have never seen. Someone who prefers an unmirrored preview gets
   * the *display* flipped back with a transform, which the tracker never sees.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) canvas.style.transform = mirrorPreview ? '' : 'scaleX(-1)'
  }, [mirrorPreview, state])

  useEffect(() => {
    if (!active) {
      setState('off')
      return
    }

    let stream: MediaStream | null = null
    let tracker: HandTracker | null = null
    let raf = 0
    let stopped = false
    let last = performance.now()
    let smoothed = 0

    async function start() {
      setState('starting')
      setError(null)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 960 },
            height: { ideal: 540 },
            // A chosen camera is a request, not a demand: an unplugged one
            // must fall back rather than fail the whole session.
            ...(cameraDeviceId ? { deviceId: { ideal: cameraDeviceId } } : { facingMode: 'user' }),
          },
          audio: false,
        })
        if (stopped) return

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        tracker = await HandTracker.create()
        if (stopped) return
        setState('live')
        raf = requestAnimationFrame(loop)
      } catch (cause) {
        if (stopped) return
        setState('failed')
        setError(describe(cause))
      }
    }

    function loop() {
      raf = requestAnimationFrame(loop)

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || !tracker || video.readyState < 2) return

      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) return
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      const context = canvas.getContext('2d')
      if (!context) return

      // Mirror here, not in CSS: the tracker reads this canvas, and the
      // landmarks have to come from the same mirrored image the desktop
      // detector trains on.
      context.save()
      context.translate(width, 0)
      context.scale(-1, 1)
      context.drawImage(video, 0, 0, width, height)
      context.restore()

      const hands = tracker.detect(canvas, performance.now())
      if (skeletonRef.current) drawSkeleton(context, hands, width, height)
      onFrameRef.current(hands)

      const now = performance.now()
      const delta = now - last
      last = now
      if (delta > 0) {
        smoothed = smoothed === 0 ? 1000 / delta : smoothed * 0.9 + (1000 / delta) * 0.1
        setFps(Math.round(smoothed))
      }
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      tracker?.close()
      stream?.getTracks().forEach((track) => track.stop())
      const video = videoRef.current
      if (video) video.srcObject = null
    }
  }, [active, cameraDeviceId])

  // Retrying is just turning the camera off and on again: the effect keys on
  // `active`, so the caller's existing toggle already re-runs the whole setup.
  return { videoRef, canvasRef, state, error, fps }
}

/** getUserMedia's DOMException names are specific; the messages are not. */
function describe(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError') {
    return 'Camera access was blocked. Allow it in your browser’s site settings, then try again.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera found. Plug one in and try again.'
  }
  if (name === 'NotReadableError') {
    return 'Another app is using the camera. Close it and try again.'
  }
  if (cause instanceof Error && cause.message) {
    return `Could not start hand tracking: ${cause.message}`
  }
  return 'Could not start the camera.'
}

const DOT = 'oklch(0.72 0.19 22)'
const BONE = 'rgba(255, 255, 255, 0.75)'

function drawSkeleton(
  context: CanvasRenderingContext2D,
  hands: HandSample[],
  width: number,
  height: number,
) {
  context.lineWidth = Math.max(2, width / 320)
  context.strokeStyle = BONE
  context.fillStyle = DOT

  for (const hand of hands) {
    for (const bone of HAND_CONNECTIONS) {
      const from = hand.landmarks[bone.start]
      const to = hand.landmarks[bone.end]
      if (!from || !to) continue
      context.beginPath()
      context.moveTo(from[0] * width, from[1] * height)
      context.lineTo(to[0] * width, to[1] * height)
      context.stroke()
    }
    for (const point of hand.landmarks) {
      context.beginPath()
      context.arc(point[0] * width, point[1] * height, Math.max(3, width / 240), 0, Math.PI * 2)
      context.fill()
    }
  }
}
