'use client'

import { useId, useMemo, useState, type FormEvent } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { TextField, PasswordField, FieldShell } from '@/components/ui/field'
import { AuthLayout, AuthHeading, BackButton, LegalNote } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { countryCodes } from '@/lib/country-codes'
import { errorMessage } from '@/lib/api'
import { signUp, type Account } from '@/lib/auth'
import {
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from '@/lib/validation'

type Errors = Partial<Record<'username' | 'email' | 'phone' | 'password' | 'confirm', string>>

/** E.164 for the backend: a leading +, then digits only. */
function e164(dial: string, phone: string): string {
  return `+${`${dial}${phone}`.replace(/\D/g, '')}`
}

export function SignUpScreen({
  onBack,
  onSignedIn,
}: {
  onBack: () => void
  /** Signing up signs you in, so this hands back a live session. */
  onSignedIn: (account: Account) => void
}) {
  const phoneId = useId()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [dial, setDial] = useState('+1')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Mismatch is shown live because it is unambiguous; everything else waits
  // for submit so the form doesn't shout while you're still typing.
  const mismatch = confirm.length > 0 && confirm !== password

  const dialOptions = useMemo(
    () =>
      countryCodes.map((country) => ({
        key: `${country.iso}${country.dial}`,
        value: country.dial,
        label: `${country.iso} ${country.dial}`,
        title: country.name,
      })),
    [],
  )

  function clear(field: keyof Errors) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
    setFailure(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {
      username: validateUsername(username) ?? undefined,
      email: validateEmail(email) ?? undefined,
      phone: validatePhone(phone) ?? undefined,
      password: validatePassword(password) ?? undefined,
      confirm: confirm !== password ? 'Passwords don’t match.' : undefined,
    }

    if (Object.values(next).some(Boolean)) {
      setErrors(next)
      return
    }

    setErrors({})
    setFailure(null)
    setSubmitting(true)

    try {
      onSignedIn(
        await signUp({
          username: username.trim(),
          email: email.trim(),
          password,
          phone: e164(dial, phone),
        }),
      )
    } catch (error) {
      // A taken email or username is the common case, and the field it belongs
      // to is not knowable from the response — show it above the form.
      setFailure(errorMessage(error))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <BackButton onClick={onBack}>Back to log in</BackButton>

      <AuthHeading
        title="Create your account"
        description="Your phone number is only used for SMS verification codes."
      />

      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {failure && <FormAlert>{failure}</FormAlert>}

        <TextField
          label="Username"
          autoComplete="username"
          placeholder="yourname"
          value={username}
          error={errors.username}
          onChange={(event) => {
            setUsername(event.target.value)
            clear('username')
          }}
        />

        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value)
            clear('email')
          }}
        />

        <FieldShell
          id={phoneId}
          label="Phone number"
          hint="Standard SMS rates may apply."
          error={errors.phone}
        >
          <div className="flex gap-2">
            <div className="relative shrink-0">
              <Select
                aria-label="Country calling code"
                value={dial}
                onChange={(event) => setDial(event.target.value)}
                className="w-[6.5rem] pr-8 font-mono"
              >
                {dialOptions.map((option) => (
                  <option key={option.key} value={option.value} title={option.title}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <Input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              placeholder="555 123 4567"
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={`${phoneId}-message`}
              onChange={(event) => {
                setPhone(event.target.value)
                clear('phone')
              }}
            />
          </div>
        </FieldShell>

        <PasswordField
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          showStrength
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value)
            clear('password')
          }}
        />

        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          error={mismatch ? 'Passwords don’t match.' : errors.confirm}
          onChange={(event) => {
            setConfirm(event.target.value)
            clear('confirm')
          }}
        />

        <Button
          type="submit"
          size="xl"
          className="mt-1 w-full"
          disabled={mismatch || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <LegalNote />
    </AuthLayout>
  )
}
