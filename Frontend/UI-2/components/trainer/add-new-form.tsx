"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, Info, Languages, MessageSquareText, Type } from "lucide-react"

const languageSuggestions = [
  "ASL — American Sign Language",
  "BSL — British Sign Language",
  "ISL — Indian Sign Language",
  "Auslan — Australian Sign Language",
  "LSF — French Sign Language",
  "JSL — Japanese Sign Language",
]

const phraseOptions = [
  { value: true, label: "Yes", hint: "Record multi-sign phrases as well as single signs" },
  { value: false, label: "No", hint: "Keep every entry to a single sign" },
]

export function AddNewForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [language, setLanguage] = useState("")
  const [phrasesIncluded, setPhrasesIncluded] = useState(true)

  const canSubmit = name.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const params = new URLSearchParams({
      name: name.trim(),
      language: language.trim(),
      phrases: phrasesIncluded ? "yes" : "no",
    })
    router.push(`/add-new/configure?${params.toString()}`)
  }

  const fieldClass =
    "w-full rounded-lg border border-input bg-background py-3 pl-11 pr-4 text-base outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15"

  return (
    <form
      onSubmit={handleSubmit}
      className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-ember to-iris" />

      <div className="flex flex-col gap-7 p-7 md:p-8">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-lg font-semibold tracking-tight">Vocabulary details</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Just the basics before you start recording. Everything here can be changed later.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <div className="relative">
            <Type
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kitchen basics"
              autoComplete="off"
              aria-describedby="name-hint"
              className={fieldClass}
            />
          </div>
          <p id="name-hint" className="text-xs text-muted-foreground">
            What you will call this set of signs — a room, a topic, or a class.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="language" className="text-sm font-medium text-foreground">
            Language
            <span className="ml-2 font-normal text-muted-foreground">optional</span>
          </label>
          <div className="relative">
            <Languages
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="language"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="ISL — Indian Sign Language"
              list="language-suggestions"
              autoComplete="off"
              aria-describedby="language-hint"
              className={fieldClass}
            />
            <datalist id="language-suggestions">
              {languageSuggestions.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <p id="language-hint" className="text-xs text-muted-foreground">
            Which sign language these gestures belong to. Start typing for suggestions.
          </p>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <MessageSquareText className="size-4 text-muted-foreground" />
            Phrases included?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {phraseOptions.map((option) => {
              const selected = phrasesIncluded === option.value
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setPhrasesIncluded(option.value)}
                  aria-pressed={selected}
                  className={`flex flex-col items-start gap-1 rounded-lg border px-4 py-3 text-left transition-all ${
                    selected
                      ? "border-primary bg-primary/8 ring-2 ring-primary/25"
                      : "border-input bg-background hover:border-primary/40 hover:bg-accent/40"
                  }`}
                >
                  <span
                    className={`text-base font-semibold ${selected ? "text-primary" : "text-foreground"}`}
                  >
                    {option.label}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">{option.hint}</span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="flex items-start gap-2.5 rounded-lg border border-ember/25 bg-ember/8 p-3.5">
          <Info className="mt-0.5 size-4 shrink-0 text-ember" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Aim for at least a few samples per sign, recorded in the lighting you will actually use. Variety beats volume.
          </p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="group mt-1 inline-flex items-center justify-center gap-2 self-start rounded-lg bg-gradient-to-r from-primary to-[oklch(0.5_0.2_12)] px-7 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:shadow-[0_10px_30px_-12px_oklch(0.5_0.2_22_/_0.8)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
        >
          Next
          <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-0.5 group-disabled:translate-x-0" />
        </button>
      </div>
    </form>
  )
}
