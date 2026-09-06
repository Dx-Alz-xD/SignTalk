'use client'

import { useRouter } from 'next/navigation'
import { AccountScreen } from '@/components/screens/account-screen'
import { DirectPasteScreen } from '@/components/screens/direct-paste-screen'
import { ProfileScreen } from '@/components/screens/profile-screen'
import { SettingsScreen } from '@/components/screens/settings-screen'
import { signOut } from '@/lib/auth'
import { TrainerScreen } from '@/components/screens/trainer-screen'
import { TranslatorScreen } from '@/components/screens/translator-screen'
import { VideoTranslatorScreen } from '@/components/screens/video-translator-screen'

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

export function DirectPasteRoute() {
  const router = useRouter()
  return <DirectPasteScreen onBack={() => router.push('/app')} />
}

export function AccountRoute() {
  const router = useRouter()
  return (
    <AccountScreen
      onOpenTrainer={() => router.push('/app/trainer')}
      onOpenProfile={(username) => router.push(`/app/users/${encodeURIComponent(username)}`)}
      onSignOut={() => {
        // Same order as the dashboard: leave first, then tell the server.
        try {
          sessionStorage.removeItem('signtalk-booted')
        } catch {
          // Nothing to clear.
        }
        router.replace('/')
        void signOut().catch(() => undefined)
      }}
    />
  )
}

export function ProfileRoute({ username }: { username: string }) {
  const router = useRouter()
  return <ProfileScreen username={username} onBack={() => router.back()} />
}

export function VideoTranslatorRoute() {
  const router = useRouter()
  return <VideoTranslatorScreen onBack={() => router.push('/app')} />
}

export function SettingsRoute() {
  return <SettingsScreen />
}
