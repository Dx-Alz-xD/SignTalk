'use client'

/**
 * Pull the soundtrack out of a video file, in the browser, as a 16 kHz mono
 * 16-bit WAV - the smallest thing the transcriber can work from (about 2 MB
 * per minute) and the only thing that has to leave this machine. The video
 * itself never does.
 *
 * Chrome, Edge and Firefox all let decodeAudioData read the audio track out of
 * an MP4/WebM/MOV container directly. When one cannot (an unusual codec), the
 * caller falls back to uploading the whole file for the server to decode.
 */

export const TARGET_RATE = 16000

export async function extractWav(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer()

  // decodeAudioData needs a live context; the offline one below does the
  // downmix and resample in one pass.
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(bytes.slice(0))
  } finally {
    await context.close().catch(() => undefined)
  }

  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE))
  const offline = new OfflineAudioContext(1, length, TARGET_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()

  return encodeWav(rendered.getChannelData(0), TARGET_RATE)
}

/** Float samples in [-1, 1] -> RIFF/WAVE, PCM 16-bit, mono. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
