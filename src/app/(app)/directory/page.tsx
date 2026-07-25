import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { PageHeader } from "@/components/layout/PageHeader"
import { DirectoryClient, type DirectoryEntry } from "./DirectoryClient"

export const metadata = { title: "Staff Directory — Human Connections" }

// Company-wide contact directory. Readable by every authenticated user
// (the employees table allows SELECT to all authenticated users), so staff,
// managers and HR all see the same list. No admin settings — it just reads
// existing staff details.
export default async function DirectoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const role = await getUserRole(supabase, user.id)
  if (!role || role === "applicant") redirect("/login")

  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name, job_title, phone, email, work_email, profile_photo_url, avatar_initials, status, department:departments(name, colour)")
    .eq("is_archived", false)
    .order("first_name")

  const entries: DirectoryEntry[] = (data ?? [])
    .filter((e) => e.status !== "terminated" && e.status !== "resigned")
    .map((e) => {
      const dept = e.department as unknown as { name: string; colour: string | null } | null
      return {
        id: e.id,
        name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
        jobTitle: e.job_title ?? "",
        department: dept?.name ?? null,
        departmentColour: dept?.colour ?? null,
        phone: e.phone ?? null,
        email: e.work_email ?? e.email ?? null,
        photoUrl: e.profile_photo_url ?? null,
        initials: e.avatar_initials ?? `${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`.toUpperCase(),
      }
    })

  return (
    <div>
      <PageHeader
        title="Staff Directory"
        subtitle={`${entries.length} ${entries.length === 1 ? "person" : "people"} · call, WhatsApp or email anyone with one tap`}
      />
      <DirectoryClient entries={entries} />
    </div>
  )
}
