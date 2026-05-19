import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import type { Employee } from "@/lib/types"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)

  if (!role || role === "staff" || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let query = supabase
    .from("employees")
    .select(
      "id, first_name, last_name, email, phone, department_id, job_title, manager_id, start_date, status, avatar_initials"
    )
    .order("last_name")

  if (role === "manager") {
    const employeeId = await getEmployeeIdForUser(supabase, user.id)
    if (!employeeId) return NextResponse.json({ employees: [] })

    const { data: myEmp } = await supabase
      .from("employees")
      .select("department_id")
      .eq("id", employeeId)
      .single()

    if (!myEmp?.department_id) return NextResponse.json({ employees: [] })

    query = query.eq("department_id", myEmp.department_id) as typeof query
  }

  const { data, error } = await query

  if (error) {
    console.error("[GET /api/employees]", error)
    return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 })
  }

  const employees: Employee[] = (data ?? []).map((row) => ({
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

  return NextResponse.json({ employees })
}
