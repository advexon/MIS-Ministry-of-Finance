import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = process.env.SENTRY_DSN

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV,
  enabled: SENTRY_DSN ? true : false,
  
  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  
  // Release tracking
  release: process.env.APP_VERSION || "unknown",
  
  // Ignore certain errors
  ignoreErrors: [
    "top.GLOBALS",
    "chrome-extension://",
    "moz-extension://",
    "Can't find variable: ZiteReader",
    "jigsaw is not defined",
    "ComboSearch is not defined",
  ],
})
