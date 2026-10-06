import { NextRequest, NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import {
  MAX_NOTIFY_EMAILS, getRecipients, invalidEmails, parseEmails, setRecipients, type NotifyKind,
} from "@/lib/notification-settings"

// Settings → Notifications (HR only): who is emailed for password reset
// requests and for the staff-changes digests. An empty list = all HR admins.

const FIELDS: { field: string; kind: NotifyKind }[] = [
  { field: "passwordResetEmails", kind: "passwordReset" },
  { field: "staffChangesEmails", kind: "staffChanges" },
]

async function current() {
  const [passwordResetEmails, staffChangesEmails] = await Promise.all([
    getRecipients("passwordReset"),
    getRecipients("staffChanges"),
  ])
  return { passwordResetEmails, staffChangesEmails }
}

export async function GET() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  return NextResponse.json(await current())
}

export async function PUT(req: NextRequest) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => null)
  const updates: { kind: NotifyKind; emails: string[] }[] = []
  for (const { field, kind } of FIELDS) {
    if (!(field in (body ?? {}))) continue
    if (typeof body[field] !== "string") {
      return NextResponse.json({ error: `${field} must be text` }, { status: 400 })
    }
    const emails = parseEmails(body[field])
    const bad = invalidEmails(emails)
    if (bad.length > 0) {
      return NextResponse.json({ error: `Not a valid email address: ${bad.join(", ")}` }, { status: 400 })
    }
    if (emails.length > MAX_NOTIFY_EMAILS) {
      return NextResponse.json({ error: `Add at most ${MAX_NOTIFY_EMAILS} addresses per field.` }, { status: 400 })
    }
    updates.push({ kind, emails })
  }
  if (updates.length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 })

  try {
    for (const u of updates) await setRecipients(u.kind, u.emails)
  } catch (e) {
    console.error("[PUT /api/settings/notifications]", e)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
  return NextResponse.json(await current())
}
