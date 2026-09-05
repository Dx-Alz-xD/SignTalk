'use client'

import type React from 'react'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputBaseClass = cn(
  'h-11 w-full rounded-lg border border-input bg-elevated px-3.5 text-sm text-foreground',
  'shadow-[inset_0_1px_0_oklch(1_0_0/4%)] transition-[color,box-shadow,border-color,background-color] duration-150',
  'placeholder:text-muted-foreground/70',
  'hover:border-border-strong',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
)

export function AddNewForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('')
  const [phrasesIncluded, setPhrasesIncluded] = useState(true)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams({
      name,
      language,
      phrases: phrasesIncluded ? 'yes' : 'no',
    })
    router.push(`/add-new/configure?${params.toString()}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xl flex-col gap-6 rounded-xl border bg-elevated p-5 sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Everyday greetings"
          className={inputBaseClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="language" className="text-sm font-medium text-foreground">
          Language
        </label>
        <input
          id="language"
          type="text"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="ASL, ISL, BSL…"
          className={inputBaseClass}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-sm font-medium text-foreground">Phrases included?</span>
        <div className="grid grid-cols-2 gap-2.5">
          {[true, false].map((value) => {
            const active = phrasesIncluded === value
            return (
              <button
                key={String(value)}
                type="button"
                onClick={() => setPhrasesIncluded(value)}
                aria-pressed={active}
                className={cn(
                  'h-11 rounded-lg border text-sm font-medium transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
                  active
                    ? 'border-primary/45 bg-primary/10 text-primary'
                    : 'border-input bg-elevated text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
              >
                {value ? 'Yes' : 'No'}
              </button>
            )
          })}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Phrase vocabularies record whole expressions, not just single letters or words.
        </p>
      </div>

      <button
        type="submit"
        className={cn(
          'group inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg px-5',
          'bg-primary text-sm font-medium text-primary-foreground shadow-raised',
          'transition-all hover:bg-primary/90 active:translate-y-px',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
        )}
      >
        Continue
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </form>
  )
}
