import { NextRequest, NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { loadAccessData } from "@/lib/access-overview"
import { isAccessLevel } from "@/lib/access-levels"
import { reportingLine } from "@/lib/reporting-line"

// Settings → Who can see what (HR only).
// GET: everyone's department, Reports to, access level and login status.
// PATCH: bulk-set "Reports to" and/or access level for one or more people.
//   Body: { employee_ids: string[], manager_id?: string | null, access_level?: AccessLevel }

export async function GET() {
  const ctx = await requireHR()
  if (ctx.error) return ctx.error
  return NextResponse.json(await loadAccessData())
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => null)
  const ids: string[] = Array.isArray(body?.employee_ids)
    ? Array.from(new Set(body.employee_ids.filter((x: unknown): x is string => typeof x === "string")))
    : []
  if (ids.length === 0) return NextResponse.json({ error: "Pick at least one person" }, { status: 400 })
  if (ids.length > 500) return NextResponse.json({ error: "Too many people at once" }, { status: 400 })

  const setManager = body && "manager_id" in body
  const managerId: string | null = setManager ? (typeof body.manager_id === "string" && body.manager_id ? body.manager_id : null) : null
  const setAccess = body && "access_level" in body
  if (setAccess && !isAccessLevel(body.access_level)) {
    return NextResponse.json({ error: "Invalid access level" }, { status: 400 })
  }
  if (!setManager && !setAccess) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })

  const data = await loadAccessData()
  const known = new Set(data.people.map((p) => p.id))
  if (ids.some((id) => !known.has(id))) {
    return NextResponse.json({ error: "Someone in the selection wasn't found (archived?)" }, { status: 400 })
  }

  if (setManager && managerId) {
    if (!known.has(managerId)) return NextResponse.json({ error: "That manager wasn't found" }, { status: 400 })
    if (ids.includes(managerId)) {
      return NextResponse.json({ error: "Someone can't report to themselves" }, { status: 400 })
    }
    // No loops: the new manager can't already sit below anyone being moved.
    const rows = data.people.map((p) => ({ id: p.id, manager_id: p.managerId }))
    const clash = ids.find((id) => reportingLine(rows, id).includes(managerId))
    if (clash) {
      const a = data.people.find((p) => p.id === clash)?.name ?? "Someone"
      const m = data.people.find((p) => p.id === managerId)?.name ?? "the manager"
      return NextResponse.json({ error: `${m} already reports (directly or indirectly) to ${a}, so ${a} can't report to ${m}` }, { status: 400 })
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (setManager) update.manager_id = managerId
  if (setAccess) update.access_level = body.access_level

  const { error } = await ctx.supabase.from("employees").update(update).in("id", ids)
  if (error) {
    console.error("[PATCH /api/settings/access]", error)
    return NextResponse.json({ error: "Failed to save changes" }, { status: 500 })
  }
  return NextResponse.json(await loadAccessData())
}
