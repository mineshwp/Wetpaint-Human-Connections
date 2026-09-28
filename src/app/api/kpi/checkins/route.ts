import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser, getTeamScope, applyTeamScope, canAccessEmployee } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"
import {
  defaultCheckinMonth, isCheckinStatus, isCheckinWindowOpen, isMonthKey, monthStart, periodMonths,
} from "@/lib/kpi/checkins"

// Monthly manager check-ins.
//  - HR: every active/onboarding employee, any month, any time.
//  - Department heads / managers: their department's staff (never themselves),
//    writable during the month and until the 10th of the next.
//  - Staff: no access (HR decision pending — see the Q4 plan doc).

const CHECKIN_SELECT = "id, employee_id, month, status, comment, author_id, updated_at, author:employees!kpi_monthly_checkins_author_id_fkey(first_name, last_name)"

type Author = { first_name: string; last_name: string } | null

function shape(row: Record<string, unknown>) {
  const a = row.author as unknown as Author
  return {
    id: row.id,
    employeeId: row.employee_id,
    month: String(row.month).slice(0, 7),
    status: row.status,
    comment: row.comment ?? "",
    authorName: a ? `${a.first_name} ${a.last_name}`.trim() : "HR",
    updatedAt: row.updated_at,
  }
}

async function context() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])
  if (role !== "hr" && role !== "dept_head" && role !== "manager") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase, userId: user.id, role, myEmployeeId }
}

export async function GET(req: NextRequest) {
  const ctx = await context()
  if (ctx.error) return ctx.error
  const { supabase, userId, role, myEmployeeId } = ctx
  const { searchParams } = new URL(req.url)

  // One employee's check-ins for a KPI period (shown beside the quarterly review).
  const employeeId = searchParams.get("employee_id")
  if (employeeId) {
    if (employeeId === myEmployeeId && role !== "hr") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!(await canAccessEmployee(supabase, userId, role, employeeId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const months = periodMonths(searchParams.get("period") ?? "")
    if (months.length === 0) return NextResponse.json({ error: "period like 'Q2 2026' is required" }, { status: 400 })
    const { data, error } = await supabase
      .from("kpi_monthly_checkins")
      .select(CHECKIN_SELECT)
      .eq("employee_id", employeeId)
      .in("month", months.map(monthStart))
    if (error) {
      console.error("[GET /api/kpi/checkins] employee", error)
      return NextResponse.json({ error: "Failed to load check-ins" }, { status: 500 })
    }
    return NextResponse.json({ months, checkins: (data ?? []).map(shape) })
  }

  // The team list for one month.
  const monthParam = searchParams.get("month")
  const month = isMonthKey(monthParam) ? monthParam : defaultCheckinMonth()

  let staffQuery = supabase
    .from("employees")
    .select("id, first_name, last_name, job_title, profile_photo_url, avatar_initials, department:departments(id, name, colour)")
    .eq("is_archived", false)
    .in("status", ["active", "onboarding", "on-leave"])
    .order("first_name")

  if (role !== "hr") {
    const scope = await getTeamScope(supabase, role, myEmployeeId)
    if (scope.kind === "none") {
      return NextResponse.json({ month, canEdit: false, staff: [] })
    }
    staffQuery = applyTeamScope(staffQuery, scope)
    if (myEmployeeId) staffQuery = staffQuery.neq("id", myEmployeeId) as typeof staffQuery
  }

  const [{ data: staff, error: staffError }, { data: checkins, error: ciError }] = await Promise.all([
    staffQuery,
    supabase.from("kpi_monthly_checkins").select(CHECKIN_SELECT).eq("month", monthStart(month)),
  ])
  if (staffError || ciError) {
    console.error("[GET /api/kpi/checkins] month", staffError ?? ciError)
    return NextResponse.json({ error: "Failed to load check-ins" }, { status: 500 })
  }

  const byEmployee = new Map((checkins ?? []).map((c) => [c.employee_id as string, shape(c)]))
  type Dept = { id: string; name: string; colour: string } | null
  return NextResponse.json({
    month,
    canEdit: role === "hr" || isCheckinWindowOpen(month),
    staff: (staff ?? []).map((e) => {
      const dept = e.department as unknown as Dept
      return {
        id: e.id,
        name: `${e.first_name} ${e.last_name}`.trim(),
        jobTitle: e.job_title,
        photoUrl: e.profile_photo_url,
        initials: e.avatar_initials ?? `${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase(),
        department: dept ? { name: dept.name, colour: dept.colour } : null,
        checkin: byEmployee.get(e.id) ?? null,
      }
    }),
  })
}

// Save one check-in. Body: { employee_id, month: "YYYY-MM", status, comment? }
export async function PUT(req: NextRequest) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const ctx = await context()
  if (ctx.error) return ctx.error
  const { supabase, userId, role, myEmployeeId } = ctx

  const body = await req.json().catch(() => null)
  const employeeId = typeof body?.employee_id === "string" ? body.employee_id : null
  const month = body?.month
  const status = body?.status
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 1000) : ""

  if (!employeeId || !isMonthKey(month) || !isCheckinStatus(status)) {
    return NextResponse.json({ error: "employee_id, month (YYYY-MM) and a valid status are required" }, { status: 400 })
  }
  if (role !== "hr") {
    if (employeeId === myEmployeeId) {
      return NextResponse.json({ error: "You can't write your own check-in" }, { status: 403 })
    }
    if (!(await canAccessEmployee(supabase, userId, role, employeeId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!isCheckinWindowOpen(month)) {
      return NextResponse.json({ error: "This month's check-ins have closed — only HR can change them now." }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from("kpi_monthly_checkins")
    .upsert(
      {
        employee_id: employeeId,
        month: monthStart(month),
        status,
        comment: comment || null,
        author_id: myEmployeeId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id,month" }
    )
    .select(CHECKIN_SELECT)
    .single()

  if (error) {
    console.error("[PUT /api/kpi/checkins]", error)
    return NextResponse.json({ error: "Failed to save check-in" }, { status: 500 })
  }
  return NextResponse.json({ checkin: shape(data) })
}
