import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"

async function canAccessReview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  reviewId: string
): Promise<boolean> {
  const [role, myEmployeeId, impersonating] = await Promise.all([
    getUserRole(supabase, userId),
    getEmployeeIdForUser(supabase, userId),
    getImpersonationContext(),
  ])
  const effectiveRole = role === "hr" && impersonating ? "staff" : role
  const effectiveEmployeeId = role === "hr" && impersonating ? impersonating.employeeId : myEmployeeId

  if (effectiveRole === "hr") return true
  if (!effectiveEmployeeId) return false

  const { data: review } = await supabase
    .from("kpi_reviews")
    .select("employee_id")
    .eq("id", reviewId)
    .single()
  if (review?.employee_id === effectiveEmployeeId) return true

  const { data: inv } = await supabase
    .from("kpi_review_invitees")
    .select("id")
    .eq("review_id", reviewId)
    .eq("invitee_id", effectiveEmployeeId)
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

  const [role, myEmployeeId, impersonating] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
    getImpersonationContext(),
  ])
  const effectiveRole = role === "hr" && impersonating ? "staff" : role
  const effectiveEmployeeId = role === "hr" && impersonating ? impersonating.employeeId : myEmployeeId

  const body = await req.json()
  const { item_id, score, comments } = body
  const bodyScorerId: string | null = body.scorer_id ?? null

  if (!item_id) return NextResponse.json({ error: "item_id is required" }, { status: 400 })

  // scorer_id semantics:
  //  - HR: null = the HR-scored section; a value = recording a specific
  //    reviewer's score on their behalf (used for backdated data entry).
  //  - Invitee: always their own employee id (client value is ignored).
  let scorerId: string | null = null

  if (effectiveRole === "hr") {
    if (bodyScorerId) {
      // Must be an actual invitee (reviewer) on this review.
      const { data: inv } = await supabase
        .from("kpi_review_invitees")
        .select("id")
        .eq("review_id", reviewId)
        .eq("invitee_id", bodyScorerId)
        .single()
      if (!inv) return NextResponse.json({ error: "That reviewer is not on this review" }, { status: 400 })
      scorerId = bodyScorerId
    }
  } else {
    if (!effectiveEmployeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    // Verify this person is an accepted invitee on this review
    const { data: inv } = await supabase
      .from("kpi_review_invitees")
      .select("id")
      .eq("review_id", reviewId)
      .eq("invitee_id", effectiveEmployeeId)
      .in("status", ["accepted", "completed"])
      .single()
    if (!inv) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    scorerId = effectiveEmployeeId
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
