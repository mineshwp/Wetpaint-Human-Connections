import { createAdminClient } from "@/lib/supabase/admin"
import { FEEDBACK_BUCKET, type FeedbackAttachment, type FeedbackKind, type FeedbackStatus } from "@/lib/feedback"

export interface FeedbackMessageView {
  id: string
  created_at: string
  kind: "reply" | "status"
  from_hr: boolean
  author_name: string | null
  /** The reply text, or (for kind "status") the new status key. */
  body: string
}

export interface FeedbackItemView {
  id: string
  created_at: string
  updated_at: string
  kind: FeedbackKind
  title: string
  description: string
  links: string[]
  page_url: string | null
  status: FeedbackStatus
  hr_note: string | null
  submitter_name: string | null
  submitter_email: string | null
  last_hr_activity_at: string | null
  submitter_read_at: string | null
  attachments: (FeedbackAttachment & { url: string | null })[]
  messages: FeedbackMessageView[]
  /** HR view: the person wrote last, so it is waiting for an HR reply. */
  awaiting_hr: boolean
  /** Person's view: HR did something (reply or status change) they haven't opened yet. */
  unread: boolean
}

const ITEM_COLS =
  "id, created_at, updated_at, kind, title, description, links, attachments, page_url, status, hr_note, submitter_name, submitter_email, last_hr_activity_at, submitter_read_at"

type Admin = ReturnType<typeof createAdminClient>

async function hydrate(admin: Admin, rows: Record<string, unknown>[]): Promise<FeedbackItemView[]> {
  const paths = rows.flatMap((i) => ((i.attachments ?? []) as FeedbackAttachment[]).map((a) => a.path))
  const urls = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await admin.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }
  const ids = rows.map((i) => i.id as string)
  const byItem = new Map<string, FeedbackMessageView[]>()
  if (ids.length > 0) {
    const { data: msgs } = await admin
      .from("feedback_messages")
      .select("id, item_id, created_at, kind, from_hr, author_name, body")
      .in("item_id", ids)
      .order("created_at", { ascending: true })
    for (const m of msgs ?? []) {
      const list = byItem.get(m.item_id as string) ?? []
      list.push(m as unknown as FeedbackMessageView)
      byItem.set(m.item_id as string, list)
    }
  }
  return rows.map((i) => {
    const messages = byItem.get(i.id as string) ?? []
    const lastReply = [...messages].reverse().find((m) => m.kind === "reply")
    const hrAt = i.last_hr_activity_at as string | null
    const readAt = i.submitter_read_at as string | null
    return {
      ...(i as unknown as Omit<FeedbackItemView, "attachments" | "messages" | "awaiting_hr" | "unread">),
      attachments: ((i.attachments ?? []) as FeedbackAttachment[]).map((a) => ({ ...a, url: urls.get(a.path) ?? null })),
      messages,
      awaiting_hr: !!lastReply && !lastReply.from_hr,
      unread: !!hrAt && (!readAt || new Date(hrAt) > new Date(readAt)),
    }
  })
}

/** All items, newest first, with conversations and 1-hour image URLs. HR callers only. */
export async function loadFeedback(): Promise<FeedbackItemView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from("feedback_items").select(ITEM_COLS).order("created_at", { ascending: false }).limit(500)
  if (error) {
    console.error("[loadFeedback]", error)
    return []
  }
  return hydrate(admin, data ?? [])
}

/** One person's own items (their view: no HR note). */
export async function loadMyFeedback(employeeId: string): Promise<FeedbackItemView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("feedback_items").select(ITEM_COLS).eq("submitted_by", employeeId)
    .order("created_at", { ascending: false }).limit(200)
  if (error) {
    console.error("[loadMyFeedback]", error)
    return []
  }
  return (await hydrate(admin, data ?? [])).map((i) => ({ ...i, hr_note: null }))
}

/** How many of this person's items have an HR reply or status change they haven't opened. */
export async function countUnreadFeedback(employeeId: string): Promise<number> {
  const { data } = await createAdminClient()
    .from("feedback_items")
    .select("last_hr_activity_at, submitter_read_at")
    .eq("submitted_by", employeeId)
    .not("last_hr_activity_at", "is", null)
  return (data ?? []).filter((r) => !r.submitter_read_at || new Date(r.last_hr_activity_at as string) > new Date(r.submitter_read_at as string)).length
}
