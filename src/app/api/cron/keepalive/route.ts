import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendMonthlyCheckinReminders } from "@/lib/kpi/checkin-reminders"
import { sendWeeklyTrainingReminders } from "@/lib/training-reminders"

// Keep-alive endpoint hit by a Vercel Cron job (see vercel.json).
// Runs a tiny query so Supabase registers activity and does not auto-pause
// the free-tier project after ~7 days of inactivity. Uses the anon key
// (no service role needed) — the request itself is what keeps the project warm.
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase env vars missing" },
      { status: 500 }
    )
  }

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // A lightweight read. RLS may return no rows for an anonymous caller, but the
  // request still reaches the database, which is all that's needed to keep it awake.
  const { error } = await supabase
    .from("departments")
    .select("id", { count: "exact", head: true })

  if (error) {
    console.error("[cron/keepalive]", error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // On the 1st of each month, remind heads and managers to do last month's
  // check-ins. Piggybacks on this daily job so no new public cron path is needed.
  let reminders: { sent: number; month: string } | undefined
  if (new Date().getUTCDate() === 1) {
    try {
      reminders = await sendMonthlyCheckinReminders()
    } catch (e) {
      console.error("[cron/keepalive] check-in reminders", e)
    }
  }

  // Mondays: training follow-ups for HR.
  let training: { sent: number; skipped?: string } | undefined
  if (new Date().getUTCDay() === 1) {
    try {
      training = await sendWeeklyTrainingReminders()
    } catch (e) {
      console.error("[cron/keepalive] training reminders", e)
    }
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString(), reminders, training })
}
