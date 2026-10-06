import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Public. Only HR admins may have a reset link emailed to them. Everyone else
 * must ask HR to set a temporary password. The response is identical either way
 * so this can't be used to discover who is an admin.
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
      .select("id")
      .ilike("email", email)
      .maybeSingle()

    let isAdmin = false
    if (emp) {
      const { data: appUser } = await admin
        .from("app_users")
        .select("active_role")
        .eq("employee_id", emp.id)
        .maybeSingle()
      isAdmin = appUser?.active_role === "hr"
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
