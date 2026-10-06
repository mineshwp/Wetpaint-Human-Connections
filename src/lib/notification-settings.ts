import { createAdminClient } from "@/lib/supabase/admin"
import { listAdmins } from "@/lib/admins"

// Who gets the "password reset requested" email. Stored as a comma-separated
// list in kpi_settings so HR can change it in Settings → Notifications. When
// empty it falls back to every HR admin, so a request is never dropped.

const KEY = "password_reset_notify_emails"
export const MAX_NOTIFY_EMAILS = 5

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/** Splits free text on commas, semicolons and whitespace; lower-cases and de-duplicates. */
export function parseEmails(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

export function invalidEmails(emails: string[]): string[] {
  return emails.filter((e) => !EMAIL_RE.test(e))
}

export async function getPasswordResetRecipients(): Promise<string[]> {
  const { data } = await createAdminClient().from("kpi_settings").select("value").eq("key", KEY).maybeSingle()
  return typeof data?.value === "string" ? parseEmails(data.value) : []
}

export async function setPasswordResetRecipients(emails: string[]) {
  const { error } = await createAdminClient()
    .from("kpi_settings")
    .upsert({ key: KEY, value: emails.join(",") }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

/** Configured recipients, or all HR admins when none are set. */
export async function resolvePasswordResetRecipients(): Promise<string[]> {
  const configured = await getPasswordResetRecipients()
  if (configured.length > 0) return configured
  return (await listAdmins()).map((a) => a.employees?.email).filter((e): e is string => !!e)
}
