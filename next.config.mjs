/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 16.4.3 can deliver late debug chunks to a closed WebSocket stream.
    // Keep React debug data in the RSC response instead of that optional channel.
    reactDebugChannel: false,
  },

  // Enable Next.js built-in image optimisation (was disabled — re-enable for
  // automatic WebP/AVIF conversion, responsive srcset, and lazy loading).
  images: {
    formats: ['image/avif', 'image/webp'],
    // Allow the Vercel blob store domain used for uploaded assets
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'hebbkx1anhila5yf.public.blob.vercel-storage.com',
      },
    ],
    // Serve the logo at the sizes actually used in the UI
    deviceSizes: [640, 768, 1024, 1280, 1536],
    imageSizes: [24, 32, 40, 64, 96],
  },

  async headers() {
    const privateHeaders = [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    ]
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      { source: '/dashboard/:path*', headers: privateHeaders },
      { source: '/api/:path*', headers: privateHeaders },
      { source: '/auth/:path*', headers: privateHeaders },
    ]
  },

  // Next.js 16 uses Turbopack by default. Set root to current directory
  // to ensure proper package resolution.
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
