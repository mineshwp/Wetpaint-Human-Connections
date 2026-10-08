import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logLoginIfNew } from "@/lib/activity-log"

/**
 * Sent by the browser on real user activity; the middleware refreshes the idle
 * cookie. It also records the sign-in in the activity log (first ping after a
 * login; repeats are ignored).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) await logLoginIfNew(user, req)
  return NextResponse.json({ ok: true })
}
