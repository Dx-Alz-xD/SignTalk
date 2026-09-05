/**
 * Typed wrappers over /auth. One function per endpoint, no rules of its own —
 * every decision (lockouts, code expiry, what a ticket buys) belongs to the
 * service behind the API, and this file only carries the answer back.
 */

import { ApiError, api } from '@/lib/api'

/** The signed-in user, as /auth/me and the sign-in endpoints return them. */
export type Account = {
  username: string
  email: string
  /** How this session was started: "password" or "recovery_code". */
  method: string
  expiresAt: string
  minutesLeft: number
  /** Masked, e.g. "+91 ••••• 45678", or null when no number is on file. */
  phone: string | null
}

export type Channel = 'email' | 'sms'

export type CodeRequest = {
  /** Null when there was nothing to send to — the screen must not react to it
   *  differently, or it becomes an oracle for which accounts exist. */
  challengeId: string | null
  channel: Channel
  sentTo: string | null
  expiresInSeconds: number
  message: string
}

type UserResponse = { user: Account }

export function signUp(input: {
  username: string
  email: string
  password: string
  phone?: string | null
}): Promise<Account> {
  return api<UserResponse>('/auth/signup', { body: input }).then((r) => r.user)
}

/** `identifier` is an email or a username — the service accepts either. */
export function signIn(identifier: string, password: string): Promise<Account> {
  return api<UserResponse>('/auth/login', { body: { identifier, password } }).then((r) => r.user)
}

export function signOut(): Promise<void> {
  return api<{ ok: boolean }>('/auth/logout', { method: 'POST' }).then(() => undefined)
}

/**
 * The current session, or null when there isn't one. A missing session is the
 * normal state on first load, so it is not an error worth throwing over.
 */
export async function fetchAccount(signal?: AbortSignal): Promise<Account | null> {
  try {
    const { user } = await api<UserResponse>('/auth/me', { signal })
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export function requestRecoveryCode(email: string, channel: Channel): Promise<CodeRequest> {
  return api<CodeRequest>('/auth/forgot', { body: { email, channel } })
}

export function verifyRecoveryCode(challengeId: string, code: string): Promise<string> {
  return api<{ ticketId: string }>('/auth/forgot/verify', {
    body: { challenge_id: challengeId, code },
  }).then((r) => r.ticketId)
}

/** Spends the ticket to set a new password. Every session is revoked with it. */
export function resetPassword(ticketId: string, password: string): Promise<string> {
  return api<{ message: string }>('/auth/forgot/reset', {
    body: { ticket_id: ticketId, password },
  }).then((r) => r.message)
}

/** Spends the ticket to sign in this once, leaving the password alone. */
export function signInWithTicket(ticketId: string): Promise<Account> {
  return api<UserResponse>('/auth/forgot/signin', { body: { ticket_id: ticketId } }).then(
    (r) => r.user,
  )
}
