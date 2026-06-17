import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { listAdmins } from "@/lib/admins"
import { PageHeader } from "@/components/layout/PageHeader"
import { AdminsPanel } from "./AdminsPanel"

export const metadata = { title: "Settings — Human Connections" }

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  const admins = await listAdmins()

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" />
      <AdminsPanel initialAdmins={admins} currentUserId={user.id} />
    </div>
  )
}
