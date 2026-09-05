import type { Metadata } from 'next'
import { ForgotPasswordFlow } from '@/components/auth-flows'
import { PageShell } from '@/components/page-shell'
import { PageSchema, type Crumb } from '@/components/structured-data'

const title = 'Reset your password'
const description =
  'Reset your SignTalk password with a six-digit verification code sent to the email address or phone number on your account.'

const crumbs: Crumb[] = [
  { name: 'Sign in', href: '/' },
  { name: 'Reset your password', href: '/forgot-password' },
]

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/forgot-password' },
  openGraph: {
    title: `${title} — SignTalk`,
    description,
    url: '/forgot-password',
    type: 'website',
  },
}

export default function ForgotPasswordPage() {
  return (
    <>
      <PageSchema
        name={title}
        description={description}
        path="/forgot-password"
        crumbs={crumbs}
      />
      <PageShell windowTitle="SignTalk — Reset password">
        <ForgotPasswordFlow crumbs={crumbs} />
      </PageShell>
    </>
  )
}
