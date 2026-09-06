'use client'

import { useCallback, useEffect, useState } from 'react'
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme-storage'

function systemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Put a theme on the page. Exported because the account's own setting arrives
 * after the inline bootstrap script has already applied this device's, and it
 * has to win.
 */
export function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? systemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Private mode: it applies for this page load either way.
  }
}

const apply = applyTheme

export type { Theme }

/**
 * Reads the theme the inline bootstrap script already applied, so the first
 * client render agrees with the server markup.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setThemeState(stored)
    }
  }, [])

  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the theme still applies.
    }
    apply(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(
      (theme === 'system' ? systemTheme() : theme) === 'dark' ? 'light' : 'dark',
    )
  }, [theme, setTheme])

  const resolved = theme === 'system' ? systemTheme() : theme

  return { theme, resolved, setTheme, toggle }
}
