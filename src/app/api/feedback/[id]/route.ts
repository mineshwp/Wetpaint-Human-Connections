import { withAudit } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendFeedbackReplyEmail } from "@/lib/email"
import {
  FEEDBACK_BUCKET, FEEDBACK_STATUSES, STATUS_LABELS, type FeedbackAttachment, type FeedbackKind, type FeedbackStatus,
} from "@/lib/feedback"
import { actorFor } from "@/lib/activity-log"

// HR only: set the status and/or the internal note on a problem report or idea.
// Body: { status?, hr_note?, notify? }. Changing the status adds a line to the
// conversation and (unless notify is false) emails the person.
async function handlePATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const body = await req.json().catch(() => null)
  const update: { status?: FeedbackStatus; hr_note?: string | null; updated_at: string; last_hr_activity_at?: string } = {
    updated_at: new Date().toISOString(),
  }
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

  const admin = createAdminClient()
  const { data: current } = await admin
    .from("feedback_items").select("status, kind, title, submitted_by, submitter_email").eq("id", id).maybeSingle()
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const statusChanged = update.status !== undefined && update.status !== current.status
  if (statusChanged) update.last_hr_activity_at = new Date().toISOString()

  const { data, error } = await admin
    .from("feedback_items").update(update).eq("id", id).select("id, status, hr_note, updated_at, last_hr_activity_at").maybeSingle()
  if (error) {
    console.error("[PATCH /api/feedback/[id]]", error)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let message = null
  if (statusChanged) {
    const actor = await actorFor(admin, ctx.userId)
    const { data: msg } = await admin
      .from("feedback_messages")
      .insert({ item_id: id, kind: "status", from_hr: true, author_id: actor.employeeId, author_name: actor.name, body: update.status })
      .select("id, created_at, kind, from_hr, author_name, body")
      .single()
    message = msg ?? null

    // Best effort: tell the person (not when HR is changing the status of their own item).
    if (body?.notify !== false && current.submitted_by !== actor.employeeId && current.submitter_email) {
      try {
        await sendFeedbackReplyEmail({
          to: [current.submitter_email], audience: "person", itemTitle: current.title, kind: current.kind as FeedbackKind,
          message: null, statusLabel: STATUS_LABELS[current.kind as FeedbackKind][update.status!], fromName: actor.name ?? "HR",
          url: `${new URL(req.url).origin}/my-feedback`,
        })
      } catch (e) {
        console.error("[PATCH /api/feedback/[id]] notify failed", e)
      }
    }
  }
  return NextResponse.json({ item: data, message })
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
