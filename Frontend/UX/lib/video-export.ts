'use client'

import type { Placement } from '@/components/video/sign-overlay'
import { cueAt, type Cue, type TimedWord } from '@/lib/video'

/**
 * Renders the video with the sign overlay burned in, in the browser, and
 * hands back a WebM file.
 *
 * Nothing is uploaded. The video plays through once at the chosen speed
 * while every frame is drawn onto a canvas together with the overlay, and a
 * MediaRecorder captures that canvas plus the video's own audio. Real time
 * only: a two-minute video takes two minutes to export (less at 1.25x).
 */

export type ExportOptions = {
  video: HTMLVideoElement
  cues: Cue[]
  words: TimedWord[]
  /** symbol id -> object URL of its picture (null when none). */
  images: Record<string, string | null>
  placement: Placement
  showCaption: boolean
  rate: number
  onProgress: (fraction: number) => void
  signal?: AbortSignal
}

export function exportSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  )
}

function pickMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

async function loadImages(images: Record<string, string | null>) {
  const loaded: Record<string, HTMLImageElement> = {}
  await Promise.all(
    Object.entries(images).map(([id, url]) => {
      if (!url) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const image = new Image()
        image.onload = () => {
          loaded[id] = image
          resolve()
        }
        image.onerror = () => resolve()
        image.src = url
      })
    }),
  )
  return loaded
}

export async function exportWithSigns(options: ExportOptions): Promise<Blob> {
  const { video, cues, words, placement, showCaption, rate, onProgress, signal } = options
  if (!exportSupported()) throw new Error('This browser cannot record video from a canvas.')

  const width = video.videoWidth || 1280
  const height = video.videoHeight || 720
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not get a drawing context.')

  const pictures = await loadImages(options.images)

  // Video frames from the canvas; audio from the element itself, when the
  // browser lets us tap it (Chrome and Edge do).
  const stream = canvas.captureStream(30)
  const tapped = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.()
  tapped?.getAudioTracks().forEach((track) => stream.addTrack(track))

  const mime = pickMime()
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  // Remember where the person was, to put things back afterwards.
  const restore = { time: video.currentTime, rate: video.playbackRate, paused: video.paused }

  return new Promise<Blob>((resolve, reject) => {
    let stopped = false
    let frame = 0

    const finish = () => {
      if (stopped) return
      stopped = true
      cancelFrame()
      video.pause()
      if (recorder.state !== 'inactive') recorder.stop()
    }

    const fail = (error: Error) => {
      finish()
      cleanup()
      reject(error)
    }

    const cleanup = () => {
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      video.playbackRate = restore.rate
      video.currentTime = restore.time
      // The canvas stream is ours to stop. The tapped stream's tracks belong
      // to the <video> element itself: stopping those would silence the
      // player for the rest of the session.
      stream.getVideoTracks().forEach((track) => track.stop())
    }

    const onEnded = () => finish()
    const onError = () => fail(new Error('The video could not be played for export.'))
    const onAbort = () => fail(new DOMException('Export cancelled', 'AbortError'))

    recorder.onstop = () => {
      cleanup()
      if (signal?.aborted) return
      resolve(new Blob(chunks, { type: mime || 'video/webm' }))
    }
    recorder.onerror = () => fail(new Error('Recording failed.'))

    // Draw on every rendered video frame where the browser offers that hook,
    // otherwise on the animation clock.
    const hasVfc = 'requestVideoFrameCallback' in video
    const cancelFrame = () => {
      if (hasVfc) (video as HTMLVideoElement & { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback(frame)
      else cancelAnimationFrame(frame)
    }
    const schedule = () => {
      if (hasVfc) {
        frame = (video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number
        }).requestVideoFrameCallback(draw)
      } else {
        frame = requestAnimationFrame(draw)
      }
    }

    function draw() {
      if (stopped) return
      context!.drawImage(video, 0, 0, width, height)
      const now = video.currentTime
      const cue = cueAt(cues, now)
      drawOverlay(context!, width, height, placement, showCaption, cue, cue ? words[cue.wordIndex]?.text ?? '' : '', pictures)
      if (video.duration) onProgress(Math.min(1, now / video.duration))
      schedule()
    }

    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort)

    video.pause()
    video.currentTime = 0
    video.playbackRate = rate
    recorder.start(500)
    schedule()
    video.play().catch((cause) => fail(cause instanceof Error ? cause : new Error('Could not start playback.')))
  })
}

// ------------------------------------------------------------- drawing --

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

/** The same overlay the page shows, drawn in video pixels. */
function drawOverlay(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  placement: Placement,
  showCaption: boolean,
  cue: Cue | null,
  word: string,
  pictures: Record<string, HTMLImageElement>,
) {
  const boxW = Math.round(width * placement.width)
  const square = boxW
  const captionH = showCaption ? Math.round(boxW * 0.16) : 0
  const boxH = square + captionH
  const x = Math.round(width * placement.x)
  const y = Math.round(height * placement.y)
  const radius = Math.round(boxW * 0.06)

  context.save()
  context.globalAlpha = placement.opacity
  roundRect(context, x, y, boxW, boxH, radius)
  context.fillStyle = 'rgba(0, 0, 0, 0.78)'
  context.fill()
  context.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  context.lineWidth = Math.max(1, width / 900)
  context.stroke()

  context.save()
  roundRect(context, x, y, boxW, boxH, radius)
  context.clip()

  const symbol = cue?.step.kind === 'symbol' ? cue.step.symbol : null
  const picture = symbol ? pictures[symbol.id] : undefined
  const letter = cue?.step.kind === 'symbol' ? cue.step.text : cue?.step.kind === 'missing' ? cue.step.text : ''

  if (picture) {
    const scale = Math.min(square / picture.width, square / picture.height)
    const pw = picture.width * scale
    const ph = picture.height * scale
    context.drawImage(picture, x + (square - pw) / 2, y + (square - ph) / 2, pw, ph)
  } else if (letter) {
    context.fillStyle = cue?.step.kind === 'missing' ? 'rgb(245, 190, 84)' : 'rgba(255,255,255,0.75)'
    context.font = `600 ${Math.round(square * 0.42)}px ui-sans-serif, system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(letter, x + square / 2, y + square / 2)
  }

  // Letter progress strip along the bottom of the picture.
  if (cue && cue.count > 1) {
    const pad = Math.max(2, square * 0.02)
    const gap = Math.max(1, square * 0.01)
    const segW = (square - pad * 2 - gap * (cue.count - 1)) / cue.count
    for (let i = 0; i < cue.count; i += 1) {
      context.fillStyle = i <= cue.index ? 'rgb(226, 70, 70)' : 'rgba(255,255,255,0.28)'
      context.fillRect(x + pad + i * (segW + gap), y + square - pad - Math.max(2, square * 0.012), segW, Math.max(2, square * 0.012))
    }
  }

  if (showCaption) {
    const fontSize = Math.round(captionH * 0.5)
    context.font = `500 ${fontSize}px ui-sans-serif, system-ui, sans-serif`
    context.textBaseline = 'middle'
    context.textAlign = 'left'
    context.fillStyle = 'rgba(255,255,255,0.95)'
    const text = word || '…'
    const maxW = boxW - fontSize * 2.6
    context.fillText(fit(context, text, maxW), x + fontSize * 0.6, y + square + captionH / 2)
    if (letter) {
      context.textAlign = 'right'
      context.fillStyle = 'rgb(226, 70, 70)'
      context.font = `600 ${Math.round(fontSize * 0.8)}px ui-monospace, monospace`
      context.fillText(letter.toUpperCase(), x + boxW - fontSize * 0.6, y + square + captionH / 2)
    }
  }
  context.restore()
  context.restore()
}

function fit(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut}…`
}
