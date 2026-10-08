import { withAudit } from "@/lib/activity-log"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { generateTempPassword } from "@/lib/password"
import { blockWhileImpersonating } from "@/lib/impersonation"

// Portal login for one employee (HR only). Onboarding is HR-set-password, like
// admins: Microsoft Safe Links auto-opens emailed one-time links, so we never
// send them. HR creates the login, gets a temporary password once, and hands it
// over.
//
// What the person can see is NOT set here: it's their access level
// (employees.access_level), set by HR in Settings → Who can see what — even
// before they have a login. HR admins are managed in Settings → Administrators.
//
// app_users RLS is own-row-only, so cross-user reads/writes use the service-role
// client — HR authorization is enforced first.

// Effectively permanent; lifted when HR restores access.
const BANNED = "876000h"

export type LoginStatus =
  | { state: "none" }
  | { state: "pending" | "active" | "disabled"; role: string; userId: string }

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
    .select("id, active_role, accepted_at")
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
    userId: appUser.id,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (auth.error) return auth.error
  const { id } = await params
  const { data: emp } = await createAdminClient().from("employees").select("access_level").eq("id", id).maybeSingle()
  return NextResponse.json({ login: await loadStatus(id), accessLevel: emp?.access_level ?? "staff" })
}

// Create a login, or reset the password (and restore access) for an existing one.
async function handlePOST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const auth = await authorize()
  if (auth.error) return auth.error
  const { supabase } = auth
  const { id } = await params


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
      { id: authUserId, employee_id: emp.id, active_role: "staff", accepted_at: null },
      { onConflict: "id" }
    )
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ login: await loadStatus(id), tempPassword: temp }, { status: 201 })
}

// Disable the login (the account and its history stay; POST restores it).
async function handleDELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

export const POST = withAudit(handlePOST, {"section": "Portal login", "action": {"POST": "Created / reset portal login", "DELETE": "Disabled portal login"}, "target": "employee"})
export const DELETE = withAudit(handleDELETE, {"section": "Portal login", "action": {"POST": "Created / reset portal login", "DELETE": "Disabled portal login"}, "target": "employee"})
