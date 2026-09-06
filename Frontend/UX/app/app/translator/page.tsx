import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { TranslatorRoute } from '@/components/workspace-routes'

export const metadata: Metadata = {
  title: 'Translator',
  description:
    'Interpret sign language live from your camera into text, then translate it into another language.',
  alternates: { canonical: '/app/translator' },
  // Sits inside the signed-in workspace, like its parent route.
  robots: { index: false, follow: false, nocache: true },
}

export default function TranslatorPage() {
  return (
    <PageShell windowTitle="Translator">
      <TranslatorRoute />
    </PageShell>
  )
}
