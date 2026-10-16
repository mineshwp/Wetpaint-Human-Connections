import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { HelpCenter } from "@/components/help/HelpCenter"
import { adminGuide } from "@/content/help/admin"

export const metadata = { title: "Admin Help — Human Connections" }

// Help for HR admins only: every admin feature and every Settings option.
// getUserRole follows "View as", so an admin viewing as staff is sent back to the staff help.
export default async function AdminHelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/help")
  return <HelpCenter guide={adminGuide} />
}
