'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckboxControl } from '@/components/ui/checkbox'
import { FormAlert } from '@/components/form-alert'
import {
  availableLanguages,
  formatUploadedOn,
  languageNames,
  toEntry,
  type CommunityEntry,
} from '@/lib/community-data'
import { errorMessage } from '@/lib/api'
import { browseCommunity, installLanguage } from '@/lib/library'
import { cn } from '@/lib/utils'

type SortKey = 'name' | 'author' | 'uploadedOn' | 'language'
type SortDirection = 'asc' | 'desc'

type Filters = {
  name: string
  author: string
  from: string
  to: string
  languages: string[]
}

const emptyFilters: Filters = { name: '', author: '', from: '', to: '', languages: [] }

const columns: { key: SortKey; label: string; width: string }[] = [
  { key: 'name', label: 'Name', width: 'w-[38%]' },
  { key: 'author', label: 'Author', width: 'w-[22%]' },
  { key: 'uploadedOn', label: 'Uploaded on', width: 'w-[20%]' },
  { key: 'language', label: 'Language', width: 'w-[12%]' },
]

export function CommunityDatabaseScreen({
  // THE ONE DIVERGENCE FROM Frontend/UX: no default here, and the back button
  // below is conditional. This app is a single page with nothing behind it, so
  // history.back() would be a dead control. Keep the rest byte-identical so
  // re-syncing stays a straight copy.
  onBack,
}: {
  onBack?: () => void
}) {
  const [entries, setEntries] = useState<CommunityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('uploadedOn')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const load = useCallback(async (signal?: AbortSignal) => {
    const published = await browseCommunity('', signal)
    if (!signal?.aborted) setEntries(published.map(toEntry))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) setFailure(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [load])

  const activeFilterCount =
    (filters.name ? 1 : 0) +
    (filters.author ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.languages.length ? 1 : 0)

  const rows = useMemo(() => {
    const name = filters.name.trim().toLowerCase()
    const author = filters.author.trim().toLowerCase()

    const filtered = entries.filter((entry) => {
      if (name && !entry.name.toLowerCase().includes(name)) return false
      if (author && !entry.author.toLowerCase().includes(author)) return false
      if (filters.from && entry.uploadedOn < filters.from) return false
      if (filters.to && entry.uploadedOn > filters.to) return false
      if (filters.languages.length && !filters.languages.includes(entry.language)) return false
      return true
    })

    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      // ISO dates and codes both compare correctly as plain strings.
      const compared = a[sortKey].localeCompare(b[sortKey], undefined, { numeric: true })
      return compared * direction
    })
  }, [entries, filters, sortKey, sortDirection])

  // Your own languages and ones already installed are not installable again.
  const installable = entries.filter(
    (entry) => selected.includes(entry.id) && !entry.installed && !entry.mine,
  ).length

  // Selections survive filtering, so only count the ones currently on screen.
  const visibleIds = rows.map((row) => row.id)
  const visibleSelected = visibleIds.filter((id) => selected.includes(id))
  const allVisibleSelected = visibleIds.length > 0 && visibleSelected.length === visibleIds.length

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  function toggleRow(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function toggleAllVisible() {
    setSelected((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    )
  }

  function toggleLanguage(code: string) {
    setFilters((current) => ({
      ...current,
      languages: current.languages.includes(code)
        ? current.languages.filter((value) => value !== code)
        : [...current.languages, code],
    }))
  }

  /** Copies the ticked languages into this account, samples and all. */
  async function install() {
    const chosen = entries.filter(
      (entry) => selected.includes(entry.id) && !entry.installed && !entry.mine,
    )
    if (!chosen.length) return

    setInstalling(true)
    setFailure(null)
    setNotice(null)
    const done: string[] = []
    try {
      // One at a time: a failure part-way through still leaves the copies that
      // did land, and the message can say exactly how far it got.
      for (const entry of chosen) {
        await installLanguage(entry.id)
        done.push(entry.name)
      }
      setNotice(
        `Installed ${done.length} language${done.length === 1 ? '' : 's'} — ` +
          `${done.join(', ')}. Open the Trainer to use ${done.length === 1 ? 'it' : 'them'}.`,
      )
      setSelected([])
      await load()
    } catch (cause) {
      setFailure(
        done.length
          ? `${errorMessage(cause)} (installed ${done.join(', ')} first.)`
          : errorMessage(cause),
      )
      if (done.length) await load().catch(() => undefined)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to your workspace"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">Community Database</h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} of {entries.length} published
              {selected.length > 0 && ` · ${selected.length} selected`}
            </p>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters(emptyFilters)}
            className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
      </header>

      {(failure || notice || loading) && (
        <div className="shrink-0 px-5 pt-4 sm:px-8">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading the community database&hellip;
            </p>
          )}
          {failure && <FormAlert>{failure}</FormAlert>}
          {notice && <FormAlert tone="success">{notice}</FormAlert>}
        </div>
      )}

      {filtersOpen && (
        <div className="shrink-0 border-b bg-elevated/60 px-5 py-4 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-name">Name</Label>
              <Input
                id="filter-name"
                value={filters.name}
                placeholder="Search names"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="filter-author">Author</Label>
              <Input
                id="filter-author"
                value={filters.author}
                placeholder="Search authors"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, author: event.target.value }))
                }
              />
            </div>
            {/* Stacked: a native date input won't shrink below ~155px, so two
                of them side by side overflow this column and collide with the
                next one. */}
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-[0.8125rem] font-medium leading-none">Uploaded between</span>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs text-muted-foreground">From</span>
                  <Input
                    id="filter-from"
                    type="date"
                    aria-label="Uploaded from"
                    value={filters.from}
                    max={filters.to || undefined}
                    className="min-w-0 flex-1"
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, from: event.target.value }))
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs text-muted-foreground">To</span>
                  <Input
                    type="date"
                    aria-label="Uploaded until"
                    value={filters.to}
                    min={filters.from || undefined}
                    className="min-w-0 flex-1"
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, to: event.target.value }))
                    }
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[0.8125rem] font-medium leading-none">Language</span>
              <div className="flex flex-wrap gap-1.5">
                {availableLanguages(entries).map((code) => {
                  const active = filters.languages.includes(code)
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleLanguage(code)}
                      aria-pressed={active}
                      title={languageNames[code] ?? code}
                      className={cn(
                        'rounded-md border px-2 py-1 font-mono text-[0.6875rem] transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-elevated text-muted-foreground hover:border-border-strong hover:text-foreground',
                      )}
                    >
                      {code}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b">
              {columns.map((column) => {
                const active = sortKey === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn('px-3 py-0 font-medium first:pl-5 sm:first:pl-8', column.width)}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      aria-label={`Sort by ${column.label}`}
                      className={cn(
                        'group flex w-full items-center gap-1.5 py-3 text-xs uppercase tracking-wider transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {column.label}
                      {active ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="size-3.5 text-primary" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="size-3.5 text-primary" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown
                          className="size-3 opacity-0 transition-opacity group-hover:opacity-60"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="w-[8%] px-3 py-3 pr-5 sm:pr-8">
                <span className="flex justify-end">
                  <CheckboxControl
                    checked={allVisibleSelected}
                    indeterminate={visibleSelected.length > 0 && !allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible rows"
                  />
                </span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                selected={selected.includes(entry.id)}
                onToggle={() => toggleRow(entry.id)}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-16 text-center">
                  {/* An empty table has four different causes, and blaming the
                      filters for all of them sends people to clear filters that
                      were never the problem. */}
                  {loading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading published languages&hellip;
                    </p>
                  ) : failure ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing to show &mdash; the list could not be loaded.
                    </p>
                  ) : entries.length === 0 ? (
                    <>
                      <p className="text-sm font-medium">Nothing published yet</p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Languages shared to the community database will appear here.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium">No sets match these filters</p>
                      <button
                        type="button"
                        onClick={() => setFilters(emptyFilters)}
                        className="mt-1.5 text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Clear all filters
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {installable > 0
            ? `${installable} set${installable > 1 ? 's' : ''} ready to install`
            : selected.length > 0
              ? 'Those are already yours'
              : 'Select sets to install'}
        </p>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={() => void install()}
            disabled={installable === 0 || installing}
          >
            {installing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            {installing ? 'Installing…' : 'Install'}
          </Button>
        </div>
      </footer>
    </div>
  )
}

function Row({
  entry,
  selected,
  onToggle,
}: {
  entry: CommunityEntry
  selected: boolean
  onToggle: () => void
}) {
  return (
    <tr
      onClick={onToggle}
      className={cn(
        'cursor-pointer border-b transition-colors last:border-b-0',
        selected ? 'bg-primary/[0.07]' : 'hover:bg-muted/40',
      )}
    >
      <td className="truncate py-3 pl-5 pr-3 font-medium sm:pl-8" title={entry.name}>
        <span className="flex items-center gap-2">
          <span className="truncate">{entry.name}</span>
          {entry.mine ? (
            <span className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase text-muted-foreground">
              Yours
            </span>
          ) : entry.installed ? (
            <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Installed
            </span>
          ) : null}
        </span>
        <span className="block text-xs text-muted-foreground">
          {entry.signs} sign{entry.signs === 1 ? '' : 's'} · {entry.samples} samples
        </span>
      </td>
      <td className="truncate px-3 py-3 font-mono text-[0.8125rem] text-muted-foreground">
        {entry.author}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
        {formatUploadedOn(entry.uploadedOn)}
      </td>
      <td className="px-3 py-3">
        <span
          title={languageNames[entry.language] ?? entry.language}
          className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.6875rem] font-medium text-primary"
        >
          {entry.language}
        </span>
      </td>
      <td className="px-3 py-3 pr-5 sm:pr-8">
        <span className="flex justify-end">
          <CheckboxControl
            checked={selected}
            onChange={onToggle}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${entry.name}`}
          />
        </span>
      </td>
    </tr>
  )
}
