import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"

async function canAccessReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  reviewId: string
): Promise<boolean> {
  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, userId),
    getEmployeeIdForUser(supabase, userId),
  ])
  if (role === "hr") return true
  if (!myEmployeeId) return false

  const { data: review } = await supabase
    .from("kpi_reviews")
    .select("employee_id")
    .eq("id", reviewId)
    .single()
  if (review?.employee_id === myEmployeeId) return true

  const { data: inv } = await supabase
    .from("kpi_review_invitees")
    .select("id")
    .eq("review_id", reviewId)
    .eq("invitee_id", myEmployeeId)
    .single()
  return !!inv
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const allowed = await canAccessReview(supabase, user.id, id)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("kpi_scores")
    .select("*")
    .eq("review_id", id)

  if (error) return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])

  const body = await req.json()
  const { item_id, score, comments } = body

  if (!item_id) return NextResponse.json({ error: "item_id is required" }, { status: 400 })

  // HR scores with scorer_id = null; invitees score with their own employee id
  let scorerId: string | null = null

  if (role !== "hr") {
    if (!myEmployeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    // Verify this person is an accepted invitee on this review
    const { data: inv } = await supabase
      .from("kpi_review_invitees")
      .select("id")
      .eq("review_id", reviewId)
      .eq("invitee_id", myEmployeeId)
      .in("status", ["accepted", "completed"])
      .single()
    if (!inv) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    scorerId = myEmployeeId
  }

  const upsertData = {
    review_id: reviewId,
    item_id,
    scorer_id: scorerId,
    score: score ?? null,
    comments: comments ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("kpi_scores")
    .upsert(upsertData, { onConflict: "review_id,item_id,scorer_id" })
    .select()
    .single()

  if (error) {
    console.error("[PUT /api/kpi/reviews/:id/scores]", error)
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 })
  }

  return NextResponse.json(data)
}
