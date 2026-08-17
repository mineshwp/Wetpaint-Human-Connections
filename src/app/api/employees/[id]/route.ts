import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser, canAccessEmployee } from "@/lib/auth"
import type { EmployeeFull } from "@/lib/types"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const role = await getUserRole(supabase, user.id)

  if (!role || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const allowed = await canAccessEmployee(supabase, user.id, role, id)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const isHR = role === "hr"

  const { data: row, error } = await supabase
    .from("employees")
    .select(`
      id, employee_number, first_name, last_name, email, phone, job_title,
      department_id, manager_id, status, start_date, avatar_initials, profile_photo_url,
      contract_type, contract_end_date, contract_is_renewable, contract_term_months, probation_end_date, salary_band, last_salary_review_date,
      personal_email, work_email, alternate_phone, home_address,
      next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
      vat_number, date_of_birth, identity_number, gender, race, disability, citizenship_status,
      bank_name, bank_account_number, bank_branch_code, bank_account_type, bank_verification_status,
      is_archived, resignation_date,
      created_at, updated_at,
      departments:department_id ( id, name, colour ),
      manager:manager_id ( id, first_name, last_name, job_title )
    `)
    .eq("id", id)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }

  type Dept = { id: string; name: string; colour: string }
  type Mgr = { id: string; first_name: string; last_name: string; job_title: string }
  const dept = row.departments as unknown as Dept | null
  const mgr = row.manager as unknown as Mgr | null

  const employee: EmployeeFull = {
    id: row.id,
    employeeNumber: row.employee_number ?? null,
    resignationDate: row.resignation_date ?? null,
    isArchived: row.is_archived ?? false,
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
    profilePhotoUrl: row.profile_photo_url ?? null,
    contractType: row.contract_type ?? null,
    contractEndDate: row.contract_end_date ?? null,
    contractIsRenewable: row.contract_is_renewable ?? false,
    contractTermMonths: row.contract_term_months ?? null,
    probationEndDate: row.probation_end_date ?? null,
    personalEmail: row.personal_email ?? null,
    workEmail: row.work_email ?? null,
    alternatePhone: row.alternate_phone ?? null,
    gender: row.gender ?? null,
    nextOfKinName: row.next_of_kin_name ?? null,
    nextOfKinPhone: row.next_of_kin_phone ?? null,
    nextOfKinRelationship: row.next_of_kin_relationship ?? null,
    // HR-only fields — stripped for non-HR
    homeAddress: isHR ? (row.home_address ?? null) : null,
    dateOfBirth: isHR ? (row.date_of_birth ?? null) : null,
    identityNumber: isHR ? (row.identity_number ?? null) : null,
    race: isHR ? (row.race ?? null) : null,
    disability: isHR ? (row.disability ?? null) : null,
    citizenshipStatus: isHR ? (row.citizenship_status ?? null) : null,
    vatNumber: isHR ? (row.vat_number ?? null) : null,
    salaryBand: isHR ? (row.salary_band ?? null) : null,
    lastSalaryReviewDate: isHR ? (row.last_salary_review_date ?? null) : null,
    bankName: isHR ? (row.bank_name ?? null) : null,
    bankAccountNumber: isHR ? (row.bank_account_number ?? null) : null,
    bankBranchCode: isHR ? (row.bank_branch_code ?? null) : null,
    bankAccountType: isHR ? (row.bank_account_type ?? null) : null,
    bankVerificationStatus: isHR ? (row.bank_verification_status ?? null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    department: dept ?? null,
    manager: mgr
      ? {
          id: mgr.id,
          firstName: mgr.first_name,
          lastName: mgr.last_name,
          jobTitle: mgr.job_title,
        }
      : null,
  }

  return NextResponse.json({ employee })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])

  const { id } = await params
  const isHR = role === "hr"
  const isOwnProfile = myEmployeeId === id

  if (!isHR && !isOwnProfile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const toNull = (v: unknown) => (v === "" ? null : v)
  const updates: Record<string, unknown> = {}

  if (isHR) {
    const textFields = [
      "first_name", "last_name", "phone", "alternate_phone",
      "personal_email", "work_email", "home_address",
      "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
      "employee_number", "job_title", "department_id", "manager_id",
      "contract_type", "gender", "race", "disability", "citizenship_status",
      "vat_number", "identity_number", "status",
      "bank_name", "bank_account_number", "bank_branch_code",
      "bank_account_type", "bank_verification_status",
      "salary_band",
    ]
    const dateFields = [
      "start_date", "contract_end_date", "probation_end_date",
      "last_salary_review_date", "date_of_birth", "resignation_date",
    ]
    if ("is_archived" in body) updates.is_archived = Boolean(body.is_archived)
    if ("contract_is_renewable" in body) updates.contract_is_renewable = Boolean(body.contract_is_renewable)
    if ("contract_term_months" in body) {
      const n = Number(body.contract_term_months)
      updates.contract_term_months = Number.isFinite(n) && n > 0 ? Math.round(n) : null
    }
    for (const field of textFields) {
      if (field in body) updates[field] = toNull(body[field])
    }
    for (const field of dateFields) {
      if (field in body) updates[field] = toNull(body[field])
    }
  } else {
    // Staff: only contact details (no work email) and next of kin
    const allowedFields = [
      "phone", "alternate_phone", "personal_email",
      "next_of_kin_name", "next_of_kin_phone", "next_of_kin_relationship",
    ]
    for (const field of allowedFields) {
      if (field in body) updates[field] = toNull(body[field])
    }
  }

  // Recompute avatar_initials when name changes
  if ("first_name" in updates || "last_name" in updates) {
    const { data: current } = await supabase
      .from("employees")
      .select("first_name, last_name")
      .eq("id", id)
      .single()
    const first = (updates.first_name as string | null) ?? current?.first_name ?? ""
    const last = (updates.last_name as string | null) ?? current?.last_name ?? ""
    updates.avatar_initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true })
  }

  updates.updated_at = new Date().toISOString()

  const { error } = await supabase.from("employees").update(updates).eq("id", id)

  if (error) {
    console.error("[PATCH /api/employees/[id]]", error)
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 })
  }

  // Cascade archive state to the employee's KPI reviews (HR only)
  if (isHR && "is_archived" in updates) {
    const { error: kpiError } = await supabase
      .from("kpi_reviews")
      .update({ is_archived: updates.is_archived })
      .eq("employee_id", id)
    if (kpiError) {
      console.error("[PATCH /api/employees/[id]] KPI archive cascade", kpiError)
    }
  }

  return NextResponse.json({ success: true })
}
