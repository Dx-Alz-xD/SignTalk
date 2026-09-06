'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LoginScreen } from '@/components/screens/login-screen'
import { SignUpScreen } from '@/components/screens/signup-screen'
import { ForgotPasswordScreen } from '@/components/screens/forgot-password-screen'
import type { Crumb } from '@/components/structured-data'

/**
 * Client wrappers that hand the auth screens their callbacks.
 *
 * The screens themselves are route-agnostic on purpose, they report what
 * happened and let the caller decide where that leads. Under the app router
 * the caller is a route, so navigation is what these translate the callbacks
 * into. Each page.tsx stays a server component and keeps its metadata.
 */

/** Where a signed-in session belongs. */
const WORKSPACE = '/app'

export function LoginFlow({ crumbs }: { crumbs?: Crumb[] }) {
  const router = useRouter()
  const [notice, setNotice] = useState<ReactNode>(null)

  // A password reset bounces back here with an explanation; it survives the
  // navigation in sessionStorage because a query string would linger in the
  // URL bar long after the message stopped being true.
  useEffect(() => {
    try {
      const carried = sessionStorage.getItem('signtalk-notice')
      if (carried) {
        setNotice(carried)
        sessionStorage.removeItem('signtalk-notice')
      }
    } catch {
      // Private mode. The screen simply shows no notice.
    }
  }, [])

  return (
    <LoginScreen
      crumbs={crumbs}
      notice={notice}
      onSignedIn={() => router.push(WORKSPACE)}
      onSignUp={() => router.push('/signup')}
      onForgotPassword={(email) => {
        const query = email ? `?email=${encodeURIComponent(email)}` : ''
        router.push(`/forgot-password${query}`)
      }}
    />
  )
}

export function SignUpFlow({ crumbs }: { crumbs?: Crumb[] }) {
  const router = useRouter()
  return (
    <SignUpScreen
      crumbs={crumbs}
      onBack={() => router.push('/')}
      onSignedIn={() => router.push(WORKSPACE)}
    />
  )
}

export function ForgotPasswordFlow({ crumbs }: { crumbs?: Crumb[] }) {
  const router = useRouter()
  const [initialEmail, setInitialEmail] = useState('')

  // Read after mount: the server render has no search params to match against,
  // and reading them during render would make the two disagree.
  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get('email')
    if (found) setInitialEmail(found)
  }, [])

  return (
    <ForgotPasswordScreen
      crumbs={crumbs}
      initialEmail={initialEmail}
      onBack={() => router.push('/')}
      onSignedIn={() => router.push(WORKSPACE)}
      onReset={(message) => {
        try {
          sessionStorage.setItem('signtalk-notice', message)
        } catch {
          // The notice is a nicety; losing it must not block the redirect.
        }
        router.push('/')
      }}
    />
  )
}
