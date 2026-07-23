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

  // Every score belongs to a reviewer who must be assigned to the item's
  // section. Resolve the section for the assignment check.
  const { data: itemRow } = await supabase
    .from("kpi_template_items")
    .select("section_id")
    .eq("id", item_id)
    .single()
  const sectionId = itemRow?.section_id ?? null

  let scorerId: string | null = null
  let reviewInviteeId: string | null = null

  if (effectiveRole === "hr") {
    // HR either records the HR/Admin score (scorer_id null — no assignment
    // needed) or a specific reviewer's score on their behalf (backdated entry).
    if (bodyScorerId) {
      const { data: inv } = await supabase
        .from("kpi_review_invitees")
        .select("id")
        .eq("review_id", reviewId)
        .eq("invitee_id", bodyScorerId)
        .single()
      if (!inv) return NextResponse.json({ error: "That reviewer is not on this review" }, { status: 400 })
      scorerId = bodyScorerId
      reviewInviteeId = inv.id
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
    reviewInviteeId = inv.id
  }

  // The reviewer must be assigned to this item's section.
  if (sectionId && reviewInviteeId) {
    const { data: assign } = await supabase
      .from("kpi_review_invitee_sections")
      .select("id")
      .eq("review_invitee_id", reviewInviteeId)
      .eq("section_id", sectionId)
      .maybeSingle()
    if (!assign) return NextResponse.json({ error: "This reviewer is not assigned to that section" }, { status: 403 })
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
