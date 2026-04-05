// Error monitoring utilities
// Sentry is temporarily disabled until it supports Next.js 16
// These functions provide a no-op fallback while maintaining the same API

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

  // Log to console (would be sent to Sentry in production)
  if (process.env.NODE_ENV === "development") {
    console.error(`[${level.toUpperCase()}]`, err.message, context)
  } else {
    // In production, log errors for server-side visibility
    console.error(`[Error Capture] ${level}:`, err.message, {
      action: context?.action,
      userId: context?.userId,
      loanId: context?.loanId,
    })
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
  if (process.env.NODE_ENV === "development") {
    console.log(`[Breadcrumb] ${category}: ${message}`)
  }
}

/**
 * Set user context for all subsequent errors
 */
export function setErrorUser(userId: string, email?: string) {
  // No-op without Sentry
}

/**
 * Clear user context
 */
export function clearErrorUser() {
  // No-op without Sentry
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
