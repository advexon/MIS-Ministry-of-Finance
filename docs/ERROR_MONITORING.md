# Error Monitoring and Sentry Setup

This document outlines the error monitoring system implemented for the PRSF Loan Management System.

## Overview

The application uses **Sentry** for comprehensive error tracking, performance monitoring, and session replay. This allows us to:
- Capture and track all application errors in real-time
- Monitor application performance
- Replay user sessions to understand what led to errors
- Set up alerts for critical issues

## Configuration

### Environment Variables

Required Sentry environment variables (see `.env.example`):

```
# Public DSN (for browser)
NEXT_PUBLIC_SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id

# Server DSN (for backend)
SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id

# Sentry organization and project
SENTRY_ORG=your-sentry-org
SENTRY_PROJECT=your-sentry-project

# Authentication token for source map uploads
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

### Setup Steps

1. **Create Sentry Account**
   - Go to [sentry.io](https://sentry.io)
   - Create a new account or sign in
   - Create a new project with platform "Next.js"

2. **Get Your DSN**
   - Copy the DSN from your Sentry project settings
   - Add to `.env.development.local` and production environment variables

3. **Configure Auth Token** (for source map uploads)
   - Go to Sentry Settings → Auth Tokens
   - Create a new token with `project:write` permission
   - Add to environment variables

## Usage

### Automatic Error Capture

All unhandled errors are automatically captured:
- React component errors
- Promise rejections
- Server-side exceptions
- Network errors

### Manual Error Capture

```typescript
import { captureError, addBreadcrumb } from "@/lib/error/monitoring"

// Capture an error
try {
  await processLoan(loanId)
} catch (error) {
  captureError(error, {
    userId: currentUser.id,
    loanId: loanId,
    action: "processLoan",
    metadata: { attempt: 2 }
  })
}

// Add a breadcrumb for tracking
addBreadcrumb("User viewed loan details", "navigation")

// Safe async function that won't throw
const result = await safeAsync(
  () => fetchLoanData(id),
  null,
  { userId, action: "fetchLoanData" }
)

// Set user context for all subsequent errors
setErrorUser(userId, email)
```

### Error Context

When capturing errors, provide context:
- `userId`: User ID for filtering issues by user
- `email`: User email
- `loanId`: Loan ID if error relates to a specific loan
- `action`: What action was being performed
- `metadata`: Any additional data

## File Structure

- `sentry.client.config.ts` - Client-side Sentry configuration
- `sentry.server.config.ts` - Server-side Sentry configuration
- `lib/error/monitoring.ts` - Error handling utilities
- `lib/error/error-boundary.tsx` - React Error Boundary component

## Best Practices

1. **Always include context** - Provide user ID, action, and relevant IDs when capturing errors
2. **Use breadcrumbs** - Add breadcrumbs for important user actions to understand error context
3. **Set user context** - Call `setErrorUser()` after login to track errors per user
4. **Use safe functions** - Use `safeAsync()` or `safeSync()` for non-critical operations
5. **Test in development** - Errors in development won't be sent to Sentry (DSN checking)

## Monitoring Dashboard

Access your Sentry dashboard to:
- View real-time errors and their frequency
- See user information and session details
- View performance metrics and transaction traces
- Set up alerts and integrations (Slack, email, etc.)

## Performance Monitoring

Sentry automatically monitors:
- Page load times
- API response times
- Database query performance
- Custom transactions you define

## Session Replay

When errors occur, Sentry captures:
- User interactions
- Console logs
- Network requests
- DOM changes
- Network errors

**Note:** Session replay is disabled in privacy mode and for sensitive data (masked).

## Alerts

Set up alerts in Sentry dashboard for:
- New errors
- Error spikes
- Performance degradation
- Specific error messages

## Troubleshooting

### Errors not appearing in Sentry
- Check that `NEXT_PUBLIC_SENTRY_DSN` is set correctly
- Ensure DSN is valid and project is active in Sentry
- Check browser console for any Sentry-related errors

### Source maps not uploading
- Verify `SENTRY_AUTH_TOKEN` is set
- Check that `SENTRY_ORG` and `SENTRY_PROJECT` match your Sentry account
- Ensure CI/CD environment has all required variables

### Too much data
- Adjust `tracesSampleRate` in config (currently 10% for production)
- Disable session replay if not needed
- Use `beforeSend` to filter out noise

## References

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Error Monitoring Best Practices](https://docs.sentry.io/platforms/javascript/guides/nextjs/best-practices/)
