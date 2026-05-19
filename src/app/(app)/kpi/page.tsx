import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"
import { KpiPageClient } from "./KpiPageClient"

export default async function KpiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [role, employeeId, impersonating] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
    getImpersonationContext(),
  ])

  if (!role || role === "applicant") redirect("/employees")

  const effectiveIsHR = role === "hr" && !impersonating
  const effectiveEmployeeId = impersonating ? impersonating.employeeId : employeeId

  return <KpiPageClient isHR={effectiveIsHR} currentEmployeeId={effectiveEmployeeId} />
}
