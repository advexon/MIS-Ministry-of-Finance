import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

const inter = Inter({ 
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'PRSF Loan Tracking MIS',
  description: 'Partial Risk Sharing Facility - Loan Tracking and Management Information System for the Ministry of Finance of Tajikistan',
  generator: 'v0.app',
  keywords: ['PRSF', 'Loan', 'Guarantee', 'Tajikistan', 'MSME', 'Finance'],
}

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
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
