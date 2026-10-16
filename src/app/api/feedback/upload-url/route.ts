import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRealUserRole } from "@/lib/auth"
import { blockWhileImpersonating } from "@/lib/impersonation"
import { ATTACHMENT_TYPES, FEEDBACK_BUCKET, MAX_ATTACHMENT_BYTES, feedbackPath } from "@/lib/feedback"

// Step 1 of attaching an image (any signed-in staff member): a one-time signed
// URL the browser uploads straight to the private feedback bucket.
// Body: { name, size, type }. Step 2 is POST /api/feedback, which checks the file exists.
export async function POST(req: Request) {
  const viewOnly = await blockWhileImpersonating()
  if (viewOnly) return viewOnly
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = await getRealUserRole(supabase, user.id)
  if (!role || role === "applicant") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const size = typeof body?.size === "number" ? body.size : 0
  const type = typeof body?.type === "string" ? body.type : ""
  if (!name) return NextResponse.json({ error: "File name is required" }, { status: 400 })
  if (!ATTACHMENT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Only images (PNG, JPG, WebP, GIF) and PDF files can be attached" }, { status: 400 })
  }
  if (size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: `${name} is over 10 MB` }, { status: 400 })

  const { data, error } = await createAdminClient().storage
    .from(FEEDBACK_BUCKET)
    .createSignedUploadUrl(feedbackPath(user.id, name))
  if (error || !data) {
    console.error("[POST feedback/upload-url]", error)
    return NextResponse.json({ error: "Couldn't start the upload" }, { status: 500 })
  }
  return NextResponse.json({ bucket: FEEDBACK_BUCKET, path: data.path, token: data.token })
}
