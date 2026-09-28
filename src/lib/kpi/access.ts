import type { SupabaseClient } from "@supabase/supabase-js"
import { getUserRole, getEmployeeIdForUser, canAccessEmployee } from "@/lib/auth"

/** Draft reviews are open for reviewers; once HR publishes, only HR can edit. */
export function isPublished(status: string | null | undefined): boolean {
  return status === "active" || status === "completed"
}

export const PUBLISHED_LOCK_MESSAGE =
  "This review has been published — only HR can make changes now."

/**
 * Who can read a review: HR; any invitee; and — once it is published — the
 * staff member it's about and any manager who can see them. Mirrored by the
 * database function hc_can_view_review.
 */
export async function canViewReview(
  supabase: SupabaseClient,
  userId: string,
  reviewId: string
): Promise<boolean> {
  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, userId),
    getEmployeeIdForUser(supabase, userId),
  ])

  if (role === "hr") return true
  if (!role || role === "applicant" || !myEmployeeId) return false

  const { data: review } = await supabase
    .from("kpi_reviews")
    .select("employee_id, status")
    .eq("id", reviewId)
    .single()
  if (!review) return false
  if (review.employee_id === myEmployeeId && isPublished(review.status)) return true

  const { data: inv } = await supabase
    .from("kpi_review_invitees")
    .select("id")
    .eq("review_id", reviewId)
    .eq("invitee_id", myEmployeeId)
    .maybeSingle()
  if (inv) return true

  // A manager sees published reviews of anyone in their team (read-only).
  if (role === "manager" && isPublished(review.status) && review.employee_id !== myEmployeeId) {
    return canAccessEmployee(supabase, userId, role, review.employee_id)
  }
  return false
}

/** Review status, for the published lock on reviewer writes. */
export async function getReviewStatus(
  supabase: SupabaseClient,
  reviewId: string
): Promise<string | null> {
  const { data } = await supabase.from("kpi_reviews").select("status").eq("id", reviewId).single()
  return (data?.status as string | undefined) ?? null
}
