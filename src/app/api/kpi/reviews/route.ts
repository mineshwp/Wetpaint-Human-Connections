import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role, myEmployeeId, impersonating] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
    getImpersonationContext(),
  ])

  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const effectiveRole = role === "hr" && impersonating ? "staff" : role
  const effectiveEmployeeId = role === "hr" && impersonating ? impersonating.employeeId : myEmployeeId

  const selectClause = `
    id, employee_id, period, title, deadline, status, created_at,
    employee:employees!kpi_reviews_employee_id_fkey(id, first_name, last_name, job_title, department:departments(name)),
    kpi_review_invitees(id, invitee_id, status, invitee:employees!kpi_review_invitees_invitee_id_fkey(id, first_name, last_name), kpi_review_invitee_sections(section_id))
  `

  if (effectiveRole !== "hr") {
    if (!effectiveEmployeeId) return NextResponse.json([])

    const [ownedResult, assignedResult] = await Promise.all([
      supabase
        .from("kpi_reviews")
        .select(selectClause)
        .eq("employee_id", effectiveEmployeeId)
        .order("created_at", { ascending: false }),
      supabase
        .from("kpi_reviews")
        .select(selectClause)
        .eq("kpi_review_invitees.invitee_id", effectiveEmployeeId)
        .order("created_at", { ascending: false }),
    ])

    const error = ownedResult.error ?? assignedResult.error
    if (error) {
      console.error("[GET /api/kpi/reviews]", error)
      return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
    }

    const byId = new Map<string, NonNullable<typeof ownedResult.data>[number]>()
    for (const review of ownedResult.data ?? []) byId.set(review.id, review)
    for (const review of assignedResult.data ?? []) {
      const isAssigned = review.kpi_review_invitees?.some(
        (invitee: { invitee_id: string }) => invitee.invitee_id === effectiveEmployeeId
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
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[GET /api/kpi/reviews]", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
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

  return NextResponse.json(data, { status: 201 })
}
