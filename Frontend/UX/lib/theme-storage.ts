/**
 * Shared between the server-rendered bootstrap script in the root layout and
 * the client-side theme hook, so it must stay free of React imports.
 */
export const THEME_STORAGE_KEY = 'signtalk-theme'

/** Light, dark, or whatever the device is set to. */
export type Theme = 'light' | 'dark' | 'system'
