'use client'

import { useEffect, useState } from 'react'
import { LoadingScreen } from '@/components/screens/loading-screen'
import { HomeScreen } from '@/components/screens/home-screen'
import { loadAccount, type AccountDetails } from '@/lib/account-session'

/**
 * The signed-in workspace: the startup sequence, then the dashboard. This is
 * one route rather than two, because "starting up" is a transition, not a
 * destination anyone should be able to link to or land on.
 */
export function Workspace() {
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState<AccountDetails | null>(null)

  // sessionStorage is client-only, so it is read after mount to keep the
  // first client render identical to the server markup.
  useEffect(() => {
    setAccount(loadAccount())
  }, [])

  if (!ready) return <LoadingScreen onDone={() => setReady(true)} />
  return <HomeScreen account={account} />
}
