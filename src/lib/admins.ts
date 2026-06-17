import { createAdminClient } from "@/lib/supabase/admin"

export interface AdminRow {
  id: string
  active_role: string
  employee_id: string | null
  employees: { first_name: string; last_name: string; email: string } | null
  // true = invited/created but has never signed in yet (awaiting acceptance)
  pending: boolean
}

// Lists all admins (active_role = "hr") and flags whether each has accepted
// their invite. Uses the service-role client because RLS on app_users only
// exposes a user's own row — callers MUST enforce hr authorization first.
// Pending is best-effort: if sign-in status can't be resolved, the list still
// returns (everyone defaults to not-pending).
export async function listAdmins(): Promise<AdminRow[]> {
  const admin = createAdminClient()

  const { data: raw, error } = await admin
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
