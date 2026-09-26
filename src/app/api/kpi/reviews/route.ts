import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { inheritForNewReview } from "@/lib/kpi/inherit"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { getHeadedDepartmentIds } from "@/lib/roles"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])

  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })


  const selectClause = `
    id, employee_id, period, title, deadline, status, created_at, action_points, action_points_generated_at,
    employee:employees!kpi_reviews_employee_id_fkey(id, first_name, last_name, job_title, department:departments(name)),
    kpi_review_invitees(id, invitee_id, status, invitee:employees!kpi_review_invitees_invitee_id_fkey(id, first_name, last_name), kpi_review_invitee_sections(section_id))
  `

  if (role !== "hr") {
    if (!myEmployeeId) return NextResponse.json([])

    // Department heads also see published reviews for staff in the departments
    // they head (read-only). Drafts stay between HR and the reviewers.
    let deptEmployeeIds: string[] = []
    if (role === "dept_head") {
      const deptIds = await getHeadedDepartmentIds(supabase, myEmployeeId)
      if (deptIds.length > 0) {
        const { data: deptEmps } = await supabase
          .from("employees")
          .select("id")
          .in("department_id", deptIds)
        deptEmployeeIds = (deptEmps ?? []).map((e) => e.id as string)
      }
    }

    const [ownedResult, assignedResult, deptResult] = await Promise.all([
      supabase
        .from("kpi_reviews")
        .select(selectClause)
        .eq("employee_id", myEmployeeId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("kpi_reviews")
        .select(selectClause)
        .eq("kpi_review_invitees.invitee_id", myEmployeeId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false }),
      deptEmployeeIds.length > 0
        ? supabase
            .from("kpi_reviews")
            .select(selectClause)
            .in("employee_id", deptEmployeeIds)
            .in("status", ["active", "completed"])
            .eq("is_archived", false)
        : Promise.resolve({ data: [], error: null }),
    ])

    const error = ownedResult.error ?? assignedResult.error ?? deptResult.error
    if (error) {
      console.error("[GET /api/kpi/reviews]", error)
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
    }

    const byId = new Map<string, NonNullable<typeof ownedResult.data>[number]>()
    for (const review of ownedResult.data ?? []) byId.set(review.id, review)
    for (const review of deptResult.data ?? []) byId.set(review.id, review)
    for (const review of assignedResult.data ?? []) {
      const isAssigned = review.kpi_review_invitees?.some(
        (invitee: { invitee_id: string }) => invitee.invitee_id === myEmployeeId
      )
      if (isAssigned) byId.set(review.id, review)
    }

    const reviews = Array.from(byId.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    return NextResponse.json(reviews)
  }

  const { data, error } = await supabase
    .from("kpi_reviews")
    .select(selectClause)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[GET /api/kpi/reviews]", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { employee_id, period, title, deadline } = body

  if (!employee_id || !period || !title) {
    return NextResponse.json({ error: "employee_id, period and title are required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("kpi_reviews")
    .insert({ employee_id, period, title, deadline: deadline || null, status: "draft" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Failed to create review" }, { status: 500 })

  // Q1-as-default: a new Q2/Q3/Q4 review inherits its period's template (cloned
  // from the same-year baseline) and the staff member's baseline-quarter custom
  // KPIs. Admins can still edit everything afterward. Best-effort.
  const inherited = await inheritForNewReview(supabase, { id: data.id, employee_id, period })

  return NextResponse.json({ ...data, inherited }, { status: 201 })
}
