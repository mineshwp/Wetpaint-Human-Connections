import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { requireHR } from "@/lib/hr-api"
import { createAdminClient } from "@/lib/supabase/admin"
import { DOCUMENTS_BUCKET, DOCUMENT_CATEGORIES } from "@/lib/documents"

const DOC_SELECT = "id, category, name, file_url, file_size, mime_type, uploaded_by, created_at, hidden_from_employee"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const role = await getUserRole(supabase, user.id)

  if (!role || role === "applicant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const isHR = role === "hr"

  // Everyone except HR (incl. managers) sees only their own documents
  if (!isHR) {
    const myEmployeeId = await getEmployeeIdForUser(supabase, user.id)
    if (myEmployeeId !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  let query = supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("employee_id", id)
    .order("created_at", { ascending: false })

  if (!isHR) {
    query = query.eq("hidden_from_employee", false) as typeof query
  }

  const { data, error } = await query

  if (error) {
    console.error("[GET /api/employees/[id]/documents]", error)
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
  }

  return NextResponse.json({ documents: data ?? [] })
}

// Step 2 of an upload (HR only): record a file already uploaded to the signed
// URL from ./upload-url. Body: { path, name, category, size?, mime?, hidden_from_employee? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireHR({ write: true })
  if (ctx.error) return ctx.error
  const { id } = await params

  const body = await req.json().catch(() => null)
  const path = typeof body?.path === "string" ? body.path : ""
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 200) : ""
  const category = typeof body?.category === "string" && body.category in DOCUMENT_CATEGORIES ? body.category : "other"
  if (!name || !path.startsWith(`${id}/`) || path.includes("..")) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 })
  }

  // The file must really be there (and in this employee's folder).
  const admin = createAdminClient()
  const folder = path.slice(0, path.lastIndexOf("/"))
  const file = path.slice(path.lastIndexOf("/") + 1)
  const { data: found } = await admin.storage.from(DOCUMENTS_BUCKET).list(folder, { search: file, limit: 1 })
  const obj = found?.find((f) => f.name === file)
  if (!obj) return NextResponse.json({ error: "Upload not found — try again" }, { status: 400 })

  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string }
  const { data, error } = await ctx.supabase
    .from("documents")
    .insert({
      employee_id: id,
      category,
      name,
      file_url: path,
      file_size: meta.size ?? (typeof body?.size === "number" ? body.size : null),
      mime_type: meta.mimetype ?? (typeof body?.mime === "string" ? body.mime : null),
      uploaded_by: ctx.employeeId,
      hidden_from_employee: body?.hidden_from_employee === true,
    })
    .select(DOC_SELECT)
    .single()
  if (error) {
    console.error("[POST /api/employees/[id]/documents]", error)
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path])
    return NextResponse.json({ error: "Failed to save document" }, { status: 500 })
  }
  return NextResponse.json({ document: data }, { status: 201 })
}
