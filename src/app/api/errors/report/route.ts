import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { actorFor } from "@/lib/activity-log"

// The browser reports a failure the server never saw (couldn't reach it, session
// expired, a save that came back with an error). Any signed-in user may post;
// text is length-capped and a person is limited to 30 reports a minute.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const message = str(body?.message, 500)
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 })

  const admin = createAdminClient()
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await admin
    .from("error_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since)
  if ((count ?? 0) >= 30) return NextResponse.json({ ok: true })

  const actor = await actorFor(admin, user.id)
  const status = Number(body?.status)
  const { error } = await admin.from("error_log").insert({
    source: "client",
    user_id: user.id,
    actor_employee_id: actor.employeeId,
    actor_name: actor.name ?? user.email ?? null,
    method: str(body?.method, 10),
    route: str(body?.route, 200),
    status: Number.isInteger(status) && status > 0 ? status : null,
    message,
    section: str(body?.section, 100),
    target_name: str(body?.target, 120),
    detail: str(body?.detail, 200),
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  })
  if (error) {
    console.error("[POST /api/errors/report]", error)
    return NextResponse.json({ error: "Failed to record" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
