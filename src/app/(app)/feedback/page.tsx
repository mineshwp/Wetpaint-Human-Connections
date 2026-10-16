import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { loadFeedback } from "@/lib/feedback-server"
import { FeedbackInbox } from "./FeedbackInbox"

export const metadata = { title: "Feedback — Human Connections" }

// HR only: the problems people report and the ideas they share.
export default async function FeedbackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Feedback" subtitle="Problems people have reported and ideas they have shared." />
      <FeedbackInbox initial={await loadFeedback()} />
    </div>
  )
}
