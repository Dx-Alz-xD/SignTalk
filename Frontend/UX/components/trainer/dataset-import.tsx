'use client'

import { useRef, useState } from 'react'
import { FileArchive, FolderOpen, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormAlert } from '@/components/form-alert'
import { errorMessage } from '@/lib/api'
import {
  entriesFromFiles,
  entriesFromZip,
  groupByClass,
  runImport,
  type ImportEntry,
  type ImportProgress,
  type ImportReport,
} from '@/lib/dataset-import'
import type { Language, Sign } from '@/lib/library'
import { cn } from '@/lib/utils'

/**
 * Import a folder or zip of images into this sign. Everything runs in the
 * browser - see lib/dataset-import.ts - so nothing but landmarks is uploaded.
 */
export function DatasetImport({
  language,
  sign,
  onDone,
  onClose,
}: {
  language: Language
  sign: Sign
  /** Something changed on the server; the caller refreshes its lists. */
  onDone: () => void
  onClose: () => void
}) {
  const [entries, setEntries] = useState<ImportEntry[] | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [replace, setReplace] = useState(false)
  const [pictures, setPictures] = useState(language.gesture_translation)
  const [limit, setLimit] = useState(0)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const cancelRef = useRef(false)

  const preview = entries ? groupByClass(entries) : null

  async function pickZip(file: File | undefined) {
    if (!file) return
    setFailure(null)
    setReport(null)
    try {
      setEntries(await entriesFromZip(file))
      setSourceName(file.name)
    } catch (cause) {
      setFailure(`Could not read that zip: ${errorMessage(cause)}`)
    }
  }

  function pickFolder(files: FileList | null) {
    if (!files || files.length === 0) return
    setFailure(null)
    setReport(null)
    const found = entriesFromFiles(files)
    setEntries(found)
    const first = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath
    setSourceName(first ? first.split('/')[0] : `${files.length} files`)
  }

  async function start() {
    if (!entries) return
    cancelRef.current = false
    setRunning(true)
    setFailure(null)
    setReport(null)
    try {
      const result = await runImport(entries, {
        language,
        sign,
        replace,
        pictures: pictures && language.gesture_translation,
        limitPerSymbol: limit,
        onProgress: setProgress,
        cancelled: () => cancelRef.current,
      })
      setReport(result)
      onDone()
    } catch (cause) {
      setFailure(errorMessage(cause))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-elevated p-4" aria-label="Import a dataset">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 font-semibold tracking-tight">
            <Upload className="size-4 text-primary" aria-hidden="true" />
            Import a dataset into {sign.name}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            One folder per symbol, images inside (a/, b/, hello/…). Hands are tracked here in
            your browser; only landmarks are sent, like a recording.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={running}
          aria-label="Close import"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {failure && <FormAlert>{failure}</FormAlert>}

      <div className="grid gap-2 sm:grid-cols-2">
        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:border-border-strong hover:bg-muted/40',
            running && 'pointer-events-none opacity-50',
          )}
        >
          <FileArchive className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Choose a .zip</span>
            <span className="text-xs text-muted-foreground">Folders inside become symbols</span>
          </span>
          <input
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(event) => void pickZip(event.target.files?.[0])}
          />
        </label>

        <label
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors hover:border-border-strong hover:bg-muted/40',
            running && 'pointer-events-none opacity-50',
          )}
        >
          <FolderOpen className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Choose a folder</span>
            <span className="text-xs text-muted-foreground">Pick the dataset&rsquo;s top folder</span>
          </span>
          <input
            type="file"
            className="sr-only"
            // Non-standard but supported by every current browser.
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            multiple
            onChange={(event) => pickFolder(event.target.files)}
          />
        </label>
      </div>

      {preview && (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
          <p className="text-sm">
            <span className="font-medium">{sourceName}</span>
            <span className="text-muted-foreground">
              {' · '}{entries!.length} image{entries!.length === 1 ? '' : 's'} in {preview.size} symbol
              folder{preview.size === 1 ? '' : 's'}
            </span>
          </p>
          {preview.size === 0 ? (
            <p className="text-xs text-warning">
              No symbol folders found. The images must sit inside folders named after the symbol.
            </p>
          ) : (
            <p className="font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
              {[...preview.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 40)
                .map(([name, list]) => `${name}:${list.length}`)
                .join('  ')}
              {preview.size > 40 && '  …'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Checkbox checked={replace} onChange={(event) => setReplace(event.target.checked)} disabled={running}>
              Replace existing samples of these symbols
            </Checkbox>
            <Checkbox
              checked={pictures && language.gesture_translation}
              onChange={(event) => setPictures(event.target.checked)}
              disabled={running || !language.gesture_translation}
            >
              Keep a picture per symbol
              {!language.gesture_translation && (
                <span className="text-muted-foreground"> (turn on gesture translation first)</span>
              )}
            </Checkbox>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Images per symbol
              <input
                type="number"
                min={0}
                step={10}
                value={limit}
                disabled={running}
                onChange={(event) => setLimit(Math.max(0, Number(event.target.value) || 0))}
                className="h-8 w-20 rounded-md border border-input bg-elevated px-2 font-mono text-xs text-foreground"
                aria-label="Images per symbol, 0 for all"
              />
              <span className="text-xs">0 = all</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {running ? (
              <Button variant="outline" size="lg" onClick={() => (cancelRef.current = true)}>
                <X aria-hidden="true" />
                Stop
              </Button>
            ) : (
              <Button size="lg" onClick={() => void start()} disabled={preview.size === 0}>
                <Upload aria-hidden="true" />
                Import {entries!.length} image{entries!.length === 1 ? '' : 's'}
              </Button>
            )}
            {progress && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {progress.symbol} · {progress.done}/{progress.total} · {progress.detected} hands found
              </span>
            )}
          </div>

          {progress && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {report && (
        <FormAlert tone={report.symbols.length > 0 ? 'success' : 'error'}>
          {report.detected} of {report.images} images had a detectable hand. {report.symbols.length} symbol
          {report.symbols.length === 1 ? '' : 's'} updated
          {Object.keys(report.views).length > 0 &&
            ` (${Object.entries(report.views)
              .map(([view, count]) => `${view} ${count}`)
              .join(', ')})`}
          .{report.failed.length > 0 && ` No usable hand in any image for: ${report.failed.join(', ')}.`}
        </FormAlert>
      )}
    </section>
  )
}
