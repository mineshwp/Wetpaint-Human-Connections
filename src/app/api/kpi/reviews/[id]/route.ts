import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { generateActionPoints } from "@/lib/kpi/action-points"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { canViewReview } from "@/lib/kpi/access"
import { isMonthPeriod, isValidReviewPeriod, PERIOD_STATUS_ERROR } from "@/lib/kpi/onboarding"

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
    .from("kpi_reviews")
    .select(`
      id, employee_id, period, title, deadline, status, created_at, action_points, action_points_generated_at,
      employee:employees!kpi_reviews_employee_id_fkey(id, first_name, last_name, job_title, department:departments(name)),
      kpi_review_invitees(id, invitee_id, status, invitee:employees!kpi_review_invitees_invitee_id_fkey(id, first_name, last_name))
    `)
    .eq("id", id)
    .single()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const allowed: Record<string, unknown> = {}
  if (body.status !== undefined) allowed.status = body.status
  if (body.title !== undefined) allowed.title = body.title
  if (body.deadline !== undefined) allowed.deadline = body.deadline
  if (body.period !== undefined) allowed.period = body.period
  if (allowed.status !== undefined && !["draft", "active", "completed"].includes(String(allowed.status))) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }
  if (allowed.period !== undefined && !isValidReviewPeriod(String(allowed.period))) {
    return NextResponse.json({ error: "period must look like \"Q1 2026\" or \"Month 1\"" }, { status: 400 })
  }

  const { data: before } = await supabase
    .from("kpi_reviews")
    .select("status, period, employee:employees!kpi_reviews_employee_id_fkey(status)")
    .eq("id", id)
    .maybeSingle()
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Month periods belong to onboarding staff; a permanent person's onboarding
  // reviews keep their Month period, but can't be moved to a quarter (or back).
  if (allowed.period !== undefined && allowed.period !== before.period) {
    const empStatus = (before.employee as { status?: string } | null)?.status
    const isOnboardingReview = isMonthPeriod(String(allowed.period))
    if (empStatus === "onboarding" && !isOnboardingReview) {
      return NextResponse.json({ error: PERIOD_STATUS_ERROR }, { status: 400 })
    }
    if (empStatus !== "onboarding" && isOnboardingReview) {
      return NextResponse.json({ error: "Month 1–3 reviews are only for staff who are onboarding." }, { status: 400 })
    }
  }

  const { data, error } = await supabase
    .from("kpi_reviews")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Failed to update review" }, { status: 500 })

  // When HR marks a quarter's review Complete, draft AI action points for
  // that period for HR to approve. Staff see nothing until HR approves.
  // Best-effort: never blocks the status change. Settings → AI controls it.
  let actionPoints: { generated: boolean; reason?: string; message?: string } | undefined
  if (body.status === "completed" && before.status !== "completed") {
    const r = await generateActionPoints(supabase, id, {
      onComplete: true,
      triggeredBy: await getEmployeeIdForUser(supabase, user.id),
    })
    actionPoints = r.ok ? { generated: true } : { generated: false, reason: r.reason, message: r.message }
  }

  return NextResponse.json({ ...data, actionPoints })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase.from("kpi_reviews").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Failed to delete review" }, { status: 500 })

  return NextResponse.json({ success: true })
}
