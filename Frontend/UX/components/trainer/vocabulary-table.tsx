'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Globe, Hand, Layers, Lock, Pencil, Plus, Search, SearchX, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/surface'
import { languageTag, type Language, type Sign } from '@/lib/library'

export type Vocabulary = { sign: Sign; language: Language }

/**
 * Every vocabulary the signed-in user owns, live from the database.
 *
 * One row per sign, with its language's settings alongside, the language is
 * what carries hand control and sample size, and both matter when deciding
 * which row to open.
 */
export function VocabularyTable({
  vocabularies,
  onOpen,
  onEdit,
  onDelete,
  onCreate,
}: {
  vocabularies: Vocabulary[]
  /** Straight to recording. */
  onOpen: (vocabulary: Vocabulary) => void
  /** Back to the details form first, to change name, hands or sample size. */
  onEdit: (vocabulary: Vocabulary) => void
  /** Delete the vocabulary and everything in it. Confirmed inline first. */
  onDelete: (vocabulary: Vocabulary) => Promise<void>
  onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const [arming, setArming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return vocabularies
    return vocabularies.filter(
      ({ sign, language }) =>
        sign.name.toLowerCase().includes(term) ||
        language.name.toLowerCase().includes(term) ||
        languageTag(language).toLowerCase().includes(term),
    )
  }, [query, vocabularies])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button size="lg" onClick={onCreate}>
          <Plus aria-hidden="true" />
          New sign language
        </Button>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, language or tag"
            aria-label="Search vocabularies"
            className={cn(
              'h-9 w-full rounded-lg border border-input bg-elevated pl-9 pr-8 text-sm text-foreground',
              'shadow-[inset_0_1px_0_oklch(1_0_0/4%)] transition-[color,box-shadow,border-color,background-color] duration-150',
              'placeholder:text-muted-foreground/70 hover:border-border-strong',
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

      {vocabularies.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" aria-hidden="true" />}
          title="Nothing trained yet"
          description="Create a sign language to get started: name it, say which hands it uses, then record the signs one at a time. Installing one from the Community works too."
          actions={
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden="true" />
              New sign language
            </Button>
          }
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" aria-hidden="true" />}
          title={`Nothing matches “${query}”`}
          description="Search looks at the vocabulary name, the language and its tag."
          actions={
            <Button size="sm" variant="outline" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-elevated">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <Th className="w-14 text-right">S.No</Th>
                  <Th>Name</Th>
                  <Th className="w-44">Language</Th>
                  <Th className="w-28">Hands</Th>
                  <Th className="w-24 text-right">Samples</Th>
                  <Th className="w-24 text-right">Shared</Th>
                  <Th className="w-28 text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((vocabulary, index) => {
                  const { sign, language } = vocabulary
                  return (
                    <tr
                      key={sign.id}
                      className="border-b last:border-b-0 transition-colors hover:bg-muted/40"
                    >
                      <Td className="text-right font-mono text-xs text-muted-foreground">
                        {index + 1}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => onOpen(vocabulary)}
                          className="rounded-sm text-left font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {sign.name}
                        </button>
                        <span className="block text-xs text-muted-foreground">
                          {sign.symbol_count} symbol{sign.symbol_count === 1 ? '' : 's'}
                        </span>
                      </Td>
                      <Td>
                        <span className="block text-sm text-foreground">{language.name}</span>
                        <span className="block truncate text-xs text-muted-foreground" title={languageTag(language)}>
                          {languageTag(language)}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Hand className="size-3.5" aria-hidden="true" />
                          {language.hand_control}
                        </span>
                      </Td>
                      <Td className="text-right font-mono text-xs text-muted-foreground">
                        {language.sample_count}
                      </Td>
                      <Td className="text-right">
                        {language.visibility === 'public' ? (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-success"
                            title="Published to the community database"
                          >
                            <Globe className="size-3.5" aria-hidden="true" />
                            Public
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3.5" aria-hidden="true" />
                            Private
                          </span>
                        )}
                      </Td>
                      <Td className="text-right">
                        {arming === sign.id ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-xs text-muted-foreground">Delete for good?</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleting === sign.id}
                              onClick={() => {
                                setDeleting(sign.id)
                                void onDelete(vocabulary).finally(() => {
                                  setDeleting(null)
                                  setArming(null)
                                })
                              }}
                            >
                              {deleting === sign.id ? 'Deleting…' : 'Delete'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setArming(null)}>
                              Keep
                            </Button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center">
                            <button
                              type="button"
                              onClick={() => onEdit(vocabulary)}
                              aria-label={`Edit ${sign.name}`}
                              title={`Edit ${sign.name}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setArming(sign.id)}
                              aria-label={`Delete ${sign.name}`}
                              title={`Delete ${sign.name} and everything in it`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </span>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-top', className)}>{children}</td>
}
