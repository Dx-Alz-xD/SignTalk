'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppWindow } from '@/components/app-window'
import { LoginScreen } from '@/components/screens/login-screen'
import { SignUpScreen } from '@/components/screens/signup-screen'
import { ForgotPasswordScreen } from '@/components/screens/forgot-password-screen'
import { LoadingScreen } from '@/components/screens/loading-screen'
import { HomeScreen } from '@/components/screens/home-screen'
import { TrainerScreen } from '@/components/screens/trainer-screen'
import { CommunityDatabaseScreen } from '@/components/screens/community-database-screen'
import { fetchAccount, signOut, type Account } from '@/lib/auth'

type Screen =
  | 'loading'
  | 'login'
  | 'signup'
  | 'forgot'
  | 'home'
  | 'trainer'
  | 'community'

export function SignTalkApp() {
  // Starts on the splash: the session cookie survives a refresh, so we ask the
  // server who we are before showing a login form the user may not need.
  const [screen, setScreen] = useState<Screen>('loading')
  const [account, setAccount] = useState<Account | null>(null)
  /** True once /auth/me has answered, however it answered. */
  const [settled, setSettled] = useState(false)
  /** Carried into the reset flow and back, so the email is only typed once. */
  const [lastEmail, setLastEmail] = useState('')
  /** A one-off success message for the login screen, e.g. after a reset. */
  const [notice, setNotice] = useState<ReactNode>(null)

  // The splash calls onDone from a timer, by which point this render's
  // `account` may be stale — read the settled value through a ref instead.
  const restored = useRef<Account | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return
        restored.current = found
        setAccount(found)
        if (found) setLastEmail(found.email)
      })
      .catch(() => {
        // An unreachable API is not a reason to hold the splash: fall through
        // to the login form, where the next request can report the failure.
        restored.current = null
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true)
      })
    return () => controller.abort()
  }, [])

  const finishBoot = useCallback(() => {
    setScreen(restored.current ? 'home' : 'login')
  }, [])

  const handleSignedIn = useCallback((next: Account) => {
    restored.current = next
    setAccount(next)
    setLastEmail(next.email)
    setNotice(null)
    setScreen('home')
  }, [])

  const handleSignOut = useCallback(async () => {
    // Drop it locally first: even if the request fails, this browser has to
    // stop acting signed in immediately.
    restored.current = null
    setAccount(null)
    setNotice(null)
    setScreen('login')
    await signOut().catch(() => undefined)
  }, [])

  const goToLogin = useCallback((withNotice: ReactNode = null) => {
    setNotice(withNotice)
    setScreen('login')
  }, [])

  return (
    <AppWindow screen={screen}>
      {/* Keyed so each screen replays the enter animation instead of snapping. */}
      <div key={screen} className="flex flex-1 flex-col animate-screen-in">
        {screen === 'loading' && <LoadingScreen ready={settled} onDone={finishBoot} />}

        {screen === 'login' && (
          <LoginScreen
            initialEmail={lastEmail}
            notice={notice}
            onSignedIn={handleSignedIn}
            onSignUp={() => {
              setNotice(null)
              setScreen('signup')
            }}
            onForgotPassword={(email) => {
              if (email) setLastEmail(email)
              setNotice(null)
              setScreen('forgot')
            }}
          />
        )}

        {screen === 'signup' && (
          <SignUpScreen onBack={() => setScreen('login')} onSignedIn={handleSignedIn} />
        )}

        {screen === 'forgot' && (
          <ForgotPasswordScreen
            initialEmail={lastEmail}
            onBack={() => goToLogin()}
            onSignedIn={handleSignedIn}
            onReset={(message, email) => {
              // The reset revoked every session, so the only way on is a fresh
              // sign-in — carry the server's wording over to explain why.
              setLastEmail(email)
              goToLogin(message)
            }}
          />
        )}

        {screen === 'home' && (
          <HomeScreen
            account={account}
            onSignOut={handleSignOut}
            onOpen={(id) => {
              // Translator and Direct Paste have no screen yet; the home cards
              // render those as inert, so nothing routes here for them.
              if (id === 'trainer') setScreen('trainer')
              if (id === 'community') setScreen('community')
            }}
          />
        )}

        {screen === 'trainer' && <TrainerScreen onBack={() => setScreen('home')} />}

        {screen === 'community' && <CommunityDatabaseScreen onBack={() => setScreen('home')} />}
      </div>
    </AppWindow>
  )
}
