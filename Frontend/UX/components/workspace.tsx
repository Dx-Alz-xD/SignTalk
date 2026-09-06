'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { HomeScreen } from '@/components/screens/home-screen'
import { fetchAccount, type Account } from '@/lib/auth'

/**
 * The dashboard. Start-up (the loading screen, the session check, the
 * redirect for signed-out visitors) belongs to the frame around every /app
 * page now, so this only needs the account for its greeting.
 */
export function Workspace() {
  const router = useRouter()
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setAccount(found)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  return (
    <HomeScreen
      account={account}
      onOpen={(id) => {
        if (id === 'trainer') router.push('/app/trainer')
        if (id === 'translator') router.push('/app/translator')
        if (id === 'direct-paste') router.push('/app/direct-paste')
        if (id === 'video') router.push('/app/video')
        if (id === 'community') router.push('/app/community')
      }}
    />
  )
}
