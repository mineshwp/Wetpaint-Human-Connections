import { createAdminClient } from "@/lib/supabase/admin"
import { sendCheckinReminderEmail } from "@/lib/email"
import { checkinDeadlineLabel, monthLabel, monthKey, shiftMonth } from "@/lib/kpi/checkins"
import { reportingLine } from "@/lib/reporting-line"

// Emails every manager who has an active portal login a
// reminder to complete last month's check-ins. Called on the 1st of the month
// by the daily cron (see /api/cron/keepalive). Service client: this runs with
// no signed-in user. Sends at most once per month (tracked in kpi_settings).
// Best-effort; returns how many emails went out.
export async function sendMonthlyCheckinReminders(now = new Date()): Promise<{ sent: number; month: string; skipped?: string }> {
  const month = shiftMonth(monthKey(now), -1)
  const admin = createAdminClient()

  // Once per month, however often the cron endpoint is hit.
  const SENT_KEY = "checkin_reminders_sent_for"
  const { data: already } = await admin.from("kpi_settings").select("value").eq("key", SENT_KEY).maybeSingle()
  if (already?.value === month) return { sent: 0, month, skipped: "already_sent" }
  await admin.from("kpi_settings").upsert({ key: SENT_KEY, value: month }, { onConflict: "key" })

  const [{ data: logins }, { data: staff }] = await Promise.all([
    admin.from("app_users").select("id, employee_id, active_role").neq("active_role", "hr"),
    admin
      .from("employees")
      .select("id, first_name, email, department_id, manager_id, access_level")
      .eq("is_archived", false)
      .in("status", ["active", "onboarding", "on-leave"]),
  ])

  const byId = new Map((staff ?? []).map((e) => [e.id as string, e]))
  const teamSize = (deptIds: string[], selfId: string) =>
    (staff ?? []).filter((e) => e.department_id && deptIds.includes(e.department_id) && e.id !== selfId).length

  const url = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wetpaint-human-connections-two.vercel.app"
  let sent = 0

  for (const login of logins ?? []) {
    const emp = login.employee_id ? byId.get(login.employee_id) : undefined
    if (!emp?.email) continue

    // Same scope rules as getTeamScope in lib/auth.ts (managers only).
    let count = 0
    if (emp.access_level === "manager_reports") {
      count = (staff ?? []).filter((e) => e.manager_id === emp.id).length
    } else if (emp.access_level === "manager_line") {
      count = reportingLine(staff ?? [], emp.id).length
    } else if (emp.access_level === "manager_department" && emp.department_id) {
      count = teamSize([emp.department_id], emp.id)
    }
    if (count === 0) continue

    // Skip disabled logins.
    const { data: authUser } = await admin.auth.admin.getUserById(login.id)
    const bannedUntil = authUser?.user?.banned_until
    if (bannedUntil && new Date(bannedUntil).getTime() > now.getTime()) continue

    const ok = await sendCheckinReminderEmail({
      to: emp.email,
      name: emp.first_name,
      monthLabel: monthLabel(month),
      deadlineLabel: checkinDeadlineLabel(month),
      teamCount: count,
      url: `${url}/kpi`,
    })
    if (ok) sent++
  }
  return { sent, month }
}
