import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { ProfileRoute } from '@/components/workspace-routes'

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  return {
    title: `${decodeURIComponent(username)} · profile`,
    description: 'A SignTalk member and the sign languages they have published.',
    robots: { index: false, follow: false, nocache: true },
  }
}

export default async function ProfilePage({ params }: Params) {
  const { username } = await params
  const name = decodeURIComponent(username)
  return (
    <PageShell windowTitle={name}>
      <ProfileRoute username={name} />
    </PageShell>
  )
}
