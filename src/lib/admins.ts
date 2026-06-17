import { createAdminClient } from "@/lib/supabase/admin"

export interface AdminRow {
  id: string
  active_role: string
  employee_id: string | null
  employees: { first_name: string; last_name: string; email: string } | null
  // true = added but has never genuinely signed into the app (accepted_at is null)
  pending: boolean
}

// Lists all admins (active_role = "hr"). Uses the service-role client because
// RLS on app_users only exposes a user's own row — callers MUST enforce hr
// authorization first.
//
// "pending" is derived from app_users.accepted_at, NOT from auth.last_sign_in_at:
// the wetpaint.co.za mailbox runs Microsoft Defender Safe Links, which auto-GETs
// the invite/verify URL and stamps last_sign_in_at without anyone logging in.
// accepted_at is only set when the user genuinely loads the app themselves.
export async function listAdmins(): Promise<AdminRow[]> {
  const admin = createAdminClient()

  const { data: raw, error } = await admin
    .from("app_users")
    .select("id, active_role, employee_id, accepted_at, employees(first_name, last_name, email)")
    .eq("active_role", "hr")
    .order("employee_id")

  if (error) throw new Error(error.message)

  return (raw ?? []).map((row) => ({
    id: row.id,
    active_role: row.active_role,
    employee_id: row.employee_id,
    employees: Array.isArray(row.employees) ? (row.employees[0] ?? null) : row.employees,
    pending: row.accepted_at == null,
  }))
}
