import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase.from("kpi_settings").select("key, value")
  if (error) return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })

  const settings = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  return NextResponse.json(settings)
}
