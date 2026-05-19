import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { AppShell } from "@/components/layout/AppShell"
import { signOut } from "./actions"
import type { UserRole } from "@/lib/types"

const ROLE_LABELS: Record<UserRole, string> = {
  hr: "HR Admin",
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

  const [role, employeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
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
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  )
}
