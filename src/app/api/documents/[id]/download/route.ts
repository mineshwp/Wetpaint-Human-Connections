import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"
import { DOCUMENTS_BUCKET } from "@/lib/documents"

// Open a document: HR any; everyone else only their own, non-hidden ones.
// Redirects to a signed URL that works for 60 seconds.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  const role = await getUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from("documents")
    .select("employee_id, name, file_url, hidden_from_employee")
    .eq("id", id)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  if (role !== "hr") {
    const me = await getEmployeeIdForUser(supabase, user.id)
    if (me !== doc.employee_id || doc.hidden_from_employee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  if (/^https?:\/\//.test(doc.file_url)) return NextResponse.redirect(doc.file_url)

  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_url, 60, { download: doc.name })
  if (error || !data) {
    console.error("[GET /api/documents/[id]/download]", error)
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
  return NextResponse.redirect(data.signedUrl)
}
