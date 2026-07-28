import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!role || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("departments")
    .select("id, name, colour")
    .order("name")

  if (error) {
    console.error("[GET /api/departments]", error)
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 })
  }

  // Optional employee counts for the management UI (?counts=1).
  const withCounts = new URL(req.url).searchParams.get("counts") === "1"
  if (withCounts) {
    const { data: emps } = await supabase
      .from("employees")
      .select("department_id")
    const counts = new Map<string, number>()
    for (const e of emps ?? []) {
      if (e.department_id) counts.set(e.department_id, (counts.get(e.department_id) ?? 0) + 1)
    }
    const departments = (data ?? []).map((d) => ({ ...d, employee_count: counts.get(d.id) ?? 0 }))
    return NextResponse.json({ departments })
  }

  return NextResponse.json({ departments: data ?? [] })
}

// Create a department (HR only).
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const colour = typeof body?.colour === "string" && body.colour.trim() ? body.colour.trim() : "#6366f1"
  if (!name) return NextResponse.json({ error: "Department name is required" }, { status: 400 })

  const { data, error } = await supabase
    .from("departments")
    .insert({ name, colour })
    .select("id, name, colour")
    .single()

  if (error) {
    console.error("[POST /api/departments]", error)
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 })
  }

  return NextResponse.json({ department: data }, { status: 201 })
}
