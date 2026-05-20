import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { AdminsPanel, type AdminRow } from "./AdminsPanel"

export const metadata = { title: "Settings — Human Connections" }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  const { data: raw } = await supabase
    .from("app_users")
    .select("id, active_role, employee_id, employees(first_name, last_name, email)")
    .eq("active_role", "hr")
    .order("employee_id")

  const admins: AdminRow[] = (raw ?? []).map((row) => ({
    id: row.id,
    active_role: row.active_role,
    employee_id: row.employee_id,
    employees: Array.isArray(row.employees) ? (row.employees[0] ?? null) : row.employees,
  }))

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" />
      <AdminsPanel initialAdmins={admins} currentUserId={user.id} />
    </div>
  )
}
