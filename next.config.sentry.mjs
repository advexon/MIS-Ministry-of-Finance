import * as Sentry from "@sentry/nextjs"
import "./sentry.server.config"

const nextConfig = {
  reactCompiler: true,
  cacheComponents: true,
}

export default Sentry.withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps related errors
  silent: !process.env.CI,

  // For security reasons, auth token should be defined as an environment variable.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  automaticVercelMonitors: true,
})
