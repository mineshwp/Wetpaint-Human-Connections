import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sectionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { title, description, min_score = 0, max_score = 10 } = body
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 })

  // Get current max position in this section
  const { data: existing } = await supabase
    .from("kpi_template_items")
    .select("position")
    .eq("section_id", sectionId)
    .order("position", { ascending: false })
    .limit(1)

  const position = existing?.[0] ? existing[0].position + 1 : 0

  const { data, error } = await supabase
    .from("kpi_template_items")
    .insert({ section_id: sectionId, title, description: description ?? null, min_score, max_score, position })
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Failed to add item" }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

// Update a section — rename, reorder (position), or toggle active (HR only).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const allowed: Record<string, unknown> = {}
  if (typeof body.title === "string") allowed.title = body.title.trim()
  if (body.type === "hr" || body.type === "invitee") allowed.type = body.type
  if (typeof body.position === "number") allowed.position = body.position
  if (typeof body.is_active === "boolean") allowed.is_active = body.is_active

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("kpi_template_sections")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("[PATCH /api/kpi/template/sections/[id]]", error)
    return NextResponse.json({ error: "Failed to update section" }, { status: 500 })
  }

  return NextResponse.json(data)
}

// Soft-delete a section and its items (HR only). Scores stay intact for history.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error: itemsError } = await supabase
    .from("kpi_template_items")
    .update({ is_active: false })
    .eq("section_id", id)

  const { error } = await supabase
    .from("kpi_template_sections")
    .update({ is_active: false })
    .eq("id", id)

  if (error || itemsError) {
    console.error("[DELETE /api/kpi/template/sections/[id]]", error ?? itemsError)
    return NextResponse.json({ error: "Failed to delete section" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
