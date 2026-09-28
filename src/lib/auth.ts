import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"
import { readImpersonationCookies } from "./impersonation"
import { reportingLine } from "./reporting-line"
import { createAdminClient } from "./supabase/admin"
import { resolveRole } from "./access-levels"

/**
 * The signed-in user's own role, ignoring any "view as" session. HR/applicant
 * come from the login; otherwise Staff vs Manager comes from the employee's
 * access level (set by HR in Settings → Who can see what).
 */
export async function getRealUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole | null> {
  const { data } = await supabase
    .from("app_users")
    .select("active_role, employee_id")
    .eq("id", userId)
    .single()
  const stored = (data?.active_role as UserRole) ?? null
  if (stored === "hr" || stored === "applicant" || !stored) return stored
  return resolveRole(stored, data?.employee_id ? await getAccessLevel(data.employee_id) : null)
}

/** An employee's access level. Service client: the column isn't granted to sessions. */
export async function getAccessLevel(employeeId: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("employees")
    .select("access_level")
    .eq("id", employeeId)
    .maybeSingle()
  return data?.access_level ?? "staff"
}

/**
 * Effective role. While an HR user is viewing as someone else, this is the
 * viewed employee's role, so every page and API route scopes itself exactly
 * as it would for that person.
 */
export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole | null> {
  const role = await getRealUserRole(supabase, userId)
  if (role === "hr") {
    const viewing = await readImpersonationCookies()
    if (viewing) return viewing.role
  }
  return role
}

/** Effective employee id (the viewed employee's while viewing as someone). */
export async function getEmployeeIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("app_users")
    .select("employee_id, active_role")
    .eq("id", userId)
    .single()
  if (data?.active_role === "hr") {
    const viewing = await readImpersonationCookies()
    if (viewing) return viewing.employeeId
  }
  return data?.employee_id ?? null
}

export async function canAccessEmployee(
  supabase: SupabaseClient,
  userId: string,
  role: UserRole | null,
  targetEmployeeId: string
): Promise<boolean> {
  if (role === "hr") return true
  if (!role || role === "applicant") return false

  const myEmployeeId = await getEmployeeIdForUser(supabase, userId)
  if (!myEmployeeId) return false

  if (myEmployeeId === targetEmployeeId) return true
  if (role === "staff") return false

  const [scope, { data: target }] = await Promise.all([
    getTeamScope(supabase, role, myEmployeeId),
    supabase.from("employees").select("department_id").eq("id", targetEmployeeId).single(),
  ])
  if (!target) return false
  if (scope.kind === "departments") return !!target.department_id && scope.ids.includes(target.department_id)
  if (scope.kind === "people") return scope.ids.includes(targetEmployeeId)
  return false
}

/**
 * Who a Manager may list and open besides themselves, from their access level
 * (employees.access_level, set by HR):
 *  - manager_department → everyone in their department
 *  - manager_reports    → people whose "Reports to" is them
 *  - manager_line       → their whole reporting line (reports, their reports, …)
 * Anyone who isn't a Manager → nobody. Mirrored by hc_can_see_employee.
 */
export type TeamScope =
  | { kind: "none" }
  | { kind: "departments"; ids: string[] }
  | { kind: "people"; ids: string[] }

export async function getTeamScope(
  supabase: SupabaseClient,
  role: UserRole | null,
  myEmployeeId: string | null
): Promise<TeamScope> {
  if (!myEmployeeId || role !== "manager") return { kind: "none" }
  const level = await getAccessLevel(myEmployeeId)

  if (level === "manager_department") {
    const { data } = await supabase.from("employees").select("department_id").eq("id", myEmployeeId).single()
    return data?.department_id ? { kind: "departments", ids: [data.department_id] } : { kind: "none" }
  }
  if (level === "manager_reports") {
    const { data } = await supabase.from("employees").select("id").eq("manager_id", myEmployeeId)
    const ids = (data ?? []).map((r) => r.id as string).filter((id) => id !== myEmployeeId)
    return ids.length ? { kind: "people", ids } : { kind: "none" }
  }
  if (level !== "manager_line") return { kind: "none" }
  const { data } = await supabase.from("employees").select("id, manager_id")
  const ids = reportingLine((data ?? []) as { id: string; manager_id: string | null }[], myEmployeeId)
  return ids.length ? { kind: "people", ids } : { kind: "none" }
}

// Matches no row — used when a scope is empty.
const NO_MATCH = "00000000-0000-0000-0000-000000000000"

/** Restrict an employees query builder to a team scope (returns the same builder type). */
export function applyTeamScope<Q>(query: Q, scope: TeamScope): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any
  if (scope.kind === "departments") return q.in("department_id", scope.ids)
  if (scope.kind === "people") return q.in("id", scope.ids)
  return q.eq("id", NO_MATCH)
}
