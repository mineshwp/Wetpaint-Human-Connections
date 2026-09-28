import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"
import { demoteDepartmentManagers, loadDepartmentsData } from "@/lib/departments"

// Set a department's managers (HR only). Body: { employee_ids: string[] } —
// the full list; one department can have several managers.
// A manager gets "Manager — whole department" access and is placed in the
// department (moved from their old one if needed). Anyone taken off the list
// goes back to "direct reports" (if people report to them) or Staff.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!Array.isArray(body?.employee_ids)) {
    return NextResponse.json({ error: "employee_ids must be a list" }, { status: 400 })
  }
  const ids: string[] = Array.from(new Set(body.employee_ids.filter((x: unknown): x is string => typeof x === "string")))
  if (ids.length > 20) return NextResponse.json({ error: "Too many managers" }, { status: 400 })

  const data = await loadDepartmentsData()
  const dept = data.departments.find((d) => d.id === id)
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 })
  const known = new Set(data.people.map((p) => p.id))
  if (ids.some((x) => !known.has(x))) {
    return NextResponse.json({ error: "Someone in the list wasn't found (archived?)" }, { status: 400 })
  }

  const removed = dept.managers.map((m) => m.id).filter((m) => !ids.includes(m))
  const { error: demoteErr } = await demoteDepartmentManagers(removed)
  if (demoteErr) {
    console.error("[PUT /api/departments/[id]/managers] demote", demoteErr)
    return NextResponse.json({ error: "Failed to save managers" }, { status: 500 })
  }

  if (ids.length) {
    const { error } = await createAdminClient()
      .from("employees")
      .update({ department_id: id, access_level: "manager_department", updated_at: new Date().toISOString() })
      .in("id", ids)
    if (error) {
      console.error("[PUT /api/departments/[id]/managers]", error)
      return NextResponse.json({ error: "Failed to save managers" }, { status: 500 })
    }
  }

  return NextResponse.json(await loadDepartmentsData())
}
