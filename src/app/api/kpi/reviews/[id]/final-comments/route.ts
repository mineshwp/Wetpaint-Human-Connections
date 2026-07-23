import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getImpersonationContext } from "@/lib/impersonation"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("kpi_final_comments")
    .select("id, review_id, author_id, comment, updated_at")
    .eq("review_id", reviewId)

  if (error) return NextResponse.json({ error: "Failed to fetch final comments" }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// Upsert a final comment.
//  - HR: author_id = a reviewer's employee id (recorded on their behalf) or
//    null for the HR/Admin comment.
//  - Reviewer: their own employee id only (must be an accepted invitee).
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
  const comment: string = typeof body.comment === "string" ? body.comment : ""
  let authorId: string | null = body.author_id ?? null

  if (effectiveRole === "hr") {
    if (authorId) {
      const { data: inv } = await supabase
        .from("kpi_review_invitees")
        .select("id")
        .eq("review_id", reviewId)
        .eq("invitee_id", authorId)
        .single()
      if (!inv) return NextResponse.json({ error: "That reviewer is not on this review" }, { status: 400 })
    }
  } else {
    if (!effectiveEmployeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const { data: inv } = await supabase
      .from("kpi_review_invitees")
      .select("id")
      .eq("review_id", reviewId)
      .eq("invitee_id", effectiveEmployeeId)
      .in("status", ["accepted", "completed"])
      .single()
    if (!inv) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    authorId = effectiveEmployeeId // reviewers can only write their own
  }

  // Manual upsert (partial unique indexes can't be an onConflict target).
  let existingQuery = supabase.from("kpi_final_comments").select("id").eq("review_id", reviewId)
  existingQuery = authorId ? existingQuery.eq("author_id", authorId) : existingQuery.is("author_id", null)
  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from("kpi_final_comments")
      .update({ comment, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: "Failed to save comment" }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from("kpi_final_comments")
    .insert({ review_id: reviewId, author_id: authorId, comment })
    .select()
    .single()
  if (error) {
    console.error("[PUT /api/kpi/reviews/[id]/final-comments]", error)
    return NextResponse.json({ error: "Failed to save comment" }, { status: 500 })
  }
  return NextResponse.json(data)
}
