import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser, getTeamScope, applyTeamScope, getAccessLevel } from "@/lib/auth"

// The KPI page's "My Team" tab: who this manager can see (by their access
// level). Their published reviews come from /api/kpi/reviews. Non-managers
// get an empty team.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])
  if (role !== "manager" || !myEmployeeId) return NextResponse.json({ label: null, members: [] })

  const [scope, level, { data: me }] = await Promise.all([
    getTeamScope(supabase, role, myEmployeeId),
    getAccessLevel(myEmployeeId),
    supabase.from("employees").select("department:departments!employees_department_id_fkey(name)").eq("id", myEmployeeId).maybeSingle(),
  ])
  const deptName = (me?.department as unknown as { name: string } | null)?.name ?? "your department"
  const label =
    level === "manager_department" ? `Everyone in ${deptName}`
    : level === "manager_line" ? "Everyone in your reporting line"
    : "People who report to you"

  if (scope.kind === "none") return NextResponse.json({ label, members: [] })

  const { data, error } = await applyTeamScope(
    supabase
      .from("employees")
      .select("id, first_name, last_name, job_title, profile_photo_url, department:departments!employees_department_id_fkey(name)")
      .eq("is_archived", false)
      .neq("id", myEmployeeId)
      .order("first_name"),
    scope
  )
  if (error) {
    console.error("[GET /api/kpi/team]", error)
    return NextResponse.json({ error: "Failed to load your team" }, { status: 500 })
  }
  return NextResponse.json({ label, members: data ?? [] })
}
