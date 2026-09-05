export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(trimmed)) return 'That doesn’t look like a valid email.'
  return null
}

export function validateUsername(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Pick a username.'
  if (trimmed.length < 3) return 'Use at least 3 characters.'
  // The server's rule is 3-20; matching it here saves a round trip.
  if (trimmed.length > 20) return 'Use at most 20 characters.'
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return 'Letters, numbers, dots, dashes and underscores only.'
  }
  return null
}

export function validatePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (!digits) return 'Enter your phone number.'
  if (digits.length < 6) return 'That number looks too short.'
  if (digits.length > 15) return 'That number looks too long.'
  return null
}

export type PasswordRule = {
  id: string
  label: string
  test: (value: string) => boolean
}

export const passwordRules: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { id: 'case', label: 'Upper & lowercase', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { id: 'number', label: 'A number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'A symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

export type PasswordStrength = {
  /** Rules satisfied, 0 through passwordRules.length. */
  score: number
  label: string
  /** Percentage for the meter, 0-100. */
  percent: number
  tone: 'weak' | 'fair' | 'good' | 'strong'
}

export function passwordStrength(value: string): PasswordStrength {
  const score = value ? passwordRules.filter((rule) => rule.test(value)).length : 0
  const percent = (score / passwordRules.length) * 100
  if (score <= 1) return { score, percent, label: 'Weak', tone: 'weak' }
  if (score === 2) return { score, percent, label: 'Fair', tone: 'fair' }
  if (score === 3) return { score, percent, label: 'Good', tone: 'good' }
  return { score, percent, label: 'Strong', tone: 'strong' }
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Choose a password.'
  if (value.length < 8) return 'Use at least 8 characters.'
  return null
}
