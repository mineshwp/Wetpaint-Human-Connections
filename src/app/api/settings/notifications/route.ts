import { NextRequest, NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import {
  MAX_NOTIFY_EMAILS, getPasswordResetRecipients, invalidEmails, parseEmails, setPasswordResetRecipients,
} from "@/lib/notification-settings"

// Settings → Notifications (HR only): who is emailed when someone asks for a
// password reset. Empty list = all HR admins.

export async function GET() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  return NextResponse.json({ passwordResetEmails: await getPasswordResetRecipients() })
}

export async function PUT(req: NextRequest) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => null)
  if (typeof body?.passwordResetEmails !== "string") {
    return NextResponse.json({ error: "passwordResetEmails is required" }, { status: 400 })
  }
  const emails = parseEmails(body.passwordResetEmails)
  const bad = invalidEmails(emails)
  if (bad.length > 0) {
    return NextResponse.json({ error: `Not a valid email address: ${bad.join(", ")}` }, { status: 400 })
  }
  if (emails.length > MAX_NOTIFY_EMAILS) {
    return NextResponse.json({ error: `Add at most ${MAX_NOTIFY_EMAILS} addresses.` }, { status: 400 })
  }

  try {
    await setPasswordResetRecipients(emails)
  } catch (e) {
    console.error("[PUT /api/settings/notifications]", e)
    return NextResponse.json({ error: "Failed to save" }, { status: 500 })
  }
  return NextResponse.json({ passwordResetEmails: emails })
}
