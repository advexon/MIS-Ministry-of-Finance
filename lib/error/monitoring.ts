import * as Sentry from "@sentry/nextjs"

export interface ErrorContext {
  userId?: string
  email?: string
  loanId?: string
  action?: string
  metadata?: Record<string, any>
}

/**
 * Centralized error handling and reporting
 */
export function captureError(
  error: Error | unknown,
  context?: ErrorContext,
  level: "fatal" | "error" | "warning" | "info" = "error"
) {
  const err = error instanceof Error ? error : new Error(String(error))

  // Set user context if available
  if (context?.userId || context?.email) {
    Sentry.setUser({
      id: context.userId,
      email: context.email,
    })
  }

  // Add breadcrumb for tracking
  if (context?.action) {
    Sentry.captureMessage(`Action: ${context.action}`, level)
  }

  // Capture with extra context
  Sentry.captureException(err, {
    level,
    contexts: {
      app: {
        loanId: context?.loanId,
        action: context?.action,
        ...context?.metadata,
      },
    },
    tags: {
      action: context?.action || "unknown",
      userId: context?.userId || "anonymous",
    },
  })

  // Also log to console in development
  if (process.env.NODE_ENV === "development") {
    console.error("Captured error:", err, context)
  }
}

/**
 * Add a breadcrumb for tracking user actions
 */
export function addBreadcrumb(
  message: string,
  category = "user-action",
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info"
) {
  Sentry.captureMessage(message, level)
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    timestamp: Date.now() / 1000,
  })
}

/**
 * Set user context for all subsequent errors
 */
export function setErrorUser(userId: string, email?: string) {
  Sentry.setUser({
    id: userId,
    email: email,
  })
}

/**
 * Clear user context
 */
export function clearErrorUser() {
  Sentry.setUser(null)
}

/**
 * Wrap an async function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: ErrorContext
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    captureError(error, context)
    throw error
  }
}

/**
 * Wrap a sync function with error handling
 */
export function withErrorHandlingSync<T>(
  fn: () => T,
  context?: ErrorContext
): T {
  try {
    return fn()
  } catch (error) {
    captureError(error, context)
    throw error
  }
}

/**
 * Create a safe async function that doesn't throw
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  defaultValue?: T,
  context?: ErrorContext
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (error) {
    captureError(error, { ...context, action: "safeAsync" }, "warning")
    return defaultValue
  }
}

/**
 * Create a safe sync function that doesn't throw
 */
export function safeSync<T>(
  fn: () => T,
  defaultValue?: T,
  context?: ErrorContext
): T | undefined {
  try {
    return fn()
  } catch (error) {
    captureError(error, { ...context, action: "safeSync" }, "warning")
    return defaultValue
  }
}
