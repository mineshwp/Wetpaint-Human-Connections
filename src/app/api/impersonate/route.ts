import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getRealUserRole } from "@/lib/auth"
import { startViewAs, clearViewAs } from "@/lib/impersonation"

// "View as" — HR/Admin previews the app as another employee (view only).
// Uses the *real* role throughout so HR can switch people mid-session.

async function requireRealHR() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const role = await getRealUserRole(supabase, user.id)
  if (role !== "hr") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase, user }
}

// People HR can view as: active + onboarding, not archived, excluding yourself
// ("View as Staff" covers your own record).
export async function GET() {
  const auth = await requireRealHR()
  if ("error" in auth) return auth.error
  const { supabase, user } = auth

  const [{ data: me }, { data, error }] = await Promise.all([
    supabase.from("app_users").select("employee_id").eq("id", user.id).single(),
    supabase
      .from("employees")
      .select("id, first_name, last_name, job_title, status, avatar_initials, profile_photo_url, department:departments(name)")
      .eq("is_archived", false)
      .in("status", ["active", "onboarding"])
      .order("first_name"),
  ])
  if (error) return NextResponse.json({ error: "Failed to load staff" }, { status: 500 })

  const people = (data ?? [])
    .filter((e) => e.id !== me?.employee_id)
    .map((e) => {
      const dept = e.department as unknown as { name: string } | null
      return {
        id: e.id,
        name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
        jobTitle: e.job_title ?? "",
        department: dept?.name ?? null,
        status: e.status,
        initials: e.avatar_initials ?? `${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`.toUpperCase(),
        photoUrl: e.profile_photo_url ?? null,
      }
    })
  return NextResponse.json(people)
}

export async function POST(req: Request) {
  const auth = await requireRealHR()
  if ("error" in auth) return auth.error

  const body = await req.json().catch(() => ({}))
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : ""
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 })

  const result = await startViewAs(auth.supabase, auth.user.id, employeeId, { asStaff: body.asStaff === true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ ok: true, employeeName: result.employeeName })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await clearViewAs()
  return NextResponse.json({ ok: true })
}
