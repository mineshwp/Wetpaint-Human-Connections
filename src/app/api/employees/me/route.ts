import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getEmployeeIdForUser } from "@/lib/auth"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const employeeId = await getEmployeeIdForUser(supabase, user.id)
  if (!employeeId) return NextResponse.json({ employeeId: null, user: { email: user.email } })

  const { data: emp } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, job_title")
    .eq("id", employeeId)
    .single()

  return NextResponse.json({ employeeId, employee: emp, user: { email: user.email } })
}
