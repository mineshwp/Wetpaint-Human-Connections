import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const inviteeIds: string[] = body.invitee_ids ?? []
  if (!inviteeIds.length) return NextResponse.json({ error: "invitee_ids required" }, { status: 400 })

  const rows = inviteeIds.map((invitee_id) => ({ review_id: reviewId, invitee_id, status: "pending" }))
  const { data, error } = await supabase
    .from("kpi_review_invitees")
    .upsert(rows, { onConflict: "review_id,invitee_id", ignoreDuplicates: true })
    .select()

  if (error) return NextResponse.json({ error: "Failed to add invitees" }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reviewId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { invitee_id } = body
  if (!invitee_id) return NextResponse.json({ error: "invitee_id required" }, { status: 400 })

  const { error } = await supabase
    .from("kpi_review_invitees")
    .delete()
    .eq("review_id", reviewId)
    .eq("invitee_id", invitee_id)

  if (error) return NextResponse.json({ error: "Failed to remove invitee" }, { status: 500 })

  return NextResponse.json({ success: true })
}
