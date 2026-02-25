import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Pure service-role client — no cookies, no session, no RLS
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(`Missing env vars: url=${!!url} key=${!!key}`)
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET() {
  try {
    const supabase = getAdminClient()

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
      console.error("[users API] profiles error:", JSON.stringify(usersRes.error))
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 })
    }

    console.log("[users API] returning", usersRes.data?.length, "users")

    return NextResponse.json({
      users: usersRes.data ?? [],
      roles: rolesRes.data ?? [],
      banks: banksRes.data ?? [],
      branches: branchesRes.data ?? [],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[users API] fatal error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
