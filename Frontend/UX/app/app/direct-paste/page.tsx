import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { DirectPasteRoute } from '@/components/workspace-routes'

export const metadata: Metadata = {
  title: 'Direct Paste',
  description:
    'Sign in front of your camera and have the words typed straight into whichever text field you have focused.',
  alternates: { canonical: '/app/direct-paste' },
  // Sits inside the signed-in workspace, like its parent route.
  robots: { index: false, follow: false, nocache: true },
}

export default function DirectPastePage() {
  return (
    <PageShell windowTitle="Direct Paste">
      <DirectPasteRoute />
    </PageShell>
  )
}
