import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import {
  hasPermission,
  type Permission,
  type PermissionOverrides,
} from "@/lib/utils/permissions"
import type { Role } from "@/lib/types/database"

// Pure service-role client — no cookies, no session, no RLS.
// NOTHING may reach this client before passing requireUsersAccess() below.
function getAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_MISSUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(`Missing env vars: url=${!!url} key=${!!key}`)
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type Caller = {
  userId: string
  roleCode: string
  tier: number
  bankId: string | null
  /** PRSF-side roles see every bank; bank-side roles only see their own. */
  isBankScoped: boolean
}

/**
 * Gate for this route. Because every handler here talks to the database with
 * the service-role key (which bypasses RLS entirely), the endpoint has no
 * database-level protection at all — authorization MUST be enforced here.
 *
 * Authorization is driven by the same `role_permissions` data as the rest of
 * the app (falling back to PERMISSION_MATRIX), so bank_admin and auditor keep
 * the `users` access the matrix grants them instead of being hardcoded out.
 */
async function requireUsersAccess(
  permission: Permission,
): Promise<{ caller: Caller; error: null } | { caller: null; error: NextResponse }> {
  const supabase = await createServerSupabase()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      caller: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, bank_id, role:roles(id, code, tier)")
    .eq("id", user.id)
    .single()

  if (profile?.is_active === false) {
    return {
      caller: null,
      error: NextResponse.json({ error: "Account is disabled" }, { status: 403 }),
    }
  }

  const role = (profile?.role ?? null) as Role | null
  const roleCode = role?.code ?? ""
  const tier = role?.tier ?? 99

  // Load the role's DB-backed permissions so Role Management edits apply here.
  let overrides: PermissionOverrides | null = null
  if (role?.id) {
    const { data: permRows } = await supabase
      .from("role_permissions")
      .select("resource, can_view, can_create, can_update, can_delete, can_approve")
      .eq("role_id", role.id)

    if (permRows && permRows.length > 0) {
      overrides = {}
      for (const row of permRows) {
        overrides[row.resource] = {
          resource: row.resource,
          can_view: !!row.can_view,
          can_create: !!row.can_create,
          can_update: !!row.can_update,
          can_delete: !!row.can_delete,
          can_approve: !!row.can_approve,
        }
      }
    }
  }

  if (!hasPermission(role, "users", permission, overrides)) {
    return {
      caller: null,
      error: NextResponse.json(
        { error: `Forbidden: users:${permission} permission required` },
        { status: 403 },
      ),
    }
  }

  const isBankScoped = roleCode === "bank_admin" || roleCode === "bank_officer"

  return {
    caller: {
      userId: user.id,
      roleCode,
      tier,
      bankId: (profile as any)?.bank_id ?? null,
      isBankScoped,
    },
    error: null,
  }
}

export async function GET() {
  try {
    // Previously unauthenticated: this returned every profile (including email
    // addresses) to any caller on the internet.
    const { caller, error: authError } = await requireUsersAccess("view")
    if (authError) return authError

    const supabase = getAdminClient()

    // Because the service-role client bypasses RLS, bank isolation has to be
    // applied here — otherwise a bank_admin would see every bank's users.
    let usersQuery = supabase
      .from("profiles")
      .select("*, role:roles(*), bank:banks(*)")
      .order("created_at", { ascending: false })

    if (caller!.isBankScoped) {
      if (!caller!.bankId) {
        // A bank-scoped account with no bank assigned must see nobody rather
        // than falling through to an unfiltered list.
        return NextResponse.json({
          users: [], roles: [], banks: [], branches: [],
          callerRole: caller!.roleCode,
        })
      }
      usersQuery = usersQuery.eq("bank_id", caller!.bankId)
    }

    const [usersRes, rolesRes, banksRes, branchesRes] = await Promise.all([
      usersQuery,
      supabase.from("roles").select("*").order("name_en"),
      caller!.isBankScoped
        ? supabase.from("banks").select("*").eq("id", caller!.bankId).order("name_en")
        : supabase.from("banks").select("*").order("name_en"),
      caller!.isBankScoped
        ? supabase.from("bank_branches").select("*").eq("bank_id", caller!.bankId).order("name_en")
        : supabase.from("bank_branches").select("*").order("name_en"),
    ])

    if (usersRes.error) {
      console.error("[users API] profiles error:", JSON.stringify(usersRes.error))
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      users: usersRes.data ?? [],
      roles: rolesRes.data ?? [],
      banks: banksRes.data ?? [],
      branches: branchesRes.data ?? [],
      callerRole: caller!.roleCode,
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
    // Previously unauthenticated: any caller could set any user's role_id and
    // grant themselves super_admin.
    const { caller, error: authError } = await requireUsersAccess("update")
    if (authError) return authError

    const supabase = getAdminClient()
    const body = await request.json()

    const { userId, first_name, last_name, phone, role_id, bank_id, is_active } = body

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    // Load the target once, for bank-isolation, privilege checks, and the
    // before-image recorded in the audit trail.
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("first_name, last_name, phone, role_id, bank_id, is_active, role:roles(tier)")
      .eq("id", userId)
      .single()

    if (!targetProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Bank-scoped admins may only touch users in their own bank, and may not
    // move a user to a different bank.
    if (caller!.isBankScoped) {
      if (!caller!.bankId || targetProfile.bank_id !== caller!.bankId) {
        return NextResponse.json(
          { error: "You can only modify users belonging to your own bank." },
          { status: 403 },
        )
      }
      if (bank_id !== undefined && bank_id !== caller!.bankId) {
        return NextResponse.json(
          { error: "You cannot reassign a user to another bank." },
          { status: 403 },
        )
      }
    }

    // Guard against self-lockout and self-escalation: an admin editing their
    // own record may not change their role or deactivate themselves.
    const isSelf = userId === caller!.userId
    if (isSelf && role_id !== undefined) {
      return NextResponse.json(
        { error: "You cannot change your own role." },
        { status: 403 },
      )
    }
    if (isSelf && is_active === false) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account." },
        { status: 403 },
      )
    }

    // Privilege ceiling: only super_admin may grant or modify super_admin-level
    // access, so a prsf_admin cannot mint an account more powerful than itself.
    if (role_id && caller!.roleCode !== "super_admin") {
      const { data: targetRole } = await supabase
        .from("roles")
        .select("code, tier")
        .eq("id", role_id)
        .single()

      if (!targetRole) {
        return NextResponse.json({ error: "Unknown role_id" }, { status: 400 })
      }
      if ((targetRole.tier ?? 99) < caller!.tier) {
        return NextResponse.json(
          { error: "You cannot assign a role more privileged than your own." },
          { status: 403 },
        )
      }
    }

    // Likewise, nobody may edit a user more privileged than themselves.
    if (caller!.roleCode !== "super_admin") {
      const targetTier = (targetProfile.role as { tier?: number } | null)?.tier ?? 99
      if (targetTier < caller!.tier) {
        return NextResponse.json(
          { error: "You cannot modify a user more privileged than your own role." },
          { status: 403 },
        )
      }
    }

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

    // Record who changed whom, so user administration is auditable. Only the
    // fields actually being changed are recorded, alongside their prior values.
    const changedKeys = Object.keys(updateData).filter((k) => k !== "updated_at")
    const oldData: Record<string, any> = {}
    for (const k of changedKeys) {
      oldData[k] = (targetProfile as Record<string, any>)[k] ?? null
    }

    const { error: auditError } = await supabase.from("audit_trail").insert({
      table_name: "profiles",
      record_id: userId,
      action: "UPDATE",
      changed_by: caller!.userId,
      old_data: oldData,
      new_data: updateData,
      ip_address:
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
        request.headers.get("x-real-ip") ??
        null,
      user_agent: request.headers.get("user-agent"),
    })

    // A failed audit write must not hide a successful update, but it should be
    // visible rather than silently swallowed.
    if (auditError) {
      console.error("[users API PATCH] audit write failed:", auditError.message)
    }

    return NextResponse.json({ user: data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[users API PATCH] fatal error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
