import { redirect } from "next/navigation"
import Link from "next/link"
import { UserPlus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"
import { PageHeader } from "@/components/layout/PageHeader"
import { EmployeeListClient } from "./EmployeeListClient"
import type { Employee, Department } from "@/lib/types"

export const metadata = { title: "Employees — Human Connections" }

function mapRow(row: {
  id: string; first_name: string; last_name: string; email: string
  phone: string | null; department_id: string | null; job_title: string
  manager_id: string | null; start_date: string | null; status: string
  avatar_initials: string | null; is_archived: boolean
  employee_number: string | null; profile_photo_url: string | null
  contract_type: string | null; contract_end_date: string | null
}): Employee {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    departmentId: row.department_id ?? null,
    jobTitle: row.job_title,
    managerId: row.manager_id ?? null,
    startDate: row.start_date ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: row.status as any,
    avatarInitials:
      row.avatar_initials ??
      `${row.first_name[0] ?? ""}${row.last_name[0] ?? ""}`.toUpperCase(),
    isArchived: row.is_archived ?? false,
    employeeNumber: row.employee_number ?? null,
    profilePhotoUrl: row.profile_photo_url ?? null,
    contractType: row.contract_type ?? null,
    contractEndDate: row.contract_end_date ?? null,
  }
}

export default async function EmployeesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const [role, impersonating] = await Promise.all([
    getUserRole(supabase, user.id),
    getImpersonationContext(),
  ])

  if (!role || role === "applicant") {
    redirect("/login")
  }

  if (impersonating) {
    redirect(`/employees/${impersonating.employeeId}`)
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

  const SELECT = "id, first_name, last_name, email, phone, department_id, job_title, manager_id, start_date, status, avatar_initials, is_archived, employee_number, profile_photo_url, contract_type, contract_end_date"

  let activeQuery = supabase.from("employees").select(SELECT).eq("is_archived", false).order("last_name")
  let archivedQuery = supabase.from("employees").select(SELECT).eq("is_archived", true).order("last_name")

  if (role === "manager") {
    const employeeId = await getEmployeeIdForUser(supabase, user.id)
    if (employeeId) {
      const { data: myEmp } = await supabase
        .from("employees")
        .select("department_id")
        .eq("id", employeeId)
        .single()

      if (myEmp?.department_id) {
        activeQuery = activeQuery.eq("department_id", myEmp.department_id) as typeof activeQuery
        archivedQuery = archivedQuery.eq("department_id", myEmp.department_id) as typeof archivedQuery
      }
    }
  }

  const [activeResult, archivedResult, deptResult] = await Promise.all([
    activeQuery,
    archivedQuery,
    supabase.from("departments").select("id, name, colour").order("name"),
  ])

  const employees: Employee[] = (activeResult.data ?? []).map(mapRow)
  const archivedEmployees: Employee[] = (archivedResult.data ?? []).map(mapRow)
  const departments: Department[] = deptResult.data ?? []

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${employees.length} active · ${archivedEmployees.length} archived`}
      >
        {role === "hr" && (
          <Link
            href="/employees/new"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <UserPlus size={15} />
            Add Employee
          </Link>
        )}
      </PageHeader>
      <EmployeeListClient
        employees={employees}
        archivedEmployees={archivedEmployees}
        departments={departments}
        isHR={role === "hr"}
      />
    </div>
  )
}
