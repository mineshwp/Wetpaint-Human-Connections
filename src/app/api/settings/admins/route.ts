import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUserRole } from "@/lib/auth"
import { sendAdminGrantedEmail } from "@/lib/email"
import { listAdmins } from "@/lib/admins"
import { generateTempPassword } from "@/lib/password"

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
      .select("id, active_role, accepted_at")
      .eq("employee_id", emp.id)
      .single()

    if (userLookupError && userLookupError.code !== "PGRST116") {
      return NextResponse.json({ error: userLookupError.message }, { status: 500 })
    }

    // pending = added but hasn't genuinely signed into the app yet (accepted_at null).
    let pending = false
    // tempPassword is returned only when we provision a brand-new login, so HR can
    // share it. Onboarding is HR-set-password (no email invites — Safe Links breaks
    // those by auto-consuming the one-time link).
    let tempPassword: string | null = null

    if (existingUser) {
      if (existingUser.active_role === "hr") {
        return NextResponse.json({ error: "This person is already an admin" }, { status: 409 })
      }

      const { error: updateError } = await adminClient
        .from("app_users")
        .update({ active_role: "hr" })
        .eq("id", existingUser.id)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

      // Existing app user being promoted — pending reflects whether they've ever
      // signed into the app themselves. Don't reset their password.
      pending = existingUser.accepted_at == null
    } else {
      // No app_user yet — provision a login with a temporary password HR will share.
      const temp = generateTempPassword()
      let authUserId: string

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: normalised,
        password: temp,
        email_confirm: true,
        user_metadata: { employee_id: emp.id },
      })

      if (createError) {
        // An auth user may already exist (e.g. left over from an old invite).
        // Reuse it and set a known password so HR can hand it over.
        const { data: list } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        const found = list?.users.find((u) => (u.email ?? "").toLowerCase() === normalised)
        if (!found) {
          return NextResponse.json({ error: createError.message }, { status: 500 })
        }
        const { error: pwError } = await adminClient.auth.admin.updateUserById(found.id, {
          password: temp,
          email_confirm: true,
        })
        if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 })
        authUserId = found.id
      } else {
        authUserId = created.user.id
      }

      const { error: insertError } = await adminClient
        .from("app_users")
        .insert({ id: authUserId, employee_id: emp.id, active_role: "hr", accepted_at: null })

      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

      pending = true
      tempPassword = temp
    }

    // Optional notification email (no links — safe from Safe Links). Non-blocking.
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
      tempPassword,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add admin"
    console.error("[settings/admins POST]", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
