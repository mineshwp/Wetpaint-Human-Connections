import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Copy a period's template STRUCTURE into a new period (HR only): section
// titles/types + global KPI titles/descriptions. Reviews, scores and per-review
// custom items are never copied. Used to spin up a new quarter's template from
// an existing one. Fails if the destination period already has any sections.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const fromPeriod = typeof body.from_period === "string" ? body.from_period.trim() : ""
  const toPeriod = typeof body.to_period === "string" ? body.to_period.trim() : ""
  if (!fromPeriod || !toPeriod) {
    return NextResponse.json({ error: "from_period and to_period are required" }, { status: 400 })
  }
  if (fromPeriod === toPeriod) {
    return NextResponse.json({ error: "Source and destination periods must differ" }, { status: 400 })
  }

  // Refuse to clobber an existing template.
  const { data: existingDst } = await supabase
    .from("kpi_template_sections")
    .select("id")
    .eq("period", toPeriod)
    .eq("is_active", true)
    .limit(1)
  if (existingDst && existingDst.length > 0) {
    return NextResponse.json({ error: `A template for "${toPeriod}" already exists` }, { status: 409 })
  }

  // Load the source sections with their GLOBAL items only (review_id null).
  const { data: sourceSections, error: srcErr } = await supabase
    .from("kpi_template_sections")
    .select("title, type, position, kpi_template_items(title, description, min_score, max_score, position, is_active, review_id)")
    .eq("period", fromPeriod)
    .eq("is_active", true)
    .order("position")

  if (srcErr) {
    console.error("[POST /api/kpi/template/clone] source load", srcErr)
    return NextResponse.json({ error: "Failed to read source template" }, { status: 500 })
  }
  if (!sourceSections || sourceSections.length === 0) {
    return NextResponse.json({ error: `No template found for "${fromPeriod}"` }, { status: 404 })
  }

  // Copy section by section so each new section's id can anchor its items.
  for (const sec of sourceSections) {
    const { data: newSec, error: secErr } = await supabase
      .from("kpi_template_sections")
      .insert({ title: sec.title, type: sec.type, position: sec.position, is_active: true, period: toPeriod })
      .select("id")
      .single()

    if (secErr || !newSec) {
      console.error("[POST /api/kpi/template/clone] section insert", secErr)
      return NextResponse.json({ error: "Failed to copy template" }, { status: 500 })
    }

    const items = (sec.kpi_template_items ?? [])
      .filter((i: { is_active: boolean; review_id: string | null }) => i.is_active && !i.review_id)
      .map((i: { title: string; description: string | null; min_score: number; max_score: number; position: number }) => ({
        section_id: newSec.id,
        title: i.title,
        description: i.description ?? null,
        min_score: i.min_score,
        max_score: i.max_score,
        position: i.position,
        is_active: true,
        review_id: null,
      }))

    if (items.length > 0) {
      const { error: itemsErr } = await supabase.from("kpi_template_items").insert(items)
      if (itemsErr) {
        console.error("[POST /api/kpi/template/clone] items insert", itemsErr)
        return NextResponse.json({ error: "Failed to copy KPI items" }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ success: true, period: toPeriod, sections: sourceSections.length }, { status: 201 })
}
