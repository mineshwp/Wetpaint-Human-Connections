import type { SupabaseClient } from "@supabase/supabase-js"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { getHeadedDepartmentIds } from "@/lib/roles"

/** Draft reviews are open for reviewers; once HR publishes, only HR can edit. */
export function isPublished(status: string | null | undefined): boolean {
  return status === "active" || status === "completed"
}

export const PUBLISHED_LOCK_MESSAGE =
  "This review has been published — only HR can make changes now."

/**
 * Who can read a review: HR; the staff member it's about; an invitee; or a
 * department head over the staff member's department once it is published.
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
    .select("employee_id, status, employee:employees!kpi_reviews_employee_id_fkey(department_id)")
    .eq("id", reviewId)
    .single()
  if (!review) return false
  if (review.employee_id === myEmployeeId) return true

  const { data: inv } = await supabase
    .from("kpi_review_invitees")
    .select("id")
    .eq("review_id", reviewId)
    .eq("invitee_id", myEmployeeId)
    .maybeSingle()
  if (inv) return true

  if (role === "dept_head" && isPublished(review.status)) {
    const deptId = (review.employee as unknown as { department_id: string | null } | null)?.department_id
    if (!deptId) return false
    const headed = await getHeadedDepartmentIds(supabase, myEmployeeId)
    return headed.includes(deptId)
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
