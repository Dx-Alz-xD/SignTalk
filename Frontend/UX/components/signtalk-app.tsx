'use client'

import { useState } from 'react'
import { AppWindow } from '@/components/app-window'
import { LoginScreen } from '@/components/screens/login-screen'
import { SignUpScreen, type SignUpDetails } from '@/components/screens/signup-screen'
import { ForgotPasswordScreen } from '@/components/screens/forgot-password-screen'
import { LoadingScreen } from '@/components/screens/loading-screen'
import { HomeScreen } from '@/components/screens/home-screen'

type Screen = 'login' | 'signup' | 'forgot' | 'loading' | 'home'

export function SignTalkApp() {
  const [screen, setScreen] = useState<Screen>('login')
  const [account, setAccount] = useState<SignUpDetails | null>(null)

  return (
    <AppWindow screen={screen}>
      {/* Keyed so each screen replays the enter animation instead of snapping. */}
      <div key={screen} className="flex flex-1 flex-col animate-screen-in">
        {screen === 'login' && (
          <LoginScreen
            onContinue={() => setScreen('loading')}
            onSignUp={() => setScreen('signup')}
            onForgotPassword={() => setScreen('forgot')}
          />
        )}
        {screen === 'signup' && (
          <SignUpScreen
            onBack={() => setScreen('login')}
            onCreate={(details) => {
              setAccount(details)
              setScreen('loading')
            }}
          />
        )}
        {screen === 'forgot' && (
          <ForgotPasswordScreen
            account={account}
            onBack={() => setScreen('login')}
            onVerified={() => setScreen('loading')}
          />
        )}
        {screen === 'loading' && <LoadingScreen onDone={() => setScreen('home')} />}
        {screen === 'home' && <HomeScreen account={account} />}
      </div>
    </AppWindow>
  )
}
