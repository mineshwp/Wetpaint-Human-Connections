import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { loadMyFeedback } from "@/lib/feedback-server"
import { MyFeedbackClient } from "./MyFeedbackClient"

export const metadata = { title: "My Feedback — Human Connections" }

// Everyone: the problems you reported and the ideas you shared, with HR's replies.
export default async function MyFeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") redirect("/login")
  const { data: au } = await createAdminClient().from("app_users").select("employee_id").eq("id", user.id).maybeSingle()
  const items = au?.employee_id ? await loadMyFeedback(au.employee_id) : []

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="My Feedback" subtitle="Problems you've reported and ideas you've shared, and what HR said back." />
      <MyFeedbackClient initial={items} />
    </div>
  )
}
