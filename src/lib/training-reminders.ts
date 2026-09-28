import { createAdminClient } from "@/lib/supabase/admin"
import { sendTrainingReminderEmail } from "@/lib/email"
import { groupByExpiry, isoDate, loadTraining } from "@/lib/training"

// Weekly (Monday) email to every HR admin listing training that has expired
// or expires in the next 30 days. Called by the daily cron; sends at most once
// per day it runs (tracked in kpi_settings) and only when there is something
// to follow up. Service client: runs with no signed-in user.
export async function sendWeeklyTrainingReminders(now = new Date()): Promise<{ sent: number; skipped?: string }> {
  const admin = createAdminClient()
  const today = isoDate(now)

  const SENT_KEY = "training_reminders_sent_on"
  const { data: already } = await admin.from("kpi_settings").select("value").eq("key", SENT_KEY).maybeSingle()
  if (already?.value === today) return { sent: 0, skipped: "already_sent" }
  await admin.from("kpi_settings").upsert({ key: SENT_KEY, value: today }, { onConflict: "key" })

  const rows = await loadTraining(admin)
  const { expired, expiring } = groupByExpiry(rows, now, 30)
  if (expired.length === 0 && expiring.length === 0) return { sent: 0, skipped: "nothing_due" }

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-ZA", { dateStyle: "medium" }) : "")
  const shape = (r: (typeof rows)[number]) => ({ who: r.employeeName, what: r.name, date: fmt(r.expiryDate) })

  const { data: hr } = await admin
    .from("app_users")
    .select("employee:employees(first_name, email)")
    .eq("active_role", "hr")

  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://wetpaint-human-connections-two.vercel.app"}/employees/training`
  let sent = 0
  for (const h of hr ?? []) {
    const e = h.employee as unknown as { first_name: string; email: string | null } | null
    if (!e?.email) continue
    const ok = await sendTrainingReminderEmail({
      to: e.email, name: e.first_name, expired: expired.map(shape), expiring: expiring.map(shape), url,
    })
    if (ok) sent++
  }
  return { sent }
}
