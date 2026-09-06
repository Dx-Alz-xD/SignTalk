'use client'

import { createContext, useContext } from 'react'
import type { Account } from '@/lib/auth'
import { DEFAULT_PREFERENCES, type PreferenceChanges, type Preferences } from '@/lib/preferences'

/**
 * Who is signed in and what they have set, fetched once by the app frame and
 * read from anywhere inside it.
 *
 * Before this existed, three screens each fetched the account for themselves
 * on every navigation. Settings need the same treatment and are read by the
 * camera, the recogniser and the video overlay, so they belong here too.
 */

export type SessionValue = {
  account: Account | null
  preferences: Preferences
  /** False until the first fetch of both has settled. */
  ready: boolean
  /** Applies the change locally at once, then saves. Throws if the save fails. */
  save: (changes: PreferenceChanges) => Promise<void>
  reset: () => Promise<void>
  refreshAccount: () => Promise<void>
}

const fallback: SessionValue = {
  account: null,
  preferences: DEFAULT_PREFERENCES,
  ready: false,
  save: async () => undefined,
  reset: async () => undefined,
  refreshAccount: async () => undefined,
}

export const SessionContext = createContext<SessionValue>(fallback)

/** The session. Safe outside the provider: gives defaults and no-op savers. */
export function useSession(): SessionValue {
  return useContext(SessionContext)
}

/** Just the settings, which is all most callers want. */
export function usePreferences(): Preferences {
  return useContext(SessionContext).preferences
}
