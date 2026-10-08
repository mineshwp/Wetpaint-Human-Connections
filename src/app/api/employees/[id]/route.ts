import { withAudit } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole, getEmployeeIdForUser, canAccessEmployee } from "@/lib/auth"
import { EMPLOYEE_FULL_SELECT, mapEmployeeFull, employeeFieldAccess } from "@/lib/employees"
import type { EmployeeFull } from "@/lib/types"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { changedProfileLabels, logStaffChange } from "@/lib/hr-digests"

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
  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])

  if (!role || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const allowed = await canAccessEmployee(supabase, user.id, role, id)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Service client: sensitive columns aren't granted to signed-in users. Access
  // was checked above; mapEmployeeFull strips what this viewer may not see.
  const { data: row, error } = await createAdminClient()
    .from("employees")
    .select(EMPLOYEE_FULL_SELECT)
    .eq("id", id)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }

  const employee: EmployeeFull = mapEmployeeFull(row, employeeFieldAccess(role, myEmployeeId === id))

  return NextResponse.json({ employee })
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
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

  // Staff self-edits are reported to HR in the daily digest (field names only).
  const changedLabels = isHR ? [] : await changedProfileLabels(id, updates)

  const { error } = await supabase.from("employees").update(updates).eq("id", id)

  if (error) {
    console.error("[PATCH /api/employees/[id]]", error)
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 })
  }

  if (changedLabels.length > 0) await logStaffChange("profile", id, { fields: changedLabels })

  // Archiving someone also disables their portal login (HR restores it from
  // the profile's Portal login card if they return). Never touches admins.
  if (isHR && updates.is_archived === true) {
    const admin = createAdminClient()
    const { data: login } = await admin
      .from("app_users")
      .select("id, active_role")
      .eq("employee_id", id)
      .maybeSingle()
    if (login && login.active_role !== "hr") {
      const { error: banError } = await admin.auth.admin.updateUserById(login.id, { ban_duration: "876000h" })
      if (banError) console.error("[PATCH /api/employees/[id]] disable login on archive", banError)
    }
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

export const PATCH = withAudit(handlePATCH, {"section": "Employee profile", "action": "Edited profile", "target": "employee", "fields": true})
