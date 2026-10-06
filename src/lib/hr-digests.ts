import { createAdminClient } from "@/lib/supabase/admin"
import { sendHrDigestEmail } from "@/lib/email"
import { resolveRecipients } from "@/lib/notification-settings"

// Staff self-service changes are queued in hr_change_log by the API routes and
// emailed in a digest by the daily cron to the "staff changes" recipients from
// Settings → Notifications (all HR admins if none are set): profile changes
// daily, new training weekly (Mondays). Rows are claimed (notified_at set)
// before sending so an overlapping run can't double-send, and released again if
// nobody could be emailed. Service client: runs with no signed-in user.

export type ChangeKind = "profile" | "training"

const PROFILE_LABELS: Record<string, string> = {
  phone: "phone number",
  alternate_phone: "alternate phone",
  personal_email: "personal email",
  next_of_kin_name: "next of kin name",
  next_of_kin_phone: "next of kin phone",
  next_of_kin_relationship: "next of kin relationship",
}

export const STAFF_PROFILE_FIELDS = Object.keys(PROFILE_LABELS)

/** Queue a staff change for the next HR digest. Never throws: logging must not break the save. */
export async function logStaffChange(kind: ChangeKind, employeeId: string, details: Record<string, unknown>) {
  try {
    const { error } = await createAdminClient()
      .from("hr_change_log")
      .insert({ kind, employee_id: employeeId, details })
    if (error) console.error("[hr-digests] log failed:", error.message)
  } catch (e) {
    console.error("[hr-digests] log failed:", e)
  }
}

/** Labels for the staff fields whose stored value differs from the update. */
export async function changedProfileLabels(employeeId: string, updates: Record<string, unknown>): Promise<string[]> {
  const keys = Object.keys(updates).filter((k) => k in PROFILE_LABELS)
  if (keys.length === 0) return []
  const { data } = await createAdminClient().from("employees").select(keys.join(", ")).eq("id", employeeId).single()
  const current = (data ?? {}) as unknown as Record<string, unknown>
  return keys.filter((k) => (current[k] ?? null) !== (updates[k] ?? null)).map((k) => PROFILE_LABELS[k])
}

const fmt = (d: unknown) =>
  typeof d === "string" && d ? new Date(d).toLocaleDateString("en-ZA", { dateStyle: "medium" }) : ""

type Pending = { id: string; employee: { first_name: string; last_name: string } | null; details: Record<string, unknown> }

async function sendDigest(kind: ChangeKind): Promise<{ sent: number; skipped?: string }> {
  const admin = createAdminClient()
  const claimedAt = new Date().toISOString()

  const { data: claimed, error } = await admin
    .from("hr_change_log")
    .update({ notified_at: claimedAt })
    .eq("kind", kind)
    .is("notified_at", null)
    .select("id, details, employee:employees(first_name, last_name)")
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (claimed ?? []) as unknown as Pending[]
  if (rows.length === 0) return { sent: 0, skipped: "nothing_new" }

  const release = () => admin.from("hr_change_log").update({ notified_at: null }).in("id", rows.map((r) => r.id))

  const recipients = await resolveRecipients("staffChanges")

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wetpaint-human-connections-two.vercel.app"
  const name = (r: Pending) => (r.employee ? `${r.employee.first_name} ${r.employee.last_name}`.trim() : "Unknown")

  const items = rows.map((r) => {
    if (kind === "profile") {
      const fields = Array.isArray(r.details.fields) ? (r.details.fields as string[]) : []
      return { who: name(r), what: fields.join(", ") }
    }
    const completed = fmt(r.details.date_completed)
    const expiry = fmt(r.details.expiry_date)
    const when = [completed && `completed ${completed}`, expiry && `expires ${expiry}`].filter(Boolean).join(", ")
    return { who: name(r), what: `${String(r.details.name ?? "Course")}${when ? ` (${when})` : ""}` }
  })

  let sent = 0
  for (const r of recipients) {
    const ok = await sendHrDigestEmail({
      to: r.email,
      name: r.name,
      kind,
      items,
      url: kind === "training" ? `${base}/employees/training` : `${base}/employees`,
    })
    if (ok) sent++
  }
  if (sent === 0) await release()
  return { sent }
}

export const sendDailyProfileDigest = () => sendDigest("profile")
export const sendWeeklyTrainingDigest = () => sendDigest("training")
