import type { Metadata } from 'next'
import { LoginScreen } from '@/components/screens/login-screen'
import { PageShell } from '@/components/page-shell'
import { PageSchema } from '@/components/structured-data'
import { SITE_DESCRIPTION } from '@/lib/site'

const title = 'Sign in'
const description =
  'Sign in to SignTalk to interpret sign language live from your camera, translate between sign languages, and train your own signs.'

export const metadata: Metadata = {
  // Absolute: the homepage should lead with the product, not with "Sign in".
  title: { absolute: 'SignTalk — Real-time sign language interpretation' },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${title} — SignTalk`,
    description,
    url: '/',
    type: 'website',
  },
}

export default function HomePage() {
  return (
    <>
      <PageSchema
        name="SignTalk — Real-time sign language interpretation"
        description={SITE_DESCRIPTION}
        path="/"
      />
      <PageShell windowTitle="SignTalk — Sign in">
        <LoginScreen />
      </PageShell>
    </>
  )
}
