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
