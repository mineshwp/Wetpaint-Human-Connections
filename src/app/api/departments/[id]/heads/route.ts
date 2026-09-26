import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"

// Department heads (HR only). A head must be a member of the department they
// run, and sees that department's staff and published KPI reviews — never ID,
// DOB, banking, salary, documents or HR notes.

async function authorize() {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return { error: viewOnly }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  return { supabase }
}

async function readEmployeeId(req: Request): Promise<string | null> {
  const body = await req.json().catch(() => null)
  return typeof body?.employee_id === "string" && body.employee_id ? body.employee_id : null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (auth.error) return auth.error
  const { supabase } = auth
  const { id } = await params
  const employeeId = await readEmployeeId(req)
  if (!employeeId) return NextResponse.json({ error: "employee_id is required" }, { status: 400 })

  const { data: emp } = await supabase
    .from("employees")
    .select("department_id, is_archived")
    .eq("id", employeeId)
    .single()
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  if (emp.department_id !== id) {
    return NextResponse.json({ error: "A department head must be a member of that department" }, { status: 400 })
  }
  if (emp.is_archived) {
    return NextResponse.json({ error: "Archived employees can't be department heads" }, { status: 400 })
  }

  const { error } = await supabase
    .from("department_heads")
    .upsert({ department_id: id, employee_id: employeeId }, { onConflict: "department_id,employee_id" })

  if (error) {
    console.error("[POST /api/departments/[id]/heads]", error)
    return NextResponse.json({ error: "Failed to add department head" }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize()
  if (auth.error) return auth.error
  const { supabase } = auth
  const { id } = await params
  const employeeId = await readEmployeeId(req)
  if (!employeeId) return NextResponse.json({ error: "employee_id is required" }, { status: 400 })

  const { error } = await supabase
    .from("department_heads")
    .delete()
    .eq("department_id", id)
    .eq("employee_id", employeeId)

  if (error) {
    console.error("[DELETE /api/departments/[id]/heads]", error)
    return NextResponse.json({ error: "Failed to remove department head" }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
