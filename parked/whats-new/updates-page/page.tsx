import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole, getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { announcementAudience, loadAnnouncements } from "@/lib/announcements-server"
import { UpdatesClient } from "./UpdatesClient"

export const metadata = { title: "What's New — Human Connections" }

// Everyone: what's new in the app. HR also sees the box to post a message to everyone.
export default async function UpdatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const realRole = await getRealUserRole(supabase, user.id)
  if (!realRole || realRole === "applicant") redirect("/login")
  // Effective role: an HR admin "viewing as" staff sees the staff page (no composer).
  const canPost = (await getUserRole(supabase, user.id)) === "hr"
  const { data: au } = await createAdminClient().from("app_users").select("employee_id").eq("id", user.id).maybeSingle()

  const [items, audience] = await Promise.all([
    loadAnnouncements(au?.employee_id ?? null),
    canPost ? announcementAudience() : Promise.resolve([]),
  ])

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="What's New" subtitle="New features and changes in Human Connections." />
      <UpdatesClient initial={items} canPost={canPost} audienceCount={audience.length} />
    </div>
  )
}
