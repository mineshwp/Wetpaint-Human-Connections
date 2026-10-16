import { createAdminClient } from "@/lib/supabase/admin"
import { FEEDBACK_BUCKET, type FeedbackAttachment, type FeedbackKind, type FeedbackStatus } from "@/lib/feedback"

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
  attachments: (FeedbackAttachment & { url: string | null })[]
}

/** All items, newest first, each image with a 1-hour signed URL. HR callers only. */
export async function loadFeedback(): Promise<FeedbackItemView[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("feedback_items")
    .select("id, created_at, updated_at, kind, title, description, links, attachments, page_url, status, hr_note, submitter_name, submitter_email")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    console.error("[loadFeedback]", error)
    return []
  }
  const items = data ?? []
  const paths = items.flatMap((i) => ((i.attachments ?? []) as FeedbackAttachment[]).map((a) => a.path))
  const urls = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await admin.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl)
  }
  return items.map((i) => ({
    ...(i as Omit<FeedbackItemView, "attachments">),
    attachments: ((i.attachments ?? []) as FeedbackAttachment[]).map((a) => ({ ...a, url: urls.get(a.path) ?? null })),
  }))
}
