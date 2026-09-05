'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { TextField, PasswordField } from '@/components/ui/field'
import { Checkbox } from '@/components/ui/checkbox'
import { AuthLayout, AuthHeading, LegalNote } from '@/components/auth-layout'
import { validateEmail } from '@/lib/validation'

export function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const emailError = validateEmail(email)
    const passwordError = password ? null : 'Enter your password.'

    if (emailError || passwordError) {
      setErrors({ email: emailError ?? undefined, password: passwordError ?? undefined })
      return
    }

    setErrors({})
    setSubmitting(true)
    router.push('/app')
  }

  return (
    <AuthLayout>
      <AuthHeading
        title="Welcome back"
        description="Sign in to continue to your interpreter and trainer."
      />

      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
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
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
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
          }}
          action={
            // A real link, so the route is crawlable and openable in a new tab.
            <Link
              href="/forgot-password"
              className="rounded-sm text-xs font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Forgot password?
            </Link>
          }
        />

        <Checkbox
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        >
          Keep me signed in
        </Checkbox>

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

          <Link
            href="/signup"
            className={buttonVariants({ variant: 'outline', size: 'xl', className: 'w-full' })}
          >
            Create an account
          </Link>
        </div>
      </form>

      <LegalNote />
    </AuthLayout>
  )
}
