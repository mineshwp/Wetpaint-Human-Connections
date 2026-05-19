import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import type { Employee } from "@/lib/types"

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)

  if (!role || role === "staff" || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const includeArchived = searchParams.get("archived") === "true"

  let query = supabase
    .from("employees")
    .select(
      "id, first_name, last_name, email, phone, department_id, job_title, manager_id, start_date, status, avatar_initials, is_archived"
    )
    .order("last_name")

  if (!includeArchived) {
    query = query.eq("is_archived", false) as typeof query
  }

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
    isArchived: row.is_archived ?? false,
  }))

  return NextResponse.json({ employees })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()

  const { first_name, last_name, email, job_title } = body
  if (!first_name || !last_name || !email || !job_title) {
    return NextResponse.json({ error: "first_name, last_name, email and job_title are required" }, { status: 400 })
  }

  const toNull = (v: unknown) => (v === "" || v === undefined ? null : v)

  const insert: Record<string, unknown> = {
    first_name,
    last_name,
    email,
    job_title,
    status: body.status ?? "onboarding",
    is_archived: false,
    avatar_initials: `${first_name[0] ?? ""}${last_name[0] ?? ""}`.toUpperCase(),
  }

  const optionalText = [
    "phone", "alternate_phone", "personal_email", "work_email", "home_address",
    "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
    "employee_number", "department_id", "manager_id", "contract_type",
    "gender", "race", "disability", "citizenship_status", "vat_number",
    "identity_number", "salary_band",
    "bank_name", "bank_account_number", "bank_branch_code", "bank_account_type",
  ]
  const optionalDate = ["start_date", "contract_end_date", "probation_end_date", "date_of_birth"]

  for (const f of optionalText) {
    if (f in body) insert[f] = toNull(body[f])
  }
  for (const f of optionalDate) {
    if (f in body) insert[f] = toNull(body[f])
  }

  const { data, error } = await supabase
    .from("employees")
    .insert(insert)
    .select("id")
    .single()

  if (error) {
    console.error("[POST /api/employees]", error)
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
