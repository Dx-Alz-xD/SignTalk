'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Loader2,
  Mail,
  MailCheck,
  MessageSquare,
  MessageSquareMore,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/field'
import { AuthLayout, AuthHeading, BackButton } from '@/components/auth-layout'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { loadAccount, type AccountDetails } from '@/lib/account-session'
import { CodeInput, emptyCode } from '@/components/code-input'
import { maskPhone } from '@/lib/country-codes'
import { validateEmail } from '@/lib/validation'
import { cn } from '@/lib/utils'

type Method = 'email' | 'sms'
type Step = 'choose' | 'identify' | 'code'

const RESEND_SECONDS = 30

export function ForgotPasswordScreen({
  crumbs,
}: {
  crumbs: { name: string; href: string }[]
}) {
  const router = useRouter()
  const [account, setAccount] = useState<AccountDetails | null>(null)
  const [step, setStep] = useState<Step>('choose')
  const [method, setMethod] = useState<Method>('email')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [code, setCode] = useState<string[]>(emptyCode)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const codeComplete = code.every((digit) => digit !== '')
  const phoneLabel = account?.phone
    ? maskPhone(account.dial, account.phone)
    : 'the phone number on your account'

  useEffect(() => {
    const stored = loadAccount()
    if (!stored) return
    setAccount(stored)
    setEmail((current) => current || stored.email)
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  function startCodeStep(next: Method) {
    setMethod(next)
    setCode(emptyCode())
    setCooldown(RESEND_SECONDS)
    setStep('code')
  }

  function chooseMethod(next: Method) {
    setMethod(next)
    setCode(emptyCode())
    // SMS goes straight to the phone captured at sign-up, so no identify step.
    if (next === 'sms') startCodeStep('sms')
    else setStep('identify')
  }

  function goBack() {
    if (step === 'identify') setStep('choose')
    else setStep(method === 'sms' ? 'choose' : 'identify')
  }

  const backLabel =
    step === 'choose'
      ? 'Back to log in'
      : step === 'identify' || method === 'sms'
        ? 'Choose another method'
        : 'Change email'

  function submitEmail(event: FormEvent) {
    event.preventDefault()
    const error = validateEmail(email)
    if (error) {
      setEmailError(error)
      return
    }
    setEmailError(null)
    startCodeStep('email')
  }

  const verify = useCallback(() => {
    setSubmitting(true)
    router.push('/app')
  }, [router])

  return (
    <AuthLayout>
      <Breadcrumbs crumbs={crumbs} />

      {/* Step one goes back to a different route; later steps stay on this
          page, so only the first is a real link. */}
      {step === 'choose' ? (
        <BackButton href="/">{backLabel}</BackButton>
      ) : (
        <BackButton onClick={goBack}>{backLabel}</BackButton>
      )}

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
              description={`Text a verification code to ${phoneLabel}.`}
              onClick={() => chooseMethod('sms')}
            />
          </div>
        </>
      )}

      {step === 'identify' && (
        <>
          <AuthHeading
            title="Verify by email"
            description="Enter the email on your account and we&rsquo;ll send a code."
          />
          <form className="flex flex-col gap-5" onSubmit={submitEmail} noValidate>
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
              }}
            />
            <Button type="submit" size="xl" className="w-full">
              Send verification code
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
                We sent a code to{' '}
                <span className="font-medium text-foreground">
                  {method === 'email' ? email || 'your email' : phoneLabel}
                </span>
                . Enter it below to verify it&rsquo;s you.
              </>
            }
          />

          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault()
              verify()
            }}
          >
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-[0.8125rem] font-medium">Verification code</legend>
              <CodeInput
                value={code}
                onChange={setCode}
                onComplete={verify}
                disabled={submitting}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Didn&rsquo;t get it?{' '}
                <button
                  type="button"
                  disabled={cooldown > 0}
                  onClick={() => setCooldown(RESEND_SECONDS)}
                  className="rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
                {' · '}
                <button
                  type="button"
                  onClick={() => chooseMethod(method === 'email' ? 'sms' : 'email')}
                  className="rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {method === 'email' ? 'Use SMS instead' : 'Use email instead'}
                </button>
              </p>
            </fieldset>

            <Button
              type="submit"
              size="xl"
              className="w-full"
              disabled={!codeComplete || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Verifying&hellip;
                </>
              ) : (
                'Verify and log in'
              )}
            </Button>
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
