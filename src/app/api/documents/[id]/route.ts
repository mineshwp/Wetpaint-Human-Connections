import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"
import { DOCUMENTS_BUCKET } from "@/lib/documents"

// Delete a document and its file (HR only).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const { data: doc } = await ctx.supabase.from("documents").select("id, file_url").eq("id", id).maybeSingle()
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  const { error } = await ctx.supabase.from("documents").delete().eq("id", id)
  if (error) {
    console.error("[DELETE /api/documents/[id]]", error)
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
  }
  if (doc.file_url && !/^https?:\/\//.test(doc.file_url)) {
    const { error: rmErr } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).remove([doc.file_url])
    if (rmErr) console.error("[DELETE /api/documents/[id]] remove file", rmErr)
  }
  return NextResponse.json({ success: true })
}
