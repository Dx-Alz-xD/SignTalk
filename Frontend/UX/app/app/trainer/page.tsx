import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { TrainerRoute } from '@/components/workspace-routes'

export const metadata: Metadata = {
  title: 'Trainer',
  description:
    'Record your own signs from the camera and build a vocabulary SignTalk can recognise.',
  alternates: { canonical: '/app/trainer' },
  // Sits inside the signed-in workspace, like its parent route.
  robots: { index: false, follow: false, nocache: true },
}

export default function TrainerPage() {
  return (
    <PageShell windowTitle="SignTalk — Trainer">
      <TrainerRoute />
    </PageShell>
  )
}
