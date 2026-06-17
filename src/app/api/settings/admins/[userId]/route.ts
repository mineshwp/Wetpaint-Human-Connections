import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { sendAdminRevokedEmail } from "@/lib/email"
import { generateTempPassword } from "@/lib/password"

// Reset/set a temporary password for an admin so HR can hand it over.
// Onboarding is HR-set-password (no email invites). Returns the new password once.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const adminClient = createAdminClient()

    // Confirm the target is an admin (service-role: RLS hides other rows).
    const { data: target } = await adminClient
      .from("app_users")
      .select("id, active_role, employees(first_name, last_name)")
      .eq("id", userId)
      .single()
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const temp = generateTempPassword()
    const { error: pwError } = await adminClient.auth.admin.updateUserById(userId, {
      password: temp,
      email_confirm: true,
    })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 })

    const rawEmp = target.employees
    const emp = Array.isArray(rawEmp) ? rawEmp[0] : rawEmp
    const typedEmp = emp as { first_name: string; last_name: string } | null

    return NextResponse.json({
      success: true,
      name: typedEmp ? `${typedEmp.first_name} ${typedEmp.last_name}` : "User",
      tempPassword: temp,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reset password"
    console.error("[settings/admins/[userId] POST]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (userId === user.id) {
    return NextResponse.json({ error: "You cannot remove your own admin access" }, { status: 400 })
  }

  // RLS on app_users only exposes a user's own row, so use the service-role
  // client for these cross-user reads/writes (hr authorization enforced above).
  const adminClient = createAdminClient()

  // Get their employee details for the notification email
  const { data: target } = await adminClient
    .from("app_users")
    .select("id, active_role, employees(first_name, last_name, email)")
    .eq("id", userId)
    .single()

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (target.active_role !== "hr") {
    return NextResponse.json({ error: "This user is not an admin" }, { status: 400 })
  }

  const { error } = await adminClient
    .from("app_users")
    .update({ active_role: "staff" })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send notification email
  try {
    const rawEmp = target.employees
    const emp = Array.isArray(rawEmp) ? rawEmp[0] : rawEmp
    const typedEmp = emp as { first_name: string; last_name: string; email: string } | null
    if (typedEmp?.email) await sendAdminRevokedEmail(typedEmp.email, typedEmp.first_name)
  } catch (e) {
    console.error("[settings/admins DELETE] email send failed:", e)
  }

  return NextResponse.json({ success: true })
}
