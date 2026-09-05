'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingScreen } from '@/components/screens/loading-screen'
import { HomeScreen } from '@/components/screens/home-screen'
import { fetchAccount, signOut, type Account } from '@/lib/auth'

/**
 * The signed-in workspace: the startup sequence, then the dashboard. This is
 * one route rather than two, because "starting up" is a transition, not a
 * destination anyone should be able to link to or land on.
 *
 * The session is the HttpOnly cookie the backend sets, so who you are is a
 * question only the server can answer — the splash holds until /auth/me has,
 * and an unauthenticated visitor is sent back to sign in rather than shown an
 * empty dashboard.
 */
export function Workspace() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [settled, setSettled] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)

  // The splash finishes on a timer, by which point this render's `account` is
  // stale — the redirect decision reads the settled value through a ref.
  const restored = useRef<Account | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return
        restored.current = found
        setAccount(found)
      })
      .catch(() => {
        // An unreachable API is not proof of being signed out, but there is
        // nothing to show either way; the sign-in page can report the failure.
        restored.current = null
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(true)
      })
    return () => controller.abort()
  }, [])

  const finishBoot = useCallback(() => {
    if (!restored.current) {
      router.replace('/')
      return
    }
    setReady(true)
  }, [router])

  const handleSignOut = useCallback(async () => {
    // Drop it locally first: even if the request fails, this browser has to
    // stop acting signed in immediately.
    restored.current = null
    setAccount(null)
    router.replace('/')
    await signOut().catch(() => undefined)
  }, [router])

  if (!ready) return <LoadingScreen ready={settled} onDone={finishBoot} />

  return (
    <HomeScreen
      account={account}
      onSignOut={handleSignOut}
      onOpen={(id) => {
        // Direct Paste has no screen yet; its card renders inert, so nothing
        // routes here for it.
        if (id === 'trainer') router.push('/app/trainer')
        if (id === 'translator') router.push('/app/translator')
        if (id === 'community') router.push('/app/community')
      }}
    />
  )
}
