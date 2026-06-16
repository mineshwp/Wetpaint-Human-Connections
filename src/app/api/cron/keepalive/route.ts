import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Keep-alive endpoint hit by a Vercel Cron job (see vercel.json).
// Runs a tiny real DB query so Supabase registers activity and does not
// auto-pause the free-tier project after ~7 days of inactivity.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  // Vercel sets this Authorization header automatically on cron invocations.
  // If CRON_SECRET is configured, reject anything that doesn't match.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("departments")
    .select("id", { count: "exact", head: true })

  if (error) {
    console.error("[cron/keepalive]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() })
}
