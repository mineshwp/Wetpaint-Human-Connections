import { withAudit } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser, canAccessEmployee } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { logStaffChange } from "@/lib/hr-digests"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role] = await Promise.all([getUserRole(supabase, user.id)])
  const allowed = await canAccessEmployee(supabase, user.id, role, id)
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("employee_training")
    .select("*")
    .eq("employee_id", id)
    .order("date_completed", { ascending: false, nullsFirst: false })

  if (error) {
    console.error("[GET /api/employees/[id]/training]", error)
    return NextResponse.json({ error: "Failed to fetch training" }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])

  const isHR = role === "hr"
  const isOwnProfile = myEmployeeId === id

  if (!isHR && !isOwnProfile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Training name is required" }, { status: 400 })
  }
  if (!["online", "in-person"].includes(body.type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  }

  const toNull = (v: unknown) => (v === "" || v === undefined ? null : v)

  const { data, error } = await supabase
    .from("employee_training")
    .insert({
      employee_id: id,
      name: body.name.trim(),
      type: body.type,
      provider: toNull(body.provider),
      category: toNull(body.category),
      url: toNull(body.url),
      venue: toNull(body.venue),
      date_completed: toNull(body.date_completed),
      expiry_date: toNull(body.expiry_date),
      duration_hours: body.duration_hours ? Number(body.duration_hours) : null,
      certificate_url: toNull(body.certificate_url),
      notes: toNull(body.notes),
    })
    .select()
    .single()

  if (error) {
    console.error("[POST /api/employees/[id]/training]", error)
    return NextResponse.json({ error: "Failed to save training" }, { status: 500 })
  }

  // Courses staff add themselves go in HR's weekly digest.
  if (!isHR) {
    await logStaffChange("training", id, {
      name: data.name, date_completed: data.date_completed, expiry_date: data.expiry_date,
    })
  }

  return NextResponse.json(data, { status: 201 })
}

export const POST = withAudit(handlePOST, {"section": "Training", "action": "Added training record", "target": "employee"})
