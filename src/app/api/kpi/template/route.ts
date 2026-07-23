import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("kpi_template_sections")
    .select("*, kpi_template_items(*)")
    .eq("is_active", true)
    .order("position")

  if (error) return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 })

  const sections = (data ?? []).map((s) => ({
    ...s,
    kpi_template_items: (s.kpi_template_items ?? [])
      // Global template only — per-review custom items (review_id set) are
      // excluded here; they belong to a specific review.
      .filter((i: { is_active: boolean; review_id: string | null }) => i.is_active && !i.review_id)
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position),
  }))

  return NextResponse.json(sections)
}
