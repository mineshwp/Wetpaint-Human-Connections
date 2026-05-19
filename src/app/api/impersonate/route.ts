import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { employeeId, employeeName } = await req.json()
  if (!employeeId || !employeeName) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const cookieStore = await cookies()
  cookieStore.set("impersonate_employee_id", employeeId, { httpOnly: true, path: "/" })
  cookieStore.set("impersonate_employee_name", employeeName, { httpOnly: true, path: "/" })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cookieStore = await cookies()
  cookieStore.delete("impersonate_employee_id")
  cookieStore.delete("impersonate_employee_name")

  return NextResponse.json({ ok: true })
}
