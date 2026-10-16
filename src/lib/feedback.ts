// "Report an Issue" / "Share an Idea": shared constants, labels and helpers.
// Items live in feedback_items (service role only); images in the private
// "feedback-attachments" bucket.

export const FEEDBACK_BUCKET = "feedback-attachments"
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 5
export const MAX_LINKS = 5
export const MAX_TITLE = 120
export const MAX_DESCRIPTION = 4000
/** Per person, to stop accidental floods (each submission emails HR). */
export const MAX_SUBMISSIONS_PER_HOUR = 10

export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]

export type FeedbackKind = "problem" | "idea"
export type FeedbackStatus = "new" | "in_progress" | "done" | "closed"

export const FEEDBACK_KINDS: Record<FeedbackKind, { label: string; plural: string }> = {
  problem: { label: "Problem", plural: "Problems" },
  idea: { label: "Idea", plural: "Ideas" },
}

export const FEEDBACK_STATUSES: FeedbackStatus[] = ["new", "in_progress", "done", "closed"]

/** Status wording differs by kind: a problem gets fixed, an idea gets planned. */
export const STATUS_LABELS: Record<FeedbackKind, Record<FeedbackStatus, string>> = {
  problem: { new: "New", in_progress: "Being looked at", done: "Fixed", closed: "Closed" },
  idea: { new: "New", in_progress: "Planned", done: "Done", closed: "Not planned" },
}

export interface FeedbackAttachment {
  path: string
  name: string
  size: number | null
  mime: string | null
}

/** Safe object path: `<auth user id>/<random>-<file name>`. */
export function feedbackPath(userId: string, fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-100) || "file"
  return `${userId}/${crypto.randomUUID()}-${safe}`
}

/** Keeps only well-formed http(s) links, trimmed, de-duplicated and capped. */
export function cleanLinks(input: unknown): { links: string[]; error?: string } {
  if (input == null) return { links: [] }
  if (!Array.isArray(input)) return { links: [], error: "Links must be a list" }
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== "string" || !raw.trim()) continue
    const text = raw.trim()
    if (text.length > 500) return { links: [], error: "A link is too long" }
    let url: URL
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`)
    } catch {
      return { links: [], error: `"${text.slice(0, 40)}" isn't a valid link` }
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { links: [], error: "Links must start with http:// or https://" }
    }
    if (!out.includes(url.toString())) out.push(url.toString())
  }
  if (out.length > MAX_LINKS) return { links: [], error: `Add at most ${MAX_LINKS} links` }
  return { links: out }
}
