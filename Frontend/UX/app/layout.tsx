import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { JsonLd } from '@/components/structured-data'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/site'
import { THEME_STORAGE_KEY } from '@/lib/theme-storage'
import './globals.css'

// next/font generates a hashed family name, so the CSS variable is the only
// reliable way to reach these, naming the family in globals.css never matched.
const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  // Makes every relative canonical / Open Graph URL below resolve absolutely.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · Real-time sign language interpretation`,
    // Each page supplies its own short title; this keeps the brand on the end.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'sign language',
    'ASL',
    'ISL',
    'BSL',
    'custom sign language',
    'sign language translator',
    'sign language recognition',
    'accessibility',
    'real-time interpretation',
    'deaf communication',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: `${SITE_NAME} · Real-time sign language interpretation`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl('/'),
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME}, Real-time sign language interpretation`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
    ],
    apple: '/apple-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5efee' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1416' },
  ],
}

// Runs before paint so the stored theme never flashes the wrong way.
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark' ? stored
      : (stored === 'system'
          ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
          : 'dark');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`

/** Site-wide graph: who publishes this, and what the product is. */
const siteGraph = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/icon.svg'),
    description: SITE_DESCRIPTION,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: 'en',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#app`,
    name: SITE_NAME,
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'macOS, Windows, Linux, Web',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
    featureList: [
      'Real-time sign language interpretation from a camera',
      'Translation between sign languages',
      'Train and record your own signs',
      'Direct paste into any focused text field',
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  },
]

/**
 * The CSP nonce minted for this request in proxy.ts, or undefined when there
 * is no request to read - the desktop build is a static export, where proxy.ts
 * never runs and headers() is not available. Reading it is what makes every
 * page dynamic, which nonce-based CSP requires anyway.
 */
async function cspNonce(): Promise<string | undefined> {
  if (process.env.DESKTOP_BUILD === '1') return undefined
  const { headers } = await import('next/headers')
  return (await headers()).get('x-nonce') ?? undefined
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const nonce = await cspNonce()

  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <JsonLd data={siteGraph} nonce={nonce} />
      </head>
      <body className="antialiased font-sans">
        {children}
        {/* Only on a real Vercel deployment. Anywhere else the insights script
            does not exist, so rendering this guarantees a 404 and a console
            error - on a self-hosted build, in the Electron app and in local
            production runs alike. */}
        {process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' &&
          !process.env.NEXT_PUBLIC_DESKTOP && <Analytics />}
      </body>
    </html>
  )
}
