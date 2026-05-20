import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { sendAdminGrantedEmail } from "@/lib/email"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await supabase
    .from("app_users")
    .select("id, active_role, employee_id, employees(first_name, last_name, email)")
    .eq("active_role", "hr")
    .order("employee_id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ admins: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

  const normalised = email.trim().toLowerCase()
  if (!normalised.endsWith("@wetpaint.co.za")) {
    return NextResponse.json(
      { error: "Only @wetpaint.co.za email addresses can be granted admin access" },
      { status: 400 }
    )
  }

  // Find the employee record
  const { data: emp, error: empError } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email")
    .ilike("email", normalised)
    .single()

  if (empError || !emp) {
    return NextResponse.json(
      { error: "No employee found with that email address" },
      { status: 404 }
    )
  }

  // Find or create app_user for this employee
  const adminClient = createAdminClient()

  const { data: existingUser, error: userLookupError } = await supabase
    .from("app_users")
    .select("id, active_role")
    .eq("employee_id", emp.id)
    .single()

  if (userLookupError && userLookupError.code !== "PGRST116") {
    return NextResponse.json({ error: userLookupError.message }, { status: 500 })
  }

  if (existingUser) {
    if (existingUser.active_role === "hr") {
      return NextResponse.json({ error: "This person is already an admin" }, { status: 409 })
    }

    const { error: updateError } = await supabase
      .from("app_users")
      .update({ active_role: "hr" })
      .eq("id", existingUser.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  } else {
    // They haven't been invited/logged in yet — invite them and set role to hr
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalised,
      { data: { employee_id: emp.id } }
    )
    if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

    const { error: insertError } = await supabase
      .from("app_users")
      .insert({ id: invited.user.id, employee_id: emp.id, active_role: "hr" })

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Send notification email (non-blocking — don't fail the request if email fails)
  try {
    await sendAdminGrantedEmail(normalised, emp.first_name)
  } catch (e) {
    console.error("[settings/admins POST] email send failed:", e)
  }

  return NextResponse.json({
    success: true,
    name: `${emp.first_name} ${emp.last_name}`,
    email: normalised,
  })
}
