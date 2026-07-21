import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase.from("kpi_settings").select("key, value")
  if (error) return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })

  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  return NextResponse.json(settings)
}

// Upsert a setting (HR only), e.g. { key: "current_period", value: "Q3 2026" }.
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const key = typeof body.key === "string" ? body.key.trim() : ""
  const value = typeof body.value === "string" ? body.value.trim() : ""
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 })

  const { error } = await supabase
    .from("kpi_settings")
    .upsert({ key, value }, { onConflict: "key" })

  if (error) {
    console.error("[PUT /api/kpi/settings]", error)
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 })
  }

  return NextResponse.json({ key, value })
}
