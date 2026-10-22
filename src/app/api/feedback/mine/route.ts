import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"
import { loadMyFeedback } from "@/lib/feedback-server"

// The signed-in person's own problem reports and ideas, with the conversation on each.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: au } = await createAdminClient().from("app_users").select("employee_id").eq("id", user.id).maybeSingle()
  if (!au?.employee_id) return NextResponse.json({ items: [] })
  return NextResponse.json({ items: await loadMyFeedback(au.employee_id) })
}
