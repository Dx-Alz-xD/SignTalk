import type { Metadata } from 'next'
import { SignUpScreen } from '@/components/screens/signup-screen'
import { PageShell } from '@/components/page-shell'
import { PageSchema, type Crumb } from '@/components/structured-data'

const title = 'Create an account'
const description =
  'Create a free SignTalk account to start interpreting and training sign language. Your phone number is used only for SMS verification codes.'

const crumbs: Crumb[] = [
  { name: 'Sign in', href: '/' },
  { name: 'Create an account', href: '/signup' },
]

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/signup' },
  openGraph: {
    title: `${title} — SignTalk`,
    description,
    url: '/signup',
    type: 'website',
  },
}

export default function SignUpPage() {
  return (
    <>
      <PageSchema name={title} description={description} path="/signup" crumbs={crumbs} />
      <PageShell windowTitle="SignTalk — Create account">
        <SignUpScreen crumbs={crumbs} />
      </PageShell>
    </>
  )
}
