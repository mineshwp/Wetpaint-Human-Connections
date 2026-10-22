import { withAudit, actorFor } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { resolveRecipients } from "@/lib/notification-settings"
import { sendFeedbackReplyEmail } from "@/lib/email"
import { MAX_MESSAGE, MAX_MESSAGES_PER_HOUR, STATUS_LABELS, type FeedbackKind } from "@/lib/feedback"

// Reply on a problem report or idea. Two people can use this:
//   - HR (any item): the person is emailed and sees it under My Feedback
//   - the person who sent it (their own items only): HR is emailed
// Body: { body }
async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  if (!text) return NextResponse.json({ error: "Write a message first" }, { status: 400 })
  if (text.length > MAX_MESSAGE) return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE} characters` }, { status: 400 })

  const admin = createAdminClient()
  const { data: item } = await admin
    .from("feedback_items").select("id, kind, title, status, submitted_by, submitter_email").eq("id", id).maybeSingle()
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const actor = await actorFor(admin, user.id)
  const isOwner = !!actor.employeeId && item.submitted_by === actor.employeeId
  // HR answering someone else's item is "from HR"; anyone answering their own item is the person.
  const fromHr = role === "hr" && !isOwner
  if (!fromHr && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from("feedback_messages").select("id", { count: "exact", head: true })
    .eq("author_id", actor.employeeId ?? "00000000-0000-0000-0000-000000000000").eq("kind", "reply").gte("created_at", since)
  if ((count ?? 0) >= MAX_MESSAGES_PER_HOUR) {
    return NextResponse.json({ error: "That's a lot of messages in the last hour. Please try again a little later." }, { status: 429 })
  }

  const { data: msg, error } = await admin
    .from("feedback_messages")
    .insert({ item_id: id, kind: "reply", from_hr: fromHr, author_id: actor.employeeId, author_name: actor.name ?? user.email, body: text })
    .select("id, created_at, kind, from_hr, author_name, body")
    .single()
  if (error || !msg) {
    console.error("[POST /api/feedback/[id]/messages]", error)
    return NextResponse.json({ error: "Couldn't send that — please try again" }, { status: 500 })
  }
  // HR replied → mark the person's copy unread. The person replied → HR sees "awaiting reply" (derived).
  const now = new Date().toISOString()
  await admin.from("feedback_items").update(fromHr ? { last_hr_activity_at: now, updated_at: now } : { updated_at: now }).eq("id", id)

  try {
    const origin = new URL(req.url).origin
    if (fromHr) {
      if (item.submitter_email) {
        await sendFeedbackReplyEmail({
          to: [item.submitter_email], audience: "person", itemTitle: item.title, kind: item.kind as FeedbackKind, message: text,
          statusLabel: STATUS_LABELS[item.kind as FeedbackKind][item.status as keyof typeof STATUS_LABELS.problem], fromName: actor.name ?? "HR",
          url: `${origin}/my-feedback`,
        })
      }
    } else {
      const to = (await resolveRecipients("feedback")).map((r) => r.email)
      await sendFeedbackReplyEmail({
        to, audience: "hr", itemTitle: item.title, kind: item.kind as FeedbackKind, message: text, statusLabel: null,
        fromName: actor.name ?? "Someone", url: `${origin}/feedback`,
      })
    }
  } catch (e) {
    console.error("[POST /api/feedback/[id]/messages] notify failed", e)
  }
  return NextResponse.json({ message: msg }, { status: 201 })
}

export const POST = withAudit(handlePOST, { section: "Feedback", action: "Replied on a problem report or idea" })
