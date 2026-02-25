import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()

    // Verify caller is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
