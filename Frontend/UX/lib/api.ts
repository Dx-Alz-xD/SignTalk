/**
 * The one place that talks to the SignTalk API.
 *
 * The session is an HttpOnly cookie set by the backend, so every request has
 * to opt into credentials — there is no token for this code to carry around,
 * which is the point: script on the page cannot read or leak it.
 */

/** Backend origin. Override per environment with NEXT_PUBLIC_SIGNTALK_API. */
export const API_BASE = (
  process.env.NEXT_PUBLIC_SIGNTALK_API ?? 'http://localhost:8000'
).replace(/\/+$/, '')

/**
 * A request that reached the server and came back refused, or never reached it
 * at all (status 0). `code` is the backend's own error name — ValidationError,
 * InvalidCredentialsError, ChallengeError and friends — so screens can branch
 * on the cause while still showing the server's wording.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** True when the call never landed — server down, or CORS refused it. */
  get offline(): boolean {
    return this.status === 0
  }
}

type Payload = Record<string, unknown> | null

/** Pull a human message out of whatever shape the failure arrived in. */
function messageOf(payload: Payload, status: number): string {
  if (payload) {
    // Our own handlers answer {error, code}; FastAPI's HTTPException answers
    // {detail}, and its request validation answers {detail: [{msg, loc}]}.
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.detail === 'string') return payload.detail
    if (Array.isArray(payload.detail)) {
      const first = payload.detail[0] as { msg?: string } | undefined
      if (first?.msg) return first.msg
    }
  }
  if (status === 404) return 'That is not there any more.'
  return `Something went wrong (${status}).`
}

function codeOf(payload: Payload, status: number): string {
  if (payload && typeof payload.code === 'string') return payload.code
  return `HTTP${status}`
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, signal } = options
  const method = options.method ?? (body === undefined ? 'GET' : 'POST')

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (cause) {
    // fetch only rejects when the request never completed, so this is never a
    // rule the user broke — say so plainly instead of blaming their input.
    if (signal?.aborted) throw cause
    throw new ApiError('Cannot reach the SignTalk server. Is the backend running?', 0, 'NetworkError')
  }

  if (response.status === 204) return undefined as T

  const payload = (await response.json().catch(() => null)) as Payload

  if (!response.ok) {
    throw new ApiError(messageOf(payload, response.status), response.status, codeOf(payload, response.status))
  }

  return payload as T
}

/** The message to show a user, from any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Try again.'
}
