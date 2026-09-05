'use client'

import { useRouter } from 'next/navigation'
import { CommunityDatabaseScreen } from '@/components/screens/community-database-screen'

/** Back goes to the workspace, so a typed URL still leads somewhere sensible. */
export function CommunityRoute() {
  const router = useRouter()
  return <CommunityDatabaseScreen onBack={() => router.push('/app')} />
}
