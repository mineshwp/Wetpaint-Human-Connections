import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Sort period strings like "Q2 2026" chronologically (year, then quarter);
// anything unparseable falls back to alphabetical at the end.
function periodSortKey(p: string): [number, number] {
  const m = p.match(/Q\s*(\d)\D+(\d{4})/i)
  if (m) return [parseInt(m[2], 10), parseInt(m[1], 10)]
  return [Number.MAX_SAFE_INTEGER, 0]
}

// Returns the global template for a single period, plus the list of periods
// that have a template (so the manage-template UI can offer a selector).
// `?period=` chooses which period's sections to return; defaults to the
// current period from kpi_settings.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Resolve the target period: explicit ?period= wins, else current_period.
  const requested = req.nextUrl.searchParams.get("period")?.trim() || null
  const { data: setting } = await supabase
    .from("kpi_settings")
    .select("value")
    .eq("key", "current_period")
    .maybeSingle()
  const currentPeriod = setting?.value ?? null
  const period = requested ?? currentPeriod

  const [{ data: allSections, error }] = await Promise.all([
    supabase
      .from("kpi_template_sections")
      .select("id, title, type, position, is_active, period, kpi_template_items(*)")
      .eq("is_active", true)
      .order("position"),
  ])

  if (error) return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 })

  // Every period that currently has an active section, plus the current period,
  // sorted chronologically — used to populate the template selector.
  const periodSet = new Set<string>((allSections ?? []).map((s) => s.period).filter(Boolean) as string[])
  if (currentPeriod) periodSet.add(currentPeriod)
  const periods = Array.from(periodSet).sort((a, b) => {
    const [ay, aq] = periodSortKey(a), [by, bq] = periodSortKey(b)
    return ay - by || aq - bq || a.localeCompare(b)
  })

  const sections = (allSections ?? [])
    .filter((s) => s.period === period)
    .map((s) => ({
      ...s,
      kpi_template_items: (s.kpi_template_items ?? [])
        // Global template only — per-review custom items (review_id set) are
        // excluded here; they belong to a specific review.
        .filter((i: { is_active: boolean; review_id: string | null }) => i.is_active && !i.review_id)
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position),
    }))

  return NextResponse.json({ period, currentPeriod, periods, sections })
}
