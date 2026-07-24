import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole, getEmployeeIdForUser } from "@/lib/auth"

const BUCKET = "employee-photos"
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

// Who may change this employee's photo: HR, or the employee themselves.
async function authorize(req: NextRequest, id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401 as const }
  const [role, myEmployeeId] = await Promise.all([
    getUserRole(supabase, user.id),
    getEmployeeIdForUser(supabase, user.id),
  ])
  if (role !== "hr" && myEmployeeId !== id) return { error: "Forbidden", status: 403 as const }
  return { ok: true as const }
}

// Remove any existing photo files for this employee (folder is `${id}/`).
async function clearExisting(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data: existing } = await admin.storage.from(BUCKET).list(id)
  if (existing && existing.length) {
    await admin.storage.from(BUCKET).remove(existing.map((f) => `${id}/${f.name}`))
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorize(req, id)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })

  const ext = EXT_BY_MIME[file.type]
  if (!ext) return NextResponse.json({ error: "Unsupported image type (use JPG, PNG, WEBP or GIF)" }, { status: 400 })

  const admin = createAdminClient()
  await clearExisting(admin, id)

  const path = `${id}/photo.${ext}`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) {
    console.error("[POST /api/employees/[id]/photo] upload", upErr)
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 })
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  // Cache-bust so a replaced photo refreshes immediately.
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await admin
    .from("employees")
    .update({ profile_photo_url: url, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (dbErr) {
    console.error("[POST /api/employees/[id]/photo] db", dbErr)
    return NextResponse.json({ error: "Uploaded but failed to save link" }, { status: 500 })
  }

  return NextResponse.json({ profilePhotoUrl: url })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorize(req, id)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  await clearExisting(admin, id)
  const { error } = await admin
    .from("employees")
    .update({ profile_photo_url: null, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return NextResponse.json({ error: "Failed to remove photo" }, { status: 500 })

  return NextResponse.json({ success: true })
}
