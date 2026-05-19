import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"

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

  if (!role || role === "applicant" || role === "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const isHR = role === "hr"

  // Staff can only view their own documents
  if (role === "staff") {
    const myEmployeeId = await getEmployeeIdForUser(supabase, user.id)
    if (myEmployeeId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  let query = supabase
    .from("documents")
    .select(
      "id, category, name, file_url, file_size, mime_type, uploaded_by, created_at, hidden_from_employee"
    )
    .eq("employee_id", id)
    .order("created_at", { ascending: false })

  if (!isHR) {
    query = query.eq("hidden_from_employee", false) as typeof query
  }

  const { data, error } = await query

  if (error) {
    console.error("[GET /api/employees/[id]/documents]", error)
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
  }

  return NextResponse.json({ documents: data ?? [] })
}
