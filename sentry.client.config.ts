import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: SENTRY_DSN ? true : false,
  
  // Integrations
  integrations: [
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  
  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || "unknown",
  
  // Before sending to Sentry
  beforeSend(event, hint) {
    // Ignore certain errors
    if (event.exception) {
      const error = hint.originalException
      if (error instanceof Error) {
        // Ignore network errors in development
        if (process.env.NODE_ENV === "development" && error.message.includes("Network")) {
          return null
        }
      }
    }
    return event
  },
  
  // Ignore certain URLs
  ignoreErrors: [
    // Browser extensions
    "top.GLOBALS",
    // Chrome extensions
    "chrome-extension://",
    // Firefox extensions
    "moz-extension://",
    // Random plugins
    "Can't find variable: ZiteReader",
    "jigsaw is not defined",
    "ComboSearch is not defined",
  ],
})
