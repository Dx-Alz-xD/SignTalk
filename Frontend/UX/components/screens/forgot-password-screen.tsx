'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ChevronRight,
  Loader2,
  Mail,
  MailCheck,
  MessageSquare,
  MessageSquareMore,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField, PasswordField } from '@/components/ui/field'
import { AuthLayout, AuthHeading, BackButton } from '@/components/auth-layout'
import { CodeInput, emptyCode } from '@/components/code-input'
import { FormAlert } from '@/components/form-alert'
import { Breadcrumbs } from '@/components/breadcrumbs'
import type { Crumb } from '@/components/structured-data'
import { errorMessage } from '@/lib/api'
import {
  requestRecoveryCode,
  resetPassword,
  signInWithTicket,
  verifyRecoveryCode,
  type Account,
  type Channel,
} from '@/lib/auth'
import { validateEmail, validatePassword } from '@/lib/validation'
import { cn } from '@/lib/utils'

type Step = 'choose' | 'identify' | 'code' | 'reset'

const RESEND_SECONDS = 30

export function ForgotPasswordScreen({
  crumbs,
  initialEmail = '',
  onBack,
  onSignedIn,
  onReset,
}: {
  /** Visible breadcrumb trail, matching the JSON-LD the route emits. */
  crumbs?: Crumb[]
  /** Whatever address the user last used, so it is only typed once. */
  initialEmail?: string
  onBack: () => void
  /** The ticket was spent on a passwordless sign-in. */
  onSignedIn: (account: Account) => void
  /** The ticket was spent on a new password; every session is gone with it. */
  onReset: (message: string, email: string) => void
}) {
  const [step, setStep] = useState<Step>('choose')
  const [method, setMethod] = useState<Channel>('email')
  const [email, setEmail] = useState(initialEmail)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [code, setCode] = useState<string[]>(emptyCode)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)

  // Where the server says it sent the code, already masked by the backend.
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Null once the server has nothing to send to. The screen looks identical
  // either way, which accounts exist is not something this flow may reveal.
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [ticketId, setTicketId] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const codeComplete = code.every((digit) => digit !== '')
  const mismatch = confirm.length > 0 && confirm !== password

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  /** Ask for a code and move to the code step, whatever the server has to send to. */
  const sendCode = useCallback(async (address: string, channel: Channel) => {
    setBusy(true)
    setFailure(null)
    try {
      const result = await requestRecoveryCode(address, channel)
      setChallengeId(result.challengeId)
      setSentTo(result.sentTo)
      setCode(emptyCode())
      setCooldown(RESEND_SECONDS)
      setStep('code')
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }, [])

  function chooseMethod(next: Channel) {
    setMethod(next)
    setFailure(null)
    setCode(emptyCode())
    // Both channels start from the email address: it is what identifies the
    // account, and SMS goes to whatever number is on file for it.
    setStep('identify')
  }

  function goBack() {
    setFailure(null)
    if (step === 'choose') onBack()
    else if (step === 'identify') setStep('choose')
    else if (step === 'code') setStep('identify')
    else setStep('code')
  }

  const backLabel =
    step === 'choose'
      ? 'Back to log in'
      : step === 'identify'
        ? 'Choose another method'
        : step === 'code'
          ? 'Change email'
          : 'Back'

  function submitEmail(event: FormEvent) {
    event.preventDefault()
    const error = validateEmail(email)
    if (error) {
      setEmailError(error)
      return
    }
    setEmailError(null)
    void sendCode(email.trim(), method)
  }

  const verify = useCallback(
    async (entered: string) => {
      // No challenge means the request found nothing to send to. The code
      // cannot be right, and saying anything more specific would answer a
      // question this flow refuses to answer.
      if (!challengeId) {
        setFailure('That code is not valid. Check the address and request a new one.')
        return
      }
      setBusy(true)
      setFailure(null)
      try {
        setTicketId(await verifyRecoveryCode(challengeId, entered))
        setStep('reset')
      } catch (error) {
        // The server counts the attempts and says how many are left.
        setFailure(errorMessage(error))
        setCode(emptyCode())
      } finally {
        setBusy(false)
      }
    },
    [challengeId],
  )

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault()
    const error = validatePassword(password)
    if (error || confirm !== password) {
      setPasswordError(error ?? 'Passwords don’t match.')
      return
    }
    if (!ticketId) return

    setPasswordError(null)
    setBusy(true)
    setFailure(null)
    try {
      onReset(await resetPassword(ticketId, password), email.trim())
    } catch (error) {
      setFailure(errorMessage(error))
      setBusy(false)
    }
  }

  /** The other thing the ticket can buy: one sign-in, password untouched. */
  async function useTicketToSignIn() {
    if (!ticketId) return
    setBusy(true)
    setFailure(null)
    try {
      onSignedIn(await signInWithTicket(ticketId))
    } catch (error) {
      setFailure(errorMessage(error))
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      {crumbs && <Breadcrumbs crumbs={crumbs} />}
      <BackButton onClick={goBack}>{backLabel}</BackButton>

      {step === 'choose' && (
        <>
          <AuthHeading
            title="Reset your password"
            description="Choose how you&rsquo;d like to receive your 6-digit verification code."
          />
          <div className="flex flex-col gap-3">
            <MethodOption
              icon={Mail}
              title="Email code"
              description="Send a verification code to the email on your account."
              onClick={() => chooseMethod('email')}
            />
            <MethodOption
              icon={MessageSquare}
              title="SMS code"
              description="Text a verification code to the number on your account."
              onClick={() => chooseMethod('sms')}
            />
          </div>
        </>
      )}

      {step === 'identify' && (
        <>
          <AuthHeading
            title={method === 'email' ? 'Verify by email' : 'Verify by SMS'}
            description={
              method === 'email'
                ? 'Enter the email on your account and we’ll send a code.'
                : 'Enter the email on your account. We’ll text the code to the number saved on it.'
            }
          />
          <form className="flex flex-col gap-5" onSubmit={submitEmail} noValidate>
            {failure && <FormAlert>{failure}</FormAlert>}
            <TextField
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              error={emailError}
              onChange={(event) => {
                setEmail(event.target.value)
                setEmailError(null)
                setFailure(null)
              }}
            />
            <Button type="submit" size="xl" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Sending&hellip;
                </>
              ) : (
                'Send verification code'
              )}
            </Button>
          </form>
        </>
      )}

      {step === 'code' && (
        <>
          <AuthHeading
            icon={
              method === 'email' ? (
                <MailCheck className="size-5" aria-hidden="true" />
              ) : (
                <MessageSquareMore className="size-5" aria-hidden="true" />
              )
            }
            title={method === 'email' ? 'Check your email' : 'Check your messages'}
            description={
              <>
                If that account exists, a code is on its way to{' '}
                <span className="font-medium text-foreground">
                  {sentTo ?? (method === 'email' ? email : 'the number on the account')}
                </span>
                . Enter it below to verify it&rsquo;s you.
              </>
            }
          />

          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              void verify(code.join(''))
            }}
          >
            {failure && <FormAlert>{failure}</FormAlert>}

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-[0.8125rem] font-medium">Verification code</legend>
              <CodeInput
                value={code}
                onChange={(next) => {
                  setCode(next)
                  setFailure(null)
                }}
                onComplete={(entered) => void verify(entered)}
                invalid={Boolean(failure)}
                disabled={busy}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Didn&rsquo;t get it?{' '}
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  onClick={() => void sendCode(email.trim(), method)}
                  className="rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
                {' · '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const next: Channel = method === 'email' ? 'sms' : 'email'
                    setMethod(next)
                    void sendCode(email.trim(), next)
                  }}
                  className="rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  {method === 'email' ? 'Use SMS instead' : 'Use email instead'}
                </button>
              </p>
            </fieldset>

            <Button type="submit" size="xl" className="w-full" disabled={!codeComplete || busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Verifying&hellip;
                </>
              ) : (
                'Verify code'
              )}
            </Button>
          </form>
        </>
      )}

      {step === 'reset' && (
        <>
          <AuthHeading
            icon={<ShieldCheck className="size-5" aria-hidden="true" />}
            title="Choose a new password"
            description="That code checked out. Set a new password, or skip it and sign in this once."
          />

          <form className="flex flex-col gap-5" onSubmit={submitNewPassword} noValidate>
            {failure && <FormAlert>{failure}</FormAlert>}

            <PasswordField
              label="New password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              showStrength
              autoFocus
              value={password}
              error={passwordError}
              onChange={(event) => {
                setPassword(event.target.value)
                setPasswordError(null)
                setFailure(null)
              }}
            />

            <PasswordField
              label="Confirm new password"
              autoComplete="new-password"
              placeholder="Re-enter your new password"
              value={confirm}
              error={mismatch ? 'Passwords don’t match.' : null}
              onChange={(event) => {
                setConfirm(event.target.value)
                setPasswordError(null)
              }}
            />

            <div className="flex flex-col gap-3">
              <Button type="submit" size="xl" className="w-full" disabled={mismatch || busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Saving&hellip;
                  </>
                ) : (
                  'Save password'
                )}
              </Button>

              {/* The ticket is single-use, so this is the other branch of the
                  same decision rather than something to do afterwards. */}
              <Button
                type="button"
                variant="outline"
                size="xl"
                className="w-full"
                disabled={busy}
                onClick={() => void useTicketToSignIn()}
              >
                Skip and log me in this once
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Saving a new password signs you out everywhere else.
            </p>
          </form>
        </>
      )}
    </AuthLayout>
  )
}

function MethodOption({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 rounded-xl border border-border bg-elevated p-4 text-left',
        'transition-[border-color,background-color,box-shadow,transform] duration-150',
        'hover:border-primary/50 hover:shadow-raised active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden="true"
      />
    </button>
  )
}
