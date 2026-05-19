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
      .filter((i: { is_active: boolean }) => i.is_active)
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position),
  }))

  return NextResponse.json(sections)
}
