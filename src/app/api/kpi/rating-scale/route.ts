import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// The KPI rating guide (1-10 → annual increase / birthday bonus).
// Readable by any authenticated user; only HR can edit.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("kpi_rating_scale")
    .select("score, label, annual_increase, birthday_bonus")
    .order("score")

  if (error) {
    console.error("[GET /api/kpi/rating-scale]", error)
    return NextResponse.json({ error: "Failed to fetch rating scale" }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// Bulk-upsert the rating guide rows (HR only). Body: { rows: [{ score, label,
// annual_increase, birthday_bonus }] }. Scores must be 1-10.
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const rows = Array.isArray(body.rows) ? body.rows : null
  if (!rows) return NextResponse.json({ error: "rows array is required" }, { status: 400 })

  const clean = rows
    .map((r: { score: unknown; label?: unknown; annual_increase?: unknown; birthday_bonus?: unknown }) => ({
      score: Number(r.score),
      label: typeof r.label === "string" ? r.label.trim() : "",
      annual_increase: typeof r.annual_increase === "string" ? r.annual_increase.trim() : "",
      birthday_bonus: typeof r.birthday_bonus === "string" ? r.birthday_bonus.trim() : "",
    }))
    .filter((r: { score: number }) => Number.isInteger(r.score) && r.score >= 1 && r.score <= 10)

  if (clean.length === 0) return NextResponse.json({ error: "No valid rows" }, { status: 400 })

  const { data, error } = await supabase
    .from("kpi_rating_scale")
    .upsert(clean, { onConflict: "score" })
    .select("score, label, annual_increase, birthday_bonus")
    .order("score")

  if (error) {
    console.error("[PUT /api/kpi/rating-scale]", error)
    return NextResponse.json({ error: "Failed to save rating scale" }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
