import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

interface RawItem {
  id: string
  section_id: string
  title: string
  description: string | null
  min_score: number
  max_score: number
  position: number
  is_active: boolean
  review_id: string | null
}

interface Override {
  item_id: string
  hidden: boolean
  title: string | null
  description: string | null
  min_score: number | null
  max_score: number | null
}

// Returns the KPI template as it applies to ONE review: the global template
// with this review's per-item overrides applied and hidden items removed,
// plus this review's own custom items. Any authenticated user who can see the
// review's scores can read it (scoring UI needs it).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Templates are per-period: a review reads the template for its own period.
  const { data: review, error: revErr } = await supabase
    .from("kpi_reviews")
    .select("period")
    .eq("id", reviewId)
    .maybeSingle()
  if (revErr) {
    console.error("[GET /api/kpi/reviews/[id]/template] review lookup", revErr)
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 })
  }
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })

  const [{ data: sections, error: secErr }, { data: overrides }] = await Promise.all([
    supabase
      .from("kpi_template_sections")
      .select("id, title, type, position, is_active, kpi_template_items(id, section_id, title, description, min_score, max_score, position, is_active, review_id)")
      .eq("is_active", true)
      .eq("period", review.period)
      .order("position"),
    supabase
      .from("kpi_review_item_overrides")
      .select("item_id, hidden, title, description, min_score, max_score")
      .eq("review_id", reviewId),
  ])

  if (secErr) {
    console.error("[GET /api/kpi/reviews/[id]/template]", secErr)
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 })
  }

  const overrideByItem = new Map<string, Override>()
  for (const o of (overrides ?? []) as Override[]) overrideByItem.set(o.item_id, o)

  const result = (sections ?? []).map((section) => {
    const raw = (section.kpi_template_items ?? []) as RawItem[]
    const items = raw
      .filter((i) => i.is_active)
      // Global items (review_id null) OR this review's own custom items.
      .filter((i) => i.review_id === null || i.review_id === reviewId)
      .map((i) => {
        const ov = i.review_id === null ? overrideByItem.get(i.id) : undefined
        if (ov?.hidden) return null // globally-present but hidden for this review
        return {
          id: i.id,
          section_id: i.section_id,
          title: ov?.title ?? i.title,
          description: ov?.description ?? i.description,
          min_score: ov?.min_score ?? i.min_score,
          max_score: ov?.max_score ?? i.max_score,
          position: i.position,
          is_active: true,
          _custom: i.review_id === reviewId,
          _overridden: !!ov && (ov.title !== null || ov.description !== null || ov.min_score !== null || ov.max_score !== null),
        }
      })
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .sort((a, b) => a.position - b.position)

    return { id: section.id, title: section.title, type: section.type, position: section.position, is_active: section.is_active, kpi_template_items: items }
  })

  return NextResponse.json(result)
}
