import { withAudit } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"
import { requireHR } from "@/lib/hr-api"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { resolveRecipients } from "@/lib/notification-settings"
import { sendFeedbackEmail } from "@/lib/email"
import {
  FEEDBACK_BUCKET, MAX_ATTACHMENTS, MAX_DESCRIPTION, MAX_SUBMISSIONS_PER_HOUR, MAX_TITLE,
  cleanLinks, type FeedbackAttachment,
} from "@/lib/feedback"
import { loadFeedback } from "@/lib/feedback-server"

// HR only: every problem report and idea, newest first, with short-lived image URLs.
export async function GET() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  return NextResponse.json({ items: await loadFeedback() })
}

// Any signed-in staff member: report a problem or share an idea.
// Body: { kind, title, description, links?, attachments?: [{ path, name }], pageUrl? }
async function handlePOST(req: Request) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const kind = body?.kind === "problem" || body?.kind === "idea" ? (body.kind as "problem" | "idea") : null
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const description = typeof body?.description === "string" ? body.description.trim() : ""
  if (!kind) return NextResponse.json({ error: "Choose whether this is a problem or an idea" }, { status: 400 })
  if (!title) return NextResponse.json({ error: "Add a short title" }, { status: 400 })
  if (title.length > MAX_TITLE) return NextResponse.json({ error: `Keep the title under ${MAX_TITLE} characters` }, { status: 400 })
  if (!description) return NextResponse.json({ error: "Add a description" }, { status: 400 })
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json({ error: `Keep the description under ${MAX_DESCRIPTION} characters` }, { status: 400 })
  }
  const { links, error: linkError } = cleanLinks(body?.links)
  if (linkError) return NextResponse.json({ error: linkError }, { status: 400 })

  const admin = createAdminClient()

  // Gentle rate limit: each submission emails HR.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: au } = await admin.from("app_users").select("employee_id").eq("id", user.id).maybeSingle()
  const employeeId: string | null = au?.employee_id ?? null
  if (employeeId) {
    const { count } = await admin
      .from("feedback_items").select("id", { count: "exact", head: true })
      .eq("submitted_by", employeeId).gte("created_at", since)
    if ((count ?? 0) >= MAX_SUBMISSIONS_PER_HOUR) {
      return NextResponse.json({ error: "You've sent a lot in the last hour. Please try again a little later." }, { status: 429 })
    }
  }

  // Every attachment must be in this person's own folder and really be there.
  const rawAtt = Array.isArray(body?.attachments) ? body.attachments : []
  if (rawAtt.length > MAX_ATTACHMENTS) {
    return NextResponse.json({ error: `Attach at most ${MAX_ATTACHMENTS} files` }, { status: 400 })
  }
  const attachments: FeedbackAttachment[] = []
  for (const a of rawAtt) {
    const path = typeof a?.path === "string" ? a.path : ""
    if (!path.startsWith(`${user.id}/`) || path.includes("..")) {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 })
    }
    const folder = path.slice(0, path.lastIndexOf("/"))
    const file = path.slice(path.lastIndexOf("/") + 1)
    const { data: found } = await admin.storage.from(FEEDBACK_BUCKET).list(folder, { search: file, limit: 1 })
    const obj = found?.find((f) => f.name === file)
    if (!obj) return NextResponse.json({ error: "An upload didn't finish — please try attaching it again" }, { status: 400 })
    const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string }
    attachments.push({
      path,
      name: (typeof a?.name === "string" ? a.name.trim() : file).slice(0, 120) || file,
      size: meta.size ?? null,
      mime: meta.mimetype ?? null,
    })
  }

  let submitterName = user.email ?? "Someone"
  let submitterEmail: string | null = user.email ?? null
  if (employeeId) {
    const { data: e } = await admin.from("employees").select("first_name, last_name, email").eq("id", employeeId).maybeSingle()
    if (e) {
      submitterName = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || submitterName
      submitterEmail = e.email ?? submitterEmail
    }
  }

  const pageUrl = typeof body?.pageUrl === "string" && body.pageUrl.startsWith("/") ? body.pageUrl.slice(0, 300) : null
  const { data, error } = await admin
    .from("feedback_items")
    .insert({
      kind, title, description, links, attachments, page_url: pageUrl,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      submitted_by: employeeId, submitter_name: submitterName, submitter_email: submitterEmail,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[POST /api/feedback]", error)
    if (attachments.length) await admin.storage.from(FEEDBACK_BUCKET).remove(attachments.map((a) => a.path))
    return NextResponse.json({ error: "Couldn't send that — please try again" }, { status: 500 })
  }

  // Best effort: a failed email must not fail the submission (it's still in /feedback).
  try {
    const to = (await resolveRecipients("feedback")).map((r) => r.email)
    await sendFeedbackEmail({
      to, kind, title, description, submitterName, attachments: attachments.length,
      url: `${new URL(req.url).origin}/feedback`,
    })
  } catch (e) {
    console.error("[POST /api/feedback] notify failed", e)
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}

export const POST = withAudit(handlePOST, { section: "Feedback", action: "Sent a problem report or idea" })
