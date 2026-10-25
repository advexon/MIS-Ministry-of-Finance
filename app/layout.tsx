import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'

import './globals.css'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
  // Only load the weights actually used in the design — avoids fetching all variants
  weight: ['400', '500', '600', '700'],
  // display=swap prevents invisible text during font load (FOIT)
  display: 'swap',
  // Preload the font so the browser fetches it before CSS parsing
  preload: true,
})

// Institutional serif used for display headings only — pairs with Inter for UI/data
const sourceSerif = Source_Serif_4({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-source-serif',
  weight: ['400', '600', '700'],
  display: 'swap',
  preload: true,
})

export const metadata: Metadata = {
  authors: [{ name: 'Siyovush Mirzoev' }],
  creator: 'Siyovush Mirzoev',
  title: {
    default: 'Credit Guarantee Fund MIS',
    template: '%s | CGF MIS',
  },
  description:
    'Credit Guarantee Fund — Loan Tracking and Management Information System for the Ministry of Finance of Tajikistan.',
  robots: { index: false, follow: false }, // Internal tool — keep out of search engines
}

export const viewport: Viewport = {
  themeColor: '#1d3a6b',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className={`${inter.variable} ${sourceSerif.variable} font-sans antialiased`}>
        {children}
        {/*
          Every toast() call in the app was being dropped because no Toaster was
          ever mounted, so failed saves and permission errors across 11 screens
          reported nothing at all to the user. Mounted once here at the root.
        */}
        <Toaster />
      </body>
    </html>
  )
}
