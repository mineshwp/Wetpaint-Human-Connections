import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getEmployeeIdForUser } from "@/lib/auth"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: inviteeRowId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const myEmployeeId = await getEmployeeIdForUser(supabase, user.id)
  if (!myEmployeeId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Verify the invitee row belongs to this user
  const { data: row } = await supabase
    .from("kpi_review_invitees")
    .select("id, invitee_id")
    .eq("id", inviteeRowId)
    .single()

  if (!row || row.invitee_id !== myEmployeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const response = body.response // "accepted" | "declined"
  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "response must be accepted or declined" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("kpi_review_invitees")
    .update({ status: response })
    .eq("id", inviteeRowId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Failed to update status" }, { status: 500 })

  return NextResponse.json(data)
}
