import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Add a KPI item to a section for THIS review only (a per-staff custom item).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const section_id = body.section_id
  const title = typeof body.title === "string" ? body.title.trim() : ""
  if (!section_id || !title) {
    return NextResponse.json({ error: "section_id and title are required" }, { status: 400 })
  }

  // Position after the highest existing item in this section (global + custom).
  const { data: existing } = await supabase
    .from("kpi_template_items")
    .select("position")
    .eq("section_id", section_id)
    .order("position", { ascending: false })
    .limit(1)
  const position = existing?.[0] ? existing[0].position + 1 : 0

  const { data, error } = await supabase
    .from("kpi_template_items")
    .insert({
      section_id,
      review_id: reviewId,
      title,
      description: body.description ?? null,
      min_score: body.min_score ?? 0,
      max_score: body.max_score ?? 10,
      position,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.error("[POST /api/kpi/reviews/[id]/items]", error)
    return NextResponse.json({ error: "Failed to add KPI" }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
