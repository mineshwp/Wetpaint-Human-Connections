import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { generateTempPassword } from "@/lib/password"
import { blockWhileImpersonating } from "@/lib/impersonation"

// Portal login for one employee (HR only). Onboarding is HR-set-password, like
// admins: Microsoft Safe Links auto-opens emailed one-time links, so we never
// send them. HR creates the login, gets a temporary password once, and hands it
// over; the person changes it from the user menu after signing in.
//
// Stored roles here are "staff" or "manager". A Manager sees their whole
// department, their direct reports, or their whole reporting line
// (manager_scope). HR admins are managed in Settings → Admins.
//
// app_users RLS is own-row-only, so cross-user reads/writes use the service-role
// client — HR authorization is enforced first.

const LOGIN_ROLES = ["staff", "manager"] as const
type LoginRole = (typeof LOGIN_ROLES)[number]
const MANAGER_SCOPES = ["department", "reports", "line"] as const
type ManagerScope = (typeof MANAGER_SCOPES)[number]
// Effectively permanent; lifted when HR restores access.
const BANNED = "876000h"

export type LoginStatus =
  | { state: "none" }
  | { state: "pending" | "active" | "disabled"; role: string; managerScope: ManagerScope; userId: string }

async function authorize() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase, userId: user.id }
}

async function loadStatus(employeeId: string): Promise<LoginStatus> {
  const admin = createAdminClient()
  const { data: appUser } = await admin
    .from("app_users")
    .select("id, active_role, accepted_at, manager_scope")
    .eq("employee_id", employeeId)
    .limit(1)
    .maybeSingle()
  if (!appUser) return { state: "none" }

  const { data: authUser } = await admin.auth.admin.getUserById(appUser.id)
  const bannedUntil = authUser?.user?.banned_until
  const disabled = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now()
  return {
    state: disabled ? "disabled" : appUser.accepted_at ? "active" : "pending",
    role: appUser.active_role,
    managerScope: MANAGER_SCOPES.includes(appUser.manager_scope) ? appUser.manager_scope : "department",
    userId: appUser.id,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (auth.error) return auth.error
  const { id } = await params
  return NextResponse.json({ login: await loadStatus(id) })
}

// Create a login, or reset the password (and restore access) for an existing one.
// Body: { role?: "staff" | "manager", manager_scope?: "department" | "reports" | "line" }
// — only applied when creating.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const auth = await authorize()
  if (auth.error) return auth.error
  const { supabase } = auth
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const requestedRole: LoginRole = LOGIN_ROLES.includes(body?.role) ? body.role : "staff"
  const requestedScope: ManagerScope = MANAGER_SCOPES.includes(body?.manager_scope) ? body.manager_scope : "department"

  const { data: emp } = await supabase
    .from("employees")
    .select("id, email, first_name, last_name, is_archived")
    .eq("id", id)
    .single()
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  if (emp.is_archived) {
    return NextResponse.json({ error: "Archived employees can't be given a login" }, { status: 400 })
  }
  const email = (emp.email ?? "").trim().toLowerCase()
  if (!email.endsWith("@wetpaint.co.za")) {
    return NextResponse.json(
      { error: "The employee needs a @wetpaint.co.za email address to sign in" },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const temp = generateTempPassword()
  const current = await loadStatus(id)

  if (current.state !== "none") {
    const { error } = await admin.auth.admin.updateUserById(current.userId, {
      password: temp,
      email_confirm: true,
      ban_duration: "none",
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ login: await loadStatus(id), tempPassword: temp })
  }

  // New login. An auth user may already exist for this email (e.g. an old
  // email invite) — reuse it with a known password.
  let authUserId: string
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temp,
    email_confirm: true,
    user_metadata: { employee_id: emp.id },
  })
  if (createError) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const found = list?.users.find((u) => (u.email ?? "").toLowerCase() === email)
    if (!found) return NextResponse.json({ error: createError.message }, { status: 500 })
    const { error: pwError } = await admin.auth.admin.updateUserById(found.id, {
      password: temp,
      email_confirm: true,
      ban_duration: "none",
    })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 })
    authUserId = found.id
  } else {
    authUserId = created.user.id
  }

  const { error: insertError } = await admin
    .from("app_users")
    .upsert(
      { id: authUserId, employee_id: emp.id, active_role: requestedRole, manager_scope: requestedScope, accepted_at: null },
      { onConflict: "id" }
    )
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ login: await loadStatus(id), tempPassword: temp }, { status: 201 })
}

// Change what the login can see. Body: { role: "staff" | "manager", manager_scope?: "department" | "reports" | "line" }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const auth = await authorize()
  if (auth.error) return auth.error
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  if (!LOGIN_ROLES.includes(body?.role)) {
    return NextResponse.json({ error: "role must be staff or manager" }, { status: 400 })
  }

  const current = await loadStatus(id)
  if (current.state === "none") return NextResponse.json({ error: "No login yet" }, { status: 404 })
  if (current.role === "hr") {
    return NextResponse.json(
      { error: "This person is an admin — change their access in Settings → Admins" },
      { status: 400 }
    )
  }

  const managerScope: ManagerScope = MANAGER_SCOPES.includes(body?.manager_scope) ? body.manager_scope : "department"
  const { error } = await createAdminClient()
    .from("app_users")
    .update({ active_role: body.role, manager_scope: managerScope, updated_at: new Date().toISOString() })
    .eq("id", current.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ login: await loadStatus(id) })
}

// Disable the login (the account and its history stay; POST restores it).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const auth = await authorize()
  if (auth.error) return auth.error
  const { id } = await params

  const current = await loadStatus(id)
  if (current.state === "none") return NextResponse.json({ error: "No login yet" }, { status: 404 })
  if (current.userId === auth.userId) {
    return NextResponse.json({ error: "You can't disable your own login" }, { status: 400 })
  }
  if (current.role === "hr") {
    return NextResponse.json(
      { error: "This person is an admin — remove admin access in Settings first" },
      { status: 400 }
    )
  }

  const { error } = await createAdminClient().auth.admin.updateUserById(current.userId, {
    ban_duration: BANNED,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ login: await loadStatus(id) })
}
