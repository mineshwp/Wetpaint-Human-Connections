import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { AddEmployeeClient } from "./AddEmployeeClient"
import type { Employee, Department } from "@/lib/types"

export const metadata = { title: "Add Employee — Human Connections" }

export default async function NewEmployeePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  const [empResult, deptResult] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, email, phone, department_id, job_title, manager_id, start_date, status, avatar_initials, is_archived")
      .eq("is_archived", false)
      .eq("status", "active")
      .order("last_name"),
    supabase.from("departments").select("id, name, colour").order("name"),
  ])

  const allEmployees: Employee[] = (empResult.data ?? []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    departmentId: row.department_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: row.status as any,
    jobTitle: row.job_title,
    managerId: row.manager_id ?? null,
    startDate: row.start_date ?? null,
    avatarInitials:
      row.avatar_initials ??
      `${row.first_name[0] ?? ""}${row.last_name[0] ?? ""}`.toUpperCase(),
    isArchived: row.is_archived ?? false,
  }))

  const departments: Department[] = deptResult.data ?? []

  return <AddEmployeeClient departments={departments} allEmployees={allEmployees} />
}
