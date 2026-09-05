'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, Search, X } from 'lucide-react'
import { Chip } from '@/components/trainer/action-card'
import { vocabularies } from '@/lib/vocabularies'
import { cn } from '@/lib/utils'

export function VocabularyTable() {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return vocabularies
    return vocabularies.filter(
      (vocabulary) =>
        vocabulary.name.toLowerCase().includes(term) ||
        vocabulary.language.toLowerCase().includes(term),
    )
  }, [query])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/add-new"
          aria-label="Add new vocabulary"
          title="Add new vocabulary"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-raised transition-all hover:bg-primary/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
        >
          <Plus className="size-4" />
        </Link>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or language"
            aria-label="Search vocabularies"
            className={cn(
              'h-9 w-full rounded-lg border border-input bg-elevated pl-9 pr-8 text-sm text-foreground',
              'shadow-[inset_0_1px_0_oklch(1_0_0/4%)] transition-[color,box-shadow,border-color,background-color] duration-150',
              'placeholder:text-muted-foreground/70',
              'hover:border-border-strong',
              'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
              '[&::-webkit-search-cancel-button]:appearance-none',
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-elevated">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b bg-secondary/50">
                <Th className="w-14 text-right">S.No</Th>
                <Th>Name</Th>
                <Th className="w-32">Language</Th>
                <Th className="w-20 text-right">Edit</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((vocabulary, index) => (
                <tr
                  key={vocabulary.id}
                  className="group border-b transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3 text-right align-middle font-mono text-[0.6875rem] text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium tracking-tight">{vocabulary.name}</span>
                      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
                        {vocabulary.signs} signs{vocabulary.phrases ? ' · phrases' : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Chip>{vocabulary.language}</Chip>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <Link
                      href={{
                        pathname: '/add-new/configure',
                        query: {
                          name: vocabulary.name,
                          language: vocabulary.language,
                          phrases: vocabulary.phrases ? 'yes' : 'no',
                        },
                      }}
                      aria-label={`Edit ${vocabulary.name}`}
                      className="inline-flex size-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all hover:border-input hover:bg-card hover:text-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                    >
                      <Pencil className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}

              {results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center">
                    <p className="text-sm font-medium">No matches</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nothing here matches “{query.trim()}”.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted-foreground">
        {query.trim()
          ? `${results.length} of ${vocabularies.length} shown`
          : `${vocabularies.length} stored on this device`}
      </p>
    </>
  )
}

function Th({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 font-mono text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}
