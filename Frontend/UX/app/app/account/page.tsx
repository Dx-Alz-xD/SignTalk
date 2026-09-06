import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { AccountRoute } from '@/components/workspace-routes'

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your SignTalk account: details, password, and the sign languages you have published.',
  alternates: { canonical: '/app/account' },
  robots: { index: false, follow: false, nocache: true },
}

export default function AccountPage() {
  return (
    <PageShell windowTitle="Account">
      <AccountRoute />
    </PageShell>
  )
}
