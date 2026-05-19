import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, canAccessEmployee } from "@/lib/auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const role = await getUserRole(supabase, user.id)

  if (!role || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const allowed = await canAccessEmployee(supabase, user.id, role, id)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("kpi_reviews")
    .select("id, period, title, status, deadline")
    .eq("employee_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[GET /api/employees/[id]/kpi-summary]", error)
    return NextResponse.json({ error: "Failed to fetch KPI summary" }, { status: 500 })
  }

  if (!data) return NextResponse.json({ summary: null })

  return NextResponse.json({
    summary: {
      reviewId: data.id,
      period: data.period,
      title: data.title,
      status: data.status,
      deadline: data.deadline ?? null,
    },
  })
}
