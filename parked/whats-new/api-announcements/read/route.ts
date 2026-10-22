import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"

// Mark announcements as read for the signed-in person: one ({ id }) or all of
// them (no body). Not wrapped in withAudit — it's a read receipt, and logging
// every open would drown the activity log. Only touches the real user's own rows.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const admin = createAdminClient()
  const { data: au } = await admin.from("app_users").select("employee_id").eq("id", user.id).maybeSingle()
  if (!au?.employee_id) return NextResponse.json({ ok: true })

  const body = await req.json().catch(() => null)
  const only = typeof body?.id === "string" ? body.id : null
  let ids: string[]
  if (only) ids = [only]
  else {
    const { data } = await admin.from("announcements").select("id").order("created_at", { ascending: false }).limit(200)
    ids = (data ?? []).map((a) => a.id as string)
  }
  if (ids.length > 0) {
    const { error } = await admin
      .from("announcement_reads")
      .upsert(ids.map((announcement_id) => ({ announcement_id, employee_id: au.employee_id })), { onConflict: "announcement_id,employee_id", ignoreDuplicates: true })
    if (error) {
      console.error("[POST /api/announcements/read]", error)
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
