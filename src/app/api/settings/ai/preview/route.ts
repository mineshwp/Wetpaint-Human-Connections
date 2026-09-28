import { NextRequest, NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { generateActionPoints } from "@/lib/kpi/action-points"

// "Try it on a review" (HR only): runs the given (unsaved) prompt against a
// published review and returns the text. Nothing is saved or shown to staff.
// Counts toward the monthly spend cap and appears in the usage log.
export async function POST(req: NextRequest) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const body = await req.json().catch(() => null)
  const reviewId = typeof body?.review_id === "string" ? body.review_id : null
  const prompt = typeof body?.prompt === "string" && body.prompt.trim() ? body.prompt.trim().slice(0, 8000) : undefined
  if (!reviewId) return NextResponse.json({ error: "Pick a review to try it on" }, { status: 400 })

  const r = await generateActionPoints(ctx.supabase, reviewId, { dryRun: true, promptOverride: prompt, triggeredBy: ctx.employeeId })
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: 400 })
  return NextResponse.json({ text: r.text, model: r.model, costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens })
}
