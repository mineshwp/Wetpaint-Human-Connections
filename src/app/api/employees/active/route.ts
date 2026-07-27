import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, job_title, email, profile_photo_url, department:departments(name)")
    .eq("status", "active")
    .order("last_name")

  if (error) return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 })

  return NextResponse.json(data ?? [])
}
