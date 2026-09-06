import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { SettingsRoute } from '@/components/workspace-routes'

export const metadata: Metadata = {
  title: 'Settings',
  description:
    'Camera, recognition, appearance and overlay settings for your SignTalk account, saved so they follow you between devices.',
  alternates: { canonical: '/app/settings' },
  robots: { index: false, follow: false, nocache: true },
}

export default function SettingsPage() {
  return (
    <PageShell windowTitle="Settings">
      <SettingsRoute />
    </PageShell>
  )
}
