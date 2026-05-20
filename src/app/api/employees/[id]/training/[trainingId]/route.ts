import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"

async function getTrainingAndCheckAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  employeeId: string,
  trainingId: string
) {
  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, userId),
    getEmployeeIdForUser(supabase, userId),
  ])
  const isHR = role === "hr"
  const isOwnProfile = myEmployeeId === employeeId
  if (!isHR && !isOwnProfile) return { allowed: false, role, myEmployeeId }

  const { data } = await supabase
    .from("employee_training")
    .select("id, employee_id")
    .eq("id", trainingId)
    .eq("employee_id", employeeId)
    .single()

  if (!data) return { allowed: false, role, myEmployeeId }
  return { allowed: true, role, myEmployeeId }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; trainingId: string }> }
) {
  const { id, trainingId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed } = await getTrainingAndCheckAccess(supabase, user.id, id, trainingId)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const toNull = (v: unknown) => (v === "" || v === undefined ? null : v)

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const textFields = ["name", "type", "provider", "category", "url", "venue", "certificate_url", "notes"]
  const dateFields = ["date_completed", "expiry_date"]

  for (const f of textFields) {
    if (f in body) updates[f] = f === "name" ? body[f]?.trim() || null : toNull(body[f])
  }
  for (const f of dateFields) {
    if (f in body) updates[f] = toNull(body[f])
  }
  if ("duration_hours" in body) {
    updates.duration_hours = body.duration_hours ? Number(body.duration_hours) : null
  }

  const { data, error } = await supabase
    .from("employee_training")
    .update(updates)
    .eq("id", trainingId)
    .select()
    .single()

  if (error) {
    console.error("[PATCH /api/employees/[id]/training/[trainingId]]", error)
    return NextResponse.json({ error: "Failed to update training" }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; trainingId: string }> }
) {
  const { id, trainingId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed } = await getTrainingAndCheckAccess(supabase, user.id, id, trainingId)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { error } = await supabase
    .from("employee_training")
    .delete()
    .eq("id", trainingId)

  if (error) {
    console.error("[DELETE /api/employees/[id]/training/[trainingId]]", error)
    return NextResponse.json({ error: "Failed to delete training" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
