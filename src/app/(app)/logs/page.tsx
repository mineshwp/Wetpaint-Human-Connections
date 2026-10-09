import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { LogsTabs } from "./LogsTabs"

export const metadata = { title: "Logs — Human Connections" }

// HR-only audit trail: who signed in and what they changed.
export default async function LogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") redirect("/employees")

  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("is_archived", false)
    .order("first_name")

  const staff = (data ?? []).map((e) => ({ id: e.id as string, name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() }))

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Logs" subtitle="Who signed in and what they changed, plus the errors people ran into. Newest first; times are South African time." />
      <LogsTabs staff={staff} />
    </div>
  )
}
