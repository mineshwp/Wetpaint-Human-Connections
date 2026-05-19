import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const { data, error } = await supabase
    .from("hr_notes")
    .select("id, note, created_by, created_at")
    .eq("employee_id", id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[GET /api/employees/[id]/notes]", error)
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 })
  }

  return NextResponse.json({ notes: data ?? [] })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const note = (body.note ?? "").trim()
  if (!note) return NextResponse.json({ error: "Note is required" }, { status: 400 })

  const myEmployeeId = await getEmployeeIdForUser(supabase, user.id)

  const { data, error } = await supabase
    .from("hr_notes")
    .insert({ employee_id: id, note, created_by: myEmployeeId })
    .select("id, note, created_by, created_at")
    .single()

  if (error) {
    console.error("[POST /api/employees/[id]/notes]", error)
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 })
  }

  return NextResponse.json({ success: true, note: data })
}
