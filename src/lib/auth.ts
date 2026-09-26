import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"
import { readImpersonationCookies } from "./impersonation"
import { deriveRole, getHeadedDepartmentIds } from "./roles"

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

  // Department head: anyone in a department they head
  if (role === "dept_head") {
    const [headed, { data: targetEmp }] = await Promise.all([
      getHeadedDepartmentIds(supabase, myEmployeeId),
      supabase.from("employees").select("department_id").eq("id", targetEmployeeId).single(),
    ])
    return !!targetEmp?.department_id && headed.includes(targetEmp.department_id)
  }

  // Manager: anyone in same department
  const [{ data: myEmp }, { data: targetEmp }] = await Promise.all([
    supabase.from("employees").select("department_id").eq("id", myEmployeeId).single(),
    supabase.from("employees").select("department_id").eq("id", targetEmployeeId).single(),
  ])

  return (
    !!myEmp?.department_id && myEmp.department_id === targetEmp?.department_id
  )
}

/**
 * Departments whose staff a manager / department head may list: a manager's
 * own department, or every department a head heads. Empty for anyone else.
 */
export async function getScopedDepartmentIds(
  supabase: SupabaseClient,
  role: UserRole | null,
  myEmployeeId: string | null
): Promise<string[]> {
  if (!myEmployeeId) return []
  if (role === "dept_head") return getHeadedDepartmentIds(supabase, myEmployeeId)
  if (role === "manager") {
    const { data } = await supabase
      .from("employees")
      .select("department_id")
      .eq("id", myEmployeeId)
      .single()
    return data?.department_id ? [data.department_id] : []
  }
  return []
}
