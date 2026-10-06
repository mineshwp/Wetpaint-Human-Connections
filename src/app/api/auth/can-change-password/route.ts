import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getRealUserRole } from "@/lib/auth"

/** Only HR admins change their own password; everyone else asks HR. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // No session (e.g. an expired link): nothing to protect here, the update will fail on its own.
  if (!user) return NextResponse.json({ allowed: true })
  const role = await getRealUserRole(supabase, user.id)
  return NextResponse.json({ allowed: role === "hr" })
}
