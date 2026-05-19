import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"

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
    id, employee_id, period, title, deadline, status, created_at,
    employee:employees!kpi_reviews_employee_id_fkey(id, first_name, last_name, job_title, department:departments(name)),
    kpi_review_invitees(id, invitee_id, status, invitee:employees!kpi_review_invitees_invitee_id_fkey(id, first_name, last_name))
  `

  let query = supabase
    .from("kpi_reviews")
    .select(selectClause)
    .order("created_at", { ascending: false })

  if (role !== "hr") {
    if (!myEmployeeId) return NextResponse.json([])
    query = query.eq("kpi_review_invitees.invitee_id", myEmployeeId) as typeof query
  }

  const { data, error } = await query
  if (error) {
    console.error("[GET /api/kpi/reviews]", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }

  // For non-HR: filter to only reviews where they are an invitee
  if (role !== "hr") {
    const filtered = (data ?? []).filter((r) =>
      r.kpi_review_invitees?.some(
        (i: { invitee_id: string }) => i.invitee_id === myEmployeeId
      )
    )
    return NextResponse.json(filtered)
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
