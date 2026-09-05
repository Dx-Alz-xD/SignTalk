'use client'

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export const CODE_LENGTH = 6

export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid = false,
  disabled = false,
}: {
  value: string[]
  onChange: (next: string[]) => void
  /** Fires once the last empty box is filled, so the form can auto-submit. */
  onComplete?: (code: string) => void
  invalid?: boolean
  disabled?: boolean
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const completed = useRef(false)

  const filled = value.every((digit) => digit !== '')

  useEffect(() => {
    if (filled && !completed.current) {
      completed.current = true
      onComplete?.(value.join(''))
    }
    if (!filled) completed.current = false
  }, [filled, value, onComplete])

  function commit(index: number, digits: string) {
    if (!digits) {
      onChange(value.map((d, i) => (i === index ? '' : d)))
      return
    }
    const next = [...value]
    digits.split('').forEach((digit, offset) => {
      if (index + offset < CODE_LENGTH) next[index + offset] = digit
    })
    onChange(next)
    inputs.current[Math.min(index + digits.length, CODE_LENGTH - 1)]?.focus()
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault()
      inputs.current[index - 1]?.focus()
      onChange(value.map((d, i) => (i === index - 1 ? '' : d)))
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      inputs.current[index - 1]?.focus()
    }
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault()
      inputs.current[index + 1]?.focus()
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    event.preventDefault()
    commit(index, digits.slice(0, CODE_LENGTH - index))
  }

  return (
    <div className="flex gap-2 sm:gap-2.5">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={index === 0}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          maxLength={CODE_LENGTH}
          value={digit}
          onChange={(event) => commit(index, event.target.value.replace(/\D/g, ''))}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          className={cn(
            'h-14 w-full min-w-0 rounded-xl border bg-elevated text-center font-mono text-2xl font-semibold',
            'transition-[border-color,box-shadow,background-color] duration-150',
            'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
            'disabled:cursor-not-allowed disabled:opacity-55',
            digit ? 'border-border-strong' : 'border-input',
            invalid && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30',
          )}
        />
      ))}
    </div>
  )
}

export function emptyCode() {
  return Array<string>(CODE_LENGTH).fill('')
}
