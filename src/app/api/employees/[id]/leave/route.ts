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

  const year = new Date().getFullYear()

  const { data, error } = await supabase
    .from("leave_balances")
    .select("leave_type, entitled, used, pending")
    .eq("employee_id", id)
    .eq("year", year)

  if (error) {
    console.error("[GET /api/employees/[id]/leave]", error)
    return NextResponse.json({ error: "Failed to fetch leave balances" }, { status: 500 })
  }

  return NextResponse.json({ balances: data ?? [] })
}
