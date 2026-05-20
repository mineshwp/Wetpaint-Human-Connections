import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

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
  if (body.title !== undefined) allowed.title = body.title
  if (body.description !== undefined) allowed.description = body.description
  if (body.max_score !== undefined) allowed.max_score = body.max_score
  if (body.min_score !== undefined) allowed.min_score = body.min_score

  const { data, error } = await supabase
    .from("kpi_template_items")
    .update(allowed)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: "Failed to update item" }, { status: 500 })

  return NextResponse.json(data)
}
