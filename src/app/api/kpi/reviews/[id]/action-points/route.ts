import { withAudit } from "@/lib/activity-log"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { generateActionPoints } from "@/lib/kpi/action-points"

// A review's action points (HR only).
//  - draft: AI-generated or HR-edited text, never shown to staff
//  - approved: kpi_reviews.action_points — what staff (and managers) see
// HR edits the draft, then approves it; approving copies it to the review.

async function hrContext(write: boolean) {
  if (write) {
    const viewOnly = await blockWhileImpersonating()
    if (viewOnly) return { error: viewOnly }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase, employeeId: await getEmployeeIdForUser(supabase, user.id) }
}

type Supa = Awaited<ReturnType<typeof createClient>>

async function state(supabase: Supa, reviewId: string) {
  const [{ data: review }, { data: draft }] = await Promise.all([
    supabase
      .from("kpi_reviews")
      .select("id, status, action_points, action_points_approved_at, approver:employees!kpi_reviews_action_points_approved_by_fkey(first_name, last_name)")
      .eq("id", reviewId)
      .maybeSingle(),
    supabase
      .from("kpi_action_point_drafts")
      .select("content, source, model, generated_at, updated_at")
      .eq("review_id", reviewId)
      .maybeSingle(),
  ])
  if (!review) return null
  const approver = review.approver as unknown as { first_name: string; last_name: string } | null
  return {
    reviewStatus: review.status,
    approved: review.action_points ?? null,
    approvedAt: review.action_points_approved_at ?? null,
    approvedBy: approver ? `${approver.first_name} ${approver.last_name}`.trim() : null,
    draft: draft
      ? { content: draft.content, source: draft.source, model: draft.model, generatedAt: draft.generated_at, updatedAt: draft.updated_at }
      : null,
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await hrContext(false)
  if (ctx.error) return ctx.error
  const { id } = await params
  const s = await state(ctx.supabase, id)
  if (!s) return NextResponse.json({ error: "Review not found" }, { status: 404 })
  return NextResponse.json(s)
}

// Save HR's text. Body: { content: string, approve?: boolean }
// approve → staff can see it; otherwise it stays a draft.
async function handlePUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await hrContext(true)
  if (ctx.error) return ctx.error
  const { supabase, employeeId } = ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const content = typeof body?.content === "string" ? body.content.trim().slice(0, 5000) : ""
  if (!content) return NextResponse.json({ error: "Action points can't be empty" }, { status: 400 })
  const now = new Date().toISOString()

  if (body?.approve) {
    const { data: review } = await supabase.from("kpi_reviews").select("status").eq("id", id).maybeSingle()
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })
    if (review.status === "draft") {
      return NextResponse.json({ error: "Publish the review before approving its action points" }, { status: 400 })
    }
    const { error } = await supabase
      .from("kpi_reviews")
      .update({ action_points: content, action_points_generated_at: now, action_points_approved_at: now, action_points_approved_by: employeeId })
      .eq("id", id)
    if (error) {
      console.error("[PUT action-points] approve", error)
      return NextResponse.json({ error: "Failed to approve" }, { status: 500 })
    }
    await supabase.from("kpi_action_point_drafts").delete().eq("review_id", id)
  } else {
    const { error } = await supabase.from("kpi_action_point_drafts").upsert({
      review_id: id, content, source: "hr", updated_at: now, updated_by: employeeId,
    })
    if (error) {
      console.error("[PUT action-points] draft", error)
      return NextResponse.json({ error: "Failed to save draft" }, { status: 500 })
    }
  }
  return NextResponse.json(await state(supabase, id))
}

// Ask the AI for a fresh draft (replaces the current draft, never the approved text).
// Body { auto: true }: the automatic draft for a completed review that has
// none yet (sent when HR opens it) — skipped when AI action points are off,
// the review isn't completed, or HR already has a draft/approved text.
async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await hrContext(true)
  if (ctx.error) return ctx.error
  const { supabase, employeeId } = ctx
  const { id } = await params
  const body = await req.json().catch(() => null)

  if (body?.auto) {
    const s = await state(supabase, id)
    if (!s) return NextResponse.json({ error: "Review not found" }, { status: 404 })
    if (s.reviewStatus !== "completed" || s.draft || s.approved) return NextResponse.json({ ...s, skipped: true })
    const r = await generateActionPoints(supabase, id, { triggeredBy: employeeId, onComplete: true })
    if (!r.ok && (r.reason === "disabled" || r.reason === "kept_hr_draft")) {
      return NextResponse.json({ ...(await state(supabase, id)), skipped: true })
    }
    if (!r.ok) return NextResponse.json({ error: r.message, reason: r.reason }, { status: r.reason === "budget" || r.reason === "no_api_key" ? 400 : 502 })
    return NextResponse.json(await state(supabase, id))
  }

  const r = await generateActionPoints(supabase, id, { triggeredBy: employeeId })
  if (!r.ok) return NextResponse.json({ error: r.message, reason: r.reason }, { status: r.reason === "budget" || r.reason === "no_api_key" ? 400 : 502 })
  return NextResponse.json(await state(supabase, id))
}

// Take approved action points off staff view; the text goes back to a draft.
async function handleDELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await hrContext(true)
  if (ctx.error) return ctx.error
  const { supabase, employeeId } = ctx
  const { id } = await params
  const s = await state(supabase, id)
  if (!s) return NextResponse.json({ error: "Review not found" }, { status: 404 })
  if (s.approved && !s.draft) {
    await supabase.from("kpi_action_point_drafts").upsert({
      review_id: id, content: s.approved, source: "hr", updated_at: new Date().toISOString(), updated_by: employeeId,
    })
  }
  const { error } = await supabase
    .from("kpi_reviews")
    .update({ action_points: null, action_points_approved_at: null, action_points_approved_by: null })
    .eq("id", id)
  if (error) return NextResponse.json({ error: "Failed to unpublish" }, { status: 500 })
  return NextResponse.json(await state(supabase, id))
}

export const PUT = withAudit(handlePUT, {"section": "KPI · Action points", "action": {"PUT": "Saved / approved action points", "POST": "Drafted action points with AI", "DELETE": "Hid action points from staff"}, "target": "review"})
export const POST = withAudit(handlePOST, {"section": "KPI · Action points", "action": {"PUT": "Saved / approved action points", "POST": "Drafted action points with AI", "DELETE": "Hid action points from staff"}, "target": "review"})
export const DELETE = withAudit(handleDELETE, {"section": "KPI · Action points", "action": {"PUT": "Saved / approved action points", "POST": "Drafted action points with AI", "DELETE": "Hid action points from staff"}, "target": "review"})
