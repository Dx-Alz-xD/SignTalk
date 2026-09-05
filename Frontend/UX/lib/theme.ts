/**
 * Theme constants only — no hooks, no DOM.
 *
 * The root layout is a server component and needs the storage key to build its
 * pre-paint bootstrap script, so this file has to stay importable from the
 * server. The hook that uses these lives in `@/lib/use-theme`.
 */

export const THEME_STORAGE_KEY = 'signtalk-theme'

export type Theme = 'light' | 'dark' | 'system'
