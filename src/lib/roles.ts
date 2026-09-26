import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserRole } from "./types"

// Department heads are not a stored role. Anyone listed in department_heads
// is treated as "dept_head" (unless they are HR or an applicant), so assigning
// or removing a head in the Departments manager takes effect immediately and
// can never drift from app_users.active_role.

/** Department ids this employee heads (empty if none). */
export async function getHeadedDepartmentIds(
  supabase: SupabaseClient,
  employeeId: string | null
): Promise<string[]> {
  if (!employeeId) return []
  const { data } = await supabase
    .from("department_heads")
    .select("department_id")
    .eq("employee_id", employeeId)
  return (data ?? []).map((r) => r.department_id as string)
}

/** Upgrade a stored staff/manager role to dept_head when the employee heads a department. */
export async function deriveRole(
  supabase: SupabaseClient,
  storedRole: UserRole | null,
  employeeId: string | null
): Promise<UserRole | null> {
  if (storedRole !== "staff" && storedRole !== "manager") return storedRole
  const headed = await getHeadedDepartmentIds(supabase, employeeId)
  return headed.length > 0 ? "dept_head" : storedRole
}
