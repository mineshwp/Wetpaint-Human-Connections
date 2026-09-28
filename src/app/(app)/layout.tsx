import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { readImpersonationCookies } from "@/lib/impersonation"
import { getRealUserRole } from "@/lib/auth"
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
  // The shell shows the signed-in user's own identity, so read app_users
  // directly (the auth helpers return the viewed person's while viewing as).
  const [{ data: me }, viewCookies] = await Promise.all([
    supabase.from("app_users").select("active_role, employee_id").eq("id", user.id).single(),
    readImpersonationCookies(),
    supabase
      .from("app_users")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("accepted_at", null),
  ])
  const employeeId: string | null = me?.employee_id ?? null
  const role = await getRealUserRole(supabase, user.id)
  const impersonating = role === "hr" ? viewCookies : null
  const effectiveRole = impersonating ? impersonating.role : role
  const effectiveEmployeeId = impersonating ? impersonating.employeeId : employeeId

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
  const sidebarRoleBadge = effectiveRole ? ROLE_LABELS[effectiveRole] : "User"

  return (
    <AppShell
      userInitials={userInitials}
      userName={userName}
      roleBadge={roleBadge}
      isHR={role === "hr"}
      sidebarRoleBadge={sidebarRoleBadge}
      sidebarIsHR={effectiveRole === "hr"}
      sidebarOwnProfileHref={
        effectiveRole && effectiveRole !== "hr" && effectiveRole !== "applicant" && effectiveEmployeeId
          ? `/employees/${effectiveEmployeeId}`
          : null
      }
      sidebarKeepEmployeesLink={effectiveRole === "manager"}
      ownEmployeeId={employeeId}
      impersonating={impersonating}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  )
}
