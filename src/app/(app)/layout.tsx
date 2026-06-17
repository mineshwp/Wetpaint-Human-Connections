import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"
import { AppShell } from "@/components/layout/AppShell"
import { signOut } from "./actions"
import type { UserRole } from "@/lib/types"

const ROLE_LABELS: Record<UserRole, string> = {
  hr: "HR / Admin",
  manager: "Manager",
  staff: "Staff",
  applicant: "Applicant",
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Mark genuine acceptance: the first time a user actually loads the app, stamp
  // accepted_at (drives the "Pending" badge in Settings). A URL scanner like
  // Microsoft Safe Links hits Supabase's verify endpoint, never this authenticated
  // page, so it can't trigger this. Uses the user's own client — RLS allows a user
  // to update their own row. No-op (0 rows) once already set.
  const [role, employeeId, impersonating] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
    getImpersonationContext(),
    supabase
      .from("app_users")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("accepted_at", null),
  ])

  let userName = user.email ?? "User"
  let userInitials = "U"

  if (employeeId) {
    const { data: emp } = await supabase
      .from("employees")
      .select("first_name, last_name, avatar_initials")
      .eq("id", employeeId)
      .single()

    if (emp) {
      userName = `${emp.first_name} ${emp.last_name}`
      userInitials =
        emp.avatar_initials ??
        `${emp.first_name[0] ?? ""}${emp.last_name[0] ?? ""}`.toUpperCase()
    }
  }

  const roleBadge = role ? ROLE_LABELS[role] : "User"

  return (
    <AppShell
      userInitials={userInitials}
      userName={userName}
      roleBadge={roleBadge}
      isHR={role === "hr"}
      ownEmployeeId={employeeId}
      ownEmployeeName={userName}
      impersonating={impersonating}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  )
}
