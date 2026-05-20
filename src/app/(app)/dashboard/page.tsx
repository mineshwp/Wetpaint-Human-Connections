import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"
import { BarChart3, User } from "lucide-react"
import Link from "next/link"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [employeeId, impersonating] = await Promise.all([
    getEmployeeIdForUser(supabase, user.id),
    getImpersonationContext(),
  ])

  const effectiveEmployeeId = impersonating ? impersonating.employeeId : employeeId

  let employee: {
    first_name: string
    last_name: string
    job_title: string | null
    department: string | null
    employment_status: string | null
  } | null = null

  if (effectiveEmployeeId) {
    const { data } = await supabase
      .from("employees")
      .select("first_name, last_name, job_title, department, employment_status")
      .eq("id", effectiveEmployeeId)
      .single()
    employee = data
  }

  const { count: kpiCount } = await supabase
    .from("kpi_review_invitees")
    .select("*", { count: "exact", head: true })
    .eq("invitee_id", effectiveEmployeeId ?? "")
    .eq("status", "pending")

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome{employee ? `, ${employee.first_name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {employee?.job_title ?? "Your overview"}
          {employee?.department ? ` · ${employee.department}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {effectiveEmployeeId && (
          <Link
            href={`/employees/${effectiveEmployeeId}`}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">My Profile</p>
                <p className="text-xs text-muted-foreground">View your employee details</p>
              </div>
            </div>
          </Link>
        )}

        <Link
          href="/kpi"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">KPI Reviews</p>
              <p className="text-xs text-muted-foreground">
                {kpiCount && kpiCount > 0
                  ? `${kpiCount} pending review${kpiCount > 1 ? "s" : ""}`
                  : "View your performance reviews"}
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
