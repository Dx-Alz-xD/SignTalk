import type { Metadata } from 'next'
import { CommunityDatabaseScreen } from '@/components/screens/community-database-screen'
import { PageShell } from '@/components/page-shell'

export const metadata: Metadata = {
  title: 'Community Database',
  description:
    'Browse sign sets contributed by the SignTalk community, filter them by language, author and upload date, and install the ones you want.',
  alternates: { canonical: '/app/community' },
  // Sits inside the signed-in workspace, like its parent route.
  robots: { index: false, follow: false, nocache: true },
}

export default function CommunityPage() {
  return (
    <PageShell windowTitle="SignTalk — Community Database">
      <CommunityDatabaseScreen />
    </PageShell>
  )
}
