import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Update a department's name and/or colour (HR only).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const update: { name?: string; colour?: string } = {}
  if (typeof body?.name === "string") {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: "Department name is required" }, { status: 400 })
    update.name = name
  }
  if (typeof body?.colour === "string" && body.colour.trim()) update.colour = body.colour.trim()
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("departments")
    .update(update)
    .eq("id", id)
    .select("id, name, colour")
    .single()

  if (error) {
    console.error("[PATCH /api/departments/[id]]", error)
    return NextResponse.json({ error: "Failed to update department" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Department not found" }, { status: 404 })

  return NextResponse.json({ department: data })
}

// Delete a department (HR only). If staff are assigned, the caller must either
// pass ?reassignTo=<departmentId> to move them, or ?force=true to leave them
// unassigned (the FK sets department_id to null). Without either, we refuse and
// report the employee count so the UI can prompt.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const reassignTo = url.searchParams.get("reassignTo")
  const force = url.searchParams.get("force") === "true"

  const { count, error: countErr } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("department_id", id)
  if (countErr) {
    console.error("[DELETE /api/departments/[id]] count", countErr)
    return NextResponse.json({ error: "Failed to check department" }, { status: 500 })
  }
  const employeeCount = count ?? 0

  if (employeeCount > 0) {
    if (reassignTo) {
      if (reassignTo === id) {
        return NextResponse.json({ error: "Cannot reassign a department to itself" }, { status: 400 })
      }
      const { data: target } = await supabase
        .from("departments").select("id").eq("id", reassignTo).maybeSingle()
      if (!target) return NextResponse.json({ error: "Reassignment target not found" }, { status: 400 })

      const { error: moveErr } = await supabase
        .from("employees")
        .update({ department_id: reassignTo })
        .eq("department_id", id)
      if (moveErr) {
        console.error("[DELETE /api/departments/[id]] reassign", moveErr)
        return NextResponse.json({ error: "Failed to reassign employees" }, { status: 500 })
      }
    } else if (!force) {
      return NextResponse.json(
        { error: "Department has employees", employeeCount },
        { status: 409 },
      )
    }
    // force with no reassignTo: FK ON DELETE SET NULL unassigns them.
  }

  const { error } = await supabase.from("departments").delete().eq("id", id)
  if (error) {
    console.error("[DELETE /api/departments/[id]]", error)
    return NextResponse.json({ error: "Failed to delete department" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reassigned: reassignTo ? employeeCount : 0, unassigned: !reassignTo && force ? employeeCount : 0 })
}
