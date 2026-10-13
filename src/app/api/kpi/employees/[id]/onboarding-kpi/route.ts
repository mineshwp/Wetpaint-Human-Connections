import { withAudit } from "@/lib/activity-log"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"

// HR only: turn the 3-month (Month 1–3) KPI on or off for a staff member.
// Existing Month reviews are never touched — this only controls whether the
// Month 1–3 slots show (and can be created) for a permanent person.
async function handlePATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body.show_onboarding_kpi !== "boolean") {
    return NextResponse.json({ error: "show_onboarding_kpi (true/false) is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ show_onboarding_kpi: body.show_onboarding_kpi })
    .eq("id", id)
    .select("id, show_onboarding_kpi")
    .maybeSingle()

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}

export const PATCH = withAudit(handlePATCH, { section: "KPI · Review", action: "Changed 3-month KPI setting" })
