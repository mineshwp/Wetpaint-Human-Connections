import { withAudit } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"
import { FEEDBACK_BUCKET, FEEDBACK_STATUSES, type FeedbackAttachment, type FeedbackStatus } from "@/lib/feedback"

// HR only: set the status and/or the internal note on a problem report or idea.
// Body: { status?, hr_note? }
async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const body = await req.json().catch(() => null)
  const update: { status?: FeedbackStatus; hr_note?: string | null; updated_at: string } = { updated_at: new Date().toISOString() }
  if (body && "status" in body) {
    if (!FEEDBACK_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    update.status = body.status
  }
  if (body && "hr_note" in body) {
    if (body.hr_note != null && typeof body.hr_note !== "string") {
      return NextResponse.json({ error: "Note must be text" }, { status: 400 })
    }
    const note = (body.hr_note ?? "").trim().slice(0, 2000)
    update.hr_note = note || null
  }
  if (update.status === undefined && update.hr_note === undefined) {
    return NextResponse.json({ error: "Nothing to save" }, { status: 400 })
  }

  const { data, error } = await createAdminClient()
    .from("feedback_items").update(update).eq("id", id).select("id, status, hr_note, updated_at").maybeSingle()
  if (error) {
    console.error("[PATCH /api/feedback/[id]]", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ item: data })
}

// HR only: remove an item (spam / duplicates) and its images.
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: item } = await admin.from("feedback_items").select("attachments").eq("id", id).maybeSingle()
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { error } = await admin.from("feedback_items").delete().eq("id", id)
  if (error) {
    console.error("[DELETE /api/feedback/[id]]", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
  const paths = ((item.attachments ?? []) as FeedbackAttachment[]).map((a) => a.path)
  if (paths.length) await admin.storage.from(FEEDBACK_BUCKET).remove(paths)
  return NextResponse.json({ ok: true })
}

export const PATCH = withAudit(handlePATCH, { section: "Feedback", action: "Updated a problem report or idea" })
export const DELETE = withAudit(handleDELETE, { section: "Feedback", action: "Deleted a problem report or idea" })
