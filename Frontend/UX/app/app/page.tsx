import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { Workspace } from '@/components/workspace'

export const metadata: Metadata = {
  title: 'Your workspace',
  description:
    'Your SignTalk workspace: open the translator, train new signs, or paste transcription straight into another app.',
  alternates: { canonical: '/app' },
  // Signed-in surface. There is nothing here for a crawler, and indexing it
  // would put a dead-end page in results.
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function WorkspacePage() {
  return (
    <PageShell windowTitle="SignTalk">
      <Workspace />
    </PageShell>
  )
}
