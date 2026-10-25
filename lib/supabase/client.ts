import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One browser client per tab.
 *
 * createBrowserClient() returns a brand-new client on every call, and this
 * function is called inline in the body of ~33 components. A fresh object each
 * render makes any useCallback/useMemo/useEffect that lists the client as a
 * dependency re-run on every render, which on the ККГ page produced an endless
 * load loop that wiped the meeting list mid-fetch. Each instance also opens its
 * own auth listener and token-refresh timer.
 *
 * Caching the instance keeps the client referentially stable, so hook
 * dependencies behave and every call site shares one auth/session state.
 */
let browserClient: SupabaseClient | undefined

export function createClient() {
  // On the server (or during prerender) never reuse an instance across requests —
  // that would leak one user's session into another's.
  if (typeof window === 'undefined') {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
      process.env.NEXT_PUBLIC_MISSUPABASE_ANON_KEY!,
    )
  }

  browserClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
    process.env.NEXT_PUBLIC_MISSUPABASE_ANON_KEY!,
  )

  return browserClient
}
