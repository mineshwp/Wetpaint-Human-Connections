import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { EditEmployeeClient } from "./EditEmployeeClient"
import type { Department, Employee, EmployeeFull } from "@/lib/types"

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
  if (!data) return { title: "Edit Employee — Human Connections" }
  return { title: `Edit ${data.first_name} ${data.last_name} — Human Connections` }
}

export default async function EditEmployeePage({
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

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect(`/employees/${id}`)

  const [empResult, deptResult, allEmpResult] = await Promise.all([
    supabase
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
      .single(),
    supabase.from("departments").select("id, name, colour").order("name"),
    supabase
      .from("employees")
      .select("id, first_name, last_name, job_title, department_id, manager_id, status, email, phone, start_date, avatar_initials")
      .order("last_name"),
  ])

  if (empResult.error || !empResult.data) notFound()

  const row = empResult.data
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
    homeAddress: row.home_address ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    identityNumber: row.identity_number ?? null,
    race: row.race ?? null,
    disability: row.disability ?? null,
    citizenshipStatus: row.citizenship_status ?? null,
    vatNumber: row.vat_number ?? null,
    salaryBand: row.salary_band ?? null,
    lastSalaryReviewDate: row.last_salary_review_date ?? null,
    bankName: row.bank_name ?? null,
    bankAccountNumber: row.bank_account_number ?? null,
    bankBranchCode: row.bank_branch_code ?? null,
    bankAccountType: row.bank_account_type ?? null,
    bankVerificationStatus: row.bank_verification_status ?? null,
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

  const departments: Department[] = (deptResult.data ?? []) as Department[]

  const allEmployees: Employee[] = (allEmpResult.data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    jobTitle: r.job_title,
    departmentId: r.department_id ?? null,
    managerId: r.manager_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: r.status as any,
    email: r.email,
    phone: r.phone ?? null,
    startDate: r.start_date ?? null,
    avatarInitials: r.avatar_initials ?? `${r.first_name[0] ?? ""}${r.last_name[0] ?? ""}`.toUpperCase(),
    isArchived: false,
  }))

  return <EditEmployeeClient employee={employee} departments={departments} allEmployees={allEmployees} />
}
