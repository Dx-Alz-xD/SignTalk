/**
 * Carries the details typed at sign-up across a route change, so /app can
 * greet you by name and /forgot-password can mask the right phone number.
 *
 * sessionStorage on purpose: this is throwaway demo state, it dies with the
 * tab, and nothing here is a credential. Replace it with a real session from
 * the backend once the auth API is wired up.
 */

export type AccountDetails = {
  username: string
  email: string
  dial: string
  phone: string
}

const KEY = 'signtalk-account'

export function saveAccount(details: AccountDetails): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(details))
  } catch {
    // Private mode, or storage full. The app reads null and carries on.
  }
}

export function loadAccount(): AccountDetails | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AccountDetails>
    if (typeof parsed?.email !== 'string') return null
    return {
      username: parsed.username ?? '',
      email: parsed.email,
      dial: parsed.dial ?? '',
      phone: parsed.phone ?? '',
    }
  } catch {
    return null
  }
}

export function clearAccount(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to do; the value is per-tab and expires with it anyway.
  }
}
