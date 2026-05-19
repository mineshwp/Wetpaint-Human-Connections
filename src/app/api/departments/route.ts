import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (!role || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("departments")
    .select("id, name, colour")
    .order("name")

  if (error) {
    console.error("[GET /api/departments]", error)
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 })
  }

  return NextResponse.json({ departments: data ?? [] })
}
