import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { VideoTranslatorRoute } from '@/components/workspace-routes'

export const metadata: Metadata = {
  title: 'Video Translator',
  description:
    'Upload a spoken video and see its words signed over the top, timed to the speech, in any sign language you have.',
  alternates: { canonical: '/app/video' },
  robots: { index: false, follow: false, nocache: true },
}

export default function VideoPage() {
  return (
    <PageShell windowTitle="Video Translator">
      <VideoTranslatorRoute />
    </PageShell>
  )
}
