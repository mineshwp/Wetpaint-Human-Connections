import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  if (typeof body.hidden_from_employee !== "boolean") {
    return NextResponse.json({ error: "hidden_from_employee must be a boolean" }, { status: 400 })
  }

  const { error } = await supabase
    .from("documents")
    .update({ hidden_from_employee: body.hidden_from_employee })
    .eq("id", id)

  if (error) {
    console.error("[PATCH /api/documents/[id]/visibility]", error)
    return NextResponse.json({ error: "Failed to update visibility" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
