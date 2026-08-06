import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

interface SrcItem {
  title: string
  description: string | null
  min_score: number
  max_score: number
  position: number
  section_id: string
}

// Copy a staff member's per-review custom KPIs (title/description/min/max only)
// from one of their reviews into this review's matching section (HR only).
// Sections are matched by title. Scores and comments are NEVER copied. Items
// whose title already exists in the target section are skipped.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetReviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const fromReviewId = typeof body.from_review_id === "string" ? body.from_review_id : ""
  const targetSectionId = typeof body.section_id === "string" ? body.section_id : ""
  if (!fromReviewId || !targetSectionId) {
    return NextResponse.json({ error: "from_review_id and section_id are required" }, { status: 400 })
  }
  if (fromReviewId === targetReviewId) {
    return NextResponse.json({ error: "Source and target reviews must differ" }, { status: 400 })
  }

  // Load both reviews — they must belong to the same employee.
  const [{ data: target }, { data: source }] = await Promise.all([
    supabase.from("kpi_reviews").select("id, employee_id, period").eq("id", targetReviewId).maybeSingle(),
    supabase.from("kpi_reviews").select("id, employee_id, period").eq("id", fromReviewId).maybeSingle(),
  ])
  if (!target) return NextResponse.json({ error: "Target review not found" }, { status: 404 })
  if (!source) return NextResponse.json({ error: "Source review not found" }, { status: 404 })
  if (target.employee_id !== source.employee_id) {
    return NextResponse.json({ error: "Reviews belong to different employees" }, { status: 400 })
  }

  // Target section — must be active and in the target review's period.
  const { data: targetSection } = await supabase
    .from("kpi_template_sections")
    .select("id, title, period, is_active")
    .eq("id", targetSectionId)
    .maybeSingle()
  if (!targetSection || !targetSection.is_active || targetSection.period !== target.period) {
    return NextResponse.json({ error: "Target section not found for this review" }, { status: 404 })
  }
  const title = (targetSection.title ?? "").trim().toLowerCase()

  // Matching source sections (same title, source review's period).
  const { data: srcSections } = await supabase
    .from("kpi_template_sections")
    .select("id, title")
    .eq("period", source.period)
    .eq("is_active", true)
  const srcSectionIds = (srcSections ?? [])
    .filter((s) => (s.title ?? "").trim().toLowerCase() === title)
    .map((s) => s.id)
  if (srcSectionIds.length === 0) {
    return NextResponse.json({ error: "No matching section in the source review" }, { status: 404 })
  }

  // The source review's custom items in those sections.
  const { data: srcItems, error: srcErr } = await supabase
    .from("kpi_template_items")
    .select("title, description, min_score, max_score, position, section_id")
    .eq("review_id", fromReviewId)
    .eq("is_active", true)
    .in("section_id", srcSectionIds)
    .order("position")
  if (srcErr) {
    console.error("[POST /api/kpi/reviews/[id]/items/copy] source items", srcErr)
    return NextResponse.json({ error: "Failed to read source KPIs" }, { status: 500 })
  }
  if (!srcItems || srcItems.length === 0) {
    return NextResponse.json({ copied: 0 })
  }

  // Existing target items in this section — skip duplicate titles, and append
  // new items after the current highest position.
  const { data: existing } = await supabase
    .from("kpi_template_items")
    .select("title, position")
    .eq("review_id", targetReviewId)
    .eq("section_id", targetSectionId)
    .eq("is_active", true)
  const existingTitles = new Set((existing ?? []).map((i) => (i.title ?? "").trim().toLowerCase()))
  let position = (existing ?? []).reduce((max, i) => Math.max(max, i.position ?? 0), -1) + 1

  const toInsert = (srcItems as SrcItem[])
    .filter((i) => !existingTitles.has((i.title ?? "").trim().toLowerCase()))
    .map((i) => ({
      section_id: targetSectionId,
      review_id: targetReviewId,
      title: i.title,
      description: i.description ?? null,
      min_score: i.min_score,
      max_score: i.max_score,
      position: position++,
      is_active: true,
    }))

  if (toInsert.length === 0) return NextResponse.json({ copied: 0 })

  const { error: insErr } = await supabase.from("kpi_template_items").insert(toInsert)
  if (insErr) {
    console.error("[POST /api/kpi/reviews/[id]/items/copy] insert", insErr)
    return NextResponse.json({ error: "Failed to copy KPIs" }, { status: 500 })
  }

  return NextResponse.json({ copied: toInsert.length }, { status: 201 })
}
