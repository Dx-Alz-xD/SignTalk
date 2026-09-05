'use client'

import { useRouter } from 'next/navigation'
import { TrainerScreen } from '@/components/screens/trainer-screen'
import { TranslatorScreen } from '@/components/screens/translator-screen'

/**
 * Client wrappers for the workspace screens, same job as auth-flows.tsx: turn
 * the screens' "go back" callback into a route change, so each page.tsx stays
 * a server component and keeps its own metadata.
 *
 * Back goes to /app rather than through history, so arriving here by a typed
 * URL still leads somewhere sensible.
 */

export function TrainerRoute() {
  const router = useRouter()
  return <TrainerScreen onBack={() => router.push('/app')} />
}

export function TranslatorRoute() {
  const router = useRouter()
  return <TranslatorScreen onBack={() => router.push('/app')} />
}
