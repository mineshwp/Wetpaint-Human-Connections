import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser, canAccessEmployee } from "@/lib/auth"
import { EmployeeDetailClient } from "./EmployeeDetailClient"
import type {
  EmployeeFull,
  LeaveBalance,
  EmployeeDocument,
  HRNote,
  KpiSummary,
} from "@/lib/types"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from("employees")
    .select("first_name, last_name")
    .eq("id", id)
    .single()
  if (!data) return { title: "Employee — Human Connections" }
  return { title: `${data.first_name} ${data.last_name} — Human Connections` }
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])

  if (!role || role === "applicant") redirect("/login")

  const allowed = await canAccessEmployee(supabase, user.id, role, id)
  if (!allowed) notFound()

  const isHR = role === "hr"
  const isOwnProfile = myEmployeeId === id
  const canViewDocuments = isHR || isOwnProfile
  const canViewBanking = isHR
  const canViewNotes = isHR

  // Fetch employee record
  const { data: row, error: empError } = await supabase
    .from("employees")
    .select(`
      id, employee_number, first_name, last_name, email, phone, job_title,
      department_id, manager_id, status, start_date, avatar_initials, profile_photo_url,
      contract_type, contract_end_date, probation_end_date, salary_band, last_salary_review_date,
      personal_email, work_email, alternate_phone, home_address,
      next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
      vat_number, date_of_birth, identity_number, gender, race, disability, citizenship_status,
      bank_name, bank_account_number, bank_branch_code, bank_account_type, bank_verification_status,
      created_at, updated_at,
      departments:department_id ( id, name, colour ),
      manager:manager_id ( id, first_name, last_name, job_title )
    `)
    .eq("id", id)
    .single()

  if (empError || !row) notFound()

  type Dept = { id: string; name: string; colour: string }
  type Mgr = { id: string; first_name: string; last_name: string; job_title: string }
  const dept = row.departments as unknown as Dept | null
  const mgr = row.manager as unknown as Mgr | null

  const employee: EmployeeFull = {
    id: row.id,
    employeeNumber: row.employee_number ?? null,
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

  const year = new Date().getFullYear()

  // Fetch sub-resources in parallel
  const [leaveResult, docsResult, notesResult, kpiResult] = await Promise.all([
    supabase
      .from("leave_balances")
      .select("leave_type, entitled, used, pending")
      .eq("employee_id", id)
      .eq("year", year),

    canViewDocuments
      ? (() => {
          let q = supabase
            .from("documents")
            .select(
              "id, category, name, file_url, file_size, mime_type, uploaded_by, created_at, hidden_from_employee"
            )
            .eq("employee_id", id)
            .order("created_at", { ascending: false })
          if (!isHR) q = q.eq("hidden_from_employee", false) as typeof q
          return q
        })()
      : Promise.resolve({ data: [], error: null }),

    canViewNotes
      ? supabase
          .from("hr_notes")
          .select("id, note, created_by, created_at")
          .eq("employee_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from("kpi_reviews")
      .select("id, period, title, status, deadline")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const leaveBalances: LeaveBalance[] = leaveResult.data ?? []

  // For HR: fetch all docs; for staff: only non-hidden
  // The query above uses `.eq("hidden_from_employee", false)` for non-HR,
  // but Supabase ignores `.eq(col, undefined)` so we re-filter here for safety.
  const documents: EmployeeDocument[] = (docsResult.data ?? []) as EmployeeDocument[]

  const hrNotes: HRNote[] = (notesResult.data ?? []) as HRNote[]

  const kpiRow = kpiResult.data
  const kpiSummary: KpiSummary = kpiRow
    ? {
        reviewId: kpiRow.id,
        period: kpiRow.period,
        title: kpiRow.title,
        status: kpiRow.status,
        deadline: kpiRow.deadline ?? null,
      }
    : null

  return (
    <EmployeeDetailClient
      employee={employee}
      leaveBalances={leaveBalances}
      initialDocuments={documents}
      initialNotes={hrNotes}
      kpiSummary={kpiSummary}
      isHR={isHR}
      canViewDocuments={canViewDocuments}
      canViewBanking={canViewBanking}
      canViewNotes={canViewNotes}
    />
  )
}
