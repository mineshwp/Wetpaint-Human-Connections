import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { EmployeeListClient } from "./EmployeeListClient"
import type { Employee, Department } from "@/lib/types"

export const metadata = { title: "Employees — Human Connections" }

export default async function EmployeesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)

  if (!role || role === "applicant") {
    redirect("/login")
  }

  if (role === "staff") {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to view the employee list.
        </p>
      </div>
    )
  }

  let empQuery = supabase
    .from("employees")
    .select(
      "id, first_name, last_name, email, phone, department_id, job_title, manager_id, start_date, status, avatar_initials"
    )
    .order("last_name")

  if (role === "manager") {
    const employeeId = await getEmployeeIdForUser(supabase, user.id)
    if (employeeId) {
      const { data: myEmp } = await supabase
        .from("employees")
        .select("department_id")
        .eq("id", employeeId)
        .single()

      if (myEmp?.department_id) {
        empQuery = empQuery.eq("department_id", myEmp.department_id) as typeof empQuery
      }
    }
  }

  const [empResult, deptResult] = await Promise.all([
    empQuery,
    supabase.from("departments").select("id, name, colour").order("name"),
  ])

  const employees: Employee[] = (empResult.data ?? []).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    departmentId: row.department_id ?? null,
    jobTitle: row.job_title,
    managerId: row.manager_id ?? null,
    startDate: row.start_date ?? null,
    status: row.status,
    avatarInitials:
      row.avatar_initials ??
      `${row.first_name[0] ?? ""}${row.last_name[0] ?? ""}`.toUpperCase(),
  }))

  const departments: Department[] = deptResult.data ?? []

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} employee${employees.length !== 1 ? "s" : ""} across ${departments.length} department${departments.length !== 1 ? "s" : ""}`}
      />
      <EmployeeListClient employees={employees} departments={departments} />
    </div>
  )
}
