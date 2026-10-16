import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { HelpCenter } from "@/components/help/HelpCenter"
import { staffGuide } from "@/content/help/staff"

export const metadata = { title: "Help — Human Connections" }

// Help for everyone with their own account: staff, managers and KPI reviewers.
export default async function HelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  return <HelpCenter guide={staffGuide} />
}
