import { withAudit, actorFor } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"
import { requireHR } from "@/lib/hr-api"
import { sendAnnouncementEmail } from "@/lib/email"
import { MAX_ANNOUNCEMENT_BODY, MAX_ANNOUNCEMENT_TITLE, cleanLinks } from "@/lib/feedback"
import { announcementAudience, loadAnnouncements } from "@/lib/announcements-server"

// Everyone signed in: the "What's New" list, each flagged read/unread for them.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: au } = await createAdminClient().from("app_users").select("employee_id").eq("id", user.id).maybeSingle()
  return NextResponse.json({ announcements: await loadAnnouncements(au?.employee_id ?? null) })
}

// HR only: post a "What's New" message for everyone. Body: { title, body, linkUrl?, email? }
// Everyone sees it in the app (banner + What's New page). With email: true each
// active/onboarding staff member with a login is also emailed.
async function handlePOST(req: Request) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === "string" ? body.title.trim() : ""
  const text = typeof body?.body === "string" ? body.body.trim() : ""
  if (!title) return NextResponse.json({ error: "Add a title" }, { status: 400 })
  if (title.length > MAX_ANNOUNCEMENT_TITLE) return NextResponse.json({ error: `Keep the title under ${MAX_ANNOUNCEMENT_TITLE} characters` }, { status: 400 })
  if (!text) return NextResponse.json({ error: "Add a message" }, { status: 400 })
  if (text.length > MAX_ANNOUNCEMENT_BODY) return NextResponse.json({ error: `Keep the message under ${MAX_ANNOUNCEMENT_BODY} characters` }, { status: 400 })
  let linkUrl: string | null = null
  if (typeof body?.linkUrl === "string" && body.linkUrl.trim()) {
    const { links, error } = cleanLinks([body.linkUrl])
    if (error) return NextResponse.json({ error }, { status: 400 })
    linkUrl = links[0] ?? null
  }
  const email = body?.email === true

  const admin = createAdminClient()
  const actor = await actorFor(admin, ctx.userId)
  const { data, error } = await admin
    .from("announcements")
    .insert({ created_by: actor.employeeId, author_name: actor.name, title, body: text, link_url: linkUrl, email_requested: email })
    .select("id, created_at, author_name, title, body, link_url, emailed_count")
    .single()
  if (error || !data) {
    console.error("[POST /api/announcements]", error)
    return NextResponse.json({ error: "Couldn't post that — please try again" }, { status: 500 })
  }

  let emailed = 0
  let audience = 0
  if (email) {
    const recipients = await announcementAudience()
    audience = recipients.length
    emailed = await sendAnnouncementEmail({
      recipients, title, body: text, linkUrl, url: `${new URL(req.url).origin}/updates`,
    })
    await admin.from("announcements").update({ emailed_count: emailed }).eq("id", data.id)
    data.emailed_count = emailed
  }
  // The author has obviously seen it.
  if (actor.employeeId) await admin.from("announcement_reads").insert({ announcement_id: data.id, employee_id: actor.employeeId })

  return NextResponse.json({ announcement: { ...data, read: true }, emailed, audience }, { status: 201 })
}

export const POST = withAudit(handlePOST, { section: "What's New", action: "Posted an announcement" })
