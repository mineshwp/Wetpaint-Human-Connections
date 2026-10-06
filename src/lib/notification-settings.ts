import { createAdminClient } from "@/lib/supabase/admin"
import { listAdmins } from "@/lib/admins"

// Who gets each kind of HR notification email. Stored as comma-separated lists
// in kpi_settings so HR can change them in Settings → Notifications. When a
// list is empty it falls back to every HR admin, so nothing is dropped.
//   passwordReset → "password reset requested" emails
//   staffChanges  → the daily profile-change and weekly new-training digests

export type NotifyKind = "passwordReset" | "staffChanges"

const KEYS: Record<NotifyKind, string> = {
  passwordReset: "password_reset_notify_emails",
  staffChanges: "staff_changes_notify_emails",
}
export const MAX_NOTIFY_EMAILS = 5

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

/** Splits free text on commas, semicolons and whitespace; lower-cases and de-duplicates. */
export function parseEmails(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

export function invalidEmails(emails: string[]): string[] {
  return emails.filter((e) => !EMAIL_RE.test(e))
}

export async function getRecipients(kind: NotifyKind): Promise<string[]> {
  const { data } = await createAdminClient().from("kpi_settings").select("value").eq("key", KEYS[kind]).maybeSingle()
  return typeof data?.value === "string" ? parseEmails(data.value) : []
}

export async function setRecipients(kind: NotifyKind, emails: string[]) {
  const { error } = await createAdminClient()
    .from("kpi_settings")
    .upsert({ key: KEYS[kind], value: emails.join(",") }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

/** Configured recipients for this kind of email (with first names where known), or all HR admins when none are set. */
export async function resolveRecipients(kind: NotifyKind): Promise<{ email: string; name: string }[]> {
  const configured = await getRecipients(kind)
  if (configured.length === 0) {
    return (await listAdmins())
      .filter((a) => !!a.employees?.email)
      .map((a) => ({ email: a.employees!.email, name: a.employees!.first_name }))
  }
  const { data } = await createAdminClient()
    .from("employees")
    .select("first_name, email")
    .or(configured.map((e) => `email.ilike.${e}`).join(","))
  const names = new Map((data ?? []).map((e) => [String(e.email).toLowerCase(), e.first_name as string]))
  return configured.map((email) => ({ email, name: names.get(email) ?? "there" }))
}
