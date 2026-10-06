import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { listAdmins } from "@/lib/admins"
import { sendPasswordResetRequestEmail } from "@/lib/email"

const COOLDOWN_MS = 60 * 60 * 1000

/**
 * Public. HR admins get a reset link emailed to them. For anyone else, HR is
 * emailed instead and sets a temporary password for them. The response is
 * identical in every case, so this can't be used to discover who is an admin
 * or who has an account.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !email.endsWith("@wetpaint.co.za")) {
    return NextResponse.json({ error: "Enter your @wetpaint.co.za email address." }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data: emp } = await admin
      .from("employees")
      .select("id, first_name, last_name, status")
      .ilike("email", email)
      .maybeSingle()

    // One request per person per hour; extra requests get the same response but send nothing.
    let throttled = false
    if (emp) {
      const { data: last } = await admin
        .from("password_reset_requests")
        .select("last_requested_at")
        .eq("employee_id", emp.id)
        .maybeSingle()
      if (last && Date.now() - new Date(last.last_requested_at).getTime() < COOLDOWN_MS) {
        throttled = true
      } else {
        await admin
          .from("password_reset_requests")
          .upsert({ employee_id: emp.id, last_requested_at: new Date().toISOString() })
      }
    }

    let isAdmin = false
    if (emp && !throttled) {
      const { data: appUser } = await admin
        .from("app_users")
        .select("active_role")
        .eq("employee_id", emp.id)
        .maybeSingle()
      isAdmin = appUser?.active_role === "hr"
    }

    if (emp && !throttled && !isAdmin && emp.status !== "terminated") {
      const hrEmails = (await listAdmins())
        .map((a) => a.employees?.email)
        .filter((e): e is string => !!e)
      await sendPasswordResetRequestEmail({
        to: hrEmails,
        staffName: `${emp.first_name} ${emp.last_name}`.trim(),
        staffEmail: email,
        url: `${new URL(req.url).origin}/employees/${emp.id}`,
      })
    }

    if (isAdmin) {
      // Session client, so the PKCE verifier cookie lands in this browser.
      const supabase = await createClient()
      const origin = new URL(req.url).origin
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/callback?next=/login/reset-password`,
      })
      if (error) {
        console.error("[forgot-password]", error)
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
      }
    }
  } catch (e) {
    console.error("[forgot-password]", e)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
