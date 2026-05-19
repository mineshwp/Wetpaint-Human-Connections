import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"

export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole | null> {
  const { data } = await supabase
    .from("app_users")
    .select("active_role")
    .eq("id", userId)
    .single()
  return (data?.active_role as UserRole) ?? null
}

export async function getEmployeeIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("id", userId)
    .single()
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

  if (role === "staff") {
    return myEmployeeId === targetEmployeeId
  }

  // Manager: own record or anyone in same department
  if (myEmployeeId === targetEmployeeId) return true

  const [{ data: myEmp }, { data: targetEmp }] = await Promise.all([
    supabase.from("employees").select("department_id").eq("id", myEmployeeId).single(),
    supabase.from("employees").select("department_id").eq("id", targetEmployeeId).single(),
  ])

  return (
    !!myEmp?.department_id && myEmp.department_id === targetEmp?.department_id
  )
}
