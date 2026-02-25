import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
    process.env.NEXT_PUBLIC_MISSUPABASE_ANON_KEY!,
  )
}
