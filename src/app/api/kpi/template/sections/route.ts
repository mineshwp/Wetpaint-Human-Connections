import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

// Create a new template section (HR only).
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const type = body.type === "hr" ? "hr" : "invitee"
  let period = typeof body.period === "string" ? body.period.trim() : ""
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 })

  // Fall back to the current period if the caller didn't specify one.
  if (!period) {
    const { data: setting } = await supabase
      .from("kpi_settings")
      .select("value")
      .eq("key", "current_period")
      .maybeSingle()
    period = setting?.value ?? ""
  }
  if (!period) return NextResponse.json({ error: "period is required" }, { status: 400 })

  // Append after the current highest position among active sections IN THIS PERIOD.
  const { data: existing } = await supabase
    .from("kpi_template_sections")
    .select("position")
    .eq("period", period)
    .eq("is_active", true)
    .order("position", { ascending: false })
    .limit(1)

  const position = existing?.[0] ? existing[0].position + 1 : 0

  const { data, error } = await supabase
    .from("kpi_template_sections")
    .insert({ title, type, position, is_active: true, period })
    .select()
    .single()

  if (error) {
    console.error("[POST /api/kpi/template/sections]", error)
    return NextResponse.json({ error: "Failed to create section" }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
