'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField, PasswordField } from '@/components/ui/field'
import { AuthLayout, AuthHeading, LegalNote } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { errorMessage } from '@/lib/api'
import { signIn, type Account } from '@/lib/auth'

export function LoginScreen({
  initialEmail = '',
  notice,
  onSignedIn,
  onSignUp,
  onForgotPassword,
}: {
  /** Prefilled after a reset or a sign-out, so it is only typed once. */
  initialEmail?: string
  /** Carried over from another screen, e.g. after a password reset. */
  notice?: ReactNode
  onSignedIn: (account: Account) => void
  onSignUp: () => void
  /** Handed whatever is in the field, which the reset flow can start from. */
  onForgotPassword: (email: string) => void
}) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // Only emptiness is checked here: the field takes a username as well as an
    // email, and the server is the one that decides whether either matches.
    const identifierError = email.trim() ? null : 'Enter your email or username.'
    const passwordError = password ? null : 'Enter your password.'

    if (identifierError || passwordError) {
      setErrors({ email: identifierError ?? undefined, password: passwordError ?? undefined })
      return
    }

    setErrors({})
    setFailure(null)
    setSubmitting(true)
    try {
      onSignedIn(await signIn(email.trim(), password))
    } catch (error) {
      // Wrong password, locked account and unreachable server all land here;
      // the backend's own wording is the most accurate thing to show.
      setFailure(errorMessage(error))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <AuthHeading
        title="Welcome back"
        description="Sign in to continue to your interpreter and trainer."
      />

      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {notice && <FormAlert tone="success">{notice}</FormAlert>}
        {failure && <FormAlert>{failure}</FormAlert>}

        <TextField
          label="Email or username"
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder="you@example.com"
          value={email}
          error={errors.email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
            if (failure) setFailure(null)
          }}
        />

        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          error={errors.password}
          onChange={(event) => {
            setPassword(event.target.value)
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
            if (failure) setFailure(null)
          }}
          action={
            <button
              type="button"
              // Only an email is worth carrying over: recovery is keyed on the
              // address, and this field also accepts a username.
              onClick={() => onForgotPassword(email.includes('@') ? email.trim() : '')}
              className="rounded-sm text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Forgot password?
            </button>
          }
        />

        {/* The backend has no "remember me" — a session is a 30-minute cookie
            it keeps renewing while you use the app. Saying so beats a
            checkbox that quietly does nothing. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          You stay signed in for 30 minutes of inactivity, on this device only.
        </p>

        <div className="mt-1 flex flex-col gap-3">
          <Button type="submit" size="xl" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Log in'
            )}
          </Button>

          <div className="relative py-1 text-center">
            <span className="relative z-10 bg-card px-3 text-xs text-muted-foreground">
              New to SignTalk?
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="xl"
            className="w-full"
            onClick={onSignUp}
          >
            Create an account
          </Button>
        </div>
      </form>

      <LegalNote />
    </AuthLayout>
  )
}
