import { NextResponse } from "next/server"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"
import { DOCUMENTS_BUCKET, MAX_DOCUMENT_BYTES, documentPath } from "@/lib/documents"

// Step 1 of an upload (HR only): a one-time signed URL the browser uploads the
// file to directly (skips Vercel's request size limit). Body: { name, size }.
// Step 2 is POST /api/employees/[id]/documents, which records it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const size = typeof body?.size === "number" ? body.size : 0
  if (!name) return NextResponse.json({ error: "File name is required" }, { status: 400 })
  if (size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: `${name} is over 25 MB` }, { status: 400 })

  const { data: emp } = await ctx.supabase.from("employees").select("id").eq("id", id).maybeSingle()
  if (!emp) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

  const { data, error } = await createAdminClient().storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(documentPath(id, name))
  if (error || !data) {
    console.error("[POST documents/upload-url]", error)
    return NextResponse.json({ error: "Couldn't start the upload" }, { status: 500 })
  }
  return NextResponse.json({ bucket: DOCUMENTS_BUCKET, path: data.path, token: data.token })
}
