import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("kpi_reviews")
    .select(`
      id, employee_id, period, title, deadline, status, created_at,
      employee:employees!kpi_reviews_employee_id_fkey(id, first_name, last_name, job_title, department:departments(name)),
      kpi_review_invitees(id, invitee_id, status, invitee:employees!kpi_review_invitees_invitee_id_fkey(id, first_name, last_name))
    `)
    .eq("id", id)
    .single()

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const allowed: Record<string, unknown> = {}
  if (body.status !== undefined) allowed.status = body.status
  if (body.title !== undefined) allowed.title = body.title
  if (body.deadline !== undefined) allowed.deadline = body.deadline
  if (body.period !== undefined) allowed.period = body.period

  const { data, error } = await supabase
    .from("kpi_reviews")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Failed to update review" }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase.from("kpi_reviews").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Failed to delete review" }, { status: 500 })

  return NextResponse.json({ success: true })
}
