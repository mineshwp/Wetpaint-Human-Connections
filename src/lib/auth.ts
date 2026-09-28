import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"
import { readImpersonationCookies } from "./impersonation"
import { deriveRole, getHeadedDepartmentIds } from "./roles"
import { createAdminClient } from "./supabase/admin"

/** The signed-in user's own role, ignoring any "view as" session. */
export async function getRealUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole | null> {
  const { data } = await supabase
    .from("app_users")
    .select("active_role, employee_id")
    .eq("id", userId)
    .single()
  return deriveRole(supabase, (data?.active_role as UserRole) ?? null, data?.employee_id ?? null)
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
    supabase.from("employees").select("department_id, manager_id").eq("id", targetEmployeeId).single(),
  ])
  if (!target) return false
  if (scope.kind === "departments") return !!target.department_id && scope.ids.includes(target.department_id)
  if (scope.kind === "reports") return target.manager_id === scope.managerId
  return false
}

/**
 * Who a department head or manager may list and open (besides themselves):
 *  - department head → every department they head
 *  - manager → their whole department, or only their direct reports
 *    (people whose "Reports to" is them), as HR sets on the login card
 *  - anyone else → nobody
 */
export type TeamScope =
  | { kind: "none" }
  | { kind: "departments"; ids: string[] }
  | { kind: "reports"; managerId: string }

export type ManagerScope = "department" | "reports"

/** A Manager login's scope. Service client: HR may be viewing as that person. */
export async function getManagerScope(employeeId: string): Promise<ManagerScope> {
  const { data } = await createAdminClient()
    .from("app_users")
    .select("manager_scope")
    .eq("employee_id", employeeId)
    .limit(1)
    .maybeSingle()
  return data?.manager_scope === "reports" ? "reports" : "department"
}

export async function getTeamScope(
  supabase: SupabaseClient,
  role: UserRole | null,
  myEmployeeId: string | null
): Promise<TeamScope> {
  if (!myEmployeeId) return { kind: "none" }
  if (role === "dept_head") {
    const ids = await getHeadedDepartmentIds(supabase, myEmployeeId)
    return ids.length ? { kind: "departments", ids } : { kind: "none" }
  }
  if (role === "manager") {
    if ((await getManagerScope(myEmployeeId)) === "reports") {
      return { kind: "reports", managerId: myEmployeeId }
    }
    const { data } = await supabase
      .from("employees")
      .select("department_id")
      .eq("id", myEmployeeId)
      .single()
    return data?.department_id ? { kind: "departments", ids: [data.department_id] } : { kind: "none" }
  }
  return { kind: "none" }
}

// Matches no row — used when a scope is empty.
const NO_MATCH = "00000000-0000-0000-0000-000000000000"

/** Restrict an employees query builder to a team scope (returns the same builder type). */
export function applyTeamScope<Q>(query: Q, scope: TeamScope): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any
  if (scope.kind === "departments") return q.in("department_id", scope.ids)
  if (scope.kind === "reports") return q.eq("manager_id", scope.managerId)
  return q.eq("id", NO_MATCH)
}
