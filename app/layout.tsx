import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

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

export const metadata: Metadata = {
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
