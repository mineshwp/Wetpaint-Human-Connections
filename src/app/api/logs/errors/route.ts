import { NextRequest, NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"

const PAGE_SIZE = 50

// Error log for HR: failed saves and server errors users hit.
//   ?employee=<id>  only that person's errors
//   ?source=api|client
//   ?section=<name>
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive, SA local days)
//   ?page=1..
export async function GET(req: NextRequest) {
  const auth = await requireHR()
  if (auth.error) return auth.error

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const admin = createAdminClient()

  let q = admin
    .from("error_log")
    .select("id, created_at, source, actor_employee_id, actor_name, method, route, status, message, section, target_name, detail, user_agent", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const employee = sp.get("employee")
  const source = sp.get("source")
  const section = sp.get("section")
  const from = sp.get("from")
  const to = sp.get("to")
  if (employee) q = q.eq("actor_employee_id", employee)
  if (source === "api" || source === "client") q = q.eq("source", source)
  if (section) q = q.eq("section", section)
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("created_at", `${from}T00:00:00+02:00`)
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lt("created_at", new Date(new Date(`${to}T00:00:00+02:00`).getTime() + 86_400_000).toISOString())

  const { data, count, error } = await q
  if (error) {
    console.error("[GET /api/logs/errors]", error)
    return NextResponse.json({ error: "Failed to load the error log" }, { status: 500 })
  }

  const { data: secRows } = await admin.from("error_log").select("section").not("section", "is", null).limit(5000)
  const sections = [...new Set((secRows ?? []).map((r) => r.section as string))].sort()

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE, sections })
}
