import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Admin read: uses service role key to bypass RLS so the superadmin
// can always see all users regardless of their own profile's RLS policies.
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Session client — used only to verify the caller is authenticated
async function createSessionClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
}

export async function GET() {
  try {
    // 1. Verify caller is authenticated
    const sessionClient = await createSessionClient()
    const { data: { user }, error: authError } = await sessionClient.auth.getUser()

    if (authError || !user) {
      console.error("[users API] auth check failed:", authError?.message)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Use service role client to fetch all data (bypasses RLS)
    const supabase = createServiceClient()

    const [usersRes, rolesRes, banksRes, branchesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*, role:roles(*), bank:banks(*)")
        .order("created_at", { ascending: false }),
      supabase.from("roles").select("*").order("name_en"),
      supabase.from("banks").select("*").order("name_en"),
      supabase.from("bank_branches").select("*").order("name_en"),
    ])

    if (usersRes.error) {
      console.error("[users API] profiles error:", usersRes.error)
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      users: usersRes.data ?? [],
      roles: rolesRes.data ?? [],
      banks: banksRes.data ?? [],
      branches: branchesRes.data ?? [],
    })
  } catch (err) {
    console.error("[users API] unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
