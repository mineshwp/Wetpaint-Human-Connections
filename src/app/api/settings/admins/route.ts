import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { sendAdminGrantedEmail } from "@/lib/email"
import { listAdmins } from "@/lib/admins"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = await getUserRole(supabase, user.id)
  if (role !== "hr") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const admins = await listAdmins()
    return NextResponse.json({ admins })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load admins"
    console.error("[settings/admins GET]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
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

    // Find or create app_user for this employee. RLS on app_users only exposes a
    // user's own row, so all app_users reads/writes here use the service-role
    // client — authorization was already enforced via getUserRole above.
    const adminClient = createAdminClient()

    const { data: existingUser, error: userLookupError } = await adminClient
      .from("app_users")
      .select("id, active_role")
      .eq("employee_id", emp.id)
      .single()

    if (userLookupError && userLookupError.code !== "PGRST116") {
      return NextResponse.json({ error: userLookupError.message }, { status: 500 })
    }

    // pending = invited and awaiting first sign-in. An already-onboarded user
    // who is being promoted has already accepted, so they are not pending.
    let pending = false

    if (existingUser) {
      if (existingUser.active_role === "hr") {
        return NextResponse.json({ error: "This person is already an admin" }, { status: 409 })
      }

      const { error: updateError } = await adminClient
        .from("app_users")
        .update({ active_role: "hr" })
        .eq("id", existingUser.id)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

      // Already-existing auth user that has never signed in is still pending.
      const { data: authUser } = await adminClient.auth.admin.getUserById(existingUser.id)
      pending = !!authUser?.user && !authUser.user.last_sign_in_at
    } else {
      // They haven't been invited/logged in yet — invite them and set role to hr
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        normalised,
        { data: { employee_id: emp.id } }
      )
      if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 500 })

      const { error: insertError } = await adminClient
        .from("app_users")
        .insert({ id: invited.user.id, employee_id: emp.id, active_role: "hr" })

      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

      pending = true
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
      pending,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add admin"
    console.error("[settings/admins POST]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
