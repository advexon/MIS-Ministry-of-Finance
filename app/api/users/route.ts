import { NextRequest, NextResponse } from "next/server"
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

// PATCH - Update a user profile (admin only, bypasses RLS)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await request.json()
    
    const { userId, first_name, last_name, phone, role_id, bank_id, is_active } = body
    
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    console.log("[users API PATCH] Updating user:", userId, "with role_id:", role_id)

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    
    // Only include fields that are explicitly provided
    if (first_name !== undefined) updateData.first_name = first_name || null
    if (last_name !== undefined) updateData.last_name = last_name || null
    if (phone !== undefined) updateData.phone = phone || null
    if (role_id !== undefined) updateData.role_id = role_id || null
    if (bank_id !== undefined) updateData.bank_id = bank_id || null
    if (is_active !== undefined) updateData.is_active = is_active

    const { data, error } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select("*, role:roles(*), bank:banks(*)")
      .single()

    if (error) {
      console.error("[users API PATCH] update error:", JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[users API PATCH] Updated successfully, new role_id:", data?.role_id, "role:", data?.role?.name_en)

    return NextResponse.json({ user: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[users API PATCH] fatal error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
