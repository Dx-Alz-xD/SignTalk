/**
 * Kept apart from the `useTheme` hook so the server-rendered bootstrap script
 * in the root layout can read the key without pulling a client module into the
 * server graph.
 */
export const THEME_STORAGE_KEY = 'signtalk-theme'
