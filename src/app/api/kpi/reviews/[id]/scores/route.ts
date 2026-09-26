import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { canViewReview, getReviewStatus, isPublished, PUBLISHED_LOCK_MESSAGE } from "@/lib/kpi/access"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const allowed = await canViewReview(supabase, user.id, id)
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
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
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

  if (role === "hr") {
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
    if (!myEmployeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    // Reviewers can score only while the review is a draft; once HR publishes
    // it, only HR can change scores.
    if (isPublished(await getReviewStatus(supabase, reviewId))) {
      return NextResponse.json({ error: PUBLISHED_LOCK_MESSAGE }, { status: 403 })
    }
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
