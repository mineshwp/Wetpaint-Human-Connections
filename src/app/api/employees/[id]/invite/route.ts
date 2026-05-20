import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: employeeId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("email, first_name, last_name")
    .eq("id", employeeId)
    .single()

  if (empError || !emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  if (!emp.email) return NextResponse.json({ error: "Employee has no email address" }, { status: 400 })

  // Must use the service-role admin client — anon key does not have access to auth.admin
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.inviteUserByEmail(emp.email, {
    data: { employee_id: employeeId },
  })

  if (error) {
    console.error("[POST /api/employees/:id/invite]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: emp.email })
}
