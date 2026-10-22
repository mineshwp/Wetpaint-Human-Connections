import { createAdminClient } from "@/lib/supabase/admin"

export interface AnnouncementView {
  id: string
  created_at: string
  author_name: string | null
  title: string
  body: string
  link_url: string | null
  emailed_count: number
  /** This person has opened it. */
  read: boolean
}

/** Newest first, each flagged read/unread for this person. */
export async function loadAnnouncements(employeeId: string | null, limit = 100): Promise<AnnouncementView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("announcements")
    .select("id, created_at, author_name, title, body, link_url, emailed_count")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    console.error("[loadAnnouncements]", error)
    return []
  }
  const items = data ?? []
  const readIds = new Set<string>()
  if (employeeId && items.length > 0) {
    const { data: reads } = await admin
      .from("announcement_reads").select("announcement_id").eq("employee_id", employeeId).in("announcement_id", items.map((i) => i.id))
    for (const r of reads ?? []) readIds.add(r.announcement_id as string)
  }
  return items.map((i) => ({ ...(i as Omit<AnnouncementView, "read">), read: readIds.has(i.id as string) }))
}

/** Unread count and the newest unread one (for the banner), for the app shell. */
export async function unreadAnnouncements(employeeId: string): Promise<{ count: number; latest: { id: string; title: string } | null }> {
  const items = await loadAnnouncements(employeeId, 50)
  const unread = items.filter((i) => !i.read)
  return { count: unread.length, latest: unread[0] ? { id: unread[0].id, title: unread[0].title } : null }
}

/** Everyone who can use the app and should hear about a new feature: active/onboarding staff with a login and an email. */
export async function announcementAudience(): Promise<{ email: string; name: string }[]> {
  const { data, error } = await createAdminClient()
    .from("app_users")
    .select("employee_id, employees!inner(first_name, email, status)")
    .in("employees.status", ["active", "onboarding"])
  if (error) {
    console.error("[announcementAudience]", error)
    return []
  }
  const seen = new Set<string>()
  const out: { email: string; name: string }[] = []
  for (const row of data ?? []) {
    const e = row.employees as unknown as { first_name: string | null; email: string | null } | null
    const email = e?.email?.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push({ email, name: e?.first_name?.trim() || "there" })
  }
  return out
}
