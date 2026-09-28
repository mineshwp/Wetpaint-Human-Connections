import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"
import { createAdminClient } from "./supabase/admin"
import { resolveRole } from "./access-levels"

// "View as" — HR/Admin previews the app exactly as another employee sees it.
// Stored in httpOnly cookies set by /api/impersonate. The cookies are only
// honoured when the signed-in user's real role is HR (checked in lib/auth.ts
// and getImpersonationContext below), so a non-HR user can't forge them.
// While a "view as" session is active the app is view-only: every write
// endpoint calls blockWhileImpersonating().

export const IMPERSONATE_COOKIES = {
  id: "impersonate_employee_id",
  name: "impersonate_employee_name",
  role: "impersonate_role",
} as const

const VIEWABLE_ROLES: UserRole[] = ["hr", "manager", "staff"]

export interface ImpersonationContext {
  employeeId: string
  employeeName: string
  role: UserRole
}

/** Raw cookie read — NOT validated against the real user's role. */
export async function readImpersonationCookies(): Promise<ImpersonationContext | null> {
  const cookieStore = await cookies()
  const id = cookieStore.get(IMPERSONATE_COOKIES.id)?.value
  const name = cookieStore.get(IMPERSONATE_COOKIES.name)?.value
  if (!id || !name) return null
  const rawRole = cookieStore.get(IMPERSONATE_COOKIES.role)?.value as UserRole | undefined
  const role = rawRole && VIEWABLE_ROLES.includes(rawRole) ? rawRole : "staff"
  return { employeeId: id, employeeName: name, role }
}

/** Active "view as" session, or null. Only returned when the real user is HR. */
export async function getImpersonationContext(
  supabase: SupabaseClient,
  userId: string
): Promise<ImpersonationContext | null> {
  const ctx = await readImpersonationCookies()
  if (!ctx) return null
  const { data } = await supabase
    .from("app_users")
    .select("active_role")
    .eq("id", userId)
    .single()
  return data?.active_role === "hr" ? ctx : null
}

/**
 * Guard for write endpoints. Returns a 403 response while a "view as" session
 * is active, otherwise null. Deliberately unvalidated: the cookie can only
 * ever make a request more restricted, never less.
 */
export async function blockWhileImpersonating(): Promise<NextResponse | null> {
  const ctx = await readImpersonationCookies()
  if (!ctx) return null
  return NextResponse.json(
    { error: `View only — you're viewing as ${ctx.employeeName}. Exit the view to make changes.` },
    { status: 403 }
  )
}

const VIEWABLE_STATUSES = ["active", "onboarding"]

export type StartViewAsResult =
  | { ok: true; employeeName: string }
  | { ok: false; status: 403 | 404; error: string }

/**
 * Start a "view as" session. The caller must already have verified the real
 * user is HR. `asStaff` is the "View as Staff" preview of your own record,
 * which always uses the staff role; any other employee is viewed with their
 * own role so the app looks exactly as it does when they log in.
 */
export async function startViewAs(
  supabase: SupabaseClient,
  realUserId: string,
  employeeId: string,
  opts: { asStaff?: boolean } = {}
): Promise<StartViewAsResult> {
  const [{ data: me }, { data: emp }] = await Promise.all([
    supabase.from("app_users").select("employee_id").eq("id", realUserId).single(),
    supabase
      .from("employees")
      .select("id, first_name, last_name, status, is_archived")
      .eq("id", employeeId)
      .single(),
  ])
  if (!emp) return { ok: false, status: 404, error: "Employee not found" }

  const isSelf = me?.employee_id === emp.id
  if (!isSelf && (emp.is_archived || !VIEWABLE_STATUSES.includes(emp.status))) {
    return { ok: false, status: 403, error: "Only active or onboarding staff can be viewed" }
  }

  let role: UserRole = "staff"
  if (!(opts.asStaff && isSelf)) {
    // app_users RLS is own-row-only, so the target's role needs the service role.
    // No login yet → viewed with the access level HR has set for them, so a
    // manager can be checked before they ever sign in.
    const admin = createAdminClient()
    const [{ data: target }, { data: level }] = await Promise.all([
      admin.from("app_users").select("active_role").eq("employee_id", emp.id).limit(1).maybeSingle(),
      admin.from("employees").select("access_level").eq("id", emp.id).maybeSingle(),
    ])
    const stored = (target?.active_role as UserRole | undefined) ?? "staff"
    const resolved = resolveRole(stored, level?.access_level)
    if (resolved && VIEWABLE_ROLES.includes(resolved)) role = resolved
  }

  const employeeName = `${emp.first_name} ${emp.last_name}`.trim()
  const cookieStore = await cookies()
  const opt = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" }
  cookieStore.set(IMPERSONATE_COOKIES.id, emp.id, opt)
  cookieStore.set(IMPERSONATE_COOKIES.name, employeeName, opt)
  cookieStore.set(IMPERSONATE_COOKIES.role, role, opt)
  return { ok: true, employeeName }
}

export async function clearViewAs() {
  const cookieStore = await cookies()
  for (const name of Object.values(IMPERSONATE_COOKIES)) cookieStore.delete(name)
}
