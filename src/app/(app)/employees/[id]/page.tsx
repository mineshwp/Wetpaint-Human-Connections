import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser, canAccessEmployee } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"
import { setImpersonation } from "@/app/(app)/actions"
import { EMPLOYEE_FULL_SELECT, mapEmployeeFull, employeeFieldAccess } from "@/lib/employees"
import { EmployeeDetailClient } from "./EmployeeDetailClient"
import type {
  EmployeeFull,
  EmployeeDocument,
  HRNote,
  EmployeeTraining,
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

  // role / myEmployeeId are the *effective* values: while HR is viewing as
  // someone, they are that person's, so access is scoped exactly as for them.
  const [role, myEmployeeId, viewingAs] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
    getImpersonationContext(supabase, user.id),
  ])

  if (!role || role === "applicant") redirect("/login")

  const allowed = await canAccessEmployee(supabase, user.id, role, id)
  if (!allowed) notFound()

  const isHR = role === "hr"
  const isOwnProfile = myEmployeeId === id
  const canViewDocuments = isHR || isOwnProfile
  const canViewBanking = isHR
  const canViewNotes = isHR
  const canImpersonate = isHR && !viewingAs

  // Fetch employee record
  const { data: row, error: empError } = await supabase
    .from("employees")
    .select(EMPLOYEE_FULL_SELECT)
    .eq("id", id)
    .single()

  if (empError || !row) notFound()

  const employee: EmployeeFull = mapEmployeeFull(row, employeeFieldAccess(role, isOwnProfile))

  // Fetch sub-resources in parallel
  const [docsResult, notesResult, trainingResult] = await Promise.all([
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
      .from("employee_training")
      .select("*")
      .eq("employee_id", id)
      .order("date_completed", { ascending: false, nullsFirst: false }),
  ])

  const documents: EmployeeDocument[] = (docsResult.data ?? []) as EmployeeDocument[]
  const hrNotes: HRNote[] = (notesResult.data ?? []) as HRNote[]
  const training: EmployeeTraining[] = (trainingResult.data ?? []) as EmployeeTraining[]

  return (
    <EmployeeDetailClient
      employee={employee}
      initialDocuments={documents}
      initialNotes={hrNotes}
      initialTraining={training}
      isHR={isHR}
      isOwnProfile={isOwnProfile}
      canViewDocuments={canViewDocuments}
      canViewBanking={canViewBanking}
      canViewNotes={canViewNotes}
      canImpersonate={canImpersonate}
      setImpersonationAction={setImpersonation}
      showBackLink={role !== "staff"}
    />
  )
}
