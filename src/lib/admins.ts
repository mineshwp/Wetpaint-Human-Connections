import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"

export interface AdminRow {
  id: string
  active_role: string
  employee_id: string | null
  employees: { first_name: string; last_name: string; email: string } | null
  // true = invited but has never signed in yet (awaiting acceptance)
  pending: boolean
}

// Lists all admins (active_role = "hr") and flags whether each has accepted
// their invite. Pending is best-effort: if the admin client can't resolve
// sign-in status, the list still returns (everyone defaults to not-pending).
export async function listAdmins(supabase: SupabaseClient): Promise<AdminRow[]> {
  const { data: raw, error } = await supabase
    .from("app_users")
    .select("id, active_role, employee_id, employees(first_name, last_name, email)")
    .eq("active_role", "hr")
    .order("employee_id")

  if (error) throw new Error(error.message)

  const rows: AdminRow[] = (raw ?? []).map((row) => ({
    id: row.id,
    active_role: row.active_role,
    employee_id: row.employee_id,
    employees: Array.isArray(row.employees) ? (row.employees[0] ?? null) : row.employees,
    pending: false,
  }))

  try {
    const admin = createAdminClient()
    await Promise.all(
      rows.map(async (r) => {
        const { data } = await admin.auth.admin.getUserById(r.id)
        // Invited-but-not-yet-accepted users have never signed in.
        if (data?.user && !data.user.last_sign_in_at) r.pending = true
      })
    )
  } catch (e) {
    console.error("[listAdmins] could not resolve invite status:", e)
  }

  return rows
}
