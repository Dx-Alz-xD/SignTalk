/**
 * The seam between the web app and the desktop shell.
 *
 * In a browser, a page can only type into its own text fields. The desktop
 * build (desktop/, Electron) can go further: its preload script exposes
 * `window.signtalk`, and Direct Paste uses it to type into whatever
 * application is focused - a chat window, a document, a terminal.
 *
 * Nothing here assumes the bridge exists. Every caller checks first and falls
 * back to in-page behaviour, so the same screen works on the website.
 */

export type DesktopBridge = {
  /** Type text into the focused window, as if from the keyboard. */
  typeText: (text: string) => void | Promise<void>
  /** Press one named key ("Enter", "Backspace") or a combination ("Ctrl+C"). */
  pressKey?: (key: string) => void | Promise<void>
  /** Shell version, for the on-screen note. */
  version?: string
}

declare global {
  interface Window {
    signtalk?: DesktopBridge
  }
}

/** The bridge when running inside the desktop shell, null on the web. */
export function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null
  const found = window.signtalk
  return found && typeof found.typeText === 'function' ? found : null
}
