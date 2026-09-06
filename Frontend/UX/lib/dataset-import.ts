'use client'

import { unzipSync } from 'fflate'
import { ImageHandTracker, type HandSample } from '@/lib/hand-tracker'
import {
  createSymbol,
  listSymbols,
  putSymbolImage,
  type Language,
  type Sign,
  type Symbol,
} from '@/lib/library'
import { storeSamples, type Sample } from '@/lib/training'

/**
 * Import a dataset of images into a sign, right here in the browser.
 *
 * Layout: one folder per symbol, images inside. A zip or a chosen folder both
 * work. Hand tracking runs on this machine (the same MediaPipe model the
 * camera uses) and only the landmarks go to the server - exactly what a
 * recorded capture sends - so an imported symbol is indistinguishable from a
 * trained one. If the language keeps reference pictures, the first image of
 * each symbol becomes its thumbnail.
 *
 * Mirrors backend/import_dataset.py, which does the same job server-side for
 * the built-in languages; this one exists so anyone can import their own
 * dataset without installing Python.
 */

export type ImportEntry = { path: string; bytes: () => Promise<Uint8Array> }

export type ImportProgress = {
  done: number
  total: number
  symbol: string
  detected: number
  missed: number
}

export type ImportReport = {
  images: number
  detected: number
  missed: number
  symbols: string[]
  failed: string[]
  views: Record<string, number>
}

export type ImportOptions = {
  language: Language
  sign: Sign
  /** Replace what each symbol already holds, instead of adding to it. */
  replace: boolean
  /** Keep one image per symbol as its reference picture. */
  pictures: boolean
  /** Use at most this many images per symbol (0 = all). */
  limitPerSymbol: number
  onProgress: (progress: ImportProgress) => void
  cancelled: () => boolean
}

const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif)$/i
const VIEW_TOKENS: Record<string, string> = {
  bot: 'bottom',
  bottom: 'bottom',
  top: 'top',
  left: 'left',
  right: 'right',
  dif: 'varied',
  front: 'front',
}
/** How many samples one request carries. Matches MAX_SAMPLES on the server. */
const CHUNK = 400
const THUMB_MAX_PX = 320

// ----------------------------------------------------------------- sources --

export async function entriesFromZip(file: File): Promise<ImportEntry[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const files = unzipSync(data, {
    filter: (entry) =>
      IMAGE_EXT.test(entry.name) &&
      !entry.name.includes('__MACOSX/') &&
      !entry.name.split('/').pop()!.startsWith('.'),
  })
  return Object.entries(files).map(([path, bytes]) => ({ path, bytes: async () => bytes }))
}

/** From a folder picker (`webkitdirectory`) or a multi-file picker. */
export function entriesFromFiles(files: FileList | File[]): ImportEntry[] {
  return Array.from(files)
    .filter((file) => IMAGE_EXT.test(file.name) && !file.name.startsWith('.'))
    .map((file) => ({
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      bytes: async () => new Uint8Array(await file.arrayBuffer()),
    }))
}

/**
 * Folder name -> images. The dataset's own top folder is stripped when every
 * path shares it (a zip of a folder), and folders that contain further folders
 * are skipped - some datasets ship a duplicate copy of themselves nested one
 * level down, which would otherwise double-count every sample.
 */
export function groupByClass(entries: ImportEntry[]): Map<string, ImportEntry[]> {
  let paths = entries.map((entry) => entry.path.replace(/\\/g, '/').split('/').filter(Boolean))
  const firsts = new Set(paths.map((parts) => parts[0]))
  if (firsts.size === 1 && paths.every((parts) => parts.length >= 3)) {
    paths = paths.map((parts) => parts.slice(1))
  }

  const groups = new Map<string, ImportEntry[]>()
  paths.forEach((parts, index) => {
    // Exactly folder/file: anything deeper is a nested copy or a stray.
    if (parts.length !== 2) return
    const name = parts[0]
    const list = groups.get(name) ?? []
    list.push(entries[index])
    groups.set(name, list)
  })
  return groups
}

export function viewFor(path: string): string {
  const stem = path.split('/').pop()!.replace(/\.[^.]+$/, '').toLowerCase()
  for (const token of stem.split(/[_\-\s]+/)) {
    if (VIEW_TOKENS[token]) return VIEW_TOKENS[token]
  }
  return 'front'
}

export function displayName(folder: string): string {
  return folder.length === 1 && /[a-z]/i.test(folder) ? folder.toUpperCase() : folder
}

// --------------------------------------------------------------- detection --

class Detector {
  private constructor(
    private tracker: ImageHandTracker,
    private canvas: HTMLCanvasElement,
  ) {}

  static async create(): Promise<Detector> {
    return new Detector(await ImageHandTracker.create(), document.createElement('canvas'))
  }

  /**
   * Hands in one image, trying a padding cascade first: tight crops starve
   * the palm detector of context, and padding out by a quarter rescues most
   * of them. The last attempt also upscales, which small frames need.
   */
  async hands(bytes: Uint8Array): Promise<{ hands: HandSample[]; bitmap: ImageBitmap } | null> {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
    } catch {
      return null
    }
    const attempts: { pad: number; size?: number }[] = [
      { pad: 0.25 },
      { pad: 0 },
      { pad: 0.35, size: 512 },
      { pad: 0.6, size: 640 },
    ]
    for (const attempt of attempts) {
      const source = this.prepare(bitmap, attempt.pad, attempt.size)
      const hands = this.tracker.detect(source)
      if (hands.length > 0) return { hands, bitmap }
    }
    return { hands: [], bitmap }
  }

  private prepare(bitmap: ImageBitmap, pad: number, size?: number): HTMLCanvasElement {
    const margin = Math.round(Math.max(bitmap.width, bitmap.height) * pad)
    const w = bitmap.width + margin * 2
    const h = bitmap.height + margin * 2
    const scale = size ? size / Math.max(w, h) : 1
    this.canvas.width = Math.round(w * scale)
    this.canvas.height = Math.round(h * scale)
    const context = this.canvas.getContext('2d')!
    context.imageSmoothingEnabled = true
    // Replicate the edge colour into the margin, roughly, by filling with the
    // image's top-left pixel; MediaPipe only needs context, not accuracy.
    context.drawImage(bitmap, 0, 0, 1, 1, 0, 0, this.canvas.width, this.canvas.height)
    context.drawImage(bitmap, margin * scale, margin * scale, bitmap.width * scale, bitmap.height * scale)
    return this.canvas
  }

  thumbnail(bitmap: ImageBitmap): { base64: string; width: number; height: number } {
    const scale = Math.min(1, THUMB_MAX_PX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), width: canvas.width, height: canvas.height }
  }

  close() {
    this.tracker.close()
  }
}

// ------------------------------------------------------------------ import --

export async function runImport(entries: ImportEntry[], options: ImportOptions): Promise<ImportReport> {
  const groups = groupByClass(entries)
  if (groups.size === 0) {
    throw new Error(
      'No symbol folders found. Expected one folder per symbol with images inside, e.g. a/, b/, hello/.',
    )
  }

  const report: ImportReport = { images: 0, detected: 0, missed: 0, symbols: [], failed: [], views: {} }
  const total = [...groups.values()].reduce(
    (sum, list) => sum + (options.limitPerSymbol ? Math.min(list.length, options.limitPerSymbol) : list.length),
    0,
  )
  let done = 0

  const existing = await listSymbols(options.sign.id)
  const byName = new Map(existing.map((symbol) => [symbol.name.toLowerCase(), symbol]))

  const detector = await Detector.create()
  try {
    for (const folder of [...groups.keys()].sort()) {
      if (options.cancelled()) break
      let items = groups.get(folder)!
      if (options.limitPerSymbol) items = items.slice(0, options.limitPerSymbol)
      const name = displayName(folder)

      const byView = new Map<string, Sample[]>()
      let thumbnail: ReturnType<Detector['thumbnail']> | null = null

      for (const entry of items) {
        if (options.cancelled()) break
        done += 1
        report.images += 1
        const found = await detector.hands(await entry.bytes())
        if (found && found.hands.length > 0) {
          report.detected += 1
          const view = viewFor(entry.path)
          const list = byView.get(view) ?? []
          list.push({ hands: found.hands })
          byView.set(view, list)
          if (!thumbnail && options.pictures) thumbnail = detector.thumbnail(found.bitmap)
        } else {
          report.missed += 1
        }
        found?.bitmap.close()
        options.onProgress({ done, total, symbol: name, detected: report.detected, missed: report.missed })
        // Let the UI breathe between images.
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      if (byView.size === 0) {
        report.failed.push(name)
        continue
      }

      let symbol: Symbol | undefined = byName.get(name.toLowerCase())
      if (!symbol) {
        symbol = await createSymbol(options.sign.id, name)
        byName.set(name.toLowerCase(), symbol)
      }

      for (const [view, samples] of byView) {
        for (let index = 0; index < samples.length; index += CHUNK) {
          await storeSamples(symbol.id, {
            view,
            samples: samples.slice(index, index + CHUNK),
            // Only the first chunk replaces; the rest append to it.
            replace: options.replace && index === 0,
          })
        }
        report.views[view] = (report.views[view] ?? 0) + samples.length
      }
      report.symbols.push(name)

      if (thumbnail && options.pictures) {
        try {
          await putSymbolImage(symbol.id, { mime: 'image/jpeg', ...thumbnail })
        } catch {
          // A missing picture is not worth failing the import over.
        }
      }
    }
  } finally {
    detector.close()
  }
  return report
}
