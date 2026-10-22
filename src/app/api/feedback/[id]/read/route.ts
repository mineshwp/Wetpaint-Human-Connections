import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"

// The person opened their item: clears the "new reply" badge. Own items only.
// Deliberately not wrapped in withAudit — it's a read receipt, and logging every
// open would drown the activity log. Allowed in "View as" (it only touches the real user's own data).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { id } = await params

  const admin = createAdminClient()
  const { data: au } = await admin.from("app_users").select("employee_id").eq("id", user.id).maybeSingle()
  if (!au?.employee_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data, error } = await admin
    .from("feedback_items").update({ submitter_read_at: new Date().toISOString() })
    .eq("id", id).eq("submitted_by", au.employee_id).select("id").maybeSingle()
  if (error) return NextResponse.json({ error: "Failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
