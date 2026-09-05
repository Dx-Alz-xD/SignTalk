'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Download,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckboxControl } from '@/components/ui/checkbox'
import {
  availableLanguages,
  communityEntries,
  formatUploadedOn,
  languageNames,
  type CommunityEntry,
} from '@/lib/community-data'
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

export function CommunityDatabaseScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('uploadedOn')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const activeFilterCount =
    (filters.name ? 1 : 0) +
    (filters.author ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.languages.length ? 1 : 0)

  const rows = useMemo(() => {
    const name = filters.name.trim().toLowerCase()
    const author = filters.author.trim().toLowerCase()

    const filtered = communityEntries.filter((entry) => {
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
  }, [filters, sortKey, sortDirection])

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

  function download() {
    const chosen = communityEntries.filter((entry) => selected.includes(entry.id))
    if (!chosen.length) return

    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
    const csv = [
      ['Name', 'Author', 'Uploaded on', 'Language'].join(','),
      ...chosen.map((entry) =>
        [entry.name, entry.author, entry.uploadedOn, entry.language].map(escape).join(','),
      ),
    ].join('\n')

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `signtalk-community-${chosen.length}-sets.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight">Community Database</h2>
            <p className="text-xs text-muted-foreground">
              {rows.length} of {communityEntries.length} sets
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
                {availableLanguages.map((code) => {
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
                  <p className="text-sm font-medium">No sets match these filters</p>
                  <button
                    type="button"
                    onClick={() => setFilters(emptyFilters)}
                    className="mt-1.5 text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear all filters
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {selected.length > 0
            ? `${selected.length} set${selected.length > 1 ? 's' : ''} selected`
            : 'Select sets to download'}
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
          <Button type="button" size="lg" onClick={download} disabled={selected.length === 0}>
            <Download className="size-4" aria-hidden="true" />
            Download
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
        {entry.name}
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
