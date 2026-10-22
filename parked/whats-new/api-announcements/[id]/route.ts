import { withAudit } from "@/lib/activity-log"
import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"

// HR only: take an announcement down (e.g. a typo). Emails already sent can't be recalled.
async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params
  const { data, error } = await createAdminClient().from("announcements").delete().eq("id", id).select("id").maybeSingle()
  if (error) {
    console.error("[DELETE /api/announcements/[id]]", error)
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export const DELETE = withAudit(handleDELETE, { section: "What's New", action: "Deleted an announcement" })
